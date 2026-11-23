import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import test from 'node:test';
const require=createRequire(import.meta.url),timing=require('../src/server/outbound-timing.cjs'),ops=require('../src/server/operations-control.cjs');
const t0='2026-11-23T02:00:00.000Z',t1='2026-11-23T02:23:00.000Z',t2='2026-11-23T02:40:00.000Z',t3='2026-11-23T02:45:00.000Z',t4='2026-11-23T02:59:00.000Z';
test('AOT approval without vehicle fields preserves the booked driver and vehicle',()=>{
    const job={aotDriverName:'SIT Driver',aotVehiclePlate:'SIT-01',aotVehicleModel:'Truck',aotVehicleType:'6W'};
    assert.deepEqual(timing.booking(job,{approved:true}),job);
    assert.equal(timing.booking(job,{vehiclePlate:'  SIT-02  '}).aotVehiclePlate,'SIT-02');
    assert.equal(timing.booking(job,{vehiclePlate:'   '}).aotVehiclePlate,'SIT-01');
});
test('legacy milestone actions populate Operations Control KPI fields with separate real timestamps',()=>{
    const job:Record<string,unknown>={id:'sit',houseNumber:'SIT-TIMING',packageCounts:{CTN:1},aotApprovedAt:t0};
    Object.assign(job,timing.prepare(job,{phase:'wh3-load-start'},t0).patch);
    Object.assign(job,timing.prepare(job,{arrived:false},t1).patch);
    Object.assign(job,timing.prepare(job,{phase:'queue'},t2).patch);
    Object.assign(job,timing.prepare(job,{arrived:true},t3).patch,{weighStartedAt:t4});
    const row=ops.summary({jobs:[job],users:[],billing:[],customers:[]}).rows[0];
    assert.equal(row.dispatchMinutes,23);assert.equal(row.dispatchKpi,'Within30');
    assert.equal(row.queueWaitingMinutes,14);assert.equal(row.cargoReceivedAt,t3);assert.equal(row.queueReceivedAt,t2);
    assert.equal(job.driverRouteStatus,'TerminalArrived');
});
test('arrival does not fabricate queue or loading-start time and old data stays unknown',()=>{
    const job={id:'sit',houseNumber:'SIT-OLD',goodsLoadedAt:t0,terminalArrivedAt:t1};
    const copy={...job,...timing.prepare(job,{arrived:true},t2).patch};
    assert.equal(copy.terminalArrivedAt,t1);
    const row=ops.summary({jobs:[copy],users:[],billing:[],customers:[]}).rows[0];
    assert.equal(row.queueWaitingMinutes,null);assert.equal(row.dispatchMinutes,null);
    assert.equal(row.queueReceivedAt,null);
});
test('queue and load-start retries preserve first event and reject late backfilling',()=>{
    assert.equal(timing.prepare({queueReceivedAt:t0},{phase:'queue'},t1).idempotent,true);
    assert.equal(timing.prepare({wh3LoadingStartedAt:t0},{phase:'wh3-load-start'},t1).idempotent,true);
    assert.throws(()=>timing.prepare({weighStartedAt:t0},{phase:'queue'},t1),/ชั่ง/);
    assert.throws(()=>timing.prepare({goodsLoadedAt:t0},{phase:'wh3-load-start'},t1),/ออก WH3/);
    for(const job of [{invoiceId:'INV'},{readyForBilling:true},{terminalClosedAt:t0}])assert.throws(()=>timing.prepare(job,{arrived:true},t1),/วางบิล/);
    assert.throws(()=>timing.prepare({},{phase:'invented'},t0),/ไม่ถูกต้อง/);
});
