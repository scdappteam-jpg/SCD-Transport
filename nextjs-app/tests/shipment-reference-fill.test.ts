import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
const require = createRequire(import.meta.url);
const { planReferenceFill, applyReferenceFill, restoreReferenceFill } = require('../src/server/shipment-reference-fill.cjs');
function fixture(): { jobs: Record<string, unknown>[] } {
    return { jobs: [
        { id: 'collision-id', houseNumber: 'F842000001', hawbNumber: '4840000001', onhandNumber: 'F842000001', source: 'PickupReportXlsx', csConfirmed: true, pieceCount: '9', status: 'Stored' },
        { id: 'collision-id', houseNumber: '4840000001', mawbNumber: '131-12345678', source: 'GlobalConsolCSV', csConfirmed: false, pieceCount: '1', packageType: 'PLT', status: 'Pending' }
    ] };
}
test('fills only exact linked missing references, preserving quantity and different CS states', () => {
    const db = fixture();
    const before = structuredClone(db.jobs);
    const selection = planReferenceFill(db);
    assert.equal(selection.length, 2);
    const applied = applyReferenceFill(db, selection, 'admin');
    assert.equal(applied.length, 2);
    assert.equal(db.jobs[0].mawbNumber, '131-12345678');
    assert.equal(db.jobs[1].onhandNumber, 'F842000001');
    for (let i = 0; i < 2; i++) {
        const original = before[i];
        for (const key of Object.keys(original)) assert.equal(db.jobs[i][key], original[key]);
    }
    assert.equal(planReferenceFill(db).length, 0);
    for (const row of applied) restoreReferenceFill(db, row.archiveId);
    assert.equal(db.jobs[0].mawbNumber, undefined);
    assert.equal(db.jobs[1].onhandNumber, undefined);
});
test('multiple F, existing different masters, and invalid masters block fills', () => {
    for (const modify of [
        (db: ReturnType<typeof fixture>) => db.jobs.push({ ...db.jobs[0], houseNumber: 'F842000002', onhandNumber: 'F842000002' }),
        (db: ReturnType<typeof fixture>) => { db.jobs[0].mawbNumber = '160-12345678'; },
        (db: ReturnType<typeof fixture>) => { db.jobs[1].mawbNumber = '4840000001'; }
    ]) {
        const db = fixture(); modify(db);
        assert.equal(planReferenceFill(db).some((row: { eligible: boolean }) => row.eligible), false);
    }
});
test('stale reviews and duplicate selections fail atomically; restore protects later references', () => {
    const db = fixture();
    const plan = planReferenceFill(db);
    db.jobs[1].mawbNumber = '160-12345678';
    const before = JSON.stringify(db);
    assert.throws(() => applyReferenceFill(db, plan, 'admin'), /changed/);
    assert.equal(JSON.stringify(db), before);
    const fresh = planReferenceFill(db);
    assert.throws(() => applyReferenceFill(db, [fresh[0], fresh[0]], 'admin'), /Unique/);
    assert.equal(JSON.stringify(db), before);
    const applied = applyReferenceFill(db, fresh, 'admin');
    db.jobs[0].mawbNumber = '999-12345678';
    assert.throws(() => restoreReferenceFill(db, applied[0].archiveId), /changed/);
});
