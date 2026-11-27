import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
const require = createRequire(import.meta.url);
const count = require('../src/server/pickup-count-check.cjs');
const jobs = [{ houseNumber: 'H1', pieceCount: 10 }, { houseNumber: 'H2', plannedPieceCount: 4, pieceCount: 9 }, { houseNumber: 'H3' }];
test('matching counts need no reason; unknown plans are not compared', () => {
    assert.deepEqual(count.check(jobs, [{ houseNumber: 'H1', carton: '10' }, { houseNumber: 'H2', carton: '4' }, { houseNumber: 'H3', carton: '7' }], ''), { mismatches: [], reason: '' });
});
test('short or over pickups are refused without a reason and recorded with one', () => {
    const rows = [{ houseNumber: 'H1', carton: '8' }, { houseNumber: 'H2', carton: '5' }];
    assert.throws(() => count.check(jobs, rows, ' '), /H1 แผน 10 รับจริง 8.*H2 แผน 4 รับจริง 5.*เหตุผล/);
    const ok = count.check(jobs, rows, 'ลูกค้าส่งไม่ครบ');
    assert.deepEqual(ok.mismatches.map((m: { diff: number }) => m.diff), [-2, 1]);
    assert.equal(ok.reason, 'ลูกค้าส่งไม่ครบ');
});
