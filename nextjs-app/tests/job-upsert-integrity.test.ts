import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/server/legacy-api.cjs',import.meta.url),'utf8');
function fixture(){
 const db={jobs:[] as Array<Record<string,unknown>>,customers:[{id:'ABC',name:'Unrelated ABC'},{id:'CLIENT',name:'Actual client'}],loadPlans:[] as Array<{rows:Array<Record<string,unknown>>}>};
 const ctx=vm.createContext({db,crypto,nowIso:()=> '2026-11-22T00:00:00Z',findJob:(d:typeof db,h:string)=>d.jobs.find(j=>j.houseNumber===h),getOrCreateCustomer:()=>{throw new Error('must not invent a client');},normalizePickupItems:(v:unknown)=>v,deriveApprovalFields:()=>{}});
 vm.runInContext(source.match(/^function upsertJob\([\s\S]*?^}/m)![0],ctx);
 return {db,run:(p:Record<string,unknown>)=>{ctx.payload=p;return vm.runInContext('upsertJob(db,payload)',ctx);}};
}
test('driver assignment preserves the existing client, quantities and shipment references when omitted',()=>{
 const f=fixture();f.db.jobs.push({id:'JOB-OLD',houseNumber:'484-1',customerId:'CLIENT',customerName:'Actual client',mawbNumber:'189-05549401',packageCounts:{CTN:40,PLT:11},pieceCount:11});
 const job=f.run({houseNumber:'484-1',driverId:'SIT',vehiclePlate:'SIT-189-01',pickupCase:'SpecialMD',adminPrepared:true});
 assert.equal(job.customerId,'CLIENT');assert.equal(job.customerName,'Actual client');assert.equal(job.mawbNumber,'189-05549401');assert.deepEqual(job.packageCounts,{CTN:40,PLT:11});assert.equal(job.pieceCount,11);assert.equal(job.pickupCase,'SpecialMD');
 f.run({houseNumber:'484-1',pickupCase:'GeneralManual',adminPrepared:false});assert.equal(job.adminPrepared,false);
});
test('new bulk records have different IDs even during the same clock tick',()=>{
 const f=fixture();const a=f.run({houseNumber:'1',customerId:'CLIENT'}),b=f.run({houseNumber:'2',customerId:'CLIENT'});assert.notEqual(a.id,b.id);
});
test('updating a legacy duplicate ID repairs only that House and its matching plan row',()=>{
 const f=fixture();f.db.jobs.push({id:'DUP',houseNumber:'1',customerId:'CLIENT'},{id:'DUP',houseNumber:'2',customerId:'CLIENT'});f.db.loadPlans.push({rows:[{houseNumber:'1',jobId:'DUP'},{houseNumber:'2',jobId:'DUP'}]});
 const job=f.run({houseNumber:'2',driverId:'SIT'});assert.notEqual(job.id,'DUP');assert.equal(f.db.jobs[0].id,'DUP');assert.equal(f.db.loadPlans[0].rows[0].jobId,'DUP');assert.equal(f.db.loadPlans[0].rows[1].jobId,job.id);
});
test('unknown explicit customer selection rejects before modifying a shipment',()=>{
 const f=fixture();const before=JSON.stringify(f.db);assert.throws(()=>f.run({houseNumber:'1',customerId:'MISSING'}));assert.equal(JSON.stringify(f.db),before);
});
