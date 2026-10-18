/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS compatibility service. */
const receipts = require('./inbound-receipts.cjs');

function flightTime(value) {
    const raw = String(value || '').trim();
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.exec(raw);
    const ms = Date.parse(raw);
    if (!match || !Number.isFinite(ms)) throw new Error('กรุณาระบุวันเวลาออกบินใหม่พร้อมเขตเวลาให้ถูกต้อง');
    const [, year, month, day, hour, minute, second = '0', zone] = match;
    const calendar = new Date(Date.UTC(+year, +month - 1, +day));
    if (+year < 2000 || +year > 2100 || calendar.getUTCMonth() !== +month - 1 || calendar.getUTCDate() !== +day || +hour > 23 || +minute > 59 || +second > 59 || (zone !== 'Z' && (+zone.slice(1, 3) > 14 || +zone.slice(4) > 59 || (+zone.slice(1, 3) === 14 && +zone.slice(4) !== 0)))) throw new Error('วันเวลาออกบินใหม่ไม่ถูกต้อง');
    return new Date(ms).toISOString();
}
const sameTime = (a, b) => (a || '') === (b || '') || (Number.isFinite(Date.parse(a)) && Date.parse(a) === Date.parse(b));

function changeFlight(job, payload, actor, at = new Date().toISOString()) {
    const number = String(payload.updatedFlightNo || '').trim().toUpperCase();
    if (!number || number.length > 40 || !/^[A-Z0-9][A-Z0-9 /._-]*$/.test(number) || !/\d/.test(number)) throw new Error('กรุณากรอกเลข Flight ใหม่ให้ถูกต้อง');
    const time = flightTime(payload.updatedFlightTime);
    const cutoff = payload.updatedCargoCutoffAt === undefined ? (job.cargoCutoffAt || '') : (payload.updatedCargoCutoffAt ? flightTime(payload.updatedCargoCutoffAt) : '');
    if (cutoff && Date.parse(cutoff) > Date.parse(time)) throw new Error('เวลาปิดรับสินค้าต้องไม่หลังเวลาออกบิน');
    const reason = String(payload.flightChangeReason || '').trim();
    if (!reason || reason.length > 1000) throw new Error('กรุณาระบุเหตุผลเปลี่ยน Flight ไม่เกิน 1000 ตัวอักษร');
    const requestId = String(payload.requestId || '');
    if (!/^[A-Za-z0-9-]{8,100}$/.test(requestId)) throw new Error('ต้องมีรหัสคำขอเปลี่ยน Flight กรุณาโหลดหน้าใหม่');
    const history = job.flightChangeHistory || [];
    const prior = history.find(row => row.requestId === requestId);
    if (prior) {
        if (prior.newFlightNo !== number || !sameTime(prior.newFlightTime, time) || !sameTime(prior.newCargoCutoffAt, cutoff) || prior.reason !== reason) throw new Error('รหัสคำขอนี้ใช้เปลี่ยน Flight เป็นข้อมูลอื่นแล้ว');
        if (job.flightRevision !== prior.revision || job.flightNo !== prior.newFlightNo || !sameTime(job.flightTime, prior.newFlightTime) || !sameTime(job.cargoCutoffAt, prior.newCargoCutoffAt)) throw new Error('Flight ถูกแก้ใหม่หลังคำขอนี้แล้ว กรุณารีเฟรชและตรวจข้อมูลล่าสุด');
        return { changed: false, replayed: true, record: prior };
    }
    const revision = job.flightRevision || 0;
    if (!Number.isSafeInteger(payload.expectedFlightRevision) || payload.expectedFlightRevision !== revision || payload.expectedFlightNo !== (job.flightNo || '') || !sameTime(payload.expectedFlightTime, job.flightTime) || (payload.expectedCargoCutoffAt !== undefined && !sameTime(payload.expectedCargoCutoffAt, job.cargoCutoffAt))) throw new Error('Flight มีการเปลี่ยนแปลง กรุณารีเฟรชและตรวจข้อมูลล่าสุดก่อนบันทึก');
    if (number === String(job.flightNo || '').trim().toUpperCase() && sameTime(time, job.flightTime) && sameTime(cutoff, job.cargoCutoffAt)) return { changed: false, replayed: false, record: null };
    const record = { revision: revision + 1, requestId, houseNumber: job.houseNumber, master: job.mawbNumber || '', oldFlightNo: job.flightNo || '', newFlightNo: number, oldFlightTime: job.flightTime || '', newFlightTime: time, oldCargoCutoffAt: job.cargoCutoffAt || '', newCargoCutoffAt: cutoff, reason, changedBy: actor, changedAt: at };
    Object.assign(job, { previousFlightNo: job.flightNo || '', previousFlightTime: job.flightTime || '', flightNo: number, flightTime: time, cargoCutoffAt: cutoff, flightRevision: record.revision, flightChangeHistory: [...history, record], trackUpdatedAt: at, trackReprintRequired: true, updatedAt: at });
    return { changed: true, replayed: false, record };
}

function scanHouse(job, payload, actor, at = new Date().toISOString()) {
    if (!['Single', 'Pair'].includes(payload.trackType || job.trackType || 'Single')) throw new Error('Track Type ไม่ถูกต้อง');
    const changing = payload.flightChanged === true;
    // Flight edits never re-run receiving or routing. Preserve all cargo workflow fields.
    if (changing) return changeFlight(job, payload, actor, at);
    if (String(payload.updatedFlightNo || '').trim() || String(payload.updatedFlightTime || '').trim() || String(payload.flightChangeReason || '').trim()) throw new Error('กรุณาเลือก Flight เปลี่ยน ก่อนกรอกข้อมูลเที่ยวบินใหม่');
    const progressed = Boolean(job.locationId || job.inboundClosedAt) || !['Pending', 'PendingEI', 'DocumentChecked', 'InboundOpened', 'HouseIdentified'].includes(job.status);
    if (!progressed) {
        job.trackType = payload.trackType || job.trackType || 'Single';
        job.status = job.trackType === 'Pair' && receipts.house(job).complete ? 'ReadyForTerminal' : 'HouseIdentified';
    }
    job.inboundScannedAt = at;
    job.updatedAt = at;
    return { changed: false, replayed: false, record: null };
}

function preview(jobs, payload, actor) {
    const job = jobs.find(row => row.houseNumber === payload.houseNumber);
    if (!job) throw new Error('ไม่พบ House ที่เลือก');
    const copies = JSON.parse(JSON.stringify(jobs));
    const copy = copies.find(row => row.houseNumber === job.houseNumber);
    const result = scanHouse(copy, { ...payload, flightChanged: true }, actor);
    const fields = row => ({ houseNumber: row.houseNumber, onhandNumber: row.onhandNumber || '', master: row.mawbNumber || '', flightNo: row.flightNo || '', flightTime: row.flightTime || '', cargoCutoffAt: row.cargoCutoffAt || '', status: row.status, locationId: row.locationId || '', receipt: receipts.house(row), flightRevision: row.flightRevision || 0 });
    return { preview: true, persisted: false, scope: 'selected_house_only', changed: result.changed, before: fields(job), after: fields(copy), history: result.record, masterReceipt: receipts.overview(copies).masters.get(receipts.masterKey(copy)) };
}

module.exports = { flightTime, changeFlight, scanHouse, preview };
