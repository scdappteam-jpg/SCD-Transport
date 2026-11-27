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

// Job batch: a row may name its own driver (one company, several trucks).
// Every row driver is checked before anything is saved; rows without one
// follow the batch driver. Each extra driver gets its own batch (= own round).
function rowAssignments(db, payload, rows) {
    const byDriver = new Map();
    for (const row of rows || []) {
        const id = String(row?.driverId || '').trim();
        if (!id || id === String(payload.driverId || '') || byDriver.has(id)) continue;
        byDriver.set(id, assignment(db, {driverId: id}));
    }
    const plates = new Map();
    const main = payload.driverId ? [[String(payload.driverId), payload.vehiclePlate]] : [];
    for (const [id, plate] of [...main, ...[...byDriver].map(([id, a]) => [id, a.vehiclePlate])]) {
        if (plate && plates.has(plate) && plates.get(plate) !== id) throw new Error(`ทะเบียน ${plate} ถูกใช้กับคนขับมากกว่า 1 คนในชุดเดียว`);
        if (plate) plates.set(plate, id);
    }
    return byDriver;
}

function validateApproval(db, payload) {
    const fail=(message,statusCode=422)=>{throw Object.assign(new Error(message),{statusCode});};
    if(!Array.isArray(payload.houseNumbers)||!payload.houseNumbers.length||payload.houseNumbers.some(h=>typeof h!=='string'||!h.trim()))fail('กรุณาเลือก House ที่จะยืนยัน');
    const houses=payload.houseNumbers.map(h=>h.trim());
    if(new Set(houses).size!==houses.length)fail('พบ House ซ้ำในคำขอยืนยัน');
    const missing=houses.filter(h=>!(db.jobs||[]).some(j=>j.houseNumber===h));
    if(missing.length)fail('ไม่พบ House: '+missing.join(', '),404);
    const invoiceNo=String(payload.invoiceNo||'').trim();
    if(!invoiceNo)fail('กรุณากรอกเลข Invoice ก่อน Confirm');
    return {...payload,houseNumbers:houses,invoiceNo};
}
module.exports = {applyCsDetails, assignment, rowAssignments, validateApproval};
