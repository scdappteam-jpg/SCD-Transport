import argparse
import json
import re
from datetime import datetime, timezone

import openpyxl

EMAIL_RE = re.compile(r"[A-Z0-9._%+#-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.I)
PHONE_HINT_RE = re.compile(r"(?<!\d)(?:\+?66|0)\s*[-(]?\s*\d[\d\s().,/\-#]{5,}\d")
SECRET_RE = re.compile(r"^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d!@#$%^&*._-]{8,}$")

CATEGORY_BY_SHEET = {
    "SCD": "Airline",
    "BFS": "Airline",
    "TG": "Airline",
    "INTER": "Airline",
    "AGENT CONTACT": "Agent",
    "Shipping": "Shipping",
    "TRACTOR": "Towing",
    "Internal Tel.number": "Internal",
    "Tel SCD staff": "Internal",
    "Emergency contact": "Emergency",
    "K-Soft": "System Support",
}


def clean(value, limit=800):
    if value is None:
        return ""
    text = str(value).replace("\ufffd", " ")
    text = re.sub(r"[\x00-\x1f\x7f]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:limit]


def phones(value):
    text = clean(value)
    matches = []
    for match in PHONE_HINT_RE.finditer(text):
        candidate = re.sub(r"\s+", " ", match.group(0)).strip(" ,;/")
        if len(re.sub(r"\D", "", candidate)) >= 7 and candidate not in matches:
            matches.append(candidate)
    return matches


def emails(value):
    return list(dict.fromkeys(match.group(0).lower() for match in EMAIL_RE.finditer(clean(value))))


def safe_context(value):
    text = clean(value, 240)
    if not text or text.upper() == "LINK" or SECRET_RE.fullmatch(text):
        return ""
    text = EMAIL_RE.sub(" ", text)
    text = PHONE_HINT_RE.sub(" ", text)
    text = re.sub(r"\s+", " ", text).strip(" -–—,;/")
    if not text or len(text) == 1:
        return ""
    return text


def record(category, organization, name, role, phone, email, sheet, row, **extra):
    organization = clean(organization, 220)
    name = clean(name, 180)
    if not (organization or name) or not (phone or email):
        return None
    return {
        "category": clean(category, 80) or "Other",
        "organization": organization,
        "name": name,
        "role": clean(role, 160),
        "phone": clean(phone, 180),
        "email": clean(email, 220),
        "airlineCode": clean(extra.get("airlineCode"), 24),
        "terminal": clean(extra.get("terminal"), 80),
        "note": clean(extra.get("note"), 800),
        "sourceSheet": clean(sheet, 120),
        "sourceRow": row,
        "status": "Active",
    }


def add_contact(records, **kwargs):
    item = record(**kwargs)
    if item:
        records.append(item)


def parse_agent_sheet(ws, records):
    for row_no in range(5, ws.max_row + 1):
        vals = [ws.cell(row_no, col).value for col in range(1, 8)]
        shipper = safe_context(vals[0])
        for role, agent_col, contact_col in (("Pickup", 1, 2), ("Customs clearance", 3, 4), ("Handler", 5, 6)):
            agent = safe_context(vals[agent_col])
            raw_contact = vals[contact_col]
            found_phones = phones(raw_contact)
            found_emails = emails(raw_contact)
            if not found_phones and not found_emails:
                continue
            add_contact(records, category="Agent", organization=agent or shipper, name="", role=f"{role} · {shipper}" if shipper else role,
                        phone=" / ".join(found_phones), email=found_emails[0] if found_emails else "", sheet=ws.title, row=row_no,
                        note="" if agent else shipper)


def parse_airline_sheet(ws, records):
    header_row = None
    for row_no in range(1, min(ws.max_row, 30) + 1):
        labels = [clean(ws.cell(row_no, col).value).lower() for col in range(1, min(ws.max_column, 10) + 1)]
        if "code" in labels and "carrier" in labels:
            header_row = row_no
            break
    if header_row:
        for row_no in range(header_row + 1, ws.max_row + 1):
            code = safe_context(ws.cell(row_no, 1).value)
            carrier = safe_context(ws.cell(row_no, 2).value)
            tel = ws.cell(row_no, 5).value
            mail = ws.cell(row_no, 6).value
            found_phones = phones(tel)
            found_emails = emails(mail)
            if found_phones or found_emails:
                add_contact(records, category="Airline", organization=carrier or code or ws.title, name="", role="Flight operator",
                            phone=" / ".join(found_phones), email=found_emails[0] if found_emails else "", sheet=ws.title, row=row_no,
                            airlineCode=code, terminal=ws.title, note=safe_context(ws.cell(row_no, 4).value))
    end = header_row or ws.max_row + 1
    parse_generic_rows(ws, records, 1, end - 1, category="Airline service")


def parse_internal_sheet(ws, records):
    for row_no in range(1, ws.max_row + 1):
        for name_col, phone_col, role_col, email_col in ((1, 2, None, None), (10, 11, 12, 13)):
            name = safe_context(ws.cell(row_no, name_col).value)
            raw_phone = ws.cell(row_no, phone_col).value
            raw_email = ws.cell(row_no, email_col).value if email_col else None
            found_phones = phones(raw_phone)
            found_emails = emails(raw_email)
            if found_phones or found_emails:
                add_contact(records, category="Internal", organization="Expeditors / SCD", name=name, role=safe_context(ws.cell(row_no, role_col).value) if role_col else "",
                            phone=" / ".join(found_phones), email=found_emails[0] if found_emails else "", sheet=ws.title, row=row_no)


def parse_generic_rows(ws, records, start=1, end=None, category=None):
    end = end or ws.max_row
    for row_no in range(start, end + 1):
        values = [ws.cell(row_no, col).value for col in range(1, ws.max_column + 1)]
        all_phones = list(dict.fromkeys(p for value in values for p in phones(value)))
        all_emails = list(dict.fromkeys(e for value in values for e in emails(value)))
        if not all_phones and not all_emails:
            continue
        contexts = []
        for value in values:
            context = safe_context(value)
            if context and context not in contexts:
                contexts.append(context)
        organization = contexts[0] if contexts else ws.title
        name = contexts[1] if len(contexts) > 1 else ""
        role = contexts[2] if len(contexts) > 2 else ""
        add_contact(records, category=category or CATEGORY_BY_SHEET.get(ws.title, "Other"), organization=organization, name=name, role=role,
                    phone=" / ".join(all_phones), email=all_emails[0] if all_emails else "", sheet=ws.title, row=row_no,
                    note="; ".join(contexts[3:6]))


def dedupe(records):
    unique = {}
    for item in records:
        key = "|".join(re.sub(r"\s+", "", clean(item.get(field)).lower()) for field in ("category", "organization", "name", "role", "phone", "email"))
        unique.setdefault(key, item)
    return list(unique.values())


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("input")
    parser.add_argument("output")
    args = parser.parse_args()
    workbook = openpyxl.load_workbook(args.input, data_only=True, read_only=True)
    records = []
    for sheet_name in workbook.sheetnames:
        ws = workbook[sheet_name]
        if sheet_name == "AGENT CONTACT":
            parse_agent_sheet(ws, records)
        elif sheet_name in {"SCD", "BFS", "TG", "INTER"}:
            parse_airline_sheet(ws, records)
        elif sheet_name == "Internal Tel.number":
            parse_internal_sheet(ws, records)
        elif sheet_name in {"Airline security Pro", "COB", "Gateway Lane"}:
            continue
        else:
            parse_generic_rows(ws, records)
    records = dedupe(records)
    payload = {
        "source": args.input.split("\\")[-1].split("/")[-1],
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "recordCount": len(records),
        "records": records,
    }
    with open(args.output, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
    print(json.dumps({"recordCount": len(records), "output": args.output}, ensure_ascii=False))


if __name__ == "__main__":
    main()
