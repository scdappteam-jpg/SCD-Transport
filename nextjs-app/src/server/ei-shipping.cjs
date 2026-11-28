// Shipping / EI work page (SRS 2, 4.1.3, 5.2).
// One queue with four tabs, each a list of Houses waiting for an EI action:
//  prep      truck left the customer (or started), documents not finished
//  arrived   truck at WH3, release document (permit) not filed yet
//  permit    driver attached the permit; EI checks it AFTER the fact. The check
//            does not block the dock (team decision). A rejection alerts the
//            WH3 lead, who decides whether to hold the goods.
//  outbound  goods picked for export, waiting for EI approval
"use strict";

const VIEW_ROLES = ["Admin", "Executive", "EI_Customer", "CS", "WH3_TeamLeader"];
const REVIEW_ROLES = ["Admin", "Executive", "EI_Customer"];
const CLOSED = new Set(["Cancelled", "Completed", "Billed", "InvoiceSent", "Rejected"]);

function fail(message, statusCode = 422) { throw Object.assign(new Error(message), { statusCode }); }

const flightKey = job => Date.parse(job.flightTime || "") || Infinity;

function row(job, attachments) {
    const permitFiles = attachments.filter(file => file.houseNumber === job.houseNumber && file.fileType === "ReleaseDocument" && file.url).map(file => ({ fileId: file.fileId, url: file.url, mimeType: file.mimeType || "" }));
    return {
        houseNumber: job.houseNumber, hawbNumber: job.hawbNumber || "", mawbNumber: job.mawbNumber || job.masterNumber || "",
        customerName: job.customerName || "", flightNo: job.flightNo || "", flightTime: job.flightTime || "",
        status: job.status || "", vehiclePlate: job.vehiclePlate || "", driverName: job.driverName || "",
        completedAt: job.completedAt || "", etaWh3At: job.etaWh3At || "", arrivedWh3At: job.arrivedWh3At || "",
        releaseDocumentReceivedAt: job.releaseDocumentReceivedAt || "", releaseDocumentNumber: job.releaseDocumentNumber || "",
        shippingDocStatus: job.shippingDocStatus || null, permitReview: job.permitReview || null,
        isLithium: Boolean(job.isLithium || job.requiresLithiumDocs), heldOnTruck: Boolean(job.heldOnTruck),
        outboundPickedAt: job.outboundPickedAt || "", eiApproved: Boolean(job.eiApproved),
        permitFiles
    };
}

function queue(db, actor) {
    if (!actor || !VIEW_ROLES.includes(actor.role)) fail("ไม่มีสิทธิ์เปิดหน้า Shipping · EI", 403);
    const jobs = (db.jobs || []).filter(job => job.csConfirmed && !job.csRejected && !CLOSED.has(job.status));
    const attachments = db.attachments || [];
    const docsDone = job => job.shippingDocStatus?.state === "Completed";
    const tabs = {
        prep: jobs.filter(job => !job.releaseDocumentReceivedAt && (job.completedAt || job.routeStartedAt) && !docsDone(job)),
        arrived: jobs.filter(job => job.status === "AwaitingReleaseDocument" && !job.releaseDocumentReceivedAt),
        permit: jobs.filter(job => job.releaseDocumentReceivedAt && !job.permitReview),
        outbound: jobs.filter(job => job.outboundPickedAt && !job.eiApproved)
    };
    const out = {};
    for (const [key, list] of Object.entries(tabs)) out[key] = list.sort((a, b) => flightKey(a) - flightKey(b)).map(job => row(job, attachments));
    out.counts = Object.fromEntries(Object.entries(out).map(([key, list]) => [key, list.length]));
    out.alerts = (db.alerts || []).filter(alert => ["EI-Step1", "EI-Step2", "Permit-Rejected"].includes(alert.kind)).slice(-10).reverse();
    out.canReview = REVIEW_ROLES.includes(actor.role);
    return out;
}

function reviewPermit(db, actor, payload, now) {
    if (!actor || !REVIEW_ROLES.includes(actor.role)) fail("เฉพาะ EI / Shipping หรือ Admin ตรวจใบตรวจปล่อยได้", 403);
    const houses = [...new Set((Array.isArray(payload.houseNumbers) ? payload.houseNumbers : [payload.houseNumber]).map(h => String(h || "").trim()).filter(Boolean))];
    if (!houses.length) fail("กรุณาเลือก House");
    const jobs = houses.map(house => (db.jobs || []).find(job => job.houseNumber === house));
    if (jobs.some(job => !job)) fail("ไม่พบ House ที่เลือก", 404);
    if (jobs.some(job => !job.releaseDocumentReceivedAt)) fail("House ยังไม่มีใบตรวจปล่อยให้ตรวจ", 409);
    const decision = payload.decision;
    if (!["Approved", "Rejected"].includes(decision)) fail("เลือก อนุมัติ หรือ ตีกลับ");
    const reason = String(payload.reason || "").trim().slice(0, 500);
    if (decision === "Rejected" && reason.length < 5) fail("ตีกลับต้องระบุเหตุผลอย่างน้อย 5 ตัวอักษร");
    for (const job of jobs) {
        job.permitReview = { state: decision, reason, by: actor.id, byName: actor.name || "", at: now };
        job.permitReviewHistory = [...(job.permitReviewHistory || []), job.permitReview].slice(-20);
        job.updatedAt = now;
    }
    return jobs;
}

module.exports = { VIEW_ROLES, REVIEW_ROLES, queue, reviewPermit };
