import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const require = createRequire(import.meta.url);
const issue = require('../src/server/cargo-issue-plan.cjs');
const front = readFileSync(new URL('../public/legacy/app.js', import.meta.url), 'utf8');
const cut = (a: string, b: string) => front.slice(front.indexOf(a), front.indexOf(b, front.indexOf(a)));
type Job = { houseNumber: string; updatedAt: string; csConfirmed: boolean; driverId?: string; batchId?: string; cargoIssuedAt?: string; cargoIssueHistory?: unknown[]; [key: string]: unknown };
function fixture(count = 3) {
    const users = [{ id: 'A', name: 'Driver A', role: 'Driver', vehiclePlate: 'A-1' }, { id: 'B', name: 'Driver B', role: 'Driver', vehiclePlate: 'B-2' }];
    const jobs: Job[] = Array.from({ length: count }, (_, i) => ({ houseNumber: `H${i + 1}`, onhandNumber: `F${i + 1}`, mawbNumber: '205-86393230', updatedAt: 'before', csConfirmed: true, status: 'Pending', packageCounts: { PLT: 6, CTN: i + 1 }, inboundReceipt: { revision: 0 }, flightNo: 'NH850/20' }));
    return { jobs, users };
}
function plan(db: ReturnType<typeof fixture>) {
    return { requestId: 'cargo-test-0001', pages: db.users.map((driver, i) => ({ driverId: driver.id, driverName: driver.name, vehiclePlate: driver.vehiclePlate, jobs: (i ? db.jobs.slice(1) : db.jobs.slice(0, 1)).map(job => ({ houseNumber: job.houseNumber, updatedAt: job.updatedAt })) })) };
}
test('atomic A/B issuance preserves House, quantities, CS, Flight and receipt; replay is idempotent', () => {
    const db = fixture(), before = structuredClone(db.jobs), payload = plan(db);
    const preview = issue.apply(db, payload, 'admin', { preview: true, now: 'issued' });
    assert.equal(preview.persisted, false); assert.deepEqual(db.jobs, before);
    const result = issue.apply(db, payload, 'admin', { now: 'issued' });
    assert.equal(result.pageCount, 2);
    assert.deepEqual(db.jobs.map(j => j['driverId']), ['A', 'B', 'B']);
    for (const [i, job] of db.jobs.entries()) {
        for (const key of ['houseNumber', 'onhandNumber', 'mawbNumber', 'packageCounts', 'status', 'csConfirmed', 'flightNo', 'inboundReceipt']) assert.deepEqual(job[key], before[i][key]);
        assert.equal(job.cargoIssueHistory?.length, 1);
    }
    assert.equal(db.jobs[1]['batchId'], db.jobs[2]['batchId']); assert.notEqual(db.jobs[0]['batchId'], db.jobs[1]['batchId']);
    const saved = structuredClone(db.jobs);
    assert.equal(issue.apply(db, payload, 'admin').replayed, true); assert.deepEqual(db.jobs, saved);
    const changed = structuredClone(payload); changed.pages[1].driverId = 'A'; changed.pages[1].driverName = 'Driver A'; changed.pages[1].vehiclePlate = 'A-1';
    assert.throws(() => issue.apply(db, changed, 'admin'), /คำขอเดิม/);
});
test('any pending CS, stale job, unknown driver or duplicate House rejects the whole plan before mutation', () => {
    for (const kind of ['cs', 'stale', 'driver', 'duplicate', 'plate', 'issued']) {
        const db = fixture(), payload = plan(db);
        if (kind === 'cs') db.jobs[2].csConfirmed = false;
        if (kind === 'stale') db.jobs[2].updatedAt = 'newer';
        if (kind === 'driver') payload.pages[1].driverId = 'missing';
        if (kind === 'duplicate') payload.pages[1].jobs[0].houseNumber = 'H1';
        if (kind === 'plate') db.users[1].vehiclePlate = 'new-plate';
        if (kind === 'issued') db.jobs[2]['cargoIssuedAt'] = 'already';
        const before = structuredClone(db);
        assert.throws(() => issue.apply(db, payload, 'admin'));
        assert.deepEqual(db, before);
    }
});
test('each page is limited to five Houses and same driver may span multiple pages in one batch', () => {
    const db = fixture(7), payload = plan(db);
    assert.throws(() => issue.apply(db, payload, 'admin'), /1 ถึง 5/);
    payload.pages = [0, 5].map(start => ({ driverId: 'A', driverName: 'Driver A', vehiclePlate: 'A-1', jobs: db.jobs.slice(start, start + 5).map(j => ({ houseNumber: j.houseNumber, updatedAt: j.updatedAt })) }));
    assert.equal(issue.apply(db, payload, 'admin').pageCount, 2);
    assert.equal(new Set(db.jobs.map(j => j['batchId'])).size, 1);
});
test('actual wizard submits one atomic plan and prints exactly the same A/B pages as Preview', async () => {
    const db = fixture(), calls: unknown[] = [], forms: unknown[][] = [];
    const state = { users: db.users, dashboard: { jobs: db.jobs }, selectedManualHouses: [], groupWizard: { open: true, step: 3, mode: 'auto', jobs: db.jobs, selectedHouses: db.jobs.map(j => j.houseNumber), driverId: 'A', laneDrivers: ['A', 'B'], jobLaneMap: { H1: 0, H2: 1, H3: 1 }, meta: {} } };
    const context = vm.createContext({ state, crypto: { randomUUID: () => 'wizard-test-0001' }, HOUSES_PER_PAGE: 5, assignableUsers: () => db.users, cargoDataFromJobs: (jobs: Job[], driver: { id: string; vehiclePlate: string }) => ({ houses: jobs.map(j => j.houseNumber), driver: driver.id, plate: driver.vehiclePlate }), cargoSheetHtml: (data: unknown) => data, api: async (path: string, payload: unknown) => { calls.push(path); return { ok: true, ...issue.apply(db, payload, 'admin') }; }, printMultipleCargoForms: (data: unknown[]) => forms.push(data), closeGroupWizard: () => {}, renderAll: () => {}, setView: () => {}, renderCargoHistory: () => {}, toast: () => {} });
    vm.runInContext(cut('function groupWizardSourceJobs(', 'function wizardDragStart(') + cut('function computeWizardPagesAndDrivers(', 'function updateGroupWizardPreview(') + cut('function chunkArray(', 'function getPageDriver(') + cut('async function groupWizardNextOrIssue(', 'function outboundPreparationJobs('), context);
    await vm.runInContext('groupWizardNextOrIssue()', context);
    assert.deepEqual(calls, ['/api/admin/cargo-issue-plan']);
    assert.deepEqual(JSON.parse(JSON.stringify(forms)), [[{ houses: ['H1'], driver: 'A', plate: 'A-1' }, { houses: ['H2', 'H3'], driver: 'B', plate: 'B-2' }]]);
    assert.deepEqual(db.jobs.map(j => j['driverId']), ['A', 'B', 'B']);
});
