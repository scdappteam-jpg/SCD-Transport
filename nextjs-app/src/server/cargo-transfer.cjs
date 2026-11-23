/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS compatibility service. */
const receipts = require('./inbound-receipts.cjs');
const document = require('../../public/legacy/ctf-core/index.js');

const detailText = ['unloadBy', 'tmoReceivedBy', 'issueCause', 'operationNote', 'supervisorContact'];
const detailDates = ['whReleasedAt', 'driverTransferredAt', 'tmoReceivedAt', 'unloadStartedAt', 'unloadFinishedAt'];
function prepareDetails(payload) {
    const source = payload.details;
    if (!source || typeof source !== 'object' || Array.isArray(source)) fail('กรุณาระบุข้อมูลท้ายใบ');
    const result = {};
    for (const key of detailText) {
        if (Object.hasOwn(source,key) && (typeof source[key] !== 'string' || source[key].length > 1000)) fail('ข้อมูลท้ายใบไม่ถูกต้อง');
        if (Object.hasOwn(source,key)) result[key] = source[key].trim();
    }
    for (const key of detailDates) {
        if (!Object.hasOwn(source,key)) continue;
        const value = source[key];
        if (value !== '' && (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?(Z|[+-]\d\d:\d\d)$/.test(value) || !Number.isFinite(Date.parse(value)))) fail('วันที่และเวลาท้ายใบไม่ถูกต้อง ต้องระบุเขตเวลา');
        result[key] = value ? new Date(value).toISOString() : '';
    }
    if (Object.hasOwn(source,'damage')) {
        if (!['','yes','no'].includes(source.damage)) fail('กรุณาเลือกผลตรวจความเสียหาย');
        result.damage = source.damage;
    }
    if (!Object.keys(result).length) fail('ไม่มีข้อมูลท้ายใบให้บันทึก');
    return result;
}

function fail(message, statusCode = 422) {
    const error = new Error(message);
    error.statusCode = statusCode;
    throw error;
}

function evidence(file, label) {
    if (!file || typeof file.base64 !== 'string') fail(`กรุณาแนบไฟล์ ${label} ที่มีข้อมูลจริง`);
    const value = file.base64.includes(',') ? file.base64.split(',').pop() : file.base64;
    const clean = value.replace(/\s/g, '');
    if (!clean || clean.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(clean)) fail(`ไฟล์ ${label} ไม่ใช่ Base64 ที่ถูกต้อง`);
    const bytes = Buffer.from(clean, 'base64');
    if (!bytes.length || bytes.length > 10 * 1024 * 1024) fail(`ไฟล์ ${label} ต้องมีข้อมูลและไม่เกิน 10 MB`);
    const mime = String(file.mimeType || 'image/jpeg').toLowerCase();
    const signatures = {
        'application/pdf': bytes.subarray(0, 5).toString() === '%PDF-',
        'image/png': bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
        'image/jpeg': bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255,
        'image/webp': bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP'
    };
    if (!signatures[mime]) fail(`ไฟล์ ${label} ต้องเป็น PDF JPG PNG หรือ WebP ที่ตรงกับชนิดไฟล์`);
}

function files(items, label, required = false) {
    if (items != null && !Array.isArray(items)) fail(`รายการไฟล์ ${label} ไม่ถูกต้อง`);
    if (required && !items?.length) fail(`ต้องแนบเอกสาร ${label} ก่อนออก Cargo Transfer`);
    (items || []).forEach(file => evidence(file, label));
}

function metadata(payload) {
    for (const [key, label] of [['transferDate','วันที่ส่ง'], ['transferTime','เวลา'], ['transferFrom','ต้นทาง'], ['transferTo','Terminal ปลายทาง'], ['driverName','ชื่อคนขับ'], ['vehiclePlate','ทะเบียนรถ'], ['vehicleType','ประเภทรถ'], ['releaseBy','ผู้ปล่อยสินค้า']]) {
        if (typeof payload[key] !== 'string' || !payload[key].trim() || payload[key].length > 200) fail(`กรุณาระบุ${label}ให้ครบก่อนออก Cargo Transfer`);
    }
    const date = payload.transferDate;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10) !== date) fail('วันที่ส่งไม่ถูกต้อง');
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(payload.transferTime)) fail('เวลาไม่ถูกต้อง');
    if (!['TG', 'TGINT', 'BFS'].includes(payload.transferTo)) fail('กรุณาเลือก Terminal ปลายทางที่รองรับ');
}

function prepare(db, payload, findJob) {
    if (!['issue', 'return', 'record'].includes(payload.action)) fail('Cargo Transfer รองรับเฉพาะ action issue return หรือ record');
    if (!Array.isArray(payload.houses) || !payload.houses.length || payload.houses.some(house => typeof house !== 'string' || !house.trim())) fail('กรุณาระบุเลข House ที่ถูกต้องอย่างน้อยหนึ่งงาน');
    const houses = [...new Set(payload.houses.map(house => house.trim()))];
    const jobs = houses.map(house => findJob(db, house));
    const missing = houses.filter((house, index) => !jobs[index]);
    if (missing.length) fail(`ไม่พบ House ${missing.join(', ')} กรุณาตรวจทั้งชุดก่อนบันทึก`, 404);
    let details;
    if (payload.action === 'record') {
        if (jobs.some(job => !job.cargoTransferIssuedAt)) fail('ยังไม่ออก Cargo Transfer',409);
        const key = job => job.cargoTransferDocument?.id || JSON.stringify([job.cargoTransferIssuedAt,job.cargoTransferGroup]);
        if (jobs.some(job=>key(job)!==key(jobs[0]))) fail('เลือกได้ครั้งละหนึ่งใบ Cargo Transfer',409);
        const expected=jobs[0].cargoTransferDocument?.rows?.map(row=>row.houseNumber) || jobs[0].cargoTransferGroup || houses;
        if (expected.length!==houses.length || expected.some(h=>!houses.includes(h))) fail('กรุณาเลือก House ให้ครบทั้งใบก่อนบันทึกท้ายใบ',409);
        details=prepareDetails(payload);
        const merged={...(jobs[0].cargoTransferDetails||{}),...details};
        if (merged.unloadStartedAt && merged.unloadFinishedAt && merged.unloadStartedAt>merged.unloadFinishedAt) fail('เวลาลงเสร็จต้องไม่ก่อนเริ่มลงสินค้า');
        if (merged.damage==='yes' && !merged.issueCause) fail('กรุณาระบุสาเหตุหรือรายละเอียดความเสียหาย');
        if (payload.expectedUpdatedAt !== (jobs[0].cargoTransferDetails?.updatedAt || '')) fail('ข้อมูลท้ายใบเปลี่ยนแล้ว กรุณาโหลดใหม่ก่อนบันทึก',409);
    } else if (payload.action === 'return') {
        const unissued = jobs.filter(job => !job.cargoTransferIssuedAt);
        if (unissued.length) fail(`ยังไม่ออก Cargo Transfer สำหรับ House ${unissued.map(job => job.houseNumber).join(', ')}`, 409);
        evidence({base64:payload.imageBase64, mimeType:payload.mimeType}, 'Cargo Transfer ตัวจริงคืน');
    } else {
        if (jobs.some(job=>job.cargoTransferIssuedAt)) fail('งานนี้มีใบ Cargo Transfer แล้ว กรุณาโหลดใบเดิมเพื่อพิมพ์ซ้ำหรือบันทึกท้ายใบ',409);
        files(payload.permitFiles, 'Permit', true);
        files(payload.lithiumFiles, 'Lithium', jobs.some(job => job.requiresLithiumDocs || /lithium/i.test(job.productType || '')));
        // Validate every selected House before the adapter saves any file or changes any job.
        for (const job of jobs) {
            if (!job.csConfirmed) fail(`House ${job.houseNumber} ยังรอ CS ยืนยัน`, 409);
            if (!receipts.house(job).complete) fail(`House ${job.houseNumber} ยังไม่ยืนยันยอดรับจริงครบทุกหน่วยที่ WH3`, 409);
        }
        metadata(payload);
    }
    return {houses, jobs, details};
}

module.exports = {prepare, snapshot:document.snapshot};
