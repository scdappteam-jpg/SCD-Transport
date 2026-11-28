import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
const require = createRequire(import.meta.url);
const schedule = require('../src/server/import-schedule.cjs');
const alerts = require('../src/server/srs-alerts.cjs');
const pair = require('../src/server/pair-scan.cjs');
const match = require('../src/server/billing-match.cjs');
const ret = require('../src/server/customs-return.cjs');

type Row = Record<string, unknown>;
const admin = { id: 'A', role: 'Admin', name: 'Admin' };

test('import rounds: immediate by default; fixed 09/17/20 holds files until the next round; interval every 30 min', () => {
    const db: Row = {};
    assert.equal(schedule.isDue(db, '2026-11-28T03:00:00Z'), true, 'default imports immediately');
    assert.throws(() => schedule.save(db, { id: 'T', role: 'Team_Transport' }, { mode: 'fixed' }, 'x'), /Admin/);
    assert.throws(() => schedule.save(db, admin, { mode: 'fixed', times: ['9am'] }, 'x'), /HH:MM/);
    assert.throws(() => schedule.save(db, admin, { mode: 'interval', intervalMinutes: 15 }, 'x'), /30 หรือ 60/);
    schedule.save(db, admin, { mode: 'fixed', times: ['20:00', '09:00', '17:00'] }, 'x');
    // 10:05 Bangkok = 03:05Z. Last run 09:02 Bangkok -> nothing due until 17:00.
    db.importScheduleState = { lastRunAt: '2026-11-28T02:02:00Z' };
    assert.equal(schedule.isDue(db, '2026-11-28T03:05:00Z'), false);
    schedule.enqueue(db, [{ fileName: 'plan.xlsx', base64: 'AA' }], { subject: 'Plan' }, '2026-11-28T03:05:00Z');
    assert.equal(schedule.status(db, '2026-11-28T03:05:00Z').waitingFiles, 1);
    assert.equal(schedule.status(db, '2026-11-28T03:05:00Z').nextRunAt, '2026-11-28T10:00:00.000Z', 'next round is 17:00 Bangkok');
    assert.equal(schedule.isDue(db, '2026-11-28T10:01:00Z'), true, 'due after 17:00');
    assert.equal(schedule.drain(db, '2026-11-28T10:01:00Z').length, 1);
    assert.equal(schedule.isDue(db, '2026-11-28T10:30:00Z'), false);
    schedule.save(db, admin, { mode: 'interval', intervalMinutes: 30 }, 'x');
    assert.equal(schedule.isDue(db, '2026-11-28T10:20:00Z'), false);
    assert.equal(schedule.isDue(db, '2026-11-28T10:31:00Z'), true);
});

test('driver GPS refreshes the ETA only on Houses that driver is bringing back to WH3', () => {
    const db = { hr: { checkInLocations: [{ id: 'WH3', name: 'WH3', latitude: 13.69, longitude: 100.75 }] }, jobs: [
        { houseNumber: 'R1', driverId: 'D1', driverRouteStatus: 'ReturningWH3' },
        { houseNumber: 'R2', driverId: 'D1', driverRouteStatus: 'EnRouteToPickup' },
        { houseNumber: 'R3', driverId: 'D2', driverRouteStatus: 'ReturningWH3' }
    ] as Row[] };
    assert.equal(alerts.updateDriverEta(db, 'D1', '13.80,100.55', '2026-11-28T03:00:00Z'), 1);
    assert.ok(db.jobs[0].etaWh3At);
    assert.equal(db.jobs[1].etaWh3At, undefined);
    assert.equal(db.jobs[2].etaWh3At, undefined);
});

test('a Master or Flight change after QA needs a House + Master pair scan; a mismatch never releases', () => {
    const job: Row = { houseNumber: 'H1', hawbNumber: '4840001', mawbNumber: '205-1111', flightNo: 'TG640', qaApproval: { approvedAt: '2026-11-27T00:00:00Z', reference: pair.reference({ mawbNumber: '205-1111', flightNo: 'TG640' }) } };
    const db = { jobs: [job] };
    assert.equal(pair.required(job), false);
    job.flightNo = 'TG642';
    assert.equal(pair.required(job), true);
    assert.throws(() => pair.assertCurrent(job), /สแกนคู่บาร์โค้ด/);
    assert.throws(() => pair.scan(db, { id: 'W', role: 'WH_Staff' }, { houseNumber: 'H1', houseCode: 'H1', masterCode: '2051111' }, 't'), /QA/);
    const bad = pair.scan(db, { id: 'Q', role: 'QA_Inspector' }, { houseNumber: 'H1', houseCode: '4840001', masterCode: '205-9999' }, 't1');
    assert.equal(bad.ok, false);
    assert.match(bad.error, /ไม่ตรง Master ล่าสุด/);
    assert.equal(pair.required(job), true, 'still blocked after a mismatch');
    const good = pair.scan(db, { id: 'Q', role: 'QA_Inspector' }, { houseNumber: 'H1', houseCode: '4840-001', masterCode: '2051111' }, 't2');
    assert.equal(good.ok, true);
    assert.equal(pair.required(job), false);
    // Older House without a stored reference: a logged Master change after the last scan counts.
    const old: Row = { houseNumber: 'H2', mawbNumber: '205-2', qaApproval: { approvedAt: '2026-11-01T00:00:00Z' }, masterChangeHistory: [{ at: '2026-11-02T00:00:00Z' }] };
    assert.equal(pair.required(old), true);
});

test('accounting Match: matched or not matched with a note, by Billing or Admin only', () => {
    const db = { jobs: [{ houseNumber: 'B1' }, { houseNumber: 'B2' }] as Row[] };
    assert.throws(() => match.match(db, { id: 'C', role: 'CS' }, { houseNumbers: ['B1'] }, 't'), /บัญชี/);
    assert.throws(() => match.match(db, { id: 'F', role: 'Billing' }, { houseNumber: 'B1', matched: false, note: 'ผิด' }, 't'), /ต่างกัน/);
    match.match(db, { id: 'F', role: 'Billing', name: 'บัญชี' }, { houseNumbers: ['B1', 'B2'] }, 't');
    assert.equal(match.isMatched(db.jobs[0]), true);
    match.match(db, { id: 'F', role: 'Billing' }, { houseNumber: 'B2', matched: false, note: 'น้ำหนักในใบจริงไม่ตรงรูป' }, 't2');
    assert.equal(match.isMatched(db.jobs[1]), false);
    assert.equal((db.jobs[1].physicalDocMatchHistory as Row[]).length, 2);
});

test('cancel after customs needs the return-request photo, cancels the House and creates a return job', () => {
    const job: Row = { houseNumber: 'C1', customerName: 'SIT', pieceCount: 4, status: 'Stored', releaseDocumentReceivedAt: 't0', driverId: 'D1' };
    const db: { jobs: Row[] } = { jobs: [job, { houseNumber: 'C2', status: 'Pending' }] };
    const save = (_h: string, _t: string, files: unknown[]) => files.map((_f, i) => ({ fileId: `F${i}` }));
    const base = { houseNumber: 'C1', category: 'CustomerCancelled', reason: 'ลูกค้าแจ้งยกเลิกทางอีเมล', destination: 'Factory' };
    assert.throws(() => ret.cancel(db, { id: 'X', role: 'WH_Staff' }, base, 't', save), /สิทธิ์/);
    assert.throws(() => ret.cancel(db, { id: 'D2', role: 'Driver' }, { ...base, returnRequestFiles: [{ base64: 'x' }] }, 't', save), /ของตนเอง/);
    assert.throws(() => ret.cancel(db, admin, { ...base, houseNumber: 'C2', returnRequestFiles: [{ base64: 'x' }] }, 't', save), /ยังไม่ผ่านพิธีการ/);
    assert.throws(() => ret.cancel(db, admin, base, 't', save), /คำร้อง/);
    const { returnJob } = ret.cancel(db, { id: 'D1', role: 'Driver', name: 'คนขับ' }, { ...base, returnRequestFiles: [{ base64: 'x' }] }, '2026-11-28T03:00:00Z', save);
    assert.equal(job.status, 'Cancelled');
    assert.equal((job.customsCancellation as Row).chargeable, true);
    assert.equal(returnJob.houseNumber, 'C1-RTN');
    assert.equal(returnJob.returnOfHouse, 'C1');
    assert.equal(returnJob.status, 'Pending');
    assert.equal(db.jobs.length, 3);
    assert.throws(() => ret.cancel(db, admin, { ...base, returnRequestFiles: [{ base64: 'x' }] }, 't', save), /ยกเลิกไปแล้ว/);
    const s = ret.stats(db, '2026-11');
    assert.equal(s.total, 1);
    assert.deepEqual(s.byCategory, [{ code: 'CustomerCancelled', label: 'ลูกค้ายกเลิก', count: 1 }]);
});
