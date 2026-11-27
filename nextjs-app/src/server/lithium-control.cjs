// Lithium release control (SRS 4.3.2, Lithium first; DG comes later).
// A Lithium House may not be picked, loaded, transferred or closed out of
// WH3 until (1) a Lithium document (MSDS / UN38.3 / battery declaration) is
// attached and (2) Console Office has scanned the House barcode to confirm.
// The QA scan already required for every move stays in place.
"use strict";

const CONFIRM_ROLES = ["Console_Office", "Admin"];
// Steps that release goods out of storage toward the Terminal.
const RELEASE_PATHS = new Set(["/api/outbound/picking", "/api/outbound/load-bay", "/api/outbound/transfer-form", "/api/outbound/loading-detail"]);
const DOC_TYPES = /^(LithiumDocument|LithiumMSDS|MSDS)/i;

function fail(message, statusCode = 409) { throw Object.assign(new Error(message), { statusCode }); }

function isLithium(job) {
    return Boolean(job && (job.isLithium || job.requiresLithiumDocs || /lithium/i.test(String(job.productType || ""))));
}

function hasDocument(db, job) {
    return (job.lithiumDocumentFileIds || []).length > 0 ||
        (db.attachments || []).some(file => file.houseNumber === job.houseNumber && DOC_TYPES.test(String(file.fileType || "")));
}

function releasesGoods(path, p = {}) {
    if (RELEASE_PATHS.has(path)) return true;
    return path === "/api/operations/control" && ["driver-event", "transport-event"].includes(p.action) && ["wh3-load-start", "wh3-depart"].includes(p.event);
}

function assertReleased(db, job) {
    if (!isLithium(job)) return;
    if (!hasDocument(db, job)) fail(`House ${job.houseNumber} เป็นสินค้า Lithium ต้องแนบเอกสาร Lithium (MSDS / UN38.3) ก่อนปล่อยสินค้า`);
    if (!job.lithiumConsoleConfirmedAt) fail(`House ${job.houseNumber} เป็นสินค้า Lithium ต้องให้ Console Office สแกนยืนยันก่อนปล่อยสินค้า`);
}

const clean = value => String(value || "").replace(/[\s-]/g, "").toUpperCase();

// Console Office scans the House barcode; documents may be attached in the same step.
function confirm(db, actor, payload, now, saveFiles) {
    if (!actor || !CONFIRM_ROLES.includes(actor.role)) fail("เฉพาะ Console Office หรือ Admin สแกนยืนยันสินค้า Lithium ได้", 403);
    const house = String(payload.houseNumber || "").trim();
    const job = (db.jobs || []).find(item => item.houseNumber === house || item.hawbNumber === house);
    if (!job) fail("ไม่พบ House", 404);
    if (!isLithium(job)) fail(`House ${job.houseNumber} ไม่ได้เป็นสินค้า Lithium`, 422);
    const scanned = clean(payload.scannedCode);
    if (!scanned) fail("กรุณาสแกนบาร์โค้ด House", 422);
    if (![job.houseNumber, job.hawbNumber, job.onhandNumber].filter(Boolean).map(clean).includes(scanned)) fail(`บาร์โค้ดที่สแกน (${payload.scannedCode}) ไม่ตรงกับ House ${job.houseNumber}`, 422);
    const files = Array.isArray(payload.documentFiles) ? payload.documentFiles.filter(file => file && file.base64) : [];
    if (files.length) {
        const saved = saveFiles(job.houseNumber, "LithiumDocument", files) || [];
        job.lithiumDocumentFileIds = [...new Set([...(job.lithiumDocumentFileIds || []), ...saved.map(file => file?.fileId).filter(Boolean)])];
        if (!job.lithiumDocumentFileIds.length) job.lithiumDocumentFileIds = ["attached"];
    }
    if (!hasDocument(db, job)) fail("ต้องแนบเอกสาร Lithium (MSDS / UN38.3) ก่อนยืนยัน", 422);
    job.lithiumConsoleConfirmedAt = now;
    job.lithiumConsoleConfirmedBy = actor.id;
    job.lithiumConsoleConfirmedByName = actor.name || "";
    job.lithiumConfirmHistory = [...(job.lithiumConfirmHistory || []), { at: now, by: actor.id, scanned: payload.scannedCode, files: files.length }].slice(-20);
    job.updatedAt = now;
    return job;
}

module.exports = { CONFIRM_ROLES, RELEASE_PATHS, isLithium, hasDocument, releasesGoods, assertReleased, confirm };
