import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import vm from 'node:vm';
const require=createRequire(import.meta.url),events=require('../src/server/driver-dock-events.cjs'),core=require('../public/legacy/driver-dock-core.js');
const H='SIT-WH3-DOCK-20261028-A1',actor={id:'driver',role:'Driver'};
const assignedAt='2026-10-28T01:00:00Z';
type Job=Record<string,unknown>&{houseNumber:string;driverId:string;status:string;driverDockHistory:Record<string,unknown>[]};
const fixture=()=>({jobs:[{houseNumber:H,driverId:'driver',status:'InboundOpened',csConfirmed:true,cargoIssuedAt:'2026-10-28T00:00:00Z',arrivedWh3At:'2026-10-28T00:30:00Z',releaseDocumentReceivedAt:'2026-10-28T00:40:00Z',inboundReceipt:{counts:{CTN:3},revision:1,confirmedAt:'2026-10-28T00:50:00Z'},driverDockHistory:[]} as Job],dock:{bays:[{id:'D9',status:'Occupied',houseNumber:H,assignedAt,queueNumber:5}]},meetingSafety:{geofencingEnabled:false}});
const payload=(event='arrive',expectedRevision=0)=>({houseNumber:H,bayId:'D9',assignedAt,event,expectedRevision,simulation:true,requestId:'request-'+event});
const proof={mimeType:'image/png',base64:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1cAAAAASUVORK5CYII='};
test('three steps preserve WH receipt, business status, assignment, policy and first timestamps',()=>{
 const db=fixture(),before=structuredClone(db);
 for(const [index,event] of ['arrive','unload-start','unload-complete'].entries()){
  const p={...payload(event,index),evidence:proof};const plan=events.prepare(db,actor,p,`2026-10-28T01:0${index+1}:00Z`);
  events.apply(plan,event==='unload-complete'?[{fileId:'SIT-PROOF'}]:[]);
 }
 assert.equal(core.progress(db.jobs[0],db.dock.bays[0]).revision,3);
 assert.deepEqual(db.jobs[0].inboundReceipt,before.jobs[0].inboundReceipt);assert.equal(db.jobs[0].status,'InboundOpened');assert.deepEqual(db.dock,before.dock);assert.deepEqual(db.meetingSafety,before.meetingSafety);
 const old=structuredClone(db);const replay=events.prepare(db,actor,{...payload(),requestId:'new-arrive-request'},'2026-10-28T03:00:00Z');assert.equal(replay.replayed,true);events.apply(replay);assert.deepEqual(db,old);
});
test('Driver ownership is mandatory including outside the SIT allowlist',()=>{
 for(const a of [null,{id:'driver',role:'Admin'},{id:'other',role:'Driver'}])assert.throws(()=>events.prepare(fixture(),a,payload()),/คนขับ|มอบหมาย/);
});
test('missing arrival, documents, CS, cancelled work, stale bay and uncalled Dock reject without writes',()=>{
 for(const change of [(d:ReturnType<typeof fixture>)=>{d.jobs[0].arrivedWh3At='';},(d:ReturnType<typeof fixture>)=>{d.jobs[0].releaseDocumentReceivedAt='';},(d:ReturnType<typeof fixture>)=>{d.jobs[0].csConfirmed=false;},(d:ReturnType<typeof fixture>)=>{d.jobs[0].status='Cancelled';},(d:ReturnType<typeof fixture>)=>{d.dock.bays[0].assignedAt='2026-10-28T02:00:00Z';},(d:ReturnType<typeof fixture>)=>{d.dock.bays[0].status='Available';}]){
  const db=fixture();change(db);const old=structuredClone(db);assert.throws(()=>events.prepare(db,actor,payload()));assert.deepEqual(db,old);
 }
});
test('cannot start before arrival or finish before start, including forged revision',()=>{
 const db=fixture();assert.throws(()=>events.prepare(db,actor,payload('unload-start')),/เข้าท่า/);assert.throws(()=>events.prepare(db,actor,payload('unload-complete')),/เริ่มลง/);
 events.apply(events.prepare(db,actor,payload(),'2026-10-28T01:01:00Z'));
 assert.throws(()=>events.prepare(db,actor,payload('unload-start',0)),/รีเฟรช/);
});
test('SIT flags cannot be used for real Houses and real receipt cannot be backdated as arrival',()=>{
 assert.throws(()=>events.prepare(fixture(),actor,{...payload(),simulation:false}),/SIT/);
 const db=fixture();db.jobs[0].houseNumber=db.dock.bays[0].houseNumber='4840001';
 assert.throws(()=>events.prepare(db,actor,{...payload(),houseNumber:'4840001'}),/งานจริง/);
 assert.throws(()=>events.prepare(db,actor,{...payload(),houseNumber:'4840001',simulation:false}),/ยอดรับแล้ว/);
});
test('evidence is required on completion and wrong MIME cannot advance events',()=>{
 const db=fixture();events.apply(events.prepare(db,actor,payload(),'2026-10-28T01:01:00Z'));events.apply(events.prepare(db,actor,payload('unload-start',1),'2026-10-28T01:02:00Z'));
 const old=structuredClone(db);
 assert.throws(()=>events.prepare(db,actor,payload('unload-complete',2),'2026-10-28T01:03:00Z'),/แนบ/);
 assert.throws(()=>events.prepare(db,actor,{...payload('unload-complete',2),evidence:{...proof,mimeType:'application/pdf'}},'2026-10-28T01:03:00Z'));
 assert.deepEqual(db,old);
});
test('assignment generation isolates old progress and preserves original history',()=>{
 const db=fixture();events.apply(events.prepare(db,actor,payload(),'2026-10-28T01:01:00Z'));db.dock.bays[0].assignedAt='2026-10-28T02:00:00Z';
 assert.equal(core.progress(db.jobs[0],db.dock.bays[0]).revision,0);
 assert.throws(()=>events.prepare(db,actor,{...payload('unload-start',0),assignedAt:'2026-10-28T02:00:00Z'},'2026-10-28T02:01:00Z'),/เข้าท่า/);
 assert.equal(db.jobs[0].driverDockHistory.length,1);
});
test('request identity and server time cannot be reused to change a step or reorder timestamps',()=>{
 const db=fixture();events.apply(events.prepare(db,actor,payload(),'2026-10-28T01:01:00Z'));
 assert.throws(()=>events.prepare(db,actor,{...payload('unload-start',1),requestId:'request-arrive'},'2026-10-28T01:02:00Z'),/รหัสคำขอ/);
 assert.throws(()=>events.prepare(db,actor,payload('unload-start',1),'2026-10-28T00:59:00Z'),/เวลา/);
});
test('actual mobile controls enforce ordering, label SIT and never expose Driver actions to Admin',()=>{
 const source=fs.readFileSync(new URL('../public/legacy/mobile.js',import.meta.url),'utf8');
 const ctx=vm.createContext({mobileDockBusy:false,currentUser:()=>({role:'Driver'}),escapeHtmlMobile:(v:unknown)=>String(v),formatBangkokMobile:(v:unknown)=>String(v)});
 vm.runInContext(source.slice(source.indexOf('function driverDockControls('),source.indexOf('function driverDockStep(')),ctx);
 const render=vm.runInContext('driverDockControls',ctx),html=render({bay:{id:'D9'},progress:{}},H);
 assert.match(html,/ยืนยันเข้าท่า D9/);assert.match(html,/data-driver-dock-event="unload-start" disabled/);assert.match(html,/data-driver-dock-event="unload-complete" disabled/);assert.match(html,/SIT ONLY/);
 vm.runInContext("currentUser=()=>({role:'Admin'})",ctx);assert.equal(render({bay:{id:'D9'}},H),'');
});
