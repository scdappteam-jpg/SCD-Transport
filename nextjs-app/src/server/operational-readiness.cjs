/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS server compatibility boundary */
const crypto = require('node:crypto');

const clean = (value, max = 300) => String(value || '').trim().replace(/\s+/g, ' ').slice(0, max);
const fail = (message, statusCode = 422) => { throw Object.assign(new Error(message), { statusCode }); };
const ADMIN_ROLES = new Set(['Admin', 'Executive']);

function defaults() {
    return {
        attendance: { enabled: false, radiusMeters: 200, allowCardOrUsername: true, requirePin: true, requireDeviceBinding: true, oneCheckInPerWorkDate: true, workHoursOnly: true },
        warehouse: { requiredZoneCount: 11, defaultPalletCapacity: 10 },
        pxAlert: { enabled: false, staleMinutes: 60, escalationMinutes: 15 },
        nextTripNotify: { enabled: true },
        kiosk: { enabled: true, autoLogoutMinutes: 5 },
        driverUi: { fontScale: 'normal', allowUserScale: true },
        incentive: { enabled: false, amount: 1000, approvalRole: 'HR_Manager', rule: 'zero_error_monthly' },
        pdpa: { consentVersion: '', retentionDays: 365, gpsWorkHoursOnly: true },
        security: { backupEnabled: false, monitoringEnabled: false, lastRestoreTestAt: '' }
    };
}

function config(db) {
    const base = defaults(), saved = db.operationalReadiness || {};
    return Object.fromEntries(Object.keys(base).map(key => [key, { ...base[key], ...(saved[key] || {}) }]));
}

function activeZones(db) {
    return (db.warehouseMap?.zones || []).filter(zone => zone.active !== false);
}

function readiness(db) {
    const cfg = config(db);
    const zones = activeZones(db);
    const capacityZones = zones.filter(zone => Number(zone.maxPallets || zone.maxBoxes || zone.maxAreaSqm || zone.maxVolumeCbm) > 0);
    const locations = (db.hr?.checkInLocations || []).filter(location => location.active !== false && Number.isFinite(Number(location.latitude)) && Number.isFinite(Number(location.longitude)));
    const consents = db.pdpaConsents || [];
    const activeEmployees = (db.users || []).filter(user => user.status !== 'Inactive' && !['Admin', 'People_Viewer'].includes(user.role));
    const consentEmployees = new Set(consents.filter(item => item.status === 'Granted' && item.version === cfg.pdpa.consentVersion).map(item => item.employeeId));
    const activeDeviceUsers = new Set((db.attendanceDeviceBindings || []).filter(item => item.status === 'Active').map(item => item.userId));
    const deviceReady = activeEmployees.filter(user => user.pinHash && activeDeviceUsers.has(user.id));
    const foreignEmployees = activeEmployees.filter(user => clean(user.nationality) && !['ไทย', 'Thai', 'TH'].includes(clean(user.nationality)));
    const today = new Date().toISOString().slice(0, 10);
    const compliantForeign = new Set((db.employeeComplianceDocuments || []).filter(item => item.status === 'Verified' && item.expiryDate >= today && ['Passport', 'WorkPermit'].includes(item.type)).map(item => `${item.employeeId}:${item.type}`));
    const checks = [
        { id: 'radius', label: 'รัศมีเช็กอิน 200 เมตร', ok: Number(db.hr?.settings?.attendance?.defaultRadiusMeters) === 200 },
        { id: 'geofence', label: 'เปิดบังคับจุดเช็กอินจริง', ok: locations.length > 0 && db.hr?.settings?.attendance?.enforceAssignedLocations === true, detail: `${locations.length} จุด` },
        { id: 'attendance-evidence', label: 'เปิดใช้ Username/บัตร + PIN + ผูกอุปกรณ์ 1 คนต่อ 1 เครื่อง', ok: cfg.attendance.enabled && cfg.attendance.requirePin && cfg.attendance.requireDeviceBinding && cfg.attendance.oneCheckInPerWorkDate },
        { id: 'device-enrollment', label: 'พนักงานมี PIN และลงทะเบียนอุปกรณ์ครบ', ok: activeEmployees.length > 0 && deviceReady.length === activeEmployees.length, detail: `${deviceReady.length}/${activeEmployees.length} คน` },
        { id: 'warehouse-zones', label: `โซนคลังอย่างน้อย ${cfg.warehouse.requiredZoneCount} โซน`, ok: zones.length >= cfg.warehouse.requiredZoneCount, detail: `${zones.length} โซน` },
        { id: 'warehouse-capacity', label: 'กำหนดความจุทุกโซนหลัก', ok: capacityZones.length >= cfg.warehouse.requiredZoneCount, detail: `${capacityZones.length}/${cfg.warehouse.requiredZoneCount} โซน` },
        { id: 'pdpa-version', label: 'กำหนดรุ่นเอกสาร PDPA', ok: Boolean(cfg.pdpa.consentVersion) },
        { id: 'pdpa-consent', label: 'พนักงานให้ความยินยอมครบ', ok: activeEmployees.length > 0 && activeEmployees.every(user => consentEmployees.has(user.id)), detail: `${consentEmployees.size}/${activeEmployees.length} คน` },
        { id: 'foreign-docs', label: 'Passport/Work Permit พนักงานต่างชาติครบ', ok: foreignEmployees.every(user => compliantForeign.has(`${user.id}:Passport`) && compliantForeign.has(`${user.id}:WorkPermit`)), detail: `${foreignEmployees.length} คน` },
        { id: 'px-alert', label: 'เปิด PX Alert และกำหนด Escalation', ok: cfg.pxAlert.enabled && cfg.pxAlert.escalationMinutes > 0 },
        { id: 'driver-next-trip', label: 'แจ้งงานถัดไประดับรอบรถ', ok: cfg.nextTripNotify.enabled === true },
        { id: 'kiosk', label: 'Kiosk/จอคิวแบบอ่านอย่างเดียว', ok: cfg.kiosk.enabled === true && Number(cfg.kiosk.autoLogoutMinutes) > 0 },
        { id: 'backup', label: 'Backup และ Restore Test', ok: cfg.security.backupEnabled && Boolean(cfg.security.lastRestoreTestAt) },
        { id: 'monitoring', label: 'Production Monitoring', ok: cfg.security.monitoringEnabled }
    ];
    return { score: Math.round(checks.filter(item => item.ok).length / checks.length * 100), checks };
}

function saveConfig(db, actor, patch, at) {
    if (!actor || actor.role !== 'Admin') fail('เฉพาะ Admin เท่านั้นที่แก้ไข Readiness ได้', 403);
    const base = config(db), next = structuredClone(base);
    for (const key of Object.keys(defaults())) if (patch?.[key] && typeof patch[key] === 'object') Object.assign(next[key], patch[key]);
    if (patch?.attendance) { Object.assign(next.attendance,{allowCardOrUsername:true,requirePin:true,requireDeviceBinding:true,oneCheckInPerWorkDate:true});delete next.attendance.requireEmployeeQr;delete next.attendance.requireSelfieEvidence;delete next.attendance.requireFaceVerification;delete next.attendance.faceMode; }
    const radius = Number(next.attendance.radiusMeters);
    if (radius !== 200) fail('ตามมติประชุม รัศมีเช็กอินต้องเป็น 200 เมตร');
    if (!Number.isInteger(Number(next.warehouse.requiredZoneCount)) || Number(next.warehouse.requiredZoneCount) < 1) fail('จำนวนโซนไม่ถูกต้อง');
    if (!Number.isFinite(Number(next.incentive.amount)) || Number(next.incentive.amount) < 0) fail('จำนวน Incentive ไม่ถูกต้อง');
    if (!Number.isInteger(Number(next.pdpa.retentionDays)) || Number(next.pdpa.retentionDays) < 1) fail('ระยะเวลาเก็บข้อมูลไม่ถูกต้อง');
    if (next.attendance.enabled && (!next.pdpa.consentVersion || next.pdpa.gpsWorkHoursOnly !== true)) fail('ต้องกำหนดรุ่น PDPA และจำกัด GPS เฉพาะเวลางานก่อนเปิดหลักฐานเช็กอิน');
    next.updatedAt = at; next.updatedBy = actor.id;
    db.operationalReadiness = next;
    db.hr ||= {}; db.hr.settings ||= {}; db.hr.settings.attendance ||= {};
    db.hr.settings.attendance.defaultRadiusMeters = 200;
    audit(db, actor.id, 'OperationalReadinessConfigured', { sections: Object.keys(patch || {}) }, at);
    return { config: next, readiness: readiness(db) };
}

function recordConsent(db, actor, payload, at) {
    if (!actor || !ADMIN_ROLES.has(actor.role)) fail('ไม่มีสิทธิ์บันทึกความยินยอม', 403);
    const employeeId = clean(payload.employeeId, 120), version = clean(payload.version, 80), status = clean(payload.status, 20);
    if (!(db.users || []).some(user => user.id === employeeId && user.status !== 'Inactive')) fail('ไม่พบพนักงาน');
    if (!version || !['Granted', 'Withdrawn'].includes(status)) fail('ระบุรุ่นเอกสารและสถานะความยินยอมให้ถูกต้อง');
    const record = { id: `PDPA-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`, employeeId, version, status, method: clean(payload.method || 'SignedDocument', 80), evidenceRef: clean(payload.evidenceRef, 500), recordedAt: at, recordedBy: actor.id };
    db.pdpaConsents = [...(db.pdpaConsents || []), record].slice(-5000);
    audit(db, actor.id, 'PdpaConsentRecorded', { employeeId, version, status }, at);
    return record;
}

function saveEmployeeDocument(db, actor, payload, at) {
    if (!actor || !['Admin', 'Executive', 'HR_Manager'].includes(actor.role)) fail('ไม่มีสิทธิ์จัดการเอกสารพนักงาน', 403);
    const employeeId = clean(payload.employeeId, 120), type = clean(payload.type, 30);
    if (!(db.users || []).some(user => user.id === employeeId && user.status !== 'Inactive')) fail('ไม่พบพนักงาน');
    if (!['Passport', 'WorkPermit', 'BackgroundCheck'].includes(type)) fail('ประเภทเอกสารไม่ถูกต้อง');
    if (!clean(payload.documentNumber, 120) || !clean(payload.expiryDate, 20) || !/^\d{4}-\d{2}-\d{2}$/.test(payload.expiryDate)) fail('ระบุเลขเอกสารและวันหมดอายุให้ครบ');
    if (!clean(payload.evidenceRef, 500)) fail('ต้องแนบหรืออ้างอิงไฟล์เอกสาร');
    const record = { id: `COMPLY-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`, employeeId, type, documentNumber: clean(payload.documentNumber, 120), expiryDate: payload.expiryDate, status: payload.status === 'Verified' ? 'Verified' : 'PendingReview', evidenceRef: clean(payload.evidenceRef, 500), recordedAt: at, recordedBy: actor.id };
    db.employeeComplianceDocuments = [...(db.employeeComplianceDocuments || []).filter(item => !(item.employeeId === employeeId && item.type === type)), record];
    audit(db, actor.id, 'EmployeeComplianceDocumentSaved', { employeeId, type, status: record.status }, at);
    return record;
}

function evaluatePx(db, at) {
    const cfg = config(db).pxAlert;
    if (!cfg.enabled) return db.pxAlerts || [];
    const now = Date.parse(at), terminal = new Set(['Billed', 'InvoiceSent', 'Cancelled', 'LoadingCompleted', 'LoadingDetailCompleted']);
    db.pxAlerts ||= [];
    for (const job of db.jobs || []) {
        if (terminal.has(job.status)) continue;
        const reasons = [];
        if (job.inboundHold?.state === 'Open') reasons.push('InboundHold');
        if (job.status === 'Stored' && (!job.locationId || !job.qaVerified)) reasons.push('StoredWithoutLocationOrQA');
        if (job.status === 'WaitingForDock' && !job.arrivedWh3At) reasons.push('DockQueueWithoutArrival');
        const updated = Date.parse(job.updatedAt || job.createdAt || '');
        if (Number.isFinite(updated) && now - updated >= Number(cfg.staleMinutes) * 60000) reasons.push('NoProgress');
        for (const reason of reasons) {
            const key = `${job.houseNumber}:${reason}`;
            if (db.pxAlerts.some(item => item.key === key && item.status === 'Open')) continue;
            db.pxAlerts.push({ id: `PX-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`, key, houseNumber: job.houseNumber, reason, status: 'Open', openedAt: at, assignedRole: 'WH3_TeamLeader' });
        }
    }
    for (const item of db.pxAlerts) if (item.status === 'Open' && now - Date.parse(item.openedAt) >= Number(cfg.escalationMinutes) * 60000) { item.severity = 'Escalated'; item.escalatedAt ||= at; }
    db.pxAlerts = db.pxAlerts.slice(-1000);
    return db.pxAlerts;
}

function updatePx(db, actor, payload, at) {
    if (!actor || !['Admin', 'Executive', 'WH3_TeamLeader', 'Team_Transport'].includes(actor.role)) fail('ไม่มีสิทธิ์จัดการ PX Alert', 403);
    const alert = (db.pxAlerts || []).find(item => item.id === payload.alertId);
    if (!alert) fail('ไม่พบ PX Alert', 404);
    if (!['Acknowledged', 'Resolved'].includes(payload.status)) fail('สถานะไม่ถูกต้อง');
    alert.status = payload.status; alert.note = clean(payload.note, 500); alert.updatedAt = at; alert.updatedBy = actor.id;
    return alert;
}

function setNextTrip(db, actor, payload, at) {
    if (!actor || !['Admin', 'Team_Transport', 'Transport'].includes(actor.role)) fail('ไม่มีสิทธิ์กำหนดงานต่อ', 403);
    const roundId = clean(payload.roundId, 160), nextDestination = clean(payload.nextDestination, 200);
    if (!roundId || !nextDestination) fail('ระบุรอบรถและปลายทางงานต่อ');
    const jobs = (db.jobs || []).filter(job => [job.vehicleRoundId, job.assignmentRoundId, job.roundId].includes(roundId));
    if (!jobs.length) fail('ไม่พบรอบรถ', 404);
    const notice = { roundId, nextDestination, expectedAt: clean(payload.expectedAt, 40), note: clean(payload.note, 500), notifiedAt: at, notifiedBy: actor.id };
    for (const job of jobs) job.nextTripNotice = notice;
    audit(db, actor.id, 'NextTripNoticeSaved', { roundId, houses: jobs.map(job => job.houseNumber), nextDestination }, at);
    return { notice, houses: jobs.map(job => job.houseNumber) };
}

function emergencySlot(db, actor, payload, at) {
    // SRS 2: Transport admin (and WH3 lead / Admin) may jump the queue with a reason.
    if (!actor || !['Admin', 'Team_Transport', 'WH3_TeamLeader'].includes(actor.role)) fail('เฉพาะ Admin, ทีมจัดรถ หรือหัวหน้าคลังเท่านั้นที่แทรกคิวฉุกเฉินได้', 403);
    const houseNumber = clean(payload.houseNumber, 100), reason = clean(payload.reason, 500);
    if (!houseNumber || reason.length < 5) fail('ระบุ House และเหตุผลอย่างน้อย 5 ตัวอักษร');
    db.dock ||= {}; db.dock.queue ||= [];
    const index = db.dock.queue.findIndex(item => item.houseNumber === houseNumber);
    if (index < 0) fail('House นี้ไม่ได้อยู่ในคิวรถ', 404);
    const [entry] = db.dock.queue.splice(index, 1);
    Object.assign(entry, { emergency: true, emergencyReason: reason, emergencyAt: at, emergencyBy: actor.id });
    db.dock.queue.unshift(entry);
    db.dock.log = [...(db.dock.log || []), { action: 'EmergencySlotInserted', houseNumber, reason, at, by: actor.id }].slice(-500);
    return entry;
}

function incentivePreview(db, month) {
    if (!/^\d{4}-\d{2}$/.test(month || '')) fail('เดือนต้องอยู่ในรูปแบบ YYYY-MM');
    const cfg = config(db).incentive;
    const errors = db.qualityErrors || [];
    return (db.users || []).filter(user => user.status !== 'Inactive' && ['Driver', 'WH_Staff', 'Tagging_Staff', 'QA_Inspector', 'Check_House'].includes(user.role)).map(user => {
        const count = errors.filter(item => item.employeeId === user.id && String(item.at || '').slice(0, 7) === month && item.status !== 'Voided').length;
        return { employeeId: user.id, name: user.name, errorCount: count, eligible: cfg.enabled && count === 0, amount: cfg.enabled && count === 0 ? Number(cfg.amount) : 0 };
    });
}

function audit(db, actorId, action, detail, at) {
    db.hr ||= {}; db.hr.auditLogs ||= [];
    db.hr.auditLogs.push({ id: `HRAUD-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`, actorId, action, detail, at });
}

module.exports = { defaults, config, readiness, saveConfig, recordConsent, saveEmployeeDocument, evaluatePx, updatePx, setNextTrip, emergencySlot, incentivePreview };
