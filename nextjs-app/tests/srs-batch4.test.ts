import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
const require = createRequire(import.meta.url);
const special = require('../src/server/lithium-control.cjs');
const piece = require('../src/server/piece-scan.cjs');
const truck = require('../src/server/truck-link.cjs');

type Row = Record<string, unknown>;
const now = '2026-11-28T03:00:00.000Z';
const save = (_h: string, _t: string, files: unknown[]) => files.map((_f, i) => ({ fileId: `F${i}` }));

test('DG goods need a DGD or MSDS document and a Console Office scan; Lithium keeps its own fields', () => {
    const dg: Row = { houseNumber: 'SIT-DG-1', cargoType: 'dg', dgType: 'DG' };
    const li: Row = { houseNumber: 'SIT-LI-9', isLithium: true, cargoType: 'lithium' };
    const db = { jobs: [dg, li, { houseNumber: 'SIT-GEN' }], attachments: [] as Row[] };
    assert.equal(special.kindOf(dg), 'DG');
    assert.equal(special.kindOf(li), 'Lithium');
    assert.equal(special.kindOf(db.jobs[2]), null);
    assert.throws(() => special.assertReleased(db, dg), /เอกสาร DG/);
    db.attachments.push({ houseNumber: 'SIT-LI-9', fileType: 'DGDocument' });
    assert.equal(special.hasDocument(db, li), false, 'a DG document does not satisfy Lithium');
    special.confirm(db, { id: 'C', role: 'Console_Office', name: 'Console' }, { houseNumber: 'SIT-DG-1', scannedCode: 'SIT-DG-1', documentFiles: [{ base64: 'x' }] }, now, save);
    assert.equal(dg.dgConsoleConfirmedAt, now);
    assert.deepEqual(dg.dgDocumentFileIds, ['F0']);
    assert.equal(dg.lithiumConsoleConfirmedAt, undefined);
    assert.doesNotThrow(() => special.assertReleased(db, dg));
});

test('box / pallet scan counts each label once per unit, refuses duplicates, other Houses and over-plan scans', () => {
    const a: Row = { houseNumber: 'SIT-P1', packageCounts: { CTN: 2, PLT: 1 } };
    const b: Row = { houseNumber: 'SIT-P2', packageCounts: { CTN: 1 }, pieceScans: [{ code: 'BOX-B1', unit: 'CTN' }] };
    const db = { jobs: [a, b] };
    const wh = { id: 'W', role: 'WH_Staff' };
    assert.throws(() => piece.scan(db, { id: 'D', role: 'Driver' }, { houseNumber: 'SIT-P1', unit: 'CTN', code: 'X' }, now), /คลัง/);
    assert.throws(() => piece.scan(db, wh, { houseNumber: 'SIT-P1', unit: 'BAG', code: 'X' }, now), /ไม่อยู่ในแผน/);
    piece.scan(db, wh, { houseNumber: 'SIT-P1', unit: 'CTN', code: 'box-1' }, now);
    assert.throws(() => piece.scan(db, wh, { houseNumber: 'SIT-P1', unit: 'CTN', code: 'BOX-1' }, now), /สแกนไปแล้ว/);
    assert.throws(() => piece.scan(db, wh, { houseNumber: 'SIT-P1', unit: 'CTN', code: 'BOX-B1' }, now), /SIT-P2/);
    piece.scan(db, wh, { houseNumber: 'SIT-P1', unit: 'CTN', code: 'BOX-2' }, now);
    assert.throws(() => piece.scan(db, wh, { houseNumber: 'SIT-P1', unit: 'CTN', code: 'BOX-3' }, now), /ครบตามแผน/);
    const s = piece.scan(db, wh, { houseNumber: 'SIT-P1', unit: 'PLT', code: 'PLT-1' }, now);
    assert.deepEqual(s.scanned, { CTN: 2, PLT: 1 });
    assert.equal(s.complete, true);
    const removed = piece.scan(db, wh, { houseNumber: 'SIT-P1', unit: 'CTN', code: 'BOX-2', action: 'remove' }, now);
    assert.equal(removed.complete, false);
});

test('truck QR link: token stored as a hash, shows only its Houses, expires, can be revoked; arrival report changes no step', () => {
    const db: Row = { jobs: [{ houseNumber: 'SIT-T1', status: 'WaitingForDock', pieceCount: 4, packageType: 'CTN', customerName: 'PRIVATE CUSTOMER' }, { houseNumber: 'SIT-T2', status: 'Stored' }], dock: { bays: [], queue: [] } };
    assert.throws(() => truck.create(db, { id: 'D', role: 'Driver' }, { houseNumbers: ['SIT-T1'], vehiclePlate: 'SIT-1' }, now), /สิทธิ์/);
    assert.throws(() => truck.create(db, { id: 'T', role: 'Team_Transport' }, { houseNumbers: ['NOPE'], vehiclePlate: 'SIT-1' }, now), /ไม่พบ/);
    const { token, link } = truck.create(db, { id: 'T', role: 'Team_Transport' }, { houseNumbers: ['SIT-T1'], vehiclePlate: 'SIT-1', hours: 500 }, now);
    assert.equal('tokenHash' in link, false);
    assert.equal(JSON.stringify(db).includes(token), false, 'raw token is never stored');
    assert.equal(link.expiresAt, '2026-12-01T03:00:00.000Z', 'capped at 72 hours');
    const v = truck.view(db, token, now);
    assert.deepEqual(v.houses.map((h: Row) => h.houseNumber), ['SIT-T1']);
    assert.equal(v.houses[0].step, 'รอเข้าท่า');
    assert.equal(JSON.stringify(v).includes('PRIVATE CUSTOMER'), false, 'no customer data on the public page');
    assert.throws(() => truck.view(db, 'wrong', now), /ไม่ถูกต้อง/);
    truck.reportArrived(db, token, { gpsLat: 13.69, gpsLong: 100.75 }, now);
    assert.equal((db.jobs as Row[])[0].status, 'WaitingForDock');
    assert.throws(() => truck.view(db, token, '2026-12-02T00:00:00.000Z'), /หมดอายุ/);
    truck.revoke(db, { id: 'T', role: 'Team_Transport' }, link.id, now);
    assert.throws(() => truck.view(db, token, now), /ยกเลิก/);
});
