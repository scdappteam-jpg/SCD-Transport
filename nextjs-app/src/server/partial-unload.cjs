// Partial unload when a truck's permits are incomplete (SRS 6).
// Default: the truck waits until every House has its release document.
// The WH3 lead may approve unloading only the Houses whose documents are
// complete; the others are marked "held on truck" and must not be unloaded.
// A held House is released later on its own once its document arrives.
"use strict";

const APPROVERS = ["WH3_TeamLeader", "Admin"];

function fail(message, statusCode = 422) { throw Object.assign(new Error(message), { statusCode }); }

// roundJobsOf(job) returns every House on the same truck round.
function approve(db, actor, payload, now, roundJobsOf) {
    if (!actor || !APPROVERS.includes(actor.role)) fail("เฉพาะหัวหน้าคลัง WH3 หรือ Admin อนุมัติลงของบางส่วนได้", 403);
    const house = String(payload.houseNumber || "").trim();
    const job = (db.jobs || []).find(item => item.houseNumber === house);
    if (!job) fail("ไม่พบ House", 404);
    const round = roundJobsOf(job);
    const held = [...new Set((Array.isArray(payload.heldHouseNumbers) ? payload.heldHouseNumbers : []).map(h => String(h || "").trim()).filter(Boolean))];
    const reason = String(payload.reason || "").trim();
    if (reason.length < 5) fail("กรุณาระบุเหตุผล (เช่น ไฟล์ทด่วน) อย่างน้อย 5 ตัวอักษร");
    if (!held.length) fail("เลือก House ที่เอกสารยังไม่ครบ ให้ค้างไว้บนรถ");
    if (held.some(h => !round.some(item => item.houseNumber === h))) fail("House ที่เลือกไม่ได้อยู่บนรถคันนี้", 409);
    if (held.length >= round.length) fail("ต้องมีอย่างน้อย 1 House ที่เอกสารครบเพื่อลงก่อน", 409);
    if (round.some(item => item.status !== "AwaitingReleaseDocument" || item.releaseDocumentReceivedAt)) fail("อนุมัติได้เฉพาะรถที่ถึง WH3 และกำลังรอใบตรวจปล่อย", 409);
    const approval = { by: actor.id, byName: actor.name || "", at: now, reason, held };
    for (const item of round) {
        if (held.includes(item.houseNumber)) item.heldOnTruck = { by: actor.id, at: now, reason };
        else delete item.heldOnTruck;
        item.partialUnloadApproval = approval;
        item.updatedAt = now;
    }
    return { approval, jobs: round };
}

// Release-document round: Houses held on the truck wait; asking only for held
// Houses releases them on their own once their documents arrive.
function releaseScope(roundJobs, requestedJobs) {
    const requestedHeld = requestedJobs.filter(job => job.heldOnTruck);
    if (requestedHeld.length && requestedHeld.length === requestedJobs.length) return requestedHeld;
    return roundJobs.filter(job => !job.heldOnTruck);
}

module.exports = { APPROVERS, approve, releaseScope };
