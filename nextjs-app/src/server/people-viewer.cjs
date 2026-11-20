const crypto = require("crypto");

const VIEWER_ROLE = "People_Viewer";
const VIEWER_CODE = /^VIEW\d{3,6}$/;
const TEST_VIEWER_CODE = "VIEW999";

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
        const nickname = cleanText(record.nickname, 100);
        if (password.length < 6) fail(`บัญชี ${index + 1}: รหัสผ่านชั่วคราวต้องมีอย่างน้อย 6 ตัวอักษร`);
        if (codes.has(code)) fail(`รหัสผู้ใช้ซ้ำ: ${code}`);
        codes.add(code);
        return { code, name, nickname, password };
    });
}

function provision(db, { actor, records, preview = true, now = new Date().toISOString() }) {
    if (!actor || actor.role !== "Admin") fail("เฉพาะ Admin เท่านั้นที่สร้างบัญชีผู้ดูแลข้อมูลได้", 403);
    const normalized = validateRecords(records);
    const requestedCodes = new Set(normalized.map(record => record.code));
    const conflicts = (db.users || []).filter(user => requestedCodes.has(cleanText(user.code, 32).toUpperCase()) && user.role !== VIEWER_ROLE);
    if (conflicts.length) fail(`รหัสบัญชีชนกับผู้ใช้เดิม: ${conflicts.map(user => user.code).join(", ")}`, 409);
    const existing = normalized.filter(record => (db.users || []).some(user => cleanText(user.code, 32).toUpperCase() === record.code));
    const summary = {
        preview: Boolean(preview),
        createCount: normalized.length - existing.length,
        updateCount: existing.length,
        deactivateCount: 0,
        activeViewerCount: 2,
        codes: normalized.map(record => record.code)
    };
    if (preview) return summary;

    for (const record of normalized) {
        let user = (db.users || []).find(item => cleanText(item.code, 32).toUpperCase() === record.code);
        if (!user) {
            user = { id: `u_people_viewer_${record.code.toLowerCase()}`, createdAt: now };
            db.users.push(user);
        }
        Object.assign(user, {
            code: record.code,
            name: record.name,
            nickname: record.nickname,
            role: VIEWER_ROLE,
            status: "Active",
            vehiclePlate: "",
            phone: "",
            lineUserId: "",
            lineConnected: false,
            passwordHash: hashPassword(record.password),
            mustChangePassword: true,
            credentialIssuedAt: now,
            updatedAt: now
        });
    }
    db.hr ||= {};
    db.hr.auditLogs ||= [];
    db.hr.auditLogs.push({ id: `HRAUD-${Date.now()}`, action: "PeopleViewersProvisioned", actorId: actor.id, at: now, detail: summary });
    return { ...summary, preview: false };
}

function provisionTest(db, { actor, record, preview = true, now = new Date().toISOString() }) {
    if (!actor || actor.role !== "Admin") fail("เฉพาะ Admin เท่านั้นที่สร้างบัญชีทดสอบได้", 403);
    const code = TEST_VIEWER_CODE;
    const name = cleanText(record?.name, 160);
    const nickname = cleanText(record?.nickname, 100);
    const password = String(record?.temporaryPassword || "");
    if (!name) fail("กรุณาระบุชื่อบัญชีทดสอบ");
    if (password.length < 6) fail("รหัสผ่านชั่วคราวต้องมีอย่างน้อย 6 ตัวอักษร");
    const existing = (db.users || []).find(user => cleanText(user.code, 32).toUpperCase() === code);
    if (existing && existing.role !== VIEWER_ROLE) fail(`รหัสบัญชีชนกับผู้ใช้เดิม: ${code}`, 409);
    const summary = { preview: Boolean(preview), code, createCount: existing ? 0 : 1, updateCount: existing ? 1 : 0, deactivateCount: 0 };
    if (preview) return summary;
    const user = existing || { id: "u_people_viewer_view999", createdAt: now };
    if (!existing) db.users.push(user);
    Object.assign(user, {
        code,
        name,
        nickname,
        role: VIEWER_ROLE,
        status: "Active",
        vehiclePlate: "",
        phone: "",
        lineUserId: "",
        lineConnected: false,
        passwordHash: hashPassword(password),
        mustChangePassword: true,
        isTestAccount: true,
        credentialIssuedAt: now,
        updatedAt: now
    });
    db.hr ||= {};
    db.hr.auditLogs ||= [];
    db.hr.auditLogs.push({ id: `HRAUD-${Date.now()}`, action: "PeopleViewerTestProvisioned", actorId: actor.id, accountCode: code, at: now, detail: summary });
    return { ...summary, preview: false, mustChangePassword: true };
}

function provisionAdditional(db, { actor, record, preview = true, now = new Date().toISOString() }) {
    if (!actor || actor.role !== "Admin") fail("เฉพาะ Admin เท่านั้นที่สร้างบัญชีผู้ดูแลข้อมูลได้", 403);
    const code = cleanText(record?.code, 32).toUpperCase();
    const name = cleanText(record?.name, 160);
    const nickname = cleanText(record?.nickname, 100);
    const password = String(record?.temporaryPassword || "");
    const position = cleanText(record?.position, 120);
    const department = cleanText(record?.department, 120);
    if (!VIEWER_CODE.test(code) || code === TEST_VIEWER_CODE) fail("รหัสผู้ใช้ต้องเป็น VIEW ตามด้วยตัวเลข เช่น VIEW003");
    if (!name) fail("กรุณาระบุชื่อบัญชี");
    if (password.length < 6) fail("รหัสผ่านชั่วคราวต้องมีอย่างน้อย 6 ตัวอักษร");
    if (!position || !department) fail("กรุณาระบุตำแหน่งและแผนก");
    const existing = (db.users || []).find(user => cleanText(user.code, 32).toUpperCase() === code);
    if (existing) fail(`รหัสบัญชีมีอยู่แล้ว: ${code}`, 409);
    const summary = { preview: Boolean(preview), code, name, nickname, position, department, createCount: 1, deactivateCount: 0 };
    if (preview) return summary;
    const user = {
        id: `u_people_viewer_${code.toLowerCase()}`,
        code,
        name,
        nickname,
        role: VIEWER_ROLE,
        status: "Active",
        vehiclePlate: "",
        phone: "",
        lineUserId: "",
        lineConnected: false,
        passwordHash: hashPassword(password),
        mustChangePassword: true,
        credentialIssuedAt: now,
        createdAt: now,
        updatedAt: now
    };
    db.users ||= [];
    db.users.push(user);
    db.hr ||= {};
    db.hr.employeeProfiles ||= {};
    db.hr.employeeProfiles[user.id] = { employeeId: user.id, nickname, position, department, updatedAt: now };
    db.hr.auditLogs ||= [];
    db.hr.auditLogs.push({ id: `HRAUD-${Date.now()}`, action: "PeopleViewerAdditionalProvisioned", actorId: actor.id, accountCode: code, at: now, detail: summary });
    return { ...summary, preview: false, mustChangePassword: true };
}

function splitName(fullName) {
    const parts = cleanText(fullName, 200).split(" ").filter(Boolean);
    if (parts.length < 2) return { firstName: parts[0] || "-", lastName: "" };
    return { firstName: parts.slice(0, -1).join(" "), lastName: parts.at(-1) };
}

function directoryKey(user) {
    if (user?.role === VIEWER_ROLE) return cleanText(user?.code || user?.id || user?.employeeId, 120);
    return cleanText(user?.id || user?.employeeId || user?.code, 120);
}

function matchesDirectoryKey(user, key) {
    const expected = cleanText(key, 120);
    return [user?.id, user?.employeeId, user?.code].some(value => cleanText(value, 120) === expected);
}

function nextEmployeeCode(db) {
    const highest = (db.users || []).reduce((max, user) => {
        const match = cleanText(user?.code, 32).toUpperCase().match(/^EMP(\d+)$/);
        return match ? Math.max(max, Number(match[1]) || 0) : max;
    }, 0);
    let sequence = highest + 1;
    let code = `EMP${String(sequence).padStart(6, "0")}`;
    const used = new Set((db.users || []).flatMap(user => [user?.id, user?.employeeId, user?.code]).map(value => cleanText(value, 120).toUpperCase()).filter(Boolean));
    while (used.has(code)) {
        sequence += 1;
        code = `EMP${String(sequence).padStart(6, "0")}`;
    }
    return code;
}

function createPerson(db, { actor, changes, photoUrl = "", preview = false, now = new Date().toISOString() }) {
    if (!actor || actor.role !== VIEWER_ROLE) fail("เฉพาะผู้ดูแลทะเบียนบุคลากรเท่านั้นที่เพิ่มพนักงานได้", 403);
    const firstName = cleanText(changes?.firstName, 120);
    const lastName = cleanText(changes?.lastName, 120);
    const phone = cleanText(changes?.phone, 80);
    const nickname = cleanText(changes?.nickname, 100);
    const position = cleanText(changes?.position, 120);
    const department = cleanText(changes?.department, 120);
    if (!firstName) fail("กรุณาระบุชื่อ");
    if (!position || !department) fail("กรุณาระบุตำแหน่งและแผนก");
    const fullName = [firstName, lastName].filter(Boolean).join(" ");
    const normalizedName = fullName.toLocaleLowerCase("th-TH");
    const normalizedPhone = phone.replace(/\D/g, "") || phone.toLocaleLowerCase("th-TH");
    const normalizedNickname = nickname.toLocaleLowerCase("th-TH");
    const duplicate = (db.users || []).find(user => {
        if (user.status === "Inactive") return false;
        const sameName = cleanText(user.name, 240).toLocaleLowerCase("th-TH") === normalizedName;
        const userPhone = cleanText(user.phone, 80);
        const samePhone = normalizedPhone && (userPhone.replace(/\D/g, "") || userPhone.toLocaleLowerCase("th-TH")) === normalizedPhone;
        const sameNickname = normalizedNickname && cleanText(user.nickname, 100).toLocaleLowerCase("th-TH") === normalizedNickname;
        return sameName && (samePhone || (!normalizedPhone && sameNickname));
    });
    if (duplicate) fail(`พบรายชื่อพนักงานซ้ำ: ${fullName}`, 409);
    const code = nextEmployeeCode(db);
    const result = { id: code, firstName, lastName, phone, nickname, photoUrl: cleanText(photoUrl, 1000), position, department };
    if (preview) return result;
    db.users ||= [];
    db.users.push({
        id: code,
        employeeId: code,
        code,
        name: fullName,
        phone,
        nickname,
        role: "Employee",
        status: "Active",
        directoryOnly: true,
        vehiclePlate: "",
        createdAt: now,
        updatedAt: now
    });
    db.hr ||= {};
    db.hr.employeeProfiles ||= {};
    db.hr.employeeProfiles[code] = {
        employeeId: code,
        nickname,
        position,
        department,
        ...(photoUrl ? { profilePhotoUrl: photoUrl } : {}),
        createdAt: now,
        updatedAt: now
    };
    db.hr.auditLogs ||= [];
    db.hr.auditLogs.push({
        id: `HRAUD-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
        action: "PeopleDirectoryProfileCreated",
        actorId: actor.id,
        employeeId: code,
        fields: ["name", "phone", "nickname", "position", "department", ...(photoUrl ? ["photo"] : [])],
        at: now
    });
    return directory(db).find(item => item.id === code);
}

function directory(db) {
    return (db.users || [])
        .filter(user => directoryKey(user) && user.status !== "Inactive" && user.role !== "Admin" && !(user.role === VIEWER_ROLE && user.isTestAccount === true))
        .map(user => {
            const key = directoryKey(user);
            const profile = db.hr?.employeeProfiles?.[user.id] || db.hr?.employeeProfiles?.[user.employeeId] || db.hr?.employeeProfiles?.[key] || {};
            const names = splitName(user.name);
            return {
                id: key,
                firstName: names.firstName,
                lastName: names.lastName,
                phone: cleanText(user.phone, 80),
                nickname: cleanText(user.nickname || profile.nickname, 100),
                photoUrl: cleanText(profile.profilePhotoUrl || profile.photoUrl || user.profilePhotoUrl, 1000),
                position: cleanText(profile.position || user.role, 120),
                department: cleanText(profile.department || "ไม่ระบุแผนก", 120)
            };
        })
        .sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`, "th"));
}

function changePassword(user, password, now = new Date().toISOString()) {
    if (!user || user.role !== VIEWER_ROLE) fail("บัญชีนี้ไม่มีสิทธิ์เปลี่ยนรหัสผ่านทะเบียนบุคลากร", 403);
    const nextPassword = String(password || "");
    if (nextPassword.length < 6) fail("รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร");
    user.passwordHash = hashPassword(nextPassword);
    user.mustChangePassword = false;
    user.passwordChangedAt = now;
    user.updatedAt = now;
    return { ok: true, mustChangePassword: false };
}

function updatePerson(db, { actor, employeeId, changes, photoUrl = "", now = new Date().toISOString() }) {
    if (!actor || actor.role !== VIEWER_ROLE) fail("เฉพาะผู้ดูแลทะเบียนบุคลากรเท่านั้นที่แก้ไขข้อมูลได้", 403);
    const key = cleanText(employeeId, 120);
    const user = (db.users || []).find(item => matchesDirectoryKey(item, key));
    if (!user || user.status === "Inactive" || user.role === "Admin" || (user.role === VIEWER_ROLE && user.isTestAccount === true)) fail(`ไม่พบพนักงานที่แก้ไขได้ (ID: ${key || "ไม่ระบุ"})`, 404);
    const firstName = cleanText(changes?.firstName, 120);
    const lastName = cleanText(changes?.lastName, 120);
    if (!firstName) fail("กรุณาระบุชื่อ");
    const userKey = directoryKey(user);
    const profile = db.hr?.employeeProfiles?.[user.id] || db.hr?.employeeProfiles?.[user.employeeId] || db.hr?.employeeProfiles?.[userKey] || {};
    const protectedSnapshot = {
        code: user.code,
        role: user.role,
        vehiclePlate: user.vehiclePlate,
        salary: profile.salary,
        baseSalary: profile.baseSalary,
        payroll: profile.payroll
    };
    user.name = [firstName, lastName].filter(Boolean).join(" ");
    user.phone = cleanText(changes?.phone, 80);
    user.nickname = cleanText(changes?.nickname, 100);
    user.updatedAt = now;
    db.hr ||= {};
    db.hr.employeeProfiles ||= {};
    db.hr.employeeProfiles[userKey] = {
        ...profile,
        employeeId: userKey,
        nickname: user.nickname,
        position: cleanText(changes?.position, 120),
        department: cleanText(changes?.department, 120),
        ...(photoUrl ? { profilePhotoUrl: photoUrl } : {}),
        updatedAt: now
    };
    Object.assign(user, { code: protectedSnapshot.code, role: protectedSnapshot.role, vehiclePlate: protectedSnapshot.vehiclePlate });
    Object.assign(db.hr.employeeProfiles[userKey], {
        salary: protectedSnapshot.salary,
        baseSalary: protectedSnapshot.baseSalary,
        payroll: protectedSnapshot.payroll
    });
    db.hr.auditLogs ||= [];
    db.hr.auditLogs.push({
        id: `HRAUD-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
        action: "PeopleDirectoryProfileUpdated",
        actorId: actor.id,
        employeeId: userKey,
        fields: ["name", "phone", "nickname", "position", "department", ...(photoUrl ? ["photo"] : [])],
        at: now
    });
    return directory(db).find(item => item.id === userKey);
}

module.exports = { VIEWER_ROLE, TEST_VIEWER_CODE, validateRecords, provision, provisionTest, provisionAdditional, directory, changePassword, createPerson, updatePerson };
