// A repeated close is a read of the original result, never a new accounting event.
function closeInvoice(db, bill, { nowIso, findJob }) {
    if (bill.status === "Billed") return false;
    const timestamp = nowIso();
    bill.status = "Billed";
    bill.billedDate = timestamp;
    (bill.houseNumbers || [bill.houseNumber]).map(house => findJob(db, house)).filter(Boolean).forEach(job => {
        job.status = "Billed";
        job.billingStatus = "Billed";
        job.readyForBilling = false;
        job.dueDate = bill.dueDate;
        job.updatedAt = timestamp;
    });
    return true;
}
// Return the existing successful result on retries, but leave integration-queued
// invoices retryable when a provider becomes available. Never reopen accounting.
function emailPlan(bill) {
    if (bill.status === 'Billed') {
        const error = new Error('ใบวางบิลปิดเป็น Billed แล้ว ไม่สามารถส่งซ้ำหรือเปลี่ยนสถานะได้');
        error.statusCode = 409;
        throw error;
    }
    return bill.status === 'Sent' || (bill.status === 'EmailQueued' && bill.emailDeliveryStatus === 'SITOnlyNoExternalDelivery');
}
module.exports = { closeInvoice, emailPlan };
