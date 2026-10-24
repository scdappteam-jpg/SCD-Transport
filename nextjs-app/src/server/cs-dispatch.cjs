// Current CS instructions are the hand-off contract for Cargo and Driver.
function applyCsDetails(job, payload) {
    const invoice = String(payload.invoiceNo || job.csInvoiceNo || job.invoiceNo || '').trim();
    const contact = String(payload.contactName || job.csContactName || job.contactPerson || job.contact || '').trim();
    const phone = String(payload.contactPhone || job.csContactPhone || job.pickupPhone || job.tel || '').trim();
    Object.assign(job, {csInvoiceNo: invoice, invoiceNo: invoice, csContactName: contact,
        contactPerson: contact, contact, csContactPhone: phone, pickupPhone: phone, tel: phone});
    if (Array.isArray(job.pickupItems)) job.pickupItems = job.pickupItems.map(row =>
        [job.houseNumber, job.hawbNumber, job.onhandNumber].filter(Boolean).includes(row.houseNumber)
            ? {...row, invoiceNo: invoice, contact, tel: phone} : row);
}

function assignment(db, payload) {
    if (!payload.driverId) return {};
    const driver = (db.users || []).find(user => user.id === payload.driverId && user.role === 'Driver' && user.status !== 'Inactive');
    if (!driver) throw new Error('ไม่พบคนขับที่เปิดใช้งาน กรุณาเลือกใหม่');
    const plate = String(payload.vehiclePlate || driver.vehiclePlate || '').trim();
    if (!plate) throw new Error('กรุณาระบุทะเบียนรถก่อนส่งงานให้คนขับ');
    return {driverId: driver.id, driverName: driver.name || '', vehiclePlate: plate};
}

module.exports = {applyCsDetails, assignment};
