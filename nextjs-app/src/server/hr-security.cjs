function fail(message, statusCode = 403) {
    throw Object.assign(new Error(message), { statusCode });
}

function manages(actor) {
    return !!actor && ['Admin', 'Executive'].includes(actor.role);
}

function canView(db, actor, employeeId) {
    return !!actor && (manages(actor) || actor.id === employeeId ||
        db.hr?.employeeProfiles?.[employeeId]?.supervisorId === actor.id);
}

function canLead(db, actor, employeeId) {
    return !!actor && actor.id !== employeeId && (manages(actor) ||
        db.hr?.employeeProfiles?.[employeeId]?.supervisorId === actor.id);
}

function scoped(db, actor, rows, key = 'employeeId') {
    return (rows || []).filter(row => canView(db, actor, row[key]));
}

function profiles(db, actor) {
    return Object.fromEntries(Object.entries(db.hr.employeeProfiles || {}).filter(([id]) => canView(db, actor, id)));
}

function notificationVisible(notification, actor) {
    if (!actor) return false;
    if (notification.targetUserIds?.length) return notification.targetUserIds.includes(actor.id);
    // HR notifications must always identify their recipient.
    if (notification.module === 'HR') return false;
    return !notification.targetRoles?.length || notification.targetRoles.includes(actor.role);
}

function approvalRecipients(db, employeeId) {
    const supervisorId = db.hr?.employeeProfiles?.[employeeId]?.supervisorId;
    const supervisor = (db.users || []).find(user => user.id === supervisorId && user.id !== employeeId);
    // An unassigned employee must never fall back to an unrelated team's lead.
    return supervisor ? [supervisor.id] : (db.users || []).filter(user => manages(user) && user.id !== employeeId).map(user => user.id);
}

function preflight(db, path, payload, actor) {
    if (!actor) fail('กรุณาเข้าสู่ระบบใหม่', 401);
    if (['/api/hr/profile', '/api/hr/checkin-location', '/api/hr/attendance-settings',
        '/api/hr/payroll-profile', '/api/hr/payroll-run', '/api/hr/close-month', '/api/hr/policy'].includes(path) && !manages(actor)) {
        fail('เฉพาะผู้ดูแลระบบหรือผู้บริหารเท่านั้น');
    }
    if (['/api/hr/leave', '/api/hr/ot', '/api/hr/attendance-correction'].includes(path)) {
        if (payload.employeeId !== actor.id && !manages(actor)) fail('ยื่นคำขอได้เฉพาะตนเอง');
        payload.requesterId = actor.id;
    }
    if (['/api/attendance/checkin', '/api/attendance/checkout'].includes(path)) {
        if (payload.userId !== actor.id) fail('ต้องลงเวลาด้วยบัญชีของตนเอง');
        // Simulation is never an exemption from HR GPS validation.
        if (payload.simulation !== undefined && payload.simulation !== false && payload.simulation !== true) {
            fail('ค่า simulation ไม่ถูกต้อง', 400);
        }
    }
    if (path === '/api/attendance/reallocate') {
        const record = (db.attendance || []).find(row => row.id === payload.attendanceId);
        if (!record) fail('ไม่พบ attendance record', 404);
        if (!canLead(db, actor, record.userId)) fail('ไม่มีสิทธิ์จัดการเวลาของพนักงานนี้');
        payload.by = actor.name || actor.id;
    }
    if (path === '/api/hr/request-action') {
        const list = payload.kind === 'ot' ? db.hr.otRequests : payload.kind === 'attendance' ? db.hr.attendanceCorrections : db.hr.leaveRequests;
        const request = (list || []).find(row => row.id === payload.id);
        if (!request) fail('HR request not found', 404);
        const action = payload.action;
        if (action === 'cancel' && payload.kind === 'attendance' && request.status === 'approved') {
            fail('รายการแก้ไขเวลาที่มีผลแล้วต้องส่งคำขอแก้ไขใหม่', 409);
        }
        if (['approve', 'reject'].includes(action)) {
            if (request.employeeId === actor.id) fail('ไม่สามารถอนุมัติหรือปฏิเสธคำขอของตนเอง');
            const permitted = request.status === 'pendingLead' ? canLead(db, actor, request.employeeId) : manages(actor);
            if (!permitted) fail('ไม่มีสิทธิ์อนุมัติคำขอของพนักงานนี้');
        } else if (['recordActual', 'close'].includes(action)) {
            if (!canLead(db, actor, request.employeeId)) fail('ไม่มีสิทธิ์บันทึกหรือปิด OT ของพนักงานนี้');
        } else if (action === 'cancel' && actor.id !== request.employeeId && !manages(actor)) {
            fail('ยกเลิกได้เฉพาะผู้ยื่นคำขอหรือผู้ดูแลระบบ');
        }
    }
}

function attendanceLocation(db, employeeId, latitudeValue, longitudeValue) {
    const coordinate = (value, limit) => {
        if (!['number', 'string'].includes(typeof value) || String(value).trim() === '') fail('ต้องส่งพิกัด GPS ที่ใช้ได้', 400);
        const number = Number(value);
        if (!Number.isFinite(number) || Math.abs(number) > limit) fail('ต้องส่งพิกัด GPS ที่ใช้ได้', 400);
        return number;
    };
    const latitude = coordinate(latitudeValue, 90), longitude = coordinate(longitudeValue, 180);
    const assigned = db.hr?.employeeProfiles?.[employeeId]?.assignedLocationIds || [];
    const radians = value => value * Math.PI / 180;
    const locations = (db.hr?.checkInLocations || []).filter(location => location.active !== false &&
        (!assigned.length || assigned.includes(location.id))).flatMap(location => {
        const lat = Number(location.latitude), lon = Number(location.longitude);
        const radius = Number(location.radiusMeters ?? db.hr?.settings?.attendance?.defaultRadiusMeters ?? 300);
        if (location.latitude == null || location.longitude == null || !Number.isFinite(lat) || !Number.isFinite(lon) ||
            Math.abs(lat) > 90 || Math.abs(lon) > 180 || !Number.isFinite(radius) || radius <= 0) return [];
        const h = Math.sin(radians(lat - latitude) / 2) ** 2 + Math.cos(radians(latitude)) *
            Math.cos(radians(lat)) * Math.sin(radians(lon - longitude) / 2) ** 2;
        const distanceMeters = 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
        return [{ ...location, radiusMeters: radius, distanceMeters }];
    }).sort((a, b) => a.distanceMeters - b.distanceMeters);
    const inside = locations.find(location => location.distanceMeters <= location.radiusMeters);
    const nearestLocation = inside || locations[0] || null;
    if (db.hr?.settings?.attendance?.enforceAssignedLocations && !inside) {
        fail('อยู่นอกจุดลงเวลาที่กำหนด หรือยังไม่ได้กำหนดจุด กรุณาส่งคำขอแก้ไขเวลาแทน');
    }
    return { latitude, longitude, nearestLocation, insideAllowedRadius: !!inside };
}

module.exports = { manages, canView, canLead, scoped, profiles, notificationVisible, approvalRecipients, preflight, attendanceLocation };
