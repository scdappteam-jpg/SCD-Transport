const crypto = require("crypto");

function fail(message, statusCode = 400) {
    throw Object.assign(new Error(message), { statusCode });
}

function clean(value, max = 500) {
    return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function nameKey(value) {
    return clean(value, 220).toLocaleLowerCase("th-TH")
        .replace(/^(?:mr|mrs|ms|miss)\.?\s*/i, "")
        .replace(/^(?:นาย|นางสาว|นาง|น\.ส\.)\s*/u, "")
        .replace(/[^\p{L}\p{N}]+/gu, "");
}

function phoneKey(value) {
    return clean(value, 80).replace(/\D/g, "");
}

function plateKey(value) {
    return clean(value, 120).toLocaleUpperCase("th-TH").replace(/\s+/g, "");
}

function hashPassword(password) {
    const salt = crypto.randomBytes(16);
    const expected = crypto.scryptSync(password, salt, 64);
    return `scrypt$${salt.toString("base64")}$${expected.toString("base64")}`;
}

function stableVehicleId(plate) {
    return `veh_${crypto.createHash("sha256").update(plateKey(plate)).digest("hex").slice(0, 18)}`;
}

function normalizeRecord(record, index) {
    const suppliedName = clean(record.name, 220);
    const thaiName = clean(record.thaiName, 220) || (/\p{Script=Thai}/u.test(suppliedName) ? suppliedName : "");
    const englishName = clean(record.englishName, 220) || (/[A-Za-z]/.test(suppliedName) && !/\p{Script=Thai}/u.test(suppliedName) ? suppliedName : "");
    const item = {
        employeeCode: clean(record.employeeCode, 32).toUpperCase(),
        matchUserId: clean(record.matchUserId, 100),
        matchName: clean(record.matchName, 220),
        name: thaiName || englishName || suppliedName,
        thaiName,
        englishName,
        nickname: clean(record.nickname, 100),
        nationality: clean(record.nationality, 100),
        phone: clean(record.phone, 80),
        vehiclePlate: clean(record.vehiclePlate, 120).toUpperCase(),
        primaryPlate: clean(record.primaryPlate, 60).toUpperCase(),
        trailerPlate: clean(record.trailerPlate, 60).toUpperCase(),
        vehicleType: clean(record.vehicleType, 80),
        temporaryPassword: String(record.temporaryPassword || ""),
        organization: clean(record.organization, 220),
        route: clean(record.route, 220),
        sourceSheet: clean(record.sourceSheet || "SCD", 120),
        sourceRow: Number(record.sourceRow) || 0
    };
    if (!item.vehiclePlate) fail(`รายการ ${index + 1}: ไม่พบทะเบียนรถ`);
    if (item.name && !/^(?:DRV|EMP)\d{3,6}$/.test(item.employeeCode)) fail(`รายการ ${index + 1}: รหัสคนขับต้องเป็น DRV หรือ EMP ตามด้วยตัวเลข`);
    if (item.name && item.temporaryPassword.length < 12) fail(`รายการ ${index + 1}: รหัสผ่านชั่วคราวต้องมีอย่างน้อย 12 ตัวอักษร`);
    if (!item.primaryPlate) [item.primaryPlate, item.trailerPlate = ""] = item.vehiclePlate.split("+", 2).map(value => clean(value, 60));
    return item;
}

function sameFleetUser(user, item) {
    return clean(user.phone) === item.phone && clean(user.vehiclePlate) === item.vehiclePlate && clean(user.vehicleType) === item.vehicleType &&
        (!item.thaiName || clean(user.thaiName || user.name) === item.thaiName) &&
        (!item.englishName || clean(user.englishName) === item.englishName) &&
        (!item.nickname || clean(user.nickname) === item.nickname) &&
        (!item.nationality || clean(user.nationality) === item.nationality) && user.status === "Active";
}

function uniqueIndex(entries) {
    const grouped = new Map();
    for (const [key, value] of entries) {
        if (!key) continue;
        const values = grouped.get(key) || new Set();
        values.add(value);
        grouped.set(key, values);
    }
    return new Map([...grouped].flatMap(([key, values]) => values.size === 1 ? [[key, [...values][0]]] : []));
}

function mergePersonRows(rows) {
    const groups = [];
    const byStrongKey = new Map();
    for (const item of rows.filter(row => row.name)) {
        const keys = [
            phoneKey(item.phone).length >= 8 ? `phone:${phoneKey(item.phone)}` : "",
            item.matchUserId ? `user:${item.matchUserId}` : "",
            item.employeeCode ? `code:${item.employeeCode}` : "",
            item.matchName ? `name:${nameKey(item.matchName)}` : "",
            item.thaiName ? `name:${nameKey(item.thaiName)}` : "",
            item.englishName ? `name:${nameKey(item.englishName)}` : ""
        ].filter(Boolean);
        const matches = [...new Set(keys.map(key => byStrongKey.get(key)).filter(Boolean))];
        if (matches.length > 1) fail(`ข้อมูลคนขับชนกันหลายบัญชี: ${item.name}`);
        let group = matches[0];
        if (!group) {
            group = { rows: [], profile: { ...item } };
            groups.push(group);
        }
        group.rows.push(item);
        for (const field of ["thaiName", "englishName", "nickname", "nationality", "phone", "matchUserId", "matchName"]) {
            if (!group.profile[field] && item[field]) group.profile[field] = item[field];
        }
        group.profile.name = group.profile.thaiName || group.profile.englishName || group.profile.name;
        for (const key of keys) byStrongKey.set(key, group);
    }
    return groups;
}

function importFleetDrivers(db, { actor, records, preview = true, now = new Date().toISOString() }) {
    if (!actor || actor.role !== "Admin") fail("เฉพาะ Admin เท่านั้นที่นำเข้ารถและคนขับได้", 403);
    if (!Array.isArray(records) || !records.length) fail("ไม่พบข้อมูลรถและคนขับ");
    if (records.length > 500) fail("นำเข้าได้ไม่เกิน 500 รายการ");
    const normalized = records.map(normalizeRecord);
    const personGroups = mergePersonRows(normalized);

    db.users ||= [];
    db.fleetVehicles ||= [];
    const activeDrivers = db.users.filter(user => user.role === "Driver");
    const byName = uniqueIndex(activeDrivers.flatMap(user => [user.name, user.thaiName, user.englishName].filter(Boolean).map(value => [nameKey(value), user])));
    const byPhone = uniqueIndex(activeDrivers.filter(user => phoneKey(user.phone).length >= 8).map(user => [phoneKey(user.phone), user]));
    const byCode = new Map(db.users.map(user => [clean(user.code, 32).toUpperCase(), user]));
    const plans = [];
    const conflicts = [];
    let createDriverCount = 0, updateDriverCount = 0, unchangedDriverCount = 0, vehicleOnlyCount = 0;
    for (const item of normalized.filter(item => !item.name)) {
        vehicleOnlyCount += 1;
        plans.push({ item, user: null, action: "vehicle-only" });
    }
    for (const group of personGroups) {
        const item = group.profile;
        const matchCandidates = [
            item.matchUserId ? db.users.find(candidate => candidate.id === item.matchUserId) : null,
            item.matchName ? byName.get(nameKey(item.matchName)) : null,
            item.thaiName ? byName.get(nameKey(item.thaiName)) : null,
            item.englishName ? byName.get(nameKey(item.englishName)) : null,
            byName.get(nameKey(item.name)),
            phoneKey(item.phone).length >= 8 ? byPhone.get(phoneKey(item.phone)) : null
        ].filter(Boolean);
        const distinctMatches = [...new Set(matchCandidates)];
        if (distinctMatches.length > 1) {
            conflicts.push(`${item.name}: ชื่อ/เบอร์/ทะเบียนตรงกับหลายบัญชี`);
            continue;
        }
        let user = distinctMatches[0] || null;
        if (!item.name) {
            vehicleOnlyCount += 1;
            plans.push({ item, user: null, action: "vehicle-only" });
            continue;
        }
        if (user && user.role !== "Driver") {
            conflicts.push(`${item.name}: บัญชีเดิมเป็น ${user.role}`);
            continue;
        }
        const codeOwner = byCode.get(item.employeeCode);
        if (codeOwner && codeOwner !== user) {
            conflicts.push(`${item.employeeCode}: รหัสซ้ำกับ ${codeOwner.name}`);
            continue;
        }
        const action = !user ? "create" : sameFleetUser(user, item) ? "unchanged" : "update";
        if (action === "create") createDriverCount += 1;
        if (action === "update") updateDriverCount += 1;
        if (action === "unchanged") unchangedDriverCount += 1;
        plans.push({ item, rows: group.rows, user, action });
    }
    if (conflicts.length) fail(`ข้อมูลชนกับบัญชีเดิม: ${conflicts.join("; ")}`, 409);
    const uniqueVehicleKeys = new Set(normalized.map(item => plateKey(item.vehiclePlate)));
    const existingVehicleKeys = new Set(db.fleetVehicles.map(vehicle => plateKey(vehicle.plate)));
    const createVehicleCount = [...uniqueVehicleKeys].filter(key => !existingVehicleKeys.has(key)).length;
    const updateVehicleCount = uniqueVehicleKeys.size - createVehicleCount;
    const summary = {
        preview: Boolean(preview), receivedCount: records.length, driverCount: personGroups.length,
        mergedDuplicateCount: normalized.filter(item => item.name).length - personGroups.length,
        vehicleOnlyCount, createDriverCount, updateDriverCount, unchangedDriverCount,
        uniqueVehicleCount: uniqueVehicleKeys.size, createVehicleCount, updateVehicleCount,
        activeDriversAfterImport: activeDrivers.filter(user => user.status !== "Inactive").length + createDriverCount
    };
    if (preview) return summary;

    db.hr ||= {};
    db.hr.employeeProfiles ||= {};
    db.fleetImports ||= [];
    const vehicleByKey = new Map(db.fleetVehicles.map(vehicle => [plateKey(vehicle.plate), vehicle]));
    const appliedUsers = new Map();
    for (const plan of plans) {
        const { item } = plan;
        let user = plan.user;
        if (item.name) {
            user ||= appliedUsers.get(item.employeeCode || `name:${nameKey(item.name)}`);
            if (!user) {
                user = { id: `u_scdfleet_${item.employeeCode.toLowerCase()}`, code: item.employeeCode, createdAt: now };
                db.users.push(user);
            }
            Object.assign(user, {
                name: item.thaiName || (/\p{Script=Thai}/u.test(user.name || "") ? user.name : item.name),
                thaiName: item.thaiName || user.thaiName || (/\p{Script=Thai}/u.test(user.name || "") ? user.name : ""),
                englishName: item.englishName || user.englishName || "",
                nickname: item.nickname || user.nickname || "",
                nationality: item.nationality || user.nationality || "",
                role: "Driver", status: "Active", phone: item.phone || user.phone || "",
                vehiclePlate: plan.rows?.[0]?.vehiclePlate || item.vehiclePlate, vehicleType: plan.rows?.[0]?.vehicleType || item.vehicleType,
                updatedAt: now, fleetSourceSheet: item.sourceSheet, fleetSourceRow: item.sourceRow
            });
            if (plan.action === "create") {
                user.passwordHash = hashPassword(item.temporaryPassword);
                user.credentialIssuedAt = now;
                user.mustChangePassword = true;
            }
            db.hr.employeeProfiles[user.id] = {
                ...(db.hr.employeeProfiles[user.id] || {}), employeeId: user.id,
                department: "Transport", position: "Driver", employeeLevel: "Staff",
                branch: "Suvanabhumi Branch", employmentType: "Full-time",
                assignedLocationIds: db.hr.employeeProfiles[user.id]?.assignedLocationIds || [],
                createdAt: db.hr.employeeProfiles[user.id]?.createdAt || now, updatedAt: now
            };
            Object.assign(db.hr.employeeProfiles[user.id], {
                englishName: user.englishName,
                nickname: user.nickname,
                nationality: user.nationality
            });
            appliedUsers.set(item.employeeCode || `name:${nameKey(item.name)}`, user);
        }
        for (const row of plan.rows || [item]) {
            const key = plateKey(row.vehiclePlate);
            let vehicle = vehicleByKey.get(key);
            if (!vehicle) {
                vehicle = { id: stableVehicleId(row.vehiclePlate), plate: row.vehiclePlate, createdAt: now, status: "Active" };
                db.fleetVehicles.push(vehicle);
                vehicleByKey.set(key, vehicle);
            }
            vehicle.primaryPlate = row.primaryPlate;
            vehicle.trailerPlate = row.trailerPlate;
            vehicle.vehicleType = row.vehicleType;
            vehicle.status = "Active";
            vehicle.sourceSheet = row.sourceSheet;
            vehicle.sourceRows = [...new Set([...(vehicle.sourceRows || []), row.sourceRow])];
            vehicle.driverIds = [...new Set([...(vehicle.driverIds || []), ...(user ? [user.id] : [])])];
            const assignment = { organization: row.organization, route: row.route, driverId: user?.id || "", sourceRow: row.sourceRow, sourceSheet: row.sourceSheet };
            vehicle.assignments = [...(vehicle.assignments || []).filter(old => old.sourceRow !== row.sourceRow || old.sourceSheet !== row.sourceSheet), assignment];
            vehicle.updatedAt = now;
            vehicle.updatedBy = actor.id;
        }
    }
    const importRecord = { id: `FLEETIMP-${Date.now()}`, appliedAt: now, appliedBy: actor.id, ...summary, preview: false };
    db.fleetImports.push(importRecord);
    db.fleetImports = db.fleetImports.slice(-20);
    return { ...summary, preview: false, importId: importRecord.id };
}

function visibleFleet(db) {
    const users = new Map((db.users || []).map(user => [user.id, user]));
    return (db.fleetVehicles || []).filter(vehicle => vehicle.status !== "Inactive").map(vehicle => ({
        id: vehicle.id, plate: vehicle.plate, primaryPlate: vehicle.primaryPlate || "", trailerPlate: vehicle.trailerPlate || "",
        vehicleType: vehicle.vehicleType || "", drivers: (vehicle.driverIds || []).map(id => users.get(id)).filter(Boolean).map(user => ({ id: user.id, code: user.code, name: user.name, thaiName: user.thaiName || "", englishName: user.englishName || "", nickname: user.nickname || "", nationality: user.nationality || "", phone: user.phone || "" })),
        assignments: vehicle.assignments || []
    })).sort((a, b) => a.plate.localeCompare(b.plate, "th"));
}

module.exports = { importFleetDrivers, normalizeRecord, visibleFleet };
