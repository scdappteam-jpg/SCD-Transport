import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {ensureInboundBays,ensureTickets,board}=require('../src/server/dock-display.cjs');
const planning=require('../src/server/dock-planning.cjs');
const actor={role:'Admin'};
type Fixture={jobs:{houseNumber:string;status:string;vehiclePlate:string;invoiceNo?:string}[];meetingSafety:{geofencingEnabled:boolean};dock:{bays:{id:string;name:string;status:string;note:string;queueNumber?:number}[];queue:{id:string;houseNumber:string;createdAt:string;queueNumber?:number}[]}};
const fixture=():Fixture=>({jobs:[{houseNumber:'4840001',status:'WaitingForDock',vehiclePlate:'REAL-1',invoiceNo:'private'},{houseNumber:'SIT-TEST',status:'WaitingForDock',vehiclePlate:'SIT-ONLY'}],meetingSafety:{geofencingEnabled:false},dock:{bays:[{id:'D8',name:'Custom8',status:'Closed',note:'keep'}],queue:[{id:'q1',houseNumber:'4840001',createdAt:'2026-10-28T01:00:00Z'},{id:'q2',houseNumber:'SIT-TEST',createdAt:'2026-10-28T02:00:00Z'}]}});
test('inbound setup adds canonical D9–11 idempotently and preserves existing settings',()=>{
 const db=fixture(),existing=structuredClone(db.dock.bays[0]);
 assert.deepEqual(ensureInboundBays(db),['D9','D10','D11']);assert.deepEqual(ensureInboundBays(db),[]);
 assert.deepEqual(db.dock.bays[0],existing);assert.equal(db.meetingSafety.geofencingEnabled,false);
 for(const b of db.dock.bays.slice(1))assert.equal(planning.bayKind(b),'Inbound');
});
test('conflicting custom dock name rejects before partial additions',()=>{
 const db=fixture();db.dock.bays.push({id:'custom',name:'ท่า 10',status:'Available',note:''});
 const before=structuredClone(db);assert.throws(()=>ensureInboundBays(db),/รหัสอื่น/);assert.deepEqual(db,before);
});
test('tickets are stable through priority changes and monotonically increase after calling',()=>{
 const db=fixture();ensureTickets(db);assert.equal(db.dock.queue[1].queueNumber,2);
 const selected=db.dock.queue.pop();db.dock.bays.push({id:'D9',name:'ท่า 9',status:'Occupied',note:'',...selected});
 db.dock.queue.push({id:'q3',houseNumber:'new',createdAt:'2026-10-28T00:00:00Z'});ensureTickets(db);
 assert.equal(db.dock.queue[0].queueNumber,1);assert.equal(db.dock.queue[1].queueNumber,3);
 assert.equal(db.dock.bays[1].queueNumber,2);
});
test('display requires staff authentication and rejects invalid scopes',()=>{
 for(const a of [null,{role:'Driver'},{role:'EI_Customer'}])assert.throws(()=>board(fixture(),a));
 assert.throws(()=>board(fixture(),actor,'all'));
});
test('display is read only, scoped and excludes private job data and suggested docks',()=>{
 const db=fixture();ensureInboundBays(db);const before=structuredClone(db);
 const live=board(db,actor,'live'),sit=board(db,actor,'sit');
 assert.deepEqual(live.queue.map((r:{houseNumber:string})=>r.houseNumber),['4840001']);
 assert.deepEqual(sit.queue.map((r:{houseNumber:string})=>r.houseNumber),['SIT-TEST']);
 assert.equal(sit.queue[0].dockId,null);assert.equal(sit.called.length,0);
 assert.ok(!JSON.stringify(live).includes('private'));assert.deepEqual(db,before);
});
test('called rows use actual assigned dock and retain ticket; live masks SIT house',()=>{
 const db=fixture();ensureInboundBays(db);const q=db.dock.queue.pop();Object.assign(db.dock.bays[1],q,{id:'D9',assignedAt:'2026-10-28T03:00:00Z',status:'Occupied'});
 const sit=board(db,actor,'sit'),live=board(db,actor,'live');
 assert.equal(sit.called[0].dockId,'D9');assert.equal(sit.called[0].queueNumber,2);assert.equal(sit.queue.length,0);
 assert.equal(live.called.length,0);assert.ok(!JSON.stringify(live).includes('SIT-TEST'));
});
test('finished inbound queues remain in history but do not block active flight priority',()=>{
 const db=fixture();db.jobs[0].status='Billed';db.jobs[1].status='ReadyForBilling';
 db.jobs.push({houseNumber:'SIT-ACTIVE',status:'WaitingForDock',vehiclePlate:'SIT',invoiceNo:''});
 db.dock.queue.push({id:'q3',houseNumber:'SIT-ACTIVE',createdAt:'2026-10-28T03:00:00Z'});
 assert.deepEqual(planning.queue(db).map((r:{houseNumber:string})=>r.houseNumber),['SIT-ACTIVE']);
 assert.doesNotThrow(()=>planning.assignment(db,db.jobs[2],db.dock.queue[2],{id:'D9'}));
 assert.equal(db.dock.queue.length,3);
});
test('active urgent flights still prevent calling later inbound first',()=>{
 const db=fixture();Object.assign(db.jobs[0],{cargoCutoffAt:'2026-10-28T01:00:00Z'});Object.assign(db.jobs[1],{cargoCutoffAt:'2026-10-28T02:00:00Z'});
 assert.throws(()=>planning.assignment(db,db.jobs[1],db.dock.queue[1],{id:'D9'}),/Flight/);
 assert.throws(()=>planning.assignment(db,db.jobs[0],db.dock.queue[0],{id:'D7'}),/ประเภท/);
});
