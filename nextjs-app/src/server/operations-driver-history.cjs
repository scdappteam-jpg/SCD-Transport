/* eslint-disable @typescript-eslint/no-require-imports -- shared server-only CommonJS domain service */
// Read-only compatibility projection. Never backfill timestamps or mutate jobs.
const labels = {
    RouteStarted: 'เริ่มรอบรับสินค้า', CheckIn: 'ถึงจุดรับสินค้า', Loading: 'โหลดสินค้าขึ้นรถ',
    PickupComplete: 'รับสินค้าและเริ่มกลับ WH3', ArrivedWH3: 'ถึง WH3',
    ReleaseDocumentReceived: 'รับใบตรวจปล่อย'
};
const validTime = value => Boolean(value && Number.isFinite(Date.parse(value)));
function index(db) {
    const byHouse = new Map(), users = new Map((db.users || []).map(u => [u.id, u.name]));
    for (const log of db.activityLogs || []) {
        if (!labels[log.activityType] || !log.houseNumber) continue;
        const endMilestone = ['PickupComplete','ArrivedWH3','ReleaseDocumentReceived'].includes(log.activityType);
        const candidates = endMilestone ? [log.endTime,log.startTime,log.createdAt] : [log.startTime,log.createdAt];
        const at = candidates.find(validTime);
        if (!validTime(at)) continue;
        if (!byHouse.has(log.houseNumber)) byHouse.set(log.houseNumber, []);
        byHouse.get(log.houseNumber).push({at, action:'driver-event', stage:labels[log.activityType],
            actorId:log.userId || '', reportedBy:users.get(log.userId) || log.userId || 'ไม่ระบุ',
            channel:'App', note:'', source:'Driver Log', synthetic:/^SIT/i.test(log.houseNumber),
            activityType:log.activityType, eventId:log.logId || ''});
    }
    return byHouse;
}
function events(job, byHouse) {
    const seen = new Set();
    return [...job.operationsEvents || [], ...byHouse.get(job.houseNumber) || []].filter(e => {
        const key = JSON.stringify([e.at, e.action, e.stage, e.actorId, e.eventId || '']);
        if (seen.has(key)) return false;
        seen.add(key); return true;
    }).sort((a,b) => String(a.at).localeCompare(String(b.at)));
}
const round = require('../../public/legacy/transport-round-core.js').identity;
module.exports = {index, events, round};
