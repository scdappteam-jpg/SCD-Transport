// Shipping / EI document preparation status per House (SRS 5.2).
// State is "InProgress" or "Completed". While in progress the team ticks why
// it is not finished: four standard reasons plus "Other" with a note.
"use strict";

const REASONS = {
    NoInvoice: "ยังไม่ได้ Invoice จากลูกค้า",
    CustomerNotConfirmed: "ลูกค้ายังไม่ยืนยันเอกสารหรือใบขน",
    CustomsFeePending: "รอการชำระค่าธรรมเนียมศุลกากร",
    ShippingInTransit: "Shipping อยู่ระหว่างเดินทาง",
    Other: "อื่นๆ"
};
const ROLES = ["Admin", "Executive", "EI_Customer", "CS"];

function fail(message, statusCode = 422) { throw Object.assign(new Error(message), { statusCode }); }

function update(db, actor, payload, now) {
    if (!actor || !ROLES.includes(actor.role)) fail("ไม่มีสิทธิ์บันทึกสถานะเอกสาร Shipping", 403);
    const houses = (Array.isArray(payload.houseNumbers) ? payload.houseNumbers : [payload.houseNumber]).map(h => String(h || "").trim()).filter(Boolean);
    if (!houses.length) fail("กรุณาเลือก House");
    const jobs = houses.map(house => (db.jobs || []).find(job => job.houseNumber === house || job.hawbNumber === house));
    if (jobs.some(job => !job)) fail("ไม่พบ House ที่เลือก", 404);
    const state = payload.state;
    if (!["InProgress", "Completed"].includes(state)) fail("สถานะต้องเป็น กำลังทำ หรือ เสร็จแล้ว");
    const reasons = [...new Set(Array.isArray(payload.reasons) ? payload.reasons : [])];
    if (reasons.some(code => !REASONS[code])) fail("เหตุผลไม่ถูกต้อง");
    const note = String(payload.note || "").trim().slice(0, 500);
    if (state === "InProgress" && !reasons.length) fail("กรุณาเลือกอย่างน้อย 1 เหตุผลที่เอกสารยังไม่เสร็จ");
    if (reasons.includes("Other") && note.length < 3) fail("เลือก 'อื่นๆ' ต้องระบุหมายเหตุ");
    for (const job of jobs) {
        const previous = job.shippingDocStatus;
        job.shippingDocStatus = { state, reasons: state === "Completed" ? [] : reasons, note, updatedAt: now, updatedBy: actor.id, updatedByName: actor.name || "" };
        job.shippingDocHistory = [...(job.shippingDocHistory || []), { ...job.shippingDocStatus, previousState: previous?.state || "" }].slice(-50);
        if (state === "Completed" && !job.shippingDocCompletedAt) job.shippingDocCompletedAt = now;
        if (state === "InProgress") delete job.shippingDocCompletedAt;
        job.updatedAt = now;
    }
    return jobs;
}

module.exports = { REASONS, ROLES, update };
