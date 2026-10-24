/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS compatibility service. */
const receipts = require('./inbound-receipts.cjs');

function fail(message, statusCode = 409) {
    const error = new Error(message);
    error.statusCode = statusCode;
    throw error;
}

function received(job) {
    if (!job.csConfirmed) fail(`House ${job.houseNumber} ยังรอ CS ยืนยัน`);
    if (!receipts.house(job).complete) fail(`House ${job.houseNumber} ยังไม่ยืนยันยอดรับจริงครบทุกหน่วยที่ WH3`);
}

function load(job, payload) {
    received(job);
    if (!job.aotApprovedAt) fail('ต้องอนุมัติคิว AOT ก่อนโหลดสินค้า');
    if (payload.arrived && !job.goodsLoadedAt) fail('ต้องยืนยันโหลดออกจาก WH3 ก่อนยืนยันถึง Terminal');
}

function measured(job) {
    received(job);
    if (!job.terminalArrivedAt) fail(`House ${job.houseNumber} ยังไม่ยืนยันถึง Terminal`);
    const completeMeasurement = (weight, dimension) => weight != null && String(weight).trim() !== '' && Number.isFinite(Number(weight)) && Number(weight) > 0 && String(dimension || '').trim();
    // Keep a Master total separate from per-House weights; either completed
    // measurement pair is valid evidence for the existing Shipping process.
    if (!job.weighEndedAt || !(completeMeasurement(job.terminalWeight, job.terminalDimension) || completeMeasurement(job.terminalMasterWeight, job.terminalMasterDimension))) fail(`House ${job.houseNumber} ยังไม่บันทึกน้ำหนักและ Dimension ครบ`);
}

function xray(job, payload) {
    measured(job);
    if (!['WeightDimensionRecorded', 'PackingConsolidation', 'XRayPassed', 'XRayHold', 'ReXRayRequired'].includes(job.status)) fail('สถานะงานยังไม่พร้อมบันทึกผล X-Ray');
    if (payload.passed && (payload.requiresRescan || payload.hold)) fail('ผล X-Ray ผ่านต้องไม่ระบุ Hold หรือให้สแกนซ้ำพร้อมกัน', 422);
}

function evidence(file) {
    if (typeof file.base64 !== 'string') fail('กรุณาแนบไฟล์ Loading Detail ที่ถูกต้อง', 422);
    const value = file.base64.includes(',') ? file.base64.split(',').pop() : file.base64;
    const clean = value.replace(/\s/g, '');
    if (!clean || clean.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(clean)) fail('ไฟล์ Loading Detail ไม่ใช่ Base64 ที่ถูกต้อง', 422);
    const bytes = Buffer.from(clean, 'base64');
    if (!bytes.length || bytes.length > 10 * 1024 * 1024) fail('ไฟล์ Loading Detail ต้องมีข้อมูลและไม่เกิน 10 MB', 422);
    const mime = String(file.mimeType || 'image/jpeg').toLowerCase();
    const signatures = {
        'application/pdf': bytes.subarray(0, 5).toString() === '%PDF-',
        'image/png': bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
        'image/jpeg': bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255,
        'image/webp': bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP'
    };
    if (!signatures[mime]) fail('รองรับหลักฐาน Loading Detail แบบ PDF JPG PNG หรือ WebP ที่ตรงกับชนิดไฟล์', 422);
}

function loading(db, job, payload) {
    const masterKey = value => String(value || '').replace(/[\s-]/g, '').toUpperCase();
    const master = masterKey(job.mawbNumber || job.masterNumber);
    const flight = String(job.flightNo || '').trim();
    if (!master) fail('House นี้ยังไม่มี Master ที่ยืนยันสำหรับปิดงาน');
    if (!flight) fail('House นี้ยังไม่มี Flight ที่ยืนยันสำหรับปิดงาน');
    if ((payload.master && masterKey(payload.master) !== master) || (payload.flightNo && String(payload.flightNo).trim() !== flight)) fail('Master หรือ Flight เปลี่ยนแล้ว กรุณารีเฟรชก่อนปิดงาน');
    const jobs = (db.jobs || []).filter(item => masterKey(item.mawbNumber || item.masterNumber) === master && String(item.flightNo || '').trim() === flight);
    if (payload.expectedHouses && (!Array.isArray(payload.expectedHouses) || payload.expectedHouses.length !== jobs.length || new Set(payload.expectedHouses).size !== jobs.length || jobs.some(item => !payload.expectedHouses.includes(item.houseNumber)))) fail('ชุด House ของ Master เปลี่ยนแล้ว กรุณารีเฟรชก่อนปิดงาน');
    for (const item of jobs) {
        measured(item);
        if (item.xrayStatus !== 'Passed' || item.requiresRescan || ['XRayHold', 'ReXRayRequired'].includes(item.status)) fail(`House ${item.houseNumber} ยังไม่ผ่าน X-Ray หรือยังมี Hold/Re-X-Ray ค้างอยู่`);
    }
    const files = [
        ...(payload.imageBase64 ? [{ base64: payload.imageBase64, mimeType: payload.mimeType }] : []),
        ...(payload.loadingImage2Base64 ? [{ base64: payload.loadingImage2Base64, mimeType: payload.loadingImage2MimeType }] : []),
        ...(Array.isArray(payload.palletPhotos) ? payload.palletPhotos.filter(photo => photo?.base64) : [])
    ];
    if (!files.length) fail('ต้องแนบไฟล์ Loading Detail ก่อนปิดงานพร้อมวางบิล', 422);
    // Validate the entire upload before the route saves any file or changes any House.
    files.forEach(evidence);
    return jobs;
}

module.exports = { load, xray, loading };
