// Special cargo release control (SRS 4.3.2): Lithium and DG.
// A Lithium or DG House may not be picked, loaded, transferred or closed out
// of WH3 until (1) its document is attached and (2) Console Office has scanned
// the House barcode to confirm. The QA scan required for every move stays.
//   Lithium: MSDS / UN38.3 / battery declaration (fileType LithiumDocument)
//   DG:      Shipper's Declaration for Dangerous Goods (DGD) or MSDS (fileType DGDocument)
// Lithium keeps its original fields (lithium*); DG uses dg* fields.
"use strict";

const CONFIRM_ROLES = ["Console_Office", "Admin"];
// Steps that release goods out of storage toward the Terminal.
const RELEASE_PATHS = new Set(["/api/outbound/picking", "/api/outbound/load-bay", "/api/outbound/transfer-form", "/api/outbound/loading-detail"]);
const KINDS = {
    Lithium: { prefix: "lithium", fileType: "LithiumDocument", docs: /^(LithiumDocument|LithiumMSDS|MSDS)/i, label: "Lithium", docLabel: "เอกสาร Lithium (MSDS / UN38.3)" },
    DG: { prefix: "dg", fileType: "DGDocument", docs: /^(DGDocument|DGD|MSDS)/i, label: "DG", docLabel: "เอกสาร DG (DGD หรือ MSDS)" }
};

function fail(message, statusCode = 409) { throw Object.assign(new Error(message), { statusCode }); }

function isLithium(job) {
    return Boolean(job && (job.isLithium || job.requiresLithiumDocs || /lithium/i.test(String(job.productType || ""))));
}

function isDg(job) {
    return Boolean(job && !isLithium(job) && (job.cargoType === "dg" || /^DG$/i.test(String(job.dgType || "")) || job.isDangerousGoods || /dangerous/i.test(String(job.productType || ""))));
}

function kindOf(job) {
    return isLithium(job) ? "Lithium" : isDg(job) ? "DG" : null;
}

function hasDocument(db, job) {
    const kind = KINDS[kindOf(job) || "Lithium"];
    return (job[`${kind.prefix}DocumentFileIds`] || []).length > 0 ||
        (db.attachments || []).some(file => file.houseNumber === job.houseNumber && kind.docs.test(String(file.fileType || "")));
}

function releasesGoods(path, p = {}) {
    if (RELEASE_PATHS.has(path)) return true;
    return path === "/api/operations/control" && ["driver-event", "transport-event"].includes(p.action) && ["wh3-load-start", "wh3-depart"].includes(p.event);
}

function assertReleased(db, job) {
    const code = kindOf(job);
    if (!code) return;
    const kind = KINDS[code];
    if (!hasDocument(db, job)) fail(`House ${job.houseNumber} เป็นสินค้า ${kind.label} ต้องแนบ${kind.docLabel} ก่อนปล่อยสินค้า`);
    if (!job[`${kind.prefix}ConsoleConfirmedAt`]) fail(`House ${job.houseNumber} เป็นสินค้า ${kind.label} ต้องให้ Console Office สแกนยืนยันก่อนปล่อยสินค้า`);
}

const clean = value => String(value || "").replace(/[\s-]/g, "").toUpperCase();

// Console Office scans the House barcode; documents may be attached in the same step.
function confirm(db, actor, payload, now, saveFiles) {
    if (!actor || !CONFIRM_ROLES.includes(actor.role)) fail("เฉพาะ Console Office หรือ Admin สแกนยืนยันสินค้า Lithium หรือ DG ได้", 403);
    const house = String(payload.houseNumber || "").trim();
    const job = (db.jobs || []).find(item => item.houseNumber === house || item.hawbNumber === house);
    if (!job) fail("ไม่พบ House", 404);
    const code = kindOf(job);
    if (!code) fail(`House ${job.houseNumber} ไม่ได้เป็นสินค้า Lithium หรือ DG`, 422);
    const kind = KINDS[code];
    const scanned = clean(payload.scannedCode);
    if (!scanned) fail("กรุณาสแกนบาร์โค้ด House", 422);
    if (![job.houseNumber, job.hawbNumber, job.onhandNumber].filter(Boolean).map(clean).includes(scanned)) fail(`บาร์โค้ดที่สแกน (${payload.scannedCode}) ไม่ตรงกับ House ${job.houseNumber}`, 422);
    const files = Array.isArray(payload.documentFiles) ? payload.documentFiles.filter(file => file && file.base64) : [];
    const idsField = `${kind.prefix}DocumentFileIds`;
    if (files.length) {
        const saved = saveFiles(job.houseNumber, kind.fileType, files) || [];
        job[idsField] = [...new Set([...(job[idsField] || []), ...saved.map(file => file?.fileId).filter(Boolean)])];
        if (!job[idsField].length) job[idsField] = ["attached"];
    }
    if (!hasDocument(db, job)) fail(`ต้องแนบ${kind.docLabel} ก่อนยืนยัน`, 422);
    job[`${kind.prefix}ConsoleConfirmedAt`] = now;
    job[`${kind.prefix}ConsoleConfirmedBy`] = actor.id;
    job[`${kind.prefix}ConsoleConfirmedByName`] = actor.name || "";
    job[`${kind.prefix}ConfirmHistory`] = [...(job[`${kind.prefix}ConfirmHistory`] || []), { at: now, by: actor.id, scanned: payload.scannedCode, files: files.length }].slice(-20);
    job.updatedAt = now;
    return job;
}

module.exports = { CONFIRM_ROLES, RELEASE_PATHS, KINDS, isLithium, isDg, kindOf, hasDocument, releasesGoods, assertReleased, confirm };
