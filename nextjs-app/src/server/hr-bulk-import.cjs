const crypto = require("crypto");

const ALLOWED_ROLES = new Set(["Driver", "WH_Staff", "Terminal", "Billing", "Executive", "Team_Transport"]);
const EMPLOYEE_CODE = /^EMP\d{3,6}$/;

function fail(message, statusCode = 400) {
    throw Object.assign(new Error(message), { statusCode });
}

function cleanText(value, max = 500) {
    return String(value || "").trim().replace(/\s+/g, " ").slice(0, max);
}

function hashPassword(password) {
    const salt = crypto.randomBytes(16);
    const expected = crypto.scryptSync(password, salt, 64);
    return `scrypt$${salt.toString("base64")}$${expected.toString("base64")}`;
}

function validateRecords(records) {
    if (!Array.isArray(records) || !records.length) fail("ไม่พบข้อมูลพนักงานสำหรับนำเข้า");
    if (records.length > 500) fail("นำเข้าได้ไม่เกิน 500 คนต่อครั้ง");
    const codes = new Set(), names = new Set();
    return records.map((record, index) => {
        const code = cleanText(record.employeeCode, 32).toUpperCase();
        const name = cleanText(record.name, 200);
        const position = cleanText(record.position, 160);
        const department = cleanText(record.department, 160);
        const role = cleanText(record.systemRole, 80);
        const password = String(record.temporaryPassword || "");
        const baseSalary = Number(record.baseSalary);
        if (!EMPLOYEE_CODE.test(code)) fail(`แถว ${index + 1}: รหัสพนักงานไม่ถูกต้อง`);
        if (!name || !position || !department) fail(`แถว ${index + 1}: ชื่อ ตำแหน่ง และแผนกต้องครบ`);
        if (!ALLOWED_ROLES.has(role)) fail(`แถว ${index + 1}: Role ${role || "(ว่าง)"} ไม่รองรับ`);
        if (!Number.isFinite(baseSalary) || baseSalary < 0) fail(`แถว ${index + 1}: เงินเดือนไม่ถูกต้อง`);
        if (password.length < 12) fail(`แถว ${index + 1}: รหัสผ่านชั่วคราวต้องมีอย่างน้อย 12 ตัวอักษร`);
        const nameKey = name.replace(/\s+/g, "").toLocaleLowerCase("th-TH");
        if (codes.has(code)) fail(`พบรหัสพนักงานซ้ำ: ${code}`);
        if (names.has(nameKey)) fail(`พบชื่อพนักงานซ้ำ: ${name}`);
        codes.add(code);
        names.add(nameKey);
        return { code, name, position, department, role, password, baseSalary };
    });
}

function importRoster(db, { actor, records, preview = true, now = new Date().toISOString() }) {
    if (!actor || actor.role !== "Admin") fail("เฉพาะ Admin เท่านั้นที่นำเข้าทะเบียนพนักงานได้", 403);
    const normalized = validateRecords(records);
    const existingCodes = new Set((db.users || []).filter(user => user.id !== actor.id).map(user => cleanText(user.code, 32).toUpperCase()));
    const conflicts = normalized.filter(record => existingCodes.has(record.code));
    if (conflicts.length) fail(`รหัสพนักงานชนกับบัญชีเดิม: ${conflicts.map(item => item.code).join(", ")}`, 409);
    const oldUsers = (db.users || []).filter(user => user.id !== actor.id && user.status !== "Inactive");
    const summary = {
        preview: Boolean(preview),
        keepAdmin: actor.id,
        deactivateCount: oldUsers.length,
        createCount: normalized.length,
        activeAfterImport: normalized.length + 1,
        firstCode: normalized[0].code,
        lastCode: normalized[normalized.length - 1].code
    };
    if (preview) return summary;

    db.hr ||= {};
    db.hr.employeeProfiles ||= {};
    db.hr.payrollProfiles ||= {};
    db.hr.auditLogs ||= [];
    db.hr.importBackups ||= [];
    db.hr.rosterImports ||= [];
    const backup = {
        id: `HRBACKUP-${Date.now()}`,
        createdAt: now,
        createdBy: actor.id,
        users: structuredClone(db.users || []),
        employeeProfiles: structuredClone(db.hr.employeeProfiles),
        payrollProfiles: structuredClone(db.hr.payrollProfiles)
    };
    db.hr.importBackups.push(backup);
    db.hr.importBackups = db.hr.importBackups.slice(-3);

    for (const user of db.users || []) {
        if (user.id === actor.id) continue;
        user.status = "Inactive";
        user.deactivatedAt = now;
        user.deactivatedBy = actor.id;
        user.deactivationReason = "ReplacedByCurrentHrRoster";
    }

    for (const record of normalized) {
        const id = `u_${record.code.toLowerCase()}`;
        let user = (db.users || []).find(item => item.id === id);
        if (!user) {
            user = { id, createdAt: now };
            db.users.push(user);
        }
        Object.assign(user, {
            code: record.code,
            name: record.name,
            role: record.role,
            status: "Active",
            vehiclePlate: "",
            phone: "",
            lineUserId: "",
            lineConnected: false,
            passwordHash: hashPassword(record.password),
            credentialIssuedAt: now,
            updatedAt: now
        });
        db.hr.employeeProfiles[id] = {
            ...(db.hr.employeeProfiles[id] || {}),
            employeeId: id,
            department: record.department,
            position: record.position,
            employeeLevel: record.role === "Executive" ? "Management" : "Staff",
            supervisorId: "",
            branch: "Suvanabhumi Branch",
            employmentType: "Full-time",
            assignedLocationIds: db.hr.employeeProfiles[id]?.assignedLocationIds || [],
            createdAt: db.hr.employeeProfiles[id]?.createdAt || now,
            updatedAt: now
        };
        db.hr.payrollProfiles[id] = {
            employeeId: id,
            baseSalary: record.baseSalary,
            fixedAllowance: 0,
            fixedDeduction: 0,
            bankName: "",
            bankAccountLast4: "",
            updatedAt: now,
            updatedBy: actor.id
        };
    }
    const importRecord = { id: `HRIMP-${Date.now()}`, ...summary, preview: false, appliedAt: now, appliedBy: actor.id, backupId: backup.id };
    db.hr.rosterImports.push(importRecord);
    db.hr.auditLogs.push({ id: `HRAUD-${Date.now()}`, action: "BulkRosterImported", actorId: actor.id, at: now, detail: summary });
    return { ...summary, preview: false, importId: importRecord.id, backupId: backup.id };
}

module.exports = { importRoster, validateRecords };


