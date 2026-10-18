import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const require = createRequire(import.meta.url);
const receipts = require('../src/server/inbound-receipts.cjs');
type Job = Record<string, unknown> & { houseNumber: string; mawbNumber: string; packageCounts: Record<string, number>; inboundReceipt?: { revision: number; counts: Record<string, number> }; inboundReceiptHistory?: object[] };
const plain = (value: unknown) => JSON.parse(JSON.stringify(value));
function fixture(): Job[] {
    return ['4840805485', '4840805589', '4840805590'].map((houseNumber, index) => ({ houseNumber, mawbNumber: '205-86393230', packageCounts: { PLT: 6, CTN: [216, 10, 9][index] }, status: 'Pending', csConfirmed: false }));
}
function receive(job: Job, counts: Record<string, number>, requestId = 'receipt-request-1', reason = '') {
    return receipts.receiveCounts(job, { counts, expectedRevision: job.inboundReceipt?.revision || 0, requestId, reason }, 'wh-user');
}

test('Stored, ready status, scan count, location and old close evidence never imply full receipt', () => {
    for (const status of ['Stored', 'ReadyForTerminal', 'Billed']) {
        const job = { ...fixture()[0], status, locationId: 'A-01', warehousePallets: 6, warehouseBoxes: 216, scannedPieceCount: 216, inboundClosedAt: '2026-10-18T00:00:00Z' };
        const row = receipts.house(job);
        assert.equal(row.complete, false);
        assert.equal(row.confirmed, false);
        assert.deepEqual(plain(row.received), { PLT: 0, CTN: 0 });
        assert.throws(() => receipts.assertReceiptComplete(job), /ยังปิดรับเข้าไม่ได้/);
    }
});

test('Master 205-86393230 computes 2/3 and 3/3 with PLT/CTN kept separate; preview leaves source unchanged', () => {
    const jobs = fixture();
    const before = JSON.stringify(jobs);
    for (const count of [2, 3]) {
        const result = receipts.previewScenario(jobs, { master: '20586393230', received: jobs.map((job, index) => ({ houseNumber: job.houseNumber, counts: Object.fromEntries(Object.entries(job.packageCounts).map(([unit, qty]) => [unit, index < count ? qty : 0])) })) });
        assert.equal(result.persisted, false);
        assert.equal(result.summary.totalHouses, 3);
        assert.equal(result.summary.completeHouses, count);
        assert.equal(result.summary.complete, count === 3);
        if (count === 2) assert.equal(result.summary.houses[2].state, 'not_received');
        assert.deepEqual(plain(result.summary.planned), { PLT: 18, CTN: 235 });
        assert.deepEqual(plain(result.summary.received), count === 2 ? { PLT: 12, CTN: 226 } : { PLT: 18, CTN: 235 });
        assert.deepEqual(plain(result.summary.remaining), count === 2 ? { PLT: 6, CTN: 9 } : { PLT: 0, CTN: 0 });
        assert.equal(JSON.stringify(jobs), before);
    }
});

test('partial within a House, over count, missing unit, fractional or negative count cannot count as complete', () => {
    const job = fixture()[0];
    receive(job, { PLT: 6, CTN: 100 });
    assert.deepEqual(plain(receipts.house(job).remaining), { PLT: 0, CTN: 116 });
    assert.equal(receipts.house(job).complete, false);
    assert.throws(() => receipts.assertReceiptComplete(job));
    receive(job, { PLT: 6, CTN: 217 }, 'receipt-request-2');
    assert.equal(receipts.house(job).state, 'over');
    assert.equal(receipts.house(job).complete, false);
    const invalidCounts: Record<string, number>[] = [{ PLT: 6 }, { PLT: -1, CTN: 216 }, { PLT: 1.5, CTN: 216 }, { PLT: 6, CTN: 216, KG: 1 }];
    for (const counts of invalidCounts) {
        assert.throws(() => receive(fixture()[0], counts), /กรอกยอดรับสะสม/);
    }
});

test('replay is idempotent; stale and decreasing revisions are protected and history is preserved', () => {
    const job = fixture()[0];
    receive(job, { PLT: 3, CTN: 100 });
    const first = JSON.stringify(job.inboundReceiptHistory);
    receipts.receiveCounts(job, { counts: { PLT: 3, CTN: 100 }, expectedRevision: 0, requestId: 'receipt-request-1' }, 'wh-user');
    assert.equal(JSON.stringify(job.inboundReceiptHistory), first);
    assert.throws(() => receipts.receiveCounts(job, { counts: { PLT: 6, CTN: 216 }, expectedRevision: 0, requestId: 'receipt-request-2' }, 'wh-user'), /รีเฟรช/);
    assert.throws(() => receive(job, { PLT: 2, CTN: 90 }, 'receipt-request-2'), /เหตุผล/);
    receive(job, { PLT: 2, CTN: 90 }, 'receipt-request-2', 'แก้จากการตรวจนับซ้ำ');
    assert.equal(job.inboundReceiptHistory?.length, 2);
    assert.equal(job.inboundReceipt?.revision, 2);
    assert.equal(JSON.stringify(job.inboundReceiptHistory?.[0]), JSON.stringify(JSON.parse(first)[0]));
    assert.equal(job.status, 'Pending');
    assert.equal(job.csConfirmed, false);
});

test('duplicate Pickup and Consol rows do not double Master totals or manufacture three-of-three', () => {
    const jobs = fixture();
    for (const job of jobs) receive(job, job.packageCounts);
    const duplicate: Job = { ...jobs[0], houseNumber: 'F842089695', hawbNumber: jobs[0].houseNumber, packageCounts: { PLT: 999 }, inboundReceipt: undefined };
    const group = receipts.overview([...jobs, duplicate]).masters.get('20586393230');
    assert.equal(group.totalHouses, 3);
    assert.equal(group.completeHouses, 3);
    assert.deepEqual(plain(group.planned), { PLT: 18, CTN: 235 });
    assert.equal(receipts.overview([...jobs, { ...jobs[0] }]).masters.get('20586393230').complete, false);
});

test('a changed plan recomputes outstanding counts and invalid/unknown plans remain incomplete', () => {
    const job = fixture()[0];
    receive(job, job.packageCounts);
    assert.equal(receipts.house(job).complete, true);
    job.packageCounts.CTN = 220;
    assert.equal(receipts.house(job).remaining.CTN, 4);
    assert.equal(receipts.house(job).complete, false);
    assert.equal(receipts.house({ houseNumber: 'UNKNOWN', status: 'Stored', pieceCount: 6 }).complete, false);
});

test('close timeout recovery requires the same committed request, receipt revision and confirmed totals', () => {
    const job = fixture()[0];
    assert.equal(receipts.closeConfirmed({ ...job, status: 'Stored' }, { requestId: 'close-request-1' }), false);
    receive(job, job.packageCounts);
    Object.assign(job, { inboundClosedAt: '2026-10-18T00:00:00Z', inboundClosedRevision: 1, inboundCloseRequestId: 'close-request-1' });
    assert.equal(receipts.closeConfirmed(job, { requestId: 'close-request-1' }), true);
    assert.equal(receipts.closeConfirmed(job, { requestId: 'different-close' }), false);
    receive(job, { PLT: 5, CTN: 210 }, 'receipt-request-2', 'ตรวจนับใหม่');
    assert.equal(receipts.closeConfirmed(job, { requestId: 'close-request-1' }), false);
});

test('the inbound close route rejects Stored with partial counts before saving evidence or workflow', async () => {
    const source = readFileSync(new URL('../src/server/legacy-api.cjs', import.meta.url), 'utf8');
    const start = source.indexOf('    if (req.method === "POST" && pathname === "/api/inbound/close")');
    const end = source.indexOf('    if (req.method === "POST" && pathname === "/api/activity/step")', start);
    const job = fixture()[0]; job.status = 'Stored'; receive(job, { PLT: 6, CTN: 100 });
    const before = JSON.stringify(job);
    const context = { req: { method: 'POST' }, res: {}, pathname: '/api/inbound/close', db: { jobs: [job] }, refreshDbIfSharedStateChanged: async () => {}, readDb: () => ({ jobs: [job] }), requireSessionRole: () => ({ id: 'wh-user' }), parseBody: async () => ({ houseNumber: job.houseNumber, evidenceFiles: [{ base64: 'dummy' }] }), findJob: () => job, inboundReceipts: receipts, sendJson: (_r: object, status: number, data: object) => ({ status, data }), saveBase64Files: () => assert.fail('must not save partial close'), writeDb: () => assert.fail('must not write partial close') };
    const result = await vm.runInNewContext('(async () => {' + source.slice(start, end) + '})()', context);
    assert.equal(result.status, 409);
    assert.equal(JSON.stringify(job), before);
});

test('a complete close records the exact receipt revision and still requires evidence', async () => {
    const source = readFileSync(new URL('../src/server/legacy-api.cjs', import.meta.url), 'utf8');
    const start = source.indexOf('    if (req.method === "POST" && pathname === "/api/inbound/close")');
    const end = source.indexOf('    if (req.method === "POST" && pathname === "/api/activity/step")', start);
    const job = fixture()[0]; receive(job, job.packageCounts);
    let writes = 0;
    const payload: { houseNumber: string; evidenceFiles: object[]; requestId: string } = { houseNumber: job.houseNumber, evidenceFiles: [], requestId: 'close-request-1' };
    const context = { req: { method: 'POST' }, res: {}, pathname: '/api/inbound/close', db: { jobs: [job] }, refreshDbIfSharedStateChanged: async () => {}, readDb: () => ({ jobs: [job] }), requireSessionRole: () => ({ id: 'wh-user' }), parseBody: async () => payload, findJob: () => job, inboundReceipts: receipts, sendJson: (_r: object, status: number, data: object) => ({ status, data }), saveBase64Files: () => {}, writeDb: () => { writes++; }, nowIso: () => '2026-10-18T00:00:00Z', logActivity: () => {}, normalizeJob: (value: object) => value };
    const run = () => vm.runInNewContext('(async () => {' + source.slice(start, end) + '})()', context);
    assert.equal((await run()).status, 422);
    assert.equal(writes, 0);
    payload.evidenceFiles = [{ base64: 'fixture-evidence' }];
    assert.equal((await run()).status, 200);
    assert.equal(job.inboundClosedRevision, 1);
    assert.equal(receipts.closeConfirmed(job, payload), true);
    assert.equal((await run()).status, 200);
    assert.equal(writes, 1);
});

test('WH mobile receives a whole-Master denominator even while the third House is outside its work queue', () => {
    const jobs = fixture();
    jobs[0].status = jobs[1].status = 'Stored';
    receive(jobs[0], jobs[0].packageCounts); receive(jobs[1], jobs[1].packageCounts);
    const source = readFileSync(new URL('../src/server/legacy-api.cjs', import.meta.url), 'utf8');
    const start = source.indexOf('function buildMobileDashboard(');
    const end = source.indexOf('function buildStaffStats(', start);
    const context = { inboundReceipts: receipts, normalizeJob: (job: object) => job, result: undefined as unknown, db: { jobs } };
    vm.runInNewContext(source.slice(start, end) + ';result=buildMobileDashboard(db,{role:"WH_Staff"});', context);
    const result = context.result as { jobs: object[]; receiptMasters: { totalHouses: number; completeHouses: number }[] };
    assert.equal(result.jobs.length, 2);
    assert.equal(result.receiptMasters[0].totalHouses, 3);
    assert.equal(result.receiptMasters[0].completeHouses, 2);
});
