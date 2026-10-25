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
module.exports = { closeInvoice };
