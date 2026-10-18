import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
const require = createRequire(import.meta.url);
const { consolPacking } = require('../src/server/consol-packing.cjs');
const { planShipmentMerges, applyShipmentMerges, restoreShipmentMerge, updateMergedPickup } = require('../src/server/shipment-merge.cjs');

function fixture() {
    const source = { id: 'pickup-1', houseNumber: 'F842092988', hawbNumber: '4840805761', source: 'PickupReportXlsx', status: 'Pending', pieceCount: '6', csConfirmed: false, pickupLocation: 'Factory' };
    const target = { id: 'consol-1', houseNumber: '4840805761', source: 'GlobalConsolCSV', status: 'Pending', pieceCount: '53', csConfirmed: false,
        packageCounts: {} as Record<string, number>, packageType: '', pickupLocation: '', mergedHouseNumbers: [] as string[] };
    const evidence = [{ onhand: source.houseNumber, hawb: target.houseNumber, pickupPieces: 6, consolPieces: 53, quantityCheck: 'different_units', source: { sheetRow: 961, units: { PLT: 6, CTN: 53 } } }];
    return { db: { jobs: [source, target] }, source, target, evidence };
}

test('Consol quantity precedes its unit: 6 PLT and 53 CTN never become 53 PLT', () => {
    assert.deepEqual(consolPacking([6, 'PLT', 53, 'CTN', 393.1], { etd: 0, grs: 4 }), {
        packageType: 'PLT', pieces: '6', packageCounts: { PLT: 6, CTN: 53 }
    });
    assert.equal(consolPacking([53, 'CTN', 393.1], { etd: 0, grs: 2 }).pieces, '53');
});

test('reviewed merge preserves canonical workflow, both quantities, aliases and reversible archive', () => {
    const { db, evidence, source, target } = fixture();
    const before = JSON.stringify(db.jobs);
    const [row] = planShipmentMerges(db, evidence);
    assert.equal(row.eligible, true);
    assert.equal(JSON.stringify(db.jobs), before);
    const [result] = applyShipmentMerges(db, evidence, [row], 'admin');
    assert.equal(db.jobs.length, 1);
    assert.equal(target.houseNumber, '4840805761');
    assert.equal(target.pieceCount, '6');
    assert.equal(target.packageCounts.CTN, 53);
    assert.equal(target.csConfirmed, false);
    assert.equal(target.pickupLocation, 'Factory');
    assert.equal(target.mergedHouseNumbers[0], source.houseNumber);
    restoreShipmentMerge(db, result.archiveId);
    assert.equal(db.jobs.length, 2);
    assert.deepEqual(db.jobs.find((j: {houseNumber: string}) => j.houseNumber === source.houseNumber), source);
});

test('quantity conflict, multiple F, workflow references and approval differences block merge', () => {
    for (const reason of ['quantity_unresolved', 'multiple_onhands', 'source_has_references', 'approval_conflict', 'workflow_started']) {
        const f = fixture();
        if (reason === 'quantity_unresolved') f.evidence[0].quantityCheck = 'conflict';
        if (reason === 'multiple_onhands') f.db.jobs.push({ ...f.source, houseNumber: 'F842092989' });
        if (reason === 'source_has_references') Object.assign(f.db, { attachments: [{ houseNumber: f.source.houseNumber }] });
        if (reason === 'approval_conflict') f.source.csConfirmed = true;
        if (reason === 'workflow_started') f.source.status = 'Stored';
        const row = planShipmentMerges(f.db, f.evidence).find((r: {onhand: string}) => r.onhand === f.source.houseNumber);
        assert.equal(row.eligible, false);
        assert.ok(row.reasons.includes(reason));
    }
});

test('reference fill archives are audit history rather than active workflow assignments', () => {
    const { db, source, evidence } = fixture();
    Object.assign(db, { shipmentReferenceArchive: [{ houseNumber: source.houseNumber, before: { mawbNumber: null } }] });
    assert.equal(planShipmentMerges(db, evidence)[0].eligible, true);
});

test('stale review fails atomically and undo refuses to overwrite subsequent work', () => {
    const { db, target, evidence } = fixture();
    const [row] = planShipmentMerges(db, evidence);
    target.pieceCount = '54';
    assert.throws(() => applyShipmentMerges(db, evidence, [row], 'admin'), /review changed/);
    assert.equal(db.jobs.length, 2);
    target.pieceCount = '53';
    const [result] = applyShipmentMerges(db, evidence, planShipmentMerges(db, evidence), 'admin');
    target.status = 'Stored';
    assert.throws(() => restoreShipmentMerge(db, result.archiveId), /changed after merge/);
});

test('later Pickup import updates pickup information but cannot undo canonical packing or approval', () => {
    const { db, target, evidence } = fixture();
    applyShipmentMerges(db, evidence, planShipmentMerges(db, evidence), 'admin');
    updateMergedPickup(target, { onhandNumber: 'F842092988', pieceCount: '99', pickupLocation: 'New Factory', csConfirmed: true });
    assert.equal(db.jobs.length, 1);
    assert.equal(target.pieceCount, '6');
    assert.equal(target.packageType, 'PLT');
    assert.equal(target.csConfirmed, false);
    assert.equal(target.pickupLocation, 'New Factory');
});

test('explicit BULK policy preserves both histories and retains every canonical CS field', () => {
    const { db, source, target, evidence } = fixture();
    Object.assign(source, { csConfirmed: true, csInvoiceNo: 'BULK-2026-10-13', csConfirmedBy: 'Pickup admin', csConfirmedAt: '2026-10-13T04:52:00Z' });
    Object.assign(target, { csConfirmed: true, csInvoiceNo: 'BULK-2026-10-14', csConfirmedBy: 'Consol admin', csConfirmedAt: '2026-10-14T09:15:00Z' });
    assert.equal(planShipmentMerges(db, evidence)[0].eligible, false);
    Object.assign(evidence[0], { bulkPolicy: 'preserve_both_use_hawb' });
    const [review] = planShipmentMerges(db, evidence);
    assert.equal(review.eligible, true);
    const [result] = applyShipmentMerges(db, evidence, [review], 'Admin');
    const history = Reflect.get(target, 'csConfirmationHistory');
    assert.equal(history.length, 2);
    assert.equal(Reflect.get(target, 'csInvoiceNo'), 'BULK-2026-10-14');
    assert.equal(Reflect.get(target, 'csConfirmedBy'), 'Consol admin');
    assert.equal(target.csConfirmed, true);
    assert.deepEqual(new Set(history.map((r: {csInvoiceNo: string}) => r.csInvoiceNo)), new Set(['BULK-2026-10-13', 'BULK-2026-10-14']));
    restoreShipmentMerge(db, result.archiveId);
    assert.equal(db.jobs.length, 2);
});

test('BULK exception never overrides a real invoice or transfers CS approval to a pending job', () => {
    for (const conflict of ['real_invoice', 'pending']) {
        const { db, source, target, evidence } = fixture();
        Object.assign(source, { csConfirmed: true, csInvoiceNo: 'BULK-2026-10-13' });
        Object.assign(target, { csConfirmed: true, csInvoiceNo: 'BULK-2026-10-14' });
        Object.assign(evidence[0], { bulkPolicy: 'preserve_both_use_hawb' });
        if (conflict === 'real_invoice') Object.assign(source, { invoiceNo: 'INV-123' });
        else target.csConfirmed = false;
        assert.equal(planShipmentMerges(db, evidence)[0].eligible, false);
    }
});
