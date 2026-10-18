/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS API adapter. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
// The same pure calculation is used by the browser and the API. The public
// classic script is loaded in an isolated CommonJS context under this ESM app.
const context = { module: { exports: {} } };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../public/legacy/inbound-receipts.js'), 'utf8'), context);
const core = context.module.exports;

function receiveCounts(job, payload, actor) {
    const plan = core.planned(job);
    if (!plan.known) throw new Error('ยังยืนยันหน่วยและจำนวนตามแผนไม่ได้ กรุณาตรวจแผนก่อนบันทึกยอดรับ');
    const keys = Object.keys(plan.counts);
    const counts = payload.counts;
    if (!counts || typeof counts !== 'object' || Array.isArray(counts) || Object.keys(counts).length !== keys.length || keys.some(key => !Object.hasOwn(counts, key) || !core.valid(counts[key]))) throw new Error('กรอกยอดรับสะสมเป็นจำนวนเต็มตั้งแต่ 0 ให้ครบทุกหน่วยตามแผน');
    const normalized = Object.fromEntries(keys.map(key => [key, Number(counts[key])]));
    const requestId = String(payload.requestId || '');
    if (!/^[A-Za-z0-9-]{8,100}$/.test(requestId)) throw new Error('ต้องมีรหัสคำขอบันทึกยอดรับ');
    const prior = (job.inboundReceiptHistory || []).find(row => row.requestId === requestId);
    if (prior) {
        if (keys.some(key => prior.counts[key] !== normalized[key])) throw new Error('รหัสคำขอนี้ใช้บันทึกยอดอื่นแล้ว');
        return core.house(job);
    }
    const revision = job.inboundReceipt?.revision || 0;
    if (payload.expectedRevision !== revision) throw new Error('ยอดรับมีการเปลี่ยนแปลง กรุณารีเฟรชก่อนบันทึก');
    const decreases = keys.some(key => normalized[key] < Number(job.inboundReceipt?.counts?.[key] || 0));
    const reason = String(payload.reason || '').trim().slice(0, 1000);
    if (decreases && !reason) throw new Error('กรุณาระบุเหตุผลเมื่อแก้ยอดรับสะสมลดลง');
    const record = { counts: normalized, revision: revision + 1, confirmedAt: new Date().toISOString(), confirmedBy: actor, requestId, reason };
    job.inboundReceiptHistory = [...(job.inboundReceiptHistory || []), record];
    job.inboundReceipt = { ...record, counts: { ...normalized } };
    job.updatedAt = record.confirmedAt;
    return core.house(job);
}

function assertReceiptComplete(job) {
    const summary = core.house(job);
    if (!summary.complete) throw new Error('ยังปิดรับเข้าไม่ได้: ต้องยืนยันยอดรับจริงครบทุกหน่วยตามแผน และตรวจยอดเกินก่อน');
    return summary;
}

function previewScenario(jobs, payload) {
    const master = String(payload.master || '').replace(/[\s-]/g, '').toUpperCase();
    if (!master) throw new Error('กรุณาระบุ Master สำหรับชุดทดสอบ');
    const rows = core.canonical(jobs).filter(row => core.masterKey(row.job) === master);
    if (!rows.length || rows.some(row => row.ambiguous)) throw new Error('ไม่พบชุด Master ที่ระบุ House ได้แน่นอน');
    const copies = rows.map(row => JSON.parse(JSON.stringify(row.job)));
    const requested = payload.received;
    if (!Array.isArray(requested) || requested.length !== copies.length || new Set(requested.map(row => row.houseNumber)).size !== copies.length) throw new Error('ชุดทดสอบต้องระบุยอดของทุก House ใน Master อย่างละหนึ่งรายการ');
    for (const row of requested) {
        const job = copies.find(job => job.houseNumber === row.houseNumber);
        if (!job) throw new Error('House ไม่อยู่ใน Master ที่เลือก');
        job.inboundReceiptHistory = [];
        receiveCounts(job, { counts: row.counts, expectedRevision: job.inboundReceipt?.revision || 0, requestId: 'preview-' + row.houseNumber, reason: 'ดูตัวอย่าง ไม่บันทึก' }, 'preview');
    }
    return { preview: true, persisted: false, summary: core.overview(copies).masters.get(master) };
}

module.exports = { ...core, receiveCounts, assertReceiptComplete, previewScenario };
