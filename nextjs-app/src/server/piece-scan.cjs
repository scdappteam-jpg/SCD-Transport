/* eslint-disable @typescript-eslint/no-require-imports -- server-only CommonJS domain service */
// Box / pallet barcode scan at WH3 receiving (SRS 4.3.1).
// Each carton or pallet label is scanned once. The scan shows progress per
// unit against the plan; a barcode already scanned (here or on another House)
// or a scan beyond the plan is refused. The scanned totals can then be used
// as the receipt counts (the receipt itself is still confirmed in its own step).
"use strict";

const core = require("../../public/legacy/receipt-core/index.js");
const ROLES = ["WH_Staff", "WH3_TeamLeader", "Tagging_Staff", "Admin"];

function fail(message, statusCode = 422) { throw Object.assign(new Error(message), { statusCode }); }
const clean = value => String(value || "").replace(/\s+/g, "").toUpperCase().slice(0, 80);

function summary(job) {
    const plan = core.planned(job);
    const scans = job.pieceScans || [];
    const scanned = {};
    for (const scan of scans) scanned[scan.unit] = (scanned[scan.unit] || 0) + 1;
    const units = Object.keys(plan.counts);
    const complete = plan.known && units.length > 0 && units.every(unit => (scanned[unit] || 0) === plan.counts[unit]);
    return { houseNumber: job.houseNumber, planned: plan.counts, planKnown: plan.known, scanned, complete, scans: scans.slice(-200) };
}

function findJob(db, house) {
    const job = (db.jobs || []).find(item => item.houseNumber === house || item.hawbNumber === house);
    if (!job) fail("ไม่พบ House", 404);
    return job;
}

function scan(db, actor, payload, now) {
    if (!actor || !ROLES.includes(actor.role)) fail("เฉพาะพนักงานคลังสแกนรับรายกล่องได้", 403);
    const job = findJob(db, String(payload.houseNumber || "").trim());
    const plan = core.planned(job);
    if (!plan.known) fail("ยังไม่รู้จำนวนตามแผนของ House นี้ กรุณาตรวจแผนก่อนสแกน");
    const unit = String(payload.unit || "");
    if (!Object.hasOwn(plan.counts, unit)) fail(`หน่วย ${unit || "-"} ไม่อยู่ในแผนของ House นี้ (${Object.keys(plan.counts).join(", ")})`);
    const code = clean(payload.code);
    if (!code) fail("สแกนบาร์โค้ดกล่องหรือพาเลท");
    job.pieceScans ||= [];
    if (payload.action === "remove") {
        const before = job.pieceScans.length;
        job.pieceScans = job.pieceScans.filter(item => item.code !== code);
        if (job.pieceScans.length === before) fail(`ไม่พบบาร์โค้ด ${code} ใน House นี้`, 404);
        job.updatedAt = now;
        return summary(job);
    }
    if (job.pieceScans.some(item => item.code === code)) fail(`บาร์โค้ด ${code} สแกนไปแล้ว`, 409);
    const other = (db.jobs || []).find(item => item !== job && (item.pieceScans || []).some(entry => entry.code === code));
    if (other) fail(`บาร์โค้ด ${code} เป็นของ House ${other.houseNumber} ตรวจป้ายสินค้าอีกครั้ง`, 409);
    const count = job.pieceScans.filter(item => item.unit === unit).length;
    if (count >= plan.counts[unit]) fail(`สแกน ${unit} ครบตามแผน ${plan.counts[unit]} แล้ว ถ้ามีของเกิน ให้บันทึกพักรับประเภท "เกิน"`, 409);
    job.pieceScans.push({ code, unit, at: now, by: actor.id });
    job.updatedAt = now;
    return summary(job);
}

function view(db, actor, house) {
    if (!actor || ![...ROLES, "QA_Inspector", "Check_House", "Executive"].includes(actor.role)) fail("ไม่มีสิทธิ์ดูการสแกนรายกล่อง", 403);
    return summary(findJob(db, String(house || "").trim()));
}

module.exports = { ROLES, summary, scan, view };
