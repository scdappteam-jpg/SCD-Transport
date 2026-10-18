import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const require = createRequire(import.meta.url);
const flight = require('../src/server/inbound-flight.cjs');
const receipts = require('../src/server/inbound-receipts.cjs');
const plain = (value: unknown) => JSON.parse(JSON.stringify(value));
function fixture() {
    return ['4840805485', '4840805589', '4840805590'].map((houseNumber, index) => {
        const job: Record<string, unknown> = { houseNumber, onhandNumber: ['F842089695', 'F842092589', 'F842092590'][index], mawbNumber: '205-86393230', packageCounts: { CTN: [216, 10, 9][index], PLT: 6 }, flightNo: 'NH850/20', flightTime: '2026-10-20T21:35:00+07:00', status: 'Stored', locationId: 'TEST-' + index, csConfirmed: true, trackType: 'Single', inboundClosedAt: '2026-10-18T01:00:00Z' };
        receipts.receiveCounts(job, { counts: job.packageCounts, requestId: 'fixture-' + index, expectedRevision: 0 }, 'wh');
        return job;
    });
}
function payload(job: Record<string, unknown>, overrides = {}) {
    return { houseNumber: job.houseNumber, trackType: 'Single', flightChanged: true, updatedFlightNo: 'NH850/21', updatedFlightTime: '2026-10-21T21:35:00+07:00', updatedCargoCutoffAt: '', flightChangeReason: 'สายการบินแจ้งเลื่อน ตามเอกสารทดสอบ', requestId: 'flight-request-1', expectedFlightRevision: job.flightRevision || 0, expectedFlightNo: job.flightNo, expectedFlightTime: job.flightTime, expectedCargoCutoffAt: job.cargoCutoffAt || '', ...overrides };
}
test('changing Flight after storage preserves every cargo field and only changes the selected House', () => {
    const jobs = fixture(), before = structuredClone(jobs);
    const result = flight.scanHouse(jobs[0], payload(jobs[0]), 'wh-real', '2026-10-18T01:30:00Z');
    assert.equal(result.changed, true);
    for (const key of ['status', 'locationId', 'csConfirmed', 'trackType', 'inboundClosedAt', 'inboundReceipt', 'inboundReceiptHistory', 'packageCounts', 'houseNumber', 'onhandNumber', 'mawbNumber']) assert.deepEqual(jobs[0][key], before[0][key]);
    assert.deepEqual(jobs.slice(1), before.slice(1));
    assert.equal(jobs[0].flightTime, '2026-10-21T14:35:00.000Z');
    assert.equal(jobs[0].trackReprintRequired, true);
    const master = receipts.overview(jobs).masters.get('20586393230');
    assert.equal(master.completeHouses, 3);
    assert.deepEqual(plain(master.received), { CTN: 235, PLT: 18 });
    assert.equal(result.record.changedBy, 'wh-real');
    assert.equal(result.record.oldFlightNo, 'NH850/20');
    assert.equal(result.record.newFlightNo, 'NH850/21');
    assert.ok(result.record.reason);
});
test('blank number, missing ETD or reason, invalid dates, stale revision and importer updates fail before mutation', () => {
    const invalid = [{ updatedFlightNo: '' }, { updatedFlightNo: '  ' }, { updatedFlightNo: '<script>' }, { updatedFlightTime: '' }, { updatedFlightTime: '2026-02-30T21:35:00+07:00' }, { updatedFlightTime: '2026-10-21T21:35' }, { updatedFlightTime: '2026-10-21T24:00:00+07:00' }, { updatedCargoCutoffAt: '2026-10-22T00:00:00+07:00' }, { flightChangeReason: ' ' }, { expectedFlightRevision: 1 }, { expectedFlightNo: 'IMPORTED' }, { expectedFlightTime: '2026-10-22T21:35:00+07:00' }, { expectedCargoCutoffAt: '2026-10-21T12:00:00Z' }, { requestId: '' }];
    for (const override of invalid) {
        const job = fixture()[0], before = structuredClone(job);
        assert.throws(() => flight.scanHouse(job, payload(job, override), 'wh'));
        assert.deepEqual(job, before);
    }
});
test('replay writes no second history record; stale forms fail and repeated changes retain the entire history', () => {
    const job = fixture()[0], first = payload(job);
    flight.scanHouse(job, first, 'wh-1');
    const saved = structuredClone(job);
    assert.equal(flight.scanHouse(job, first, 'wh-1').replayed, true);
    assert.deepEqual(job, saved);
    assert.throws(() => flight.scanHouse(job, { ...first, updatedFlightNo: 'NH999/21' }, 'wh-1'), /รหัสคำขอ/);
    assert.throws(() => flight.scanHouse(job, { ...first, requestId: 'flight-request-2' }, 'wh-1'), /รีเฟรช/);
    flight.scanHouse(job, payload(job, { requestId: 'flight-request-2', updatedFlightNo: 'NH999/21' }), 'wh-2');
    const history = job.flightChangeHistory as Record<string, unknown>[];
    assert.equal(history.length, 2);
    assert.equal(history[0].oldFlightNo, 'NH850/20');
    assert.equal(history[1].oldFlightNo, 'NH850/21');
    assert.equal(history[1].changedBy, 'wh-2');
    assert.throws(() => flight.scanHouse(job, first, 'wh-1'), /ถูกแก้ใหม่/);
});
test('unchanged scan never regresses stored or later progress and never switches its existing Track', () => {
    for (const status of ['Stored', 'ReadyForTerminal', 'XRayPassed', 'Billed']) {
        const job = { ...fixture()[0], status, trackType: 'Pair' };
        flight.scanHouse(job, { trackType: 'Single', flightChanged: false }, 'wh');
        assert.equal(job.status, status); assert.equal(job.trackType, 'Pair');
    }
    const early = { ...fixture()[0], status: 'InboundOpened', locationId: '', inboundClosedAt: '', trackType: 'Single' };
    flight.scanHouse(early, { trackType: 'Single', flightChanged: false }, 'wh');
    assert.equal(early.status, 'HouseIdentified');
    assert.throws(() => flight.scanHouse(early, { flightChanged: false, updatedFlightNo: 'NH999' }, 'wh'));
});
test('time-only changes and new cutoff are audited; an exact no-op leaves the job unchanged', () => {
    const job = fixture()[0];
    flight.scanHouse(job, payload(job, { updatedFlightNo: 'NH850/20', updatedCargoCutoffAt: '2026-10-21T05:00:00+07:00' }), 'wh');
    assert.equal(job.flightRevision, 1);
    assert.equal(job.cargoCutoffAt, '2026-10-20T22:00:00.000Z');
    const before = structuredClone(job);
    const result = flight.scanHouse(job, payload(job, { requestId: 'flight-request-2', updatedFlightNo: job.flightNo, updatedFlightTime: job.flightTime, updatedCargoCutoffAt: job.cargoCutoffAt }), 'wh');
    assert.equal(result.changed, false); assert.deepEqual(job, before);
});
test('preview uses the same change logic without touching the real job or its Master receipts', () => {
    const jobs = fixture(), before = structuredClone(jobs);
    const result = flight.preview(jobs, payload(jobs[0]), 'wh');
    assert.equal(result.preview, true); assert.equal(result.persisted, false);
    assert.equal(result.scope, 'selected_house_only'); assert.equal(result.after.status, 'Stored');
    assert.equal(result.after.flightNo, 'NH850/21'); assert.equal(result.masterReceipt.completeHouses, 3);
    assert.deepEqual(jobs, before);
});
test('actual scan route rejects invalid Flight before write, logs one audited change and never duplicates replay', async () => {
    const source = readFileSync(new URL('../src/server/legacy-api.cjs', import.meta.url), 'utf8');
    const start = source.indexOf('    if (req.method === "POST" && pathname === "/api/inbound/scan-house")');
    const end = source.indexOf('    if (req.method === "POST" && pathname === "/api/inbound/twin-scan")', start);
    const jobs = fixture(), db = { jobs }, logs: Record<string, unknown>[] = [];
    let writes = 0, alerts = 0, body = payload(jobs[0], { updatedFlightNo: '' });
    const context = { req: { method: 'POST' }, res: {}, pathname: '/api/inbound/scan-house', db, inboundFlight: flight, refreshDbIfSharedStateChanged: async () => {}, readDb: () => db, requireSessionRole: () => ({ id: 'server-actor' }), parseBody: async () => body, findJob: () => jobs[0], sendJson: (_: unknown, status: number, data: unknown) => ({ status, data }), nowIso: () => '2026-10-18T00:00:00Z', createAlert: async () => { alerts++; }, writeDb: () => { writes++; }, logActivity: (_: unknown, value: Record<string, unknown>) => logs.push(value), normalizeJob: (job: unknown) => job, deriveFlightSla: (job: Record<string, unknown>) => ({ effectiveAirportDueAt: job.flightTime }), formatBangkok: (value: unknown) => value };
    const run = () => vm.runInNewContext('(async()=>{' + source.slice(start, end) + '})()', context);
    assert.equal((await run()).status, 409); assert.equal(writes, 0); assert.equal(alerts, 0);
    body = payload(jobs[0]);
    assert.equal((await run()).status, 200); assert.equal(writes, 1); assert.equal(alerts, 1);
    assert.equal(logs[0].activityType, 'InboundFlightChanged');
    assert.equal((logs[0].flightChange as Record<string, unknown>).changedBy, 'server-actor');
    assert.equal(jobs[0].status, 'Stored');
    assert.equal(jobs[0].effectiveAirportDueAt, jobs[0].flightTime);
    assert.equal((await run()).status, 200); assert.equal(writes, 1); assert.equal(alerts, 1);
});
test('mobile timeout recovery requires the exact committed Flight and request, not merely Stored', () => {
    const context = { window: {} as Record<string, unknown>, document: {}, crypto: { randomUUID: () => 'ui-flight-request' } };
    vm.runInNewContext(readFileSync(new URL('../public/legacy/inbound-flight-ui.js', import.meta.url), 'utf8'), context);
    const ui = context.window.FlightUI as { committed: (job: unknown, data: unknown) => boolean };
    const job = fixture()[0], data = payload(job);
    assert.equal(ui.committed(job, data), false);
    flight.scanHouse(job, data, 'wh');
    assert.equal(ui.committed(job, data), true);
    assert.equal(ui.committed(job, { ...data, requestId: 'other-request' }), false);
    assert.equal(ui.committed(job, { ...data, updatedFlightTime: '2026-10-22T21:35:00+07:00' }), false);
});
test('desktop and mobile Flight forms use explicit Bangkok time and validate before preview or save', async () => {
    const nodes: Record<string, { value: string; innerHTML?: string; scrollIntoView?: () => void }> = {
        '#trackType': { value: 'Single' }, '#flightChanged': { value: 'Yes' }, '#updatedFlightNo': { value: 'NH850/21' }, '#updatedFlightTime': { value: '2026-10-21T21:35' }, '#updatedCargoCutoffAt': { value: '' }, '#flightChangeReason': { value: '' }, '#flightPreviewResult': { value: '', innerHTML: '', scrollIntoView: () => {} }
    };
    const context = { window: { ReceiptUI: { master: () => 'MASTER PREVIEW' } } as Record<string, unknown>, document: { querySelector: (key: string) => nodes[key] }, crypto: { randomUUID: () => 'ui-flight-request' } };
    vm.runInNewContext(readFileSync(new URL('../public/legacy/inbound-flight-ui.js', import.meta.url), 'utf8'), context);
    const ui = context.window.FlightUI as { payload: (job: unknown) => Record<string, unknown>; preview: (job: unknown, api: (path: string, data: unknown) => unknown) => Promise<unknown> };
    const job = fixture()[0];
    assert.throws(() => ui.payload(job), /เหตุผล/);
    nodes['#flightChangeReason'].value = 'ทดสอบ preview';
    const data = ui.payload(job);
    assert.equal(data.updatedFlightTime, '2026-10-21T21:35:00+07:00');
    assert.equal(data.expectedFlightNo, 'NH850/20');
    assert.equal(ui.payload(job).requestId, data.requestId);
    await ui.preview(job, async (_path, value) => flight.preview([job], value, 'wh'));
    assert.match(nodes['#flightPreviewResult'].innerHTML || '', /ยังไม่บันทึกข้อมูลจริง/);
    await assert.rejects(() => ui.preview(job, async () => ({ queued: true })), /ยังไม่ได้รับผลจำลอง/);
    for (const filename of ['index.html', 'mobile.html']) {
        const html = readFileSync(new URL('../public/legacy/' + filename, import.meta.url), 'utf8');
        for (const id of ['updatedFlightTime', 'updatedCargoCutoffAt', 'flightChangeReason', 'previewFlightBtn', 'flightPreviewResult', 'flightHistoryPanel']) assert.match(html, new RegExp('id="' + id + '"'));
        assert.match(html, /inbound-flight-ui.js/);
    }
});
test('receipt preview labels distinguish simulated amounts from confirmed real amounts for 2/3 and 3/3', () => {
    const context = { window: {} as Record<string, unknown> };
    vm.runInNewContext(readFileSync(new URL('../public/legacy/inbound-receipt-ui.js', import.meta.url), 'utf8'), context);
    const ui = context.window.ReceiptUI as { master: (group: unknown, simulated?: boolean) => string };
    for (const n of [2, 3]) {
        const jobs = fixture();
        const group = receipts.previewScenario(jobs, { master: '205-86393230', received: jobs.map((job, i) => ({ houseNumber: job.houseNumber, counts: i < n ? job.packageCounts : { CTN: 0, PLT: 0 } })) }).summary;
        assert.match(ui.master(group, true), /ยอดรับในผลจำลอง/);
        assert.doesNotMatch(ui.master(group, true), /รับจริงยืนยัน/);
        assert.match(ui.master(group), /รับจริงยืนยัน/);
        assert.match(ui.master(group, true), new RegExp('รับครบ ' + n + '/3'));
    }
});
test('mobile permits Flight review after storage without unlocking Scan for jobs still waiting for documents', () => {
    const source = readFileSync(new URL('../public/legacy/mobile.js', import.meta.url), 'utf8');
    const start = source.indexOf('function renderInboundGuide()');
    const end = source.indexOf('function renderBillingGuide()', start);
    const buttons = ['inbound-doc', 'inbound-scan', 'inbound-putaway', 'inbound-close'].map(target => ({ dataset: { operationTarget: target }, disabled: true }));
    const context = { job: fixture()[0], state: { inboundUnlockedHouse: '4840805485' }, findAnyJob: () => context.job, $: (selector: string) => selector === '#scanHouse' ? { value: '4840805485' } : { querySelectorAll: () => [] }, $$: () => buttons, InboundReceipts: receipts, showOperation: () => {} };
    const render = () => vm.runInNewContext(source.slice(start, end) + ';renderInboundGuide();', context);
    render(); assert.equal(buttons[1].disabled, false);
    context.job = { ...context.job, status: 'Pending', locationId: '', inboundClosedAt: '' };
    render(); assert.equal(buttons[1].disabled, true);
});
