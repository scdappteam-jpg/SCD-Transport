const crypto = require("crypto");

const VIEWER_ROLE = "People_Viewer";
const VIEWER_CODE = /^VIEW\d{3,6}$/;

function fail(message, statusCode = 400) {
    throw Object.assign(new Error(message), { statusCode });
}

function cleanText(value, max = 200) {
    return String(value || "").trim().replace(/\s+/g, " ").slice(0, max);
}

function hashPassword(password) {
    const salt = crypto.randomBytes(16);
    const expected = crypto.scryptSync(password, salt, 64);
    return `scrypt$${salt.toString("base64")}$${expected.toString("base64")}`;
}

function validateRecords(records) {
    if (!Array.isArray(records) || records.length !== 2) fail("ต้องกำหนดบัญชีผู้ดูแลข้อมูลจำนวน 2 บัญชี");
    const codes = new Set();
    return records.map((record, index) => {
        const code = cleanText(record.code, 32).toUpperCase();
        const name = cleanText(record.name, 160);
        const password = String(record.temporaryPassword || "");
        if (!VIEWER_CODE.test(code)) fail(`บัญชี ${index + 1}: รหัสผู้ใช้ต้องเป็น VIEW ตามด้วยตัวเลข เช่น VIEW001`);
        if (!name) fail(`บัญชี ${index + 1}: กรุณาระบุชื่อบัญชี`);
        if (password.length < 12) fail(`บัญชี ${index + 1}: รหัสผ่านชั่วคราวต้องมีอย่างน้อย 12 ตัวอักษร`);
        if (codes.has(code)) fail(`รหัสผู้ใช้ซ้ำ: ${code}`);
        codes.add(code);
        return { code, name, password };
    });
}

function provision(db, { actor, records, preview = true, now = new Date().toISOString() }) {
    if (!actor || actor.role !== "Admin") fail("เฉพาะ Admin เท่านั้นที่สร้างบัญชีผู้ดูแลข้อมูลได้", 403);
    const normalized = validateRecords(records);
    const requestedCodes = new Set(normalized.map(record => record.code));
    const conflicts = (db.users || []).filter(user => requestedCodes.has(cleanText(user.code, 32).toUpperCase()) && user.role !== VIEWER_ROLE);
    if (conflicts.length) fail(`รหัสบัญชีชนกับผู้ใช้เดิม: ${conflicts.map(user => user.code).join(", ")}`, 409);
    const existing = normalized.filter(record => (db.users || []).some(user => cleanText(user.code, 32).toUpperCase() === record.code));
    const deactivated = (db.users || []).filter(user => user.role === VIEWER_ROLE && !requestedCodes.has(cleanText(user.code, 32).toUpperCase()) && user.status !== "Inactive");
    const summary = {
        preview: Boolean(preview),
        createCount: normalized.length - existing.length,
        updateCount: existing.length,
        deactivateCount: deactivated.length,
        activeViewerCount: 2,
        codes: normalized.map(record => record.code)
    };
    if (preview) return summary;

    for (const user of deactivated) {
        user.status = "Inactive";
        user.deactivatedAt = now;
        user.deactivatedBy = actor.id;
        user.deactivationReason = "ReplacedByPeopleViewerProvision";
    }
    for (const record of normalized) {
        let user = (db.users || []).find(item => cleanText(item.code, 32).toUpperCase() === record.code);
        if (!user) {
            user = { id: `u_people_viewer_${record.code.toLowerCase()}`, createdAt: now };
            db.users.push(user);
        }
        Object.assign(user, {
            code: record.code,
            name: record.name,
            role: VIEWER_ROLE,
            status: "Active",
            vehiclePlate: "",
            phone: "",
            lineUserId: "",
            lineConnected: false,
            passwordHash: hashPassword(record.password),
            credentialIssuedAt: now,
            updatedAt: now
        });
    }
    db.hr ||= {};
    db.hr.auditLogs ||= [];
    db.hr.auditLogs.push({ id: `HRAUD-${Date.now()}`, action: "PeopleViewersProvisioned", actorId: actor.id, at: now, detail: summary });
    return { ...summary, preview: false };
}

function splitName(fullName) {
    const parts = cleanText(fullName, 200).split(" ").filter(Boolean);
    if (parts.length < 2) return { firstName: parts[0] || "-", lastName: "" };
    return { firstName: parts.slice(0, -1).join(" "), lastName: parts.at(-1) };
}

function directory(db) {
    return (db.users || [])
        .filter(user => user.status !== "Inactive" && ![VIEWER_ROLE, "Admin"].includes(user.role))
        .map(user => {
            const profile = db.hr?.employeeProfiles?.[user.id] || {};
            const names = splitName(user.name);
            return {
                firstName: names.firstName,
                lastName: names.lastName,
                photoUrl: cleanText(profile.profilePhotoUrl || profile.photoUrl || user.profilePhotoUrl, 1000)
            };
        })
        .sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`, "th"));
}

module.exports = { VIEWER_ROLE, validateRecords, provision, directory };
