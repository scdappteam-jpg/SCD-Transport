import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
const require = createRequire(import.meta.url);
const issue = require('../src/server/cargo-issue-plan.cjs');
const legs = require('../src/server/split-legs.cjs');
const rounds = require('../public/legacy/transport-round-core.js');
const { route, valid } = require('./helpers/pickup-flow-fixture.cjs');

type Leg = { legId: string; driverId: string; vehiclePlate: string; pieceCount: number; batchId: string; status?: string; completedAt?: string; arrivedWh3At?: string };
type Job = { houseNumber: string; pieceCount: string; status: string; csConfirmed: boolean; updatedAt: string; splitLegs?: Leg[]; [key: string]: unknown };
type Db = { users: { id: string; name: string; role: string; vehiclePlate: string }[]; jobs: Job[]; activityLogs: unknown[]; attachments: unknown[] };
const H = 'SIT-SPLIT-1';
const A = { id: 'A', name: 'Driver A', role: 'Driver', vehiclePlate: 'A-1' }, B = { id: 'B', name: 'Driver B', role: 'Driver', vehiclePlate: 'B-2' }, C = { id: 'C', name: 'Driver C', role: 'Driver', vehiclePlate: 'C-3' };
function db(): Db {
    return { users: [A, B, C], jobs: [{ houseNumber: H, pieceCount: '10', status: 'Pending', csConfirmed: true, updatedAt: 'u' }], activityLogs: [], attachments: [] };
}
function split(d: Db, a = 6, b = 4) {
    return issue.apply(d, { requestId: 'split-test-0001', pages: [
        { driverId: 'A', driverName: 'Driver A', vehiclePlate: 'A-1', jobs: [{ houseNumber: H, updatedAt: 'u', splitPieces: a }] },
        { driverId: 'B', driverName: 'Driver B', vehiclePlate: 'B-2', jobs: [{ houseNumber: H, updatedAt: 'u', splitPieces: b }] }
    ] }, 'admin', { now: '2026-11-27T01:00:00Z' });
}
const evidence = (cartons: number, extra = {}) => ({ ...valid(), houseNumber: H, pieceCount: String(cartons), pickupItems: [{ houseNumber: H, carton: String(cartons), pickupDestination: 'WH3' }], ...extra });
async function pickup(d: Db, who: typeof A, cartons: number, extra = {}) {
    for (const step of ['route-start', 'checkin']) assert.equal((await route(d, step, { houseNumber: H }, who)).status, 200, `${who.id} ${step}`);
    assert.equal((await route(d, 'load', evidence(cartons), who)).status, 200, `${who.id} load`);
    return route(d, 'complete', evidence(cartons, extra), who);
}

test('issue plan splits one House over two trucks; shares must add up to the plan and use different drivers', () => {
    const d = db();
    split(d);
    const job = d.jobs[0];
    assert.equal(job['driverId'], 'A');
    assert.deepEqual(job.splitLegs?.map(l => [l.legId, l.driverId, l.vehiclePlate, l.pieceCount]), [['L1', 'A', 'A-1', 6], ['L2', 'B', 'B-2', 4]]);
    assert.notEqual(job.splitLegs?.[0].batchId, job.splitLegs?.[1].batchId);
    assert.equal(job.pieceCount, '10');
    for (const [a, b, msg] of [[6, 3, /ไม่เท่าแผน/], [6, 0, /มากกว่า 0/]] as const) {
        const other = db();
        assert.throws(() => split(other, a, b), msg);
        assert.equal(other.jobs[0].splitLegs, undefined);
    }
    const same = db();
    assert.throws(() => issue.apply(same, { requestId: 'split-test-0002', pages: [
        { driverId: 'A', driverName: 'Driver A', vehiclePlate: 'A-1', jobs: [{ houseNumber: H, updatedAt: 'u', splitPieces: 5 }, { houseNumber: H, updatedAt: 'u', splitPieces: 5 }] }
    ] }, 'admin'), /ซ้ำ/);
});

test('each truck runs its own pickup; the House is PickedUp only when every truck finished and waits for WH3 until all arrived', async () => {
    const d = db();
    split(d);
    const job = d.jobs[0];
    assert.equal((await route(d, 'route-start', { houseNumber: H }, C)).status >= 400, true, 'driver without a truck on the House is refused');
    assert.equal((await pickup(d, A, 6)).status, 200);
    assert.equal(job.splitLegs?.[0].status, 'PickedUp');
    assert.notEqual(job.status, 'PickedUp');
    assert.equal(job['completedAt'], undefined);
    const short = await pickup(d, B, 3);
    assert.equal(short.status, 422);
    assert.match(short.body.error, /เหตุผล/);
    assert.equal((await route(d, 'complete', evidence(3, { countMismatchReason: 'SIT ลูกค้าส่งไม่ครบ' }), B)).status, 200);
    assert.equal(job.status, 'PickedUp');
    assert.equal(job['pickupReceivedCount'], 9);
    assert.deepEqual((job['splitProgress'] as Record<string, number>), { trucks: 2, pickedUp: 2, arrivedWh3: 0 });
    assert.equal((await route(d, 'arrive-wh3', { houseNumber: H }, A)).status, 200);
    assert.equal(job.status, 'PickedUp');
    assert.equal(job['arrivedWh3At'], undefined);
    assert.equal((await route(d, 'arrive-wh3', { houseNumber: H }, B)).status, 200);
    assert.equal(job.status, 'AwaitingReleaseDocument');
    assert.ok(job['arrivedWh3At']);
});

test('driver feed shows each driver only their own truck share; billing counts one trip per truck', () => {
    const d = db();
    split(d);
    const items = legs.workItems(d.jobs).map(legs.plain);
    const forB = items.filter((item: Job) => item['driverId'] === 'B');
    assert.equal(forB.length, 1);
    assert.equal(forB[0].pieceCount, 4);
    assert.equal(forB[0].splitLegIndex, 2);
    assert.equal(forB[0].splitTotalPieceCount, '10');
    assert.equal(new Set(legs.billingTrips(d.jobs[0]).map(rounds.billingKey)).size, 2);
    assert.equal(legs.billingTrips({ houseNumber: 'X', batchId: 'B1' }).length, 1);
});

test('wizard split: each lane prints its own form with its carton share and the plan saves both trucks', async () => {
    const { readFileSync } = await import('node:fs');
    const vm = await import('node:vm');
    const front = readFileSync(new URL('../public/legacy/app.js', import.meta.url), 'utf8');
    const cut = (a: string, b: string) => front.slice(front.indexOf(a), front.indexOf(b, front.indexOf(a)));
    const d = db(), forms: unknown[][] = [];
    const state: { groupWizard: Record<string, unknown>; [key: string]: unknown } = { users: d.users, dashboard: { jobs: d.jobs }, selectedManualHouses: [], groupWizard: { open: true, step: 2, mode: 'auto', jobs: d.jobs, selectedHouses: [H], driverId: 'A', laneDrivers: ['A', 'B'], jobLaneMap: {}, jobSplits: { [H]: [7, 2] }, meta: {} } };
    const context = vm.createContext({ state, crypto: { randomUUID: () => 'split-wizard-0001' }, HOUSES_PER_PAGE: 5, assignableUsers: () => d.users, cargoDataFromJobs: (jobs: Job[], driver: { id: string; vehiclePlate: string }) => ({ rows: jobs.map(j => [j.houseNumber, j.pieceCount]), driver: driver.id, plate: driver.vehiclePlate }), cargoSheetHtml: (data: unknown) => data, api: async (_path: string, payload: unknown) => ({ ok: true, ...issue.apply(d, payload, 'admin') }), printMultipleCargoForms: (data: unknown[]) => forms.push(data), closeGroupWizard: () => {}, renderAll: () => {}, renderGroupWizard: () => {}, updateGroupWizardPreview: () => {}, setView: () => {}, renderCargoHistory: () => {}, toast: () => {} });
    vm.runInContext(cut('function groupWizardSourceJobs(', 'function wizardDragStart(') + cut('function computeWizardPagesAndDrivers(', 'function updateGroupWizardPreview(') + cut('function chunkArray(', 'function getPageDriver(') + cut('async function groupWizardNextOrIssue(', 'function outboundPreparationJobs('), context);
    await assert.rejects(vm.runInContext('groupWizardNextOrIssue()', context), /แบ่งรวม 9 จาก 10/);
    state.groupWizard.jobSplits = { [H]: [6, 4] };
    await vm.runInContext('groupWizardNextOrIssue()', context);
    state.groupWizard.step = 3;
    await vm.runInContext('groupWizardNextOrIssue()', context);
    assert.deepEqual(JSON.parse(JSON.stringify(forms)), [[{ rows: [[H, 6]], driver: 'A', plate: 'A-1' }, { rows: [[H, 4]], driver: 'B', plate: 'B-2' }]]);
    assert.deepEqual(d.jobs[0].splitLegs?.map(l => [l.driverId, l.pieceCount]), [['A', 6], ['B', 4]]);
});

test('after the release document the extra truck follows the House and is free once WH3 unloads', () => {
    const d = db();
    split(d);
    const job = d.jobs[0];
    Object.assign(job, { releaseDocumentReceivedAt: 't1', status: 'WaitingForDock' });
    const view = (driver: string) => legs.workItems(d.jobs).map(legs.plain).find((item: Job) => item['driverId'] === driver);
    assert.equal(view('B').status, 'WaitingForDock');
    assert.equal(view('B').driverRouteStatus, 'ArrivedWH3');
    assert.equal(view('B').splitFollowsMainTruck, true);
    assert.equal(view('A').splitFollowsMainTruck, undefined);
    job['wh3UnloadCompletedAt'] = 't2';
    assert.equal(view('B').driverRouteStatus, 'Available');
    legs.syncHouse(job);
    assert.equal(job.status, 'WaitingForDock', 'WH3 owns the House status after release');
});
