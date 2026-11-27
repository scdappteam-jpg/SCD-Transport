import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
const require = createRequire(import.meta.url);
const alerts = require('../src/server/srs-alerts.cjs');
const shipDoc = require('../src/server/shipping-doc-status.cjs');
const cs = require('../src/server/cs-dispatch.cjs');
const integrity = require('../src/server/workflow-integrity.cjs');
const layout = require('../src/server/dock-layout.cjs');
const planning = require('../src/server/dock-planning.cjs');
const geo = require('../src/server/wh-geofence.cjs');

type Row = Record<string, unknown>;
const at = '2026-11-27T03:00:00.000Z';
const wh3 = { id: 'WH3', name: 'WH3 คลัง', latitude: 13.6900, longitude: 100.7500, active: true };

test('EI step 1 alert carries an ETA to WH3 and is addressed to EI; step 2 asks EI to file the permit', async () => {
    const db: { alerts: Row[]; hr: Row } = { alerts: [], hr: { checkInLocations: [wh3] } };
    const create = async (d: { alerts: Row[] }, message: string, severity: string) => { const a: Row = { message, severity, createdAt: at }; d.alerts.push(a); return a; };
    const jobs: Row[] = [{ houseNumber: 'SIT-1', vehiclePlate: 'SIT-70' }];
    const a1 = await alerts.leftFactory(db, create, jobs, { gpsLat: 13.80, gpsLong: 100.55 }, at);
    assert.deepEqual(a1.audience, ['EI_Customer', 'CS', 'Admin']);
    assert.match(a1.message, /สเต็ป 1.*SIT-70.*ETA ถึง WH3 คลัง ประมาณ/);
    assert.ok(Date.parse(String(jobs[0].etaWh3At)) > Date.parse(at));
    const a2 = await alerts.arrivedAirport(db, create, jobs);
    assert.equal(a2.kind, 'EI-Step2');
    assert.match(a2.message, /ยื่นตรวจปล่อย/);
    const noPoint = await alerts.leftFactory({ alerts: [], hr: {} }, create, [{ houseNumber: 'SIT-2' }], { gpsLat: 13.8, gpsLong: 100.5 }, at);
    assert.match(noPoint.message, /ยังคำนวณ ETA ไม่ได้/);
    assert.deepEqual(alerts.forViewer([a1, { message: 'all' }], 'WH_Staff').map((a: Row) => a.message), ['all']);
});

test('Shipping doc status needs a reason while in progress, a note for Other, and clears reasons when completed', () => {
    const db = { jobs: [{ houseNumber: 'H1' }] as Row[] };
    const ei = { id: 'E', role: 'EI_Customer', name: 'EI' };
    assert.throws(() => shipDoc.update(db, { id: 'D', role: 'Driver' }, { houseNumber: 'H1', state: 'Completed' }, at), /สิทธิ์/);
    assert.throws(() => shipDoc.update(db, ei, { houseNumber: 'H1', state: 'InProgress', reasons: [] }, at), /อย่างน้อย 1/);
    assert.throws(() => shipDoc.update(db, ei, { houseNumber: 'H1', state: 'InProgress', reasons: ['Other'] }, at), /หมายเหตุ/);
    shipDoc.update(db, ei, { houseNumber: 'H1', state: 'InProgress', reasons: ['NoInvoice', 'CustomsFeePending'] }, at);
    assert.deepEqual((db.jobs[0].shippingDocStatus as Row).reasons, ['NoInvoice', 'CustomsFeePending']);
    shipDoc.update(db, ei, { houseNumber: 'H1', state: 'Completed', reasons: ['NoInvoice'] }, at);
    assert.deepEqual((db.jobs[0].shippingDocStatus as Row).reasons, []);
    assert.equal(db.jobs[0].shippingDocCompletedAt, at);
    assert.equal((db.jobs[0].shippingDocHistory as Row[]).length, 2);
});

test('CS special release needs a reason without an Invoice, and the House cannot be billed until the Invoice is in', () => {
    const db = { jobs: [{ houseNumber: 'H1' }] };
    assert.throws(() => cs.validateApproval(db, { houseNumbers: ['H1'] }), /Invoice/);
    assert.throws(() => cs.validateApproval(db, { houseNumbers: ['H1'], specialRelease: true, specialReleaseReason: 'ด่วน' }), /5 ตัวอักษร/);
    const ok = cs.validateApproval(db, { houseNumbers: ['H1'], specialRelease: true, specialReleaseReason: 'ลูกค้ายังไม่ออก Invoice ไฟล์ทด่วน' });
    assert.equal(ok.specialRelease, true);
    assert.equal(ok.invoiceNo, '');
    const job = { houseNumber: 'H1', customerId: 'C', readyForBilling: true, billingReviewStatus: 'Reviewed', amount: 100, invoicePending: true };
    assert.throws(() => integrity.billing({ jobs: [job] }, [job], {}, () => ({ blockers: [] })), /รอเลข Invoice/);
});

test('dock layout: 8 bays, inbound D6–D8 also take Customer Direct, occupied old bays stay until free', () => {
    const db: { dock: { bays: Row[]; layoutVersion?: number } } = { dock: { bays: [
        { id: 'D6', status: 'Occupied', houseNumber: 'OUT-1', note: 'Outbound' },
        { id: 'D9', status: 'Occupied', houseNumber: 'IN-9' },
        { id: 'D10', status: 'Available', houseNumber: '' },
        { id: 'D11', status: 'Available', houseNumber: '' }
    ] } };
    layout.migrate(db);
    assert.deepEqual(db.dock.bays.map(b => b.id), ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9']);
    assert.equal(db.dock.bays.find(b => b.id === 'D6')?.houseNumber, 'OUT-1');
    Object.assign(db.dock.bays.find(b => b.id === 'D9') as Row, { status: 'Available', houseNumber: '' });
    layout.migrate(db);
    assert.deepEqual(db.dock.bays.map(b => b.id), ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8']);
    assert.equal(layout.accepts({ id: 'D7' }, 'External'), true);
    assert.equal(layout.accepts({ id: 'D2' }, 'Inbound'), false);
    assert.equal(layout.isInboundBayId('D10'), true, 'history from old inbound bays stays valid');
});

test('emergency entries go ahead of flight order inside their queue type', () => {
    const jobs = ['A', 'B'].map((h, i) => ({ houseNumber: h, status: 'WaitingForDock', flightTime: `2026-11-27T0${5 + i * 3}:00:00Z` }));
    const db = { jobs, dock: { queue: [
        { id: 'qa', houseNumber: 'A', createdAt: at },
        { id: 'qb', houseNumber: 'B', createdAt: at, emergency: true, emergencyAt: at, emergencyReason: 'รถต้องออกไปงานถัดไป' }
    ] } };
    assert.deepEqual(planning.queue(db).map((e: Row) => e.houseNumber), ['B', 'A']);
});

test('warehouse scan geofence is off by default; when on, staff need a check-in within the radius', () => {
    const staff = { id: 'W1', role: 'WH_Staff' };
    const near = { userId: 'W1', date: '2026-11-27', checkInLat: 13.6904, checkInLon: 100.7502 };
    const far = { userId: 'W1', date: '2026-11-27', checkInLat: 13.70, checkInLon: 100.76 };
    const db = { meetingSafety: {} as Row, hr: { checkInLocations: [wh3] }, attendance: [] as Row[] };
    assert.equal(geo.enforce(db, staff, at), null);
    db.meetingSafety = { warehouseScanGeofence: true, warehouseScanRadiusMeters: 100 };
    assert.throws(() => geo.enforce(db, staff, at), /ลงเวลาเข้างานในรัศมี 100/);
    db.attendance = [far];
    assert.throws(() => geo.enforce(db, staff, at), /ห่างคลัง/);
    db.attendance = [near];
    assert.ok(geo.enforce(db, staff, at).distanceMeters < 100);
    assert.equal(geo.enforce(db, { id: 'X', role: 'Admin' }, at), null);
    assert.throws(() => geo.readSettings({ hr: {} }, { warehouseScanGeofence: true }), /ตั้งพิกัด/);
});
