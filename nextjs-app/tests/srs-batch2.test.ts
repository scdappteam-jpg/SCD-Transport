import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
const require = createRequire(import.meta.url);
const lithium = require('../src/server/lithium-control.cjs');
const quality = require('../src/server/warehouse-quality.cjs');
const partial = require('../src/server/partial-unload.cjs');
const readiness = require('../src/server/dock-readiness.cjs');
const provisioning = require('../src/server/user-provisioning.cjs');

type Row = Record<string, unknown>;
const at = '2026-11-28T02:00:00.000Z';

test('Console Office is a provisionable role', () => {
    assert.ok(provisioning.ROLES.includes('Console_Office'));
});

test('Lithium goods need a document and a Console Office scan before release; other goods and inbound moves are unaffected', () => {
    const job: Row = { houseNumber: 'SIT-LI-1', hawbNumber: '4840001', isLithium: true };
    const db: { jobs: Row[]; attachments: Row[] } = { jobs: [job, { houseNumber: 'SIT-GEN', productType: 'General' }], attachments: [] };
    assert.equal(lithium.releasesGoods('/api/outbound/picking'), true);
    assert.equal(lithium.releasesGoods('/api/inbound/move-location'), false);
    assert.equal(lithium.releasesGoods('/api/operations/control', { action: 'transport-event', event: 'wh3-depart' }), true);
    assert.throws(() => lithium.assertReleased(db, job), /เอกสาร Lithium/);
    assert.doesNotThrow(() => lithium.assertReleased(db, db.jobs[1]));
    const save = (_h: string, _t: string, files: unknown[]) => files.map((_f, i) => ({ fileId: `F${i}` }));
    assert.throws(() => lithium.confirm(db, { id: 'Q', role: 'QA_Inspector' }, { houseNumber: 'SIT-LI-1', scannedCode: 'SIT-LI-1' }, at, save), /Console Office/);
    const console_ = { id: 'C1', role: 'Console_Office', name: 'Console' };
    assert.throws(() => lithium.confirm(db, console_, { houseNumber: 'SIT-LI-1', scannedCode: 'OTHER' }, at, save), /ไม่ตรง/);
    assert.throws(() => lithium.confirm(db, console_, { houseNumber: 'SIT-LI-1', scannedCode: '4840001' }, at, save), /ต้องแนบเอกสาร/);
    lithium.confirm(db, console_, { houseNumber: 'SIT-LI-1', scannedCode: '4840-001', documentFiles: [{ base64: 'x' }] }, at, save);
    assert.equal(job.lithiumConsoleConfirmedAt, at);
    assert.deepEqual(job.lithiumDocumentFileIds, ['F0']);
    assert.doesNotThrow(() => lithium.assertReleased(db, job));
    db.attachments.push({ houseNumber: 'SIT-LI-2', fileType: 'LithiumDocument' });
    assert.equal(lithium.hasDocument(db, { houseNumber: 'SIT-LI-2' }), true);
});

test('movement gate blocks an unconfirmed Lithium pick even when QA approved', () => {
    const { createHash } = require('node:crypto');
    const job: Row = { houseNumber: 'SIT-LI-3', isLithium: true, status: 'Stored' };
    const identity = createHash('sha256').update(JSON.stringify(['SIT-LI-3', '', '', 'Single', '', ''])).digest('hex');
    const tags = [{ barcode: 'SIT-LI-3' }];
    job.tagInspection = { identity, revision: 1, taggedBy: 'TAG', tags };
    job.qaApproval = { revision: 1, approvedBy: 'QA', tags };
    assert.equal(quality.approved(job), true, 'fixture is QA approved');
    const db = { jobs: [job], attachments: [] as Row[], meetingSafety: {} };
    assert.throws(() => quality.enforceMovement(db, '/api/outbound/picking', { houseNumber: 'SIT-LI-3' }), /เอกสาร Lithium/);
    db.attachments.push({ houseNumber: 'SIT-LI-3', fileType: 'LithiumDocument' });
    assert.throws(() => quality.enforceMovement(db, '/api/outbound/picking', { houseNumber: 'SIT-LI-3' }), /Console Office/);
    job.lithiumConsoleConfirmedAt = at;
    assert.throws(() => quality.enforceMovement(db, '/api/outbound/picking', { houseNumber: 'SIT-LI-3' }), /ยอดรับ|ปิดรับ/, 'next gate is the receipt check, not Lithium');
});

test('WH3 lead approves partial unload: held Houses stay on the truck and do not block the rest at the dock', () => {
    const base = { driverId: 'D1', vehiclePlate: 'SIT-70', transportRoundId: 'R1', csConfirmed: true, cargoIssuedAt: at, arrivedWh3At: at, status: 'AwaitingReleaseDocument' };
    const db: { jobs: Row[] } = { jobs: ['SIT-A', 'SIT-B', 'SIT-C'].map(houseNumber => ({ ...base, houseNumber })) };
    const round = () => db.jobs;
    assert.throws(() => partial.approve(db, { id: 'T', role: 'Team_Transport' }, { houseNumber: 'SIT-A', heldHouseNumbers: ['SIT-C'], reason: 'ไฟล์ทด่วน' }, at, round), /หัวหน้าคลัง/);
    const lead = { id: 'L', role: 'WH3_TeamLeader', name: 'หัวหน้า' };
    assert.throws(() => partial.approve(db, lead, { houseNumber: 'SIT-A', heldHouseNumbers: ['SIT-A', 'SIT-B', 'SIT-C'], reason: 'ไฟล์ทด่วน' }, at, round), /อย่างน้อย 1/);
    assert.throws(() => partial.approve(db, lead, { houseNumber: 'SIT-A', heldHouseNumbers: ['SIT-C'], reason: 'ด่วน' }, at, round), /เหตุผล/);
    partial.approve(db, lead, { houseNumber: 'SIT-A', heldHouseNumbers: ['SIT-C'], reason: 'ไฟล์ทด่วน TG640' }, at, round);
    assert.ok(db.jobs[2].heldOnTruck);
    assert.equal(db.jobs[0].heldOnTruck, undefined);
    assert.deepEqual(partial.releaseScope(db.jobs, [db.jobs[0]]).map((j: Row) => j.houseNumber), ['SIT-A', 'SIT-B']);
    assert.deepEqual(partial.releaseScope(db.jobs, [db.jobs[2]]).map((j: Row) => j.houseNumber), ['SIT-C']);
    // The released Houses are ready for the dock even though SIT-C waits on the truck.
    for (const job of db.jobs.slice(0, 2)) Object.assign(job, { status: 'WaitingForDock', releaseDocumentReceivedAt: at });
    assert.equal(readiness.ready(db, { houseNumber: 'SIT-A', houseNumbers: ['SIT-A', 'SIT-B'] }), true);
    // Later: SIT-C gets its permit after the others were unloaded and is ready on its own.
    for (const job of db.jobs.slice(0, 2)) job.wh3UnloadCompletedAt = at;
    delete db.jobs[2].heldOnTruck;
    Object.assign(db.jobs[2], { status: 'WaitingForDock', releaseDocumentReceivedAt: at });
    assert.equal(readiness.ready(db, { houseNumber: 'SIT-C', houseNumbers: ['SIT-C'] }), true);
});
