/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS server compatibility boundary */
const crypto = require('node:crypto');

const clean = (value, max = 160) => String(value || '').trim().slice(0, max);
const fail = (message, statusCode = 422, code = 'DEVICE_AUTH_ERROR', detail = {}) => {
    throw Object.assign(new Error(message), { statusCode, code, ...detail });
};
const sha = value => crypto.createHash('sha256').update(String(value || '')).digest('hex');
const APPROVER_ROLES = new Set(['Admin', 'Executive', 'HR_Manager', 'WH3_TeamLeader', 'Team_Transport']);

function pinHash(pin) {
    const salt = crypto.randomBytes(16), derived = crypto.scryptSync(String(pin), salt, 64);
    return `scrypt$${salt.toString('base64')}$${derived.toString('base64')}`;
}

function pinMatches(pin, encoded) {
    const [algorithm, salt, expected] = String(encoded || '').split('$');
    if (algorithm !== 'scrypt' || !salt || !expected) return false;
    const actual = crypto.scryptSync(String(pin), Buffer.from(salt, 'base64'), 64), target = Buffer.from(expected, 'base64');
    return actual.length === target.length && crypto.timingSafeEqual(actual, target);
}

function validatePin(pin, user) {
    const value = String(pin || '');
    if (!/^\d{6}$/.test(value)) fail('PIN ต้องเป็นตัวเลข 6 หลัก', 422, 'PIN_FORMAT');
    if (/^([0-9])\1{5}$/.test(value) || ['123456', '654321', '000000'].includes(value) || value === String(user?.code || '').replace(/\D/g, '').slice(-6)) {
        fail('PIN นี้เดาง่ายเกินไป กรุณาเลือกเลขอื่น', 422, 'PIN_WEAK');
    }
    return value;
}

function setPin(db, user, pin, at) {
    validatePin(pin, user);
    user.pinHash = pinHash(pin);
    user.pinUpdatedAt = at;
    user.pinFailedAttempts = 0;
    user.pinLockedUntil = '';
    audit(db, user.id, 'PinConfigured', { employeeId: user.id }, at);
    return { ok: true, pinConfigured: true };
}

function provisionTestPin(db, user, pin, version, at) {
    if (!user?.isTestAccount) fail('ตั้ง PIN แบบคงที่ได้เฉพาะบัญชีทดสอบ', 403, 'TEST_ACCOUNT_REQUIRED');
    const value = String(pin || '');
    if (!/^\d{6}$/.test(value)) fail('PIN ต้องเป็นตัวเลข 6 หลัก', 422, 'PIN_FORMAT');
    const marker = clean(version, 80);
    if (!marker) fail('กรุณาระบุเวอร์ชัน PIN ทดสอบ', 422, 'PIN_VERSION_REQUIRED');
    if (user.testPinVersion === marker && user.pinHash) return { changed: false };
    user.pinHash = pinHash(value);
    user.pinUpdatedAt = at;
    user.pinFailedAttempts = 0;
    user.pinLockedUntil = '';
    user.testPinVersion = marker;
    for (const binding of db.attendanceDeviceBindings || []) {
        if (binding.userId === user.id && binding.status === 'Active') {
            binding.status = 'Revoked';
            binding.revokedAt = at;
            binding.revokedReason = 'TestPinReprovisioned';
        }
    }
    audit(db, user.id, 'TestPinProvisioned', { employeeId: user.id, version: marker }, at);
    return { changed: true };
}

function rateState(db, userId, now = Date.now()) {
    db.deviceLoginAttempts = (db.deviceLoginAttempts || []).filter(item => now - Date.parse(item.at) < 24 * 60 * 60 * 1000).slice(-2000);
    const failures = db.deviceLoginAttempts.filter(item => item.userId === userId && item.result === 'Failed').sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    const lastFive = failures.slice(-5);
    const triggered = lastFive.length === 5 && Date.parse(lastFive.at(-1).at) - Date.parse(lastFive[0].at) <= 15 * 60 * 1000;
    const lockedUntil = triggered ? Date.parse(lastFive.at(-1).at) + 30 * 60 * 1000 : 0;
    return { recent: lastFive, locked: triggered && now < lockedUntil, lockedUntil: lockedUntil ? new Date(lockedUntil).toISOString() : '' };
}

function recordAttempt(db, userId, result, reason, at) {
    db.deviceLoginAttempts = [...(db.deviceLoginAttempts || []), { id: crypto.randomUUID(), userId, result, reason: clean(reason, 80), at }].slice(-2000);
}

function findUser(db, login) {
    const key = clean(login, 120).toUpperCase();
    return (db.users || []).find(user => user.status !== 'Inactive' && (String(user.id).toUpperCase() === key || String(user.code || '').toUpperCase() === key));
}

function deviceHash(token) {
    const value = clean(token, 200);
    if (!/^[A-Za-z0-9_-]{40,120}$/.test(value)) fail('อุปกรณ์นี้ยังไม่พร้อมลงทะเบียน กรุณารีเฟรชหน้า', 400, 'DEVICE_TOKEN_INVALID');
    return sha(value);
}

function activeBindings(db) {
    db.attendanceDeviceBindings ||= [];
    return db.attendanceDeviceBindings.filter(item => item.status === 'Active');
}

function pendingRequest(db, userId, hash) {
    return (db.attendanceDeviceChangeRequests || []).find(item => item.userId === userId && item.requestedDeviceHash === hash && item.status === 'Pending');
}

function requestDeviceChange(db, user, hash, label, at) {
    db.attendanceDeviceChangeRequests ||= [];
    let request = pendingRequest(db, user.id, hash);
    if (!request) {
        request = {
            id: `DEVREQ-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
            userId: user.id,
            userName: user.name,
            requestedDeviceHash: hash,
            deviceLabel: clean(label || 'อุปกรณ์ใหม่', 120),
            status: 'Pending',
            requestedAt: at
        };
        db.attendanceDeviceChangeRequests.push(request);
        audit(db, user.id, 'AttendanceDeviceChangeRequested', { requestId: request.id, deviceLabel: request.deviceLabel }, at);
    }
    return request;
}

function authenticate(db, { login, pin, deviceToken, deviceLabel, at }) {
    const user = findUser(db, login);
    if (!user) fail('ข้อมูลยืนยันไม่ถูกต้อง', 401, 'AUTH_FAILED');
    const rate = rateState(db, user.id);
    if (rate.locked) fail('ลองยืนยันหลายครั้งเกินไป กรุณารอ 30 นาทีหรือติดต่อหัวหน้า', 429, 'PIN_LOCKED');
    if (!user.pinHash || !pinMatches(pin, user.pinHash)) {
        recordAttempt(db, user.id, 'Failed', 'PinMismatch', at);
        fail('ข้อมูลยืนยันไม่ถูกต้อง', 401, 'AUTH_FAILED');
    }
    const hash = deviceHash(deviceToken), bindings = activeBindings(db);
    const ownedByDevice = bindings.find(item => item.deviceHash === hash);
    if (ownedByDevice && ownedByDevice.userId !== user.id) {
        recordAttempt(db, user.id, 'Failed', 'DeviceOwnedByAnotherEmployee', at);
        fail('อุปกรณ์นี้ผูกกับพนักงานคนอื่นอยู่แล้ว กรุณาติดต่อ Admin', 409, 'DEVICE_ALREADY_BOUND');
    }
    let binding = bindings.find(item => item.userId === user.id);
    if (binding && binding.deviceHash !== hash) {
        const request = requestDeviceChange(db, user, hash, deviceLabel, at);
        fail('พบการเปลี่ยนอุปกรณ์ ส่งคำขอให้หัวหน้าอนุมัติแล้ว', 423, 'DEVICE_CHANGE_APPROVAL_REQUIRED', { requestId: request.id });
    }
    if (!binding) {
        binding = {
            id: `DEVBIND-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
            userId: user.id,
            deviceHash: hash,
            deviceLabel: clean(deviceLabel || 'อุปกรณ์ประจำตัว', 120),
            status: 'Active',
            registeredAt: at,
            registeredBy: user.id
        };
        db.attendanceDeviceBindings.push(binding);
        audit(db, user.id, 'AttendanceDeviceRegistered', { bindingId: binding.id, deviceLabel: binding.deviceLabel }, at);
    }
    binding.lastUsedAt = at;
    recordAttempt(db, user.id, 'Passed', 'DeviceVerified', at);
    return { user, binding };
}

function verifySession(db, session, userId, deviceToken) {
    if (!session || session.userId !== userId || session.authenticationMethod !== 'PIN+DeviceBinding') {
        fail('กรุณายืนยัน PIN จากอุปกรณ์ที่ลงทะเบียนก่อนลงเวลา', 428, 'DEVICE_REAUTH_REQUIRED');
    }
    const hash = deviceHash(deviceToken);
    const binding = activeBindings(db).find(item => item.id === session.deviceBindingId && item.userId === userId && item.deviceHash === hash);
    if (!binding) fail('อุปกรณ์ไม่ตรงกับที่ลงทะเบียน กรุณาขออนุมัติเปลี่ยนเครื่อง', 423, 'DEVICE_BINDING_MISMATCH');
    binding.lastUsedAt = new Date().toISOString();
    return binding;
}

function listRequests(db, actor) {
    if (!actor || !APPROVER_ROLES.has(actor.role)) fail('ไม่มีสิทธิ์ดูคำขอเปลี่ยนอุปกรณ์', 403, 'FORBIDDEN');
    return (db.attendanceDeviceChangeRequests || []).filter(item => item.status === 'Pending').map(publicRequest);
}

function publicRequest(item) {
    return { id: item.id, userId: item.userId, userName: item.userName, deviceLabel: item.deviceLabel, status: item.status, requestedAt: item.requestedAt, decidedAt: item.decidedAt, decidedBy: item.decidedBy, note: item.note };
}

function decideRequest(db, actor, requestId, decision, note, at) {
    if (!actor || !APPROVER_ROLES.has(actor.role)) fail('ไม่มีสิทธิ์อนุมัติเปลี่ยนอุปกรณ์', 403, 'FORBIDDEN');
    const request = (db.attendanceDeviceChangeRequests || []).find(item => item.id === requestId && item.status === 'Pending');
    if (!request) fail('ไม่พบคำขอที่รออนุมัติ', 404, 'REQUEST_NOT_FOUND');
    if (!['Approved', 'Rejected'].includes(decision)) fail('ผลการอนุมัติไม่ถูกต้อง', 422, 'DECISION_INVALID');
    if (decision === 'Approved') {
        const conflict = activeBindings(db).find(item => item.deviceHash === request.requestedDeviceHash && item.userId !== request.userId);
        if (conflict) fail('อุปกรณ์นี้ถูกผูกกับพนักงานอื่นแล้ว', 409, 'DEVICE_ALREADY_BOUND');
        for (const binding of activeBindings(db).filter(item => item.userId === request.userId)) {
            binding.status = 'Replaced'; binding.replacedAt = at; binding.replacedBy = actor.id;
        }
        db.attendanceDeviceBindings.push({
            id: `DEVBIND-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
            userId: request.userId,
            deviceHash: request.requestedDeviceHash,
            deviceLabel: request.deviceLabel,
            status: 'Active',
            registeredAt: at,
            registeredBy: actor.id
        });
    }
    Object.assign(request, { status: decision, decidedAt: at, decidedBy: actor.id, note: clean(note, 500) });
    audit(db, actor.id, `AttendanceDeviceChange${decision}`, { requestId, employeeId: request.userId, note: request.note }, at);
    return publicRequest(request);
}

function resetBinding(db, actor, userId, reason, at) {
    if (!actor || actor.role !== 'Admin') fail('เฉพาะ Admin เท่านั้นที่ปลดการผูกอุปกรณ์ได้', 403, 'FORBIDDEN');
    const bindings = activeBindings(db).filter(item => item.userId === userId);
    if (!bindings.length) fail('ไม่พบอุปกรณ์ที่ผูกอยู่', 404, 'BINDING_NOT_FOUND');
    for (const binding of bindings) Object.assign(binding, { status: 'Reset', resetAt: at, resetBy: actor.id, resetReason: clean(reason, 500) });
    audit(db, actor.id, 'AttendanceDeviceBindingReset', { employeeId: userId, reason: clean(reason, 500) }, at);
    return { ok: true, userId };
}

function audit(db, actorId, action, detail, at) {
    db.hr ||= {}; db.hr.auditLogs ||= [];
    db.hr.auditLogs.push({ id: `HRAUD-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`, actorId, action, detail, at });
}

module.exports = { pinHash, pinMatches, validatePin, setPin, provisionTestPin, rateState, findUser, authenticate, verifySession, listRequests, decideRequest, resetBinding, deviceHash };
