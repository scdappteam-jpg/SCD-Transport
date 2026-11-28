import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
const require = createRequire(import.meta.url);
const ei = require('../src/server/ei-shipping.cjs');
type Row = Record<string, unknown>;
const at = '2026-11-28T03:00:00.000Z';
function db() {
    const base = { csConfirmed: true, customerName: 'SIT ONLY' };
    return {
        jobs: [
            { ...base, houseNumber: 'SIT-PREP', completedAt: at, status: 'PickedUp', flightTime: '2026-11-28T10:00:00Z' },
            { ...base, houseNumber: 'SIT-PREP-DONE', completedAt: at, status: 'PickedUp', shippingDocStatus: { state: 'Completed' } },
            { ...base, houseNumber: 'SIT-ARRIVED', completedAt: at, arrivedWh3At: at, status: 'AwaitingReleaseDocument', flightTime: '2026-11-28T08:00:00Z' },
            { ...base, houseNumber: 'SIT-PERMIT', releaseDocumentReceivedAt: at, status: 'WaitingForDock' },
            { ...base, houseNumber: 'SIT-OUT', outboundPickedAt: at, status: 'OutboundConfirmed' },
            { ...base, houseNumber: 'SIT-CANCEL', completedAt: at, status: 'Cancelled' },
            { houseNumber: 'SIT-NOCS', completedAt: at, status: 'PickedUp' }
        ] as Row[],
        attachments: [{ houseNumber: 'SIT-PERMIT', fileType: 'ReleaseDocument', fileId: 'F1', url: '/storage/f1.jpg' }],
        alerts: [{ kind: 'EI-Step1', message: 'm', createdAt: at }, { kind: 'Other', message: 'x' }]
    };
}

test('EI queue sorts work into the four tabs and leaves out closed or unconfirmed Houses', () => {
    const q = ei.queue(db(), { id: 'E', role: 'EI_Customer' });
    assert.deepEqual(q.prep.map((r: Row) => r.houseNumber), ['SIT-ARRIVED', 'SIT-PREP']);
    assert.deepEqual(q.arrived.map((r: Row) => r.houseNumber), ['SIT-ARRIVED']);
    assert.deepEqual(q.permit.map((r: Row) => r.houseNumber), ['SIT-PERMIT']);
    assert.deepEqual(q.permit[0].permitFiles, [{ fileId: 'F1', url: '/storage/f1.jpg', mimeType: '' }]);
    assert.deepEqual(q.outbound.map((r: Row) => r.houseNumber), ['SIT-OUT']);
    assert.deepEqual(q.counts, { prep: 2, arrived: 1, permit: 1, outbound: 1 });
    assert.equal(q.alerts.length, 1);
    assert.equal(q.canReview, true);
    assert.equal(ei.queue(db(), { id: 'L', role: 'WH3_TeamLeader' }).canReview, false);
    assert.throws(() => ei.queue(db(), { id: 'D', role: 'Driver' }), /สิทธิ์/);
});

test('permit review is after the fact: approve or reject with a reason, and the House leaves the permit tab', () => {
    const d = db(), eiUser = { id: 'E', role: 'EI_Customer', name: 'EI' };
    assert.throws(() => ei.reviewPermit(d, { id: 'L', role: 'WH3_TeamLeader' }, { houseNumber: 'SIT-PERMIT', decision: 'Approved' }, at), /EI/);
    assert.throws(() => ei.reviewPermit(d, eiUser, { houseNumber: 'SIT-ARRIVED', decision: 'Approved' }, at), /ยังไม่มีใบ/);
    assert.throws(() => ei.reviewPermit(d, eiUser, { houseNumber: 'SIT-PERMIT', decision: 'Rejected', reason: 'ผิด' }, at), /เหตุผล/);
    const [job] = ei.reviewPermit(d, eiUser, { houseNumber: 'SIT-PERMIT', decision: 'Rejected', reason: 'เลขใบไม่ตรง Invoice' }, at);
    assert.equal(job.permitReview.state, 'Rejected');
    assert.equal(job.status, 'WaitingForDock', 'review never changes the dock flow');
    assert.equal(ei.queue(d, eiUser).permit.length, 0);
});
