import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const require = createRequire(import.meta.url);
const schedule = require('../src/server/consol-schedule.cjs');
const front = readFileSync(new URL('../public/legacy/app.js', import.meta.url), 'utf8');
const api = readFileSync(new URL('../src/server/legacy-api.cjs', import.meta.url), 'utf8');
const cut = (s: string, a: string, b: string) => s.slice(s.indexOf(a), s.indexOf(b, s.indexOf(a)));

test('date inputs use Bangkok at midnight even when host runs UTC and preserve date-only inputs', () => {
    const ctx = vm.createContext({});
    vm.runInContext(cut(front, 'function toDateInput(', 'function toDateTimeInput('), ctx);
    for (const [value, expected] of [
        ['2026-10-20T17:30:00Z', '2026-10-21'],
        ['2026-10-21T00:30:00+07:00', '2026-10-21'],
        ['2026-10-20T16:59:59Z', '2026-10-20'],
        ['2026-12-31T17:00:00Z', '2027-01-01'],
        ['2026-10-19', '2026-10-19'], ['', '']
    ]) assert.equal(vm.runInContext(`toDateInput(${JSON.stringify(value)})`, ctx), expected);
});

test('ETD changes and removals are detected while equivalent UTC instants are unchanged', () => {
    const old = { flightNo: 'NH850/20', flightTime: '2026-10-20T21:35:00+07:00' };
    assert.deepEqual(schedule.scheduleChanges(old, { ...old, flightTime: '2026-10-20T23:35:00+07:00' }), ['FLIGHT_TIME_CHANGED']);
    assert.deepEqual(schedule.scheduleChanges(old, { ...old, flightTime: '2026-10-20T14:35:00Z' }), []);
    assert.deepEqual(schedule.scheduleChanges(old, { ...old, flightTime: '' }), ['FLIGHT_TIME_CHANGED']);
    assert.deepEqual(schedule.scheduleChanges(old, { ...old, flightNo: 'NH850/21' }), ['FLIGHT_CHANGED']);
});

test('GlobalConsol import counts time-only changes, records before and after, and replay does not alert twice', () => {
    const job = { houseNumber: '4840805485', flightNo: 'NH850/20', flightTime: '2026-10-20T21:35:00+07:00', destAirport: 'NRT', status: 'Pending', csConfirmed: false, mawbNumber: '205-86393230', onhandNumber: 'F842089695', packageCounts: { PLT: 6, CTN: 216 } };
    const db = { jobs: [job], customers: [], importChanges: [] as Array<{ changes: string[]; message: string; flightBefore: { flightTime: string }; flightAfter: { flightTime: string } }> };
    const shipment = { flight: job.flightNo, fltDate: '2026-10-20', etd: '23:35', dest: 'NRT', mawb: job.mawbNumber, houses: [{ houseNo: job.houseNumber, shipper: 'Test', consignee: 'Test', pcs: '216', pkgType: 'CTN', packageCounts: job.packageCounts, dg: 'N' }] };
    const ctx = vm.createContext({ db, consolSchedule: schedule, crypto: require('node:crypto'), nowIso: () => '2026-10-18T10:00:00Z', parseFltDate: (v: string) => v, parseGlobalConsolCsv: () => [shipment], normalizePickupItems: (v: unknown) => v, deriveApprovalFields: () => {} });
    vm.runInContext(cut(api, 'function findJob(', 'function findPayloadJobs(') + cut(api, 'function upsertJob(', 'function getOrCreateCustomer(') + cut(api, 'function getOrCreateCustomer(', 'function normalizePickupItems(') + cut(api, 'function importGlobalConsolRows(', 'function recordImportHistory(') + cut(api, 'function buildImportChangeMessage(', 'function saveBase64File('), ctx);
    const run = () => JSON.parse(JSON.stringify(vm.runInContext('importGlobalConsolRows(db, "decoded fixture")', ctx)));
    const changed = run();
    assert.equal(changed.changedJobs, 1);
    assert.equal(changed.unchangedJobs, 0);
    assert.equal(db.importChanges.length, 1);
    assert.deepEqual(Array.from(db.importChanges[0].changes), ['FLIGHT_TIME_CHANGED']);
    assert.match(db.importChanges[0].message, /เที่ยวบิน/);
    assert.equal(db.importChanges[0].flightBefore.flightTime, '2026-10-20T21:35:00+07:00');
    assert.equal(db.importChanges[0].flightAfter.flightTime, '2026-10-20T23:35:00+07:00');
    assert.equal(job.status, 'Pending'); assert.equal(job.csConfirmed, false);
    assert.equal(job.onhandNumber, 'F842089695'); assert.equal(job.mawbNumber, '205-86393230');
    assert.deepEqual(job.packageCounts, { PLT: 6, CTN: 216 });
    const replay = run();
    assert.equal(replay.changedJobs, 0); assert.equal(replay.unchangedJobs, 1);
    assert.equal(db.importChanges.length, 1);
});
