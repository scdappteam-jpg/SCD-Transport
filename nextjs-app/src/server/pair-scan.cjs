// Master / Flight change re-check (SRS 5.3).
// When the Master or the Flight of a House changes while the House number
// stays, QA/QC must scan the barcode pair: top = House, bottom = Master.
// If the scanned pair does not match the latest plan, the goods are not
// released. The check compares the current Master/Flight with the values at
// the last QA approval or pair scan, so any source of change (manual flight
// change, plan import) is caught.
"use strict";

const SCAN_ROLES = ["QA_Inspector", "Check_House", "Admin"];
const clean = value => String(value || "").replace(/[\s-]/g, "").toUpperCase();

function reference(job) {
    return { master: clean(job.mawbNumber || job.masterNumber), flight: clean(job.flightNo) };
}

function baseline(job) {
    return job.pairScanRef || job.qaApproval?.reference || null;
}

// Pair scan needed: a recorded reference differs from now, or (older Houses
// without a reference) a Master/Flight change was logged after the last scan.
function required(job) {
    const base = baseline(job), now = reference(job);
    if (base) return base.master !== now.master || base.flight !== now.flight;
    const since = Date.parse(job.pairScanAt || job.qaApproval?.approvedAt || 0) || 0;
    const changes = [...(job.flightChangeHistory || []), ...(job.masterChangeHistory || [])];
    return changes.some(change => (Date.parse(change.at || change.changedAt || 0) || 0) > since);
}

function fail(message, statusCode = 409) { throw Object.assign(new Error(message), { statusCode }); }

function assertCurrent(job) {
    if (required(job)) fail(`House ${job.houseNumber} มีการเปลี่ยน Master หรือ Flight ต้องให้ QA สแกนคู่บาร์โค้ด House + Master ก่อนปล่อยสินค้า`);
}

function scan(db, actor, payload, now) {
    if (!actor || !SCAN_ROLES.includes(actor.role)) fail("เฉพาะ QA หรือ Check House สแกนคู่บาร์โค้ดได้", 403);
    const house = String(payload.houseNumber || "").trim();
    const job = (db.jobs || []).find(item => item.houseNumber === house || item.hawbNumber === house);
    if (!job) fail("ไม่พบ House", 404);
    const top = clean(payload.houseCode), bottom = clean(payload.masterCode);
    if (!top || !bottom) fail("สแกนให้ครบทั้งบาร์โค้ดบน (House) และล่าง (Master)", 422);
    const now_ = reference(job);
    const houseOk = [job.houseNumber, job.hawbNumber, job.onhandNumber].filter(Boolean).map(clean).includes(top);
    const masterOk = Boolean(now_.master) && bottom === now_.master;
    const attempt = { at: now, by: actor.id, houseCode: payload.houseCode, masterCode: payload.masterCode, ok: houseOk && masterOk };
    job.pairScanHistory = [...(job.pairScanHistory || []), attempt].slice(-30);
    if (!houseOk || !masterOk) {
        job.updatedAt = now;
        const problem = !houseOk ? `บาร์โค้ดบน (${payload.houseCode}) ไม่ใช่ House ${job.houseNumber}` : `บาร์โค้ดล่าง (${payload.masterCode}) ไม่ตรง Master ล่าสุด ${job.mawbNumber || job.masterNumber || "-"}`;
        return { ok: false, job, error: `${problem} · ห้ามปล่อยสินค้า` };
    }
    job.pairScanRef = now_;
    job.pairScanAt = now;
    job.pairScanBy = actor.id;
    job.updatedAt = now;
    return { ok: true, job };
}

module.exports = { SCAN_ROLES, reference, required, assertCurrent, scan };
