const crypto = require("crypto");

function fail(message, statusCode = 400) {
    throw Object.assign(new Error(message), { statusCode });
}

function cleanText(value, max = 500) {
    return String(value || "")
        .replace(/[\u0000-\u001f\u007f]/g, " ")
        .replace(/\uFFFD+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, max);
}

function keyText(value) {
    return cleanText(value, 500).toLocaleLowerCase("en-US").replace(/\s+/g, "");
}

function contactKey(contact) {
    return [
        contact.category,
        contact.organization,
        contact.name,
        contact.role,
        contact.phone,
        contact.email
    ].map(keyText).join("|");
}

function sourceKey(contact) {
    const sheet = keyText(contact.sourceSheet);
    const row = Number(contact.sourceRow) || 0;
    const identity = [contact.organization, contact.name, contact.role, contact.phone, contact.email].map(keyText).join("|");
    return sheet && row ? `${sheet}|${row}|${identity}` : "";
}

function stableId(contact) {
    return `ct_${crypto.createHash("sha256").update(contactKey(contact)).digest("hex").slice(0, 18)}`;
}

function normalizeRecord(record, index) {
    const normalized = {
        category: cleanText(record.category || "Other", 80),
        organization: cleanText(record.organization, 220),
        name: cleanText(record.name, 180),
        role: cleanText(record.role, 160),
        phone: cleanText(record.phone, 180),
        email: cleanText(record.email, 220).toLowerCase(),
        airlineCode: cleanText(record.airlineCode, 24).toUpperCase(),
        terminal: cleanText(record.terminal, 80),
        note: cleanText(record.note, 800),
        sourceSheet: cleanText(record.sourceSheet, 120),
        sourceRow: Number(record.sourceRow) || 0,
        status: record.status === "Inactive" ? "Inactive" : "Active"
    };
    if (!normalized.organization && !normalized.name) fail(`รายการ ${index + 1}: ต้องมีชื่อองค์กรหรือชื่อผู้ติดต่อ`);
    if (!normalized.phone && !normalized.email) fail(`รายการ ${index + 1}: ต้องมีเบอร์โทรหรืออีเมล`);
    if (normalized.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized.email)) {
        fail(`รายการ ${index + 1}: อีเมลไม่ถูกต้อง (${normalized.email})`);
    }
    normalized.id = cleanText(record.id, 80) || stableId(normalized);
    return normalized;
}

function validateRecords(records) {
    if (!Array.isArray(records) || !records.length) fail("ไม่พบข้อมูลติดต่อสำหรับนำเข้า");
    if (records.length > 2000) fail("นำเข้าได้ไม่เกิน 2,000 รายการต่อครั้ง");
    const seen = new Set();
    let duplicateCount = 0;
    const normalized = [];
    records.forEach((record, index) => {
        const item = normalizeRecord(record, index);
        const key = contactKey(item);
        if (seen.has(key)) {
            duplicateCount += 1;
            return;
        }
        seen.add(key);
        normalized.push(item);
    });
    return { normalized, duplicateCount };
}

function sameContact(a, b) {
    return ["category", "organization", "name", "role", "phone", "email", "airlineCode", "terminal", "note", "status"]
        .every(key => cleanText(a[key], 800) === cleanText(b[key], 800));
}

function importContacts(db, { actor, records, preview = true, now = new Date().toISOString() }) {
    if (!actor || actor.role !== "Admin") fail("เฉพาะ Admin เท่านั้นที่นำเข้าข้อมูลติดต่อได้", 403);
    const { normalized, duplicateCount } = validateRecords(records);
    db.contacts ||= [];
    const byId = new Map(db.contacts.map(item => [item.id, item]));
    const byKey = new Map(db.contacts.map(item => [contactKey(item), item]));
    const bySource = new Map(db.contacts.map(item => [sourceKey(item), item]).filter(([key]) => key));
    let createCount = 0, updateCount = 0, unchangedCount = 0;
    for (const item of normalized) {
        const existing = bySource.get(sourceKey(item)) || byId.get(item.id) || byKey.get(contactKey(item));
        if (!existing) createCount += 1;
        else if (sameContact(existing, item)) unchangedCount += 1;
        else updateCount += 1;
    }
    const summary = {
        preview: Boolean(preview),
        receivedCount: records.length,
        validCount: normalized.length,
        duplicateCount,
        createCount,
        updateCount,
        unchangedCount,
        totalAfterImport: db.contacts.length + createCount
    };
    if (preview) return summary;

    for (const item of normalized) {
        const existing = bySource.get(sourceKey(item)) || byId.get(item.id) || byKey.get(contactKey(item));
        if (existing) {
            Object.assign(existing, item, { updatedAt: now, updatedBy: actor.id });
        } else {
            const created = { ...item, createdAt: now, createdBy: actor.id, updatedAt: now, updatedBy: actor.id };
            db.contacts.push(created);
            byId.set(created.id, created);
            byKey.set(contactKey(created), created);
            if (sourceKey(created)) bySource.set(sourceKey(created), created);
        }
    }
    db.contactImports ||= [];
    const importRecord = { id: `CONTACTIMP-${Date.now()}`, appliedAt: now, appliedBy: actor.id, ...summary, preview: false };
    db.contactImports.push(importRecord);
    db.contactImports = db.contactImports.slice(-20);
    return { ...summary, preview: false, importId: importRecord.id };
}

function visibleContacts(db) {
    return (db.contacts || [])
        .filter(item => item.status !== "Inactive")
        .map(item => ({
            id: item.id,
            category: item.category,
            organization: item.organization,
            name: item.name,
            role: item.role,
            phone: item.phone,
            email: item.email,
            airlineCode: item.airlineCode,
            terminal: item.terminal,
            note: item.note
        }))
        .sort((a, b) => `${a.category}|${a.organization}|${a.name}`.localeCompare(`${b.category}|${b.organization}|${b.name}`, "th"));
}

module.exports = { contactKey, importContacts, normalizeRecord, validateRecords, visibleContacts };
