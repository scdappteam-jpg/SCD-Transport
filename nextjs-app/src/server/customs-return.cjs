// Cancellation after customs clearance (SRS 6).
// The customs return-request document must be photographed and attached.
// The original House is cancelled with its reason (for billing the service and
// for statistics) and a return job is created for Transport to assign a truck
// back to the factory or to WH3.
"use strict";

const ROLES = ["Admin", "Executive", "Team_Transport", "CS", "Driver"];
const CATEGORIES = {
    CustomerCancelled: "ลูกค้ายกเลิก",
    DocumentError: "เอกสารผิดพลาด",
    FlightCancelled: "ยกเลิกหรือเปลี่ยนไฟล์ท",
    CargoProblem: "สินค้ามีปัญหา",
    Other: "อื่นๆ"
};
const DESTINATIONS = { Factory: "ตีกลับโรงงานหรือลูกค้า", WH3: "ตีกลับเข้าคลัง WH3" };

function fail(message, statusCode = 422) { throw Object.assign(new Error(message), { statusCode }); }

function cleared(job) {
    return Boolean(job.releaseDocumentReceivedAt || job.eiApprovedAt || job.eiApproved);
}

// Validates everything before any change. saveFiles(house, type, files) -> saved records.
function cancel(db, actor, payload, now, saveFiles) {
    if (!actor || !ROLES.includes(actor.role)) fail("ไม่มีสิทธิ์ยกเลิกงานหลังผ่านศุลกากร", 403);
    const job = (db.jobs || []).find(item => item.houseNumber === String(payload.houseNumber || "").trim());
    if (!job) fail("ไม่พบ House", 404);
    if (actor.role === "Driver" && job.driverId !== actor.id) fail("คนขับยกเลิกได้เฉพาะงานของตนเอง", 403);
    if (job.status === "Cancelled" || job.customsCancellation) fail(`House ${job.houseNumber} ถูกยกเลิกไปแล้ว`, 409);
    if (!cleared(job)) fail("งานนี้ยังไม่ผ่านพิธีการศุลกากร ให้ใช้การยกเลิกปกติ", 409);
    if (["InvoiceDrafted", "InvoiceSent", "Billed"].includes(job.status) || job.invoiceId) fail("งานนี้ออกเอกสารวางบิลแล้ว ต้องให้บัญชียกเลิกใบวางบิลก่อน", 409);
    const category = String(payload.category || "");
    if (!CATEGORIES[category]) fail("เลือกสาเหตุการยกเลิก");
    const reason = String(payload.reason || "").trim().slice(0, 500);
    if (reason.length < 5) fail("ระบุรายละเอียดสาเหตุอย่างน้อย 5 ตัวอักษร");
    const destination = String(payload.destination || "");
    if (!DESTINATIONS[destination]) fail("เลือกปลายทางการตีกลับ");
    const files = Array.isArray(payload.returnRequestFiles) ? payload.returnRequestFiles.filter(file => file && file.base64) : [];
    if (!files.length) fail("ต้องถ่ายรูปเอกสารคำร้องขอตรวจรับคืนจากศุลกากรแนบมาด้วย");
    const returnHouse = `${job.houseNumber}-RTN`;
    if ((db.jobs || []).some(item => item.houseNumber === returnHouse)) fail(`มีงานตีกลับ ${returnHouse} อยู่แล้ว`, 409);

    const saved = saveFiles(job.houseNumber, "CustomsReturnRequest", files) || [];
    const chargeable = payload.chargeable !== false;
    const record = { category, categoryLabel: CATEGORIES[category], reason, destination, chargeable, by: actor.id, byName: actor.name || "", at: now, previousStatus: job.status, returnHouseNumber: returnHouse, fileIds: saved.map(file => file?.fileId).filter(Boolean) };
    Object.assign(job, { customsCancellation: record, status: "Cancelled", cancelledAt: now, cancelReason: `${CATEGORIES[category]}: ${reason}`, updatedAt: now });

    const returnJob = {
        id: `JOB-RTN-${Date.now()}`, houseNumber: returnHouse, returnOfHouse: job.houseNumber,
        customerId: job.customerId, customerName: job.customerName, mawbNumber: job.mawbNumber || "",
        pieceCount: job.pieceCount, packageType: job.packageType, packageCounts: job.packageCounts,
        pickupLocation: "WH3 (สินค้าตีกลับหลังผ่านศุลกากร)", startPlace: "WH3",
        endPlace: destination === "WH3" ? "WH3" : (job.pickupLocation || job.customerName || "โรงงานลูกค้า"),
        destination: destination === "WH3" ? "WH3" : "Factory", routeType: "Return",
        planSource: "CustomsReturn", manualExtra: true, status: "Pending",
        csConfirmed: true, csConfirmedAt: now, csConfirmedBy: actor.name || actor.id, approvalStatus: "ManualExtraApproved",
        isLithium: Boolean(job.isLithium), requiresLithiumDocs: Boolean(job.requiresLithiumDocs),
        cancellationChargeable: chargeable, createdAt: now, updatedAt: now
    };
    db.jobs.push(returnJob);
    db.cancellationLog = [...(db.cancellationLog || []), { houseNumber: job.houseNumber, customerName: job.customerName || "", category, reason, destination, chargeable, at: now, by: actor.id, returnHouseNumber: returnHouse }].slice(-2000);
    return { job, returnJob };
}

// Statistics by month and reason, plus chargeable count, for billing and review.
function stats(db, month) {
    const rows = (db.cancellationLog || []).filter(row => !month || String(row.at).slice(0, 7) === month);
    const byCategory = {};
    for (const row of rows) byCategory[row.category] = (byCategory[row.category] || 0) + 1;
    return { month: month || "all", total: rows.length, chargeable: rows.filter(row => row.chargeable).length, byCategory: Object.entries(byCategory).map(([code, count]) => ({ code, label: CATEGORIES[code] || code, count })).sort((a, b) => b.count - a.count), rows: rows.slice(-200).reverse() };
}

module.exports = { ROLES, CATEGORIES, DESTINATIONS, cleared, cancel, stats };
