import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const require = createRequire(import.meta.url);
const risk = require('../src/server/flight-risk.cjs');
const receipts = require('../src/server/inbound-receipts.cjs');
const due = Date.parse('2026-10-19T15:00:00Z');
function fixture(overrides = {}) {
    return { houseNumber: '4840805485', onhandNumber: 'F842089695', mawbNumber: '205-86393230', packageCounts: { CTN: 216, PLT: 6 }, status: 'Pending', flightNo: 'NH850/20', flightTime: '2026-10-20T21:35:00+07:00', cargoCutoffAt: '2026-10-19T23:00:00+07:00', ...overrides };
}
test('server and browser share exact inclusive 2h and 4h boundaries without rounding seconds', () => {
    const context = { window: {} as Record<string, unknown> };
    vm.runInNewContext(readFileSync(new URL('../public/legacy/flight-risk-core/index.js', import.meta.url), 'utf8'), context);
    const browser = context.window.FlightRiskCore as typeof risk;
    for (const [minutes, expected, tier] of [[240.01, 'DueToday', 'normal'], [240, 'Urgent', 'warning'], [120.01, 'Urgent', 'warning'], [120, 'Critical', 'critical'], [0, 'Critical', 'critical'], [-0.01, 'Breached', 'over']] as const) {
        const result = risk.derive(fixture(), due - minutes * 60000);
        assert.equal(result.flightRiskStatus, expected);
        assert.equal(result.minutesToAirportDue, minutes);
        assert.equal(browser.tier(minutes).key, tier);
        assert.equal(browser.level(minutes, false, true), expected);
    }
});
test('explicit urgent C/K and airline prefix work with ETD or cutoff; destination never triggers no-miss', () => {
    for (const fields of [{ urgentCode: 'K' }, { urgentCode: ' c ' }, { flightNo: 'K1234' }, { flightNo: 'CK123' }]) {
        for (const flightTime of [fixture().flightTime, '']) {
            const job = fixture({ ...fields, flightTime }), result = risk.derive(job, due - 180 * 60000);
            assert.equal(result.mustNotMissFlight, true); assert.equal(result.flightRiskStatus, 'Critical');
            assert.equal(risk.tier(180, risk.noMiss(job)).key, 'critical');
        }
    }
    assert.equal(risk.derive(fixture({ destination: 'KUL' }), due - 180 * 60000).flightRiskStatus, 'Urgent');
});
test('Stored, InboundOpened and arrival timestamp never suppress risk without complete confirmed quantities', () => {
    for (const status of ['Stored', 'InboundOpened', 'HouseIdentified', 'ReadyForTerminal']) {
        const job = fixture({ status, wh3ReceivedAt: '2026-10-18T01:00:00Z' });
        assert.equal(risk.derive(job, due - 60000).flightRiskStatus, 'Critical');
        receipts.receiveCounts(job, { counts: { CTN: 215, PLT: 6 }, requestId: 'partial-counts', expectedRevision: 0 }, 'wh');
        assert.equal(risk.derive(job, due - 60000).flightRiskStatus, 'Critical');
        receipts.receiveCounts(job, { counts: job.packageCounts, requestId: 'complete-counts', expectedRevision: 1 }, 'wh');
        assert.equal(risk.derive(job, due - 60000).flightRiskStatus, 'WH3Received');
    }
});
test('2/3 and 3/3 Master receipts suppress only each House that has actually confirmed its full quantities', () => {
    const jobs = [fixture({ status: 'Stored' }), fixture({ houseNumber: '4840805589', status: 'Stored', packageCounts: { CTN: 10, PLT: 6 } }), fixture({ houseNumber: '4840805590', status: 'Stored', packageCounts: { CTN: 9, PLT: 6 } })];
    jobs.slice(0, 2).forEach((job, i) => receipts.receiveCounts(job, { counts: job.packageCounts, expectedRevision: 0, requestId: 'master-counts-' + i }, 'wh'));
    const db = { jobs, alerts: [] as { houseNumber: string }[] };
    risk.refresh(db, { now: due - 60000 });
    assert.equal(receipts.overview(jobs).masters.get('20586393230').completeHouses, 2);
    assert.deepEqual(db.alerts.map(a => a.houseNumber), ['4840805590']);
    receipts.receiveCounts(jobs[2], { counts: jobs[2].packageCounts, expectedRevision: 0, requestId: 'master-counts-3' }, 'wh');
    risk.refresh(db, { now: due - 30000 });
    assert.equal(receipts.overview(jobs).masters.get('20586393230').completeHouses, 3);
    assert.equal(db.alerts.length, 1); // prior alert remains audit history
    assert.equal(risk.derive(jobs[2], due).flightRiskStatus, 'WH3Received');
});
test('first evaluation after midnight creates overdue alert once and later same-state refreshes never repeat', () => {
    const db = { jobs: [fixture()], alerts: [] as { flightRiskStatus: string }[] };
    const midnight = Date.parse('2026-10-20T00:01:00+07:00');
    for (const time of [midnight, midnight + 60000, midnight + 86400000]) risk.refresh(db, { now: time });
    assert.equal(db.alerts.length, 1); assert.equal(db.alerts[0].flightRiskStatus, 'Breached');
});
test('escalation, new deadline and a real quantity correction rearm alerts while preserving workflow', () => {
    const job = fixture({ status: 'Stored' }), db = { jobs: [job], alerts: [] };
    risk.refresh(db, { now: due - 60 * 60000 });
    risk.refresh(db, { now: due + 60000 });
    assert.equal(db.alerts.length, 2);
    receipts.receiveCounts(job, { counts: job.packageCounts, expectedRevision: 0, requestId: 'receipt-complete' }, 'wh');
    risk.refresh(db, { now: due + 120000 });
    receipts.receiveCounts(job, { counts: { CTN: 215, PLT: 6 }, expectedRevision: 1, requestId: 'receipt-correction', reason: 'verified correction' }, 'wh');
    risk.refresh(db, { now: due + 180000 });
    assert.equal(db.alerts.length, 3);
    assert.equal(job.status, 'Stored'); assert.equal(job.houseNumber, '4840805485');
});
test('no ETD/cutoff never invents urgency; cancelled/completed and terminal workflows do not trigger inbound alerts', () => {
    assert.equal(risk.derive(fixture({ flightTime: '', cargoCutoffAt: '' }), due).flightRiskStatus, 'Unclassified');
    for (const status of ['Cancelled', 'Completed', 'TerminalArrived', 'Billed']) {
        const db = { jobs: [fixture({ status })], alerts: [] };
        risk.refresh(db, { now: due + 60000 }); assert.equal(db.alerts.length, 0);
    }
});
test('board refresh fetches new server jobs, avoids overlapping requests and keeps old data visibly on failure', async () => {
    const source = readFileSync(new URL('../public/legacy/app.js', import.meta.url), 'utf8');
    const start = source.indexOf('async function refreshFlightBoard()'), end = source.indexOf('function fbToggleFull()', start);
    let resolveRequest: (value: unknown) => void = () => {};
    const context = { _fbRefreshPending: false, _fbLastSync: '', _fbSyncError: '', state: { view: 'flight-board', dashboard: { jobs: ['old'] } }, calls: 0, rendered: 0, api: () => { context.calls++; return new Promise(resolve => { resolveRequest = resolve; }); }, renderFlightBoard: () => { context.rendered++; } };
    vm.createContext(context); vm.runInContext(source.slice(start, end), context);
    const first = vm.runInContext('refreshFlightBoard()', context);
    await vm.runInContext('refreshFlightBoard()', context); assert.equal(context.calls, 1);
    resolveRequest({ dashboard: { jobs: ['updated-from-server'] } }); await first;
    assert.equal(context.state.dashboard.jobs[0], 'updated-from-server'); assert.ok(context._fbLastSync);
    const second = vm.runInContext('refreshFlightBoard()', context); resolveRequest({ queued: true }); await second;
    assert.equal(context.state.dashboard.jobs[0], 'updated-from-server'); assert.match(context._fbSyncError, /ข้อมูลเดิม/);
    assert.match(source.slice(source.indexOf('    _fbTimer = setInterval'), end), /refreshFlightBoard\(\)/);
});
test('real dashboard polling evaluates and persists new alerts without requiring a cargo write or n8n', async () => {
    const source = readFileSync(new URL('../src/server/legacy-api.cjs', import.meta.url), 'utf8');
    const start = source.indexOf('    if (req.method === "GET" && pathname === "/api/bootstrap")');
    const end = source.indexOf('    if (req.method === "POST" && pathname === "/api/scan-barcode")', start);
    const job = fixture(), before = structuredClone(job), db = { jobs: [job], alerts: [] };
    let writes = 0;
    const now = Date.parse('2026-10-20T00:01:00+07:00');
    const context = { req: { method: 'GET' }, res: {}, pathname: '/api/bootstrap', db, publicUsers: () => [], refreshFlightSla: (state: unknown) => risk.refresh(state, { now }), writeDb: () => { writes++; }, buildDashboard: () => ({ jobs: db.jobs, alerts: db.alerts }), sendJson: (_res: unknown, status: number, value: unknown) => ({ status, value }) };
    const run = () => vm.runInNewContext('(async()=>{' + source.slice(start, end) + '})()', context);
    assert.equal((await run()).status, 200); assert.equal(writes, 1); assert.equal(db.alerts.length, 1);
    await run(); assert.equal(writes, 1); assert.equal(db.alerts.length, 1);
    for (const key of Object.keys(before) as (keyof typeof job)[]) assert.deepEqual(job[key], before[key]);
});
