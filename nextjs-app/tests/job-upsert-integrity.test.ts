import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
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

test('actual bulk upsert keeps one round across Houses, later pickup edits, Driver readiness and Billing',()=>{
 const f=fixture();
 const a=f.run({houseNumber:'SIT-A',customerId:'CLIENT',batchId:'SIT-ROUND-1',driverId:'SIT-DRIVER',vehiclePlate:'SIT-1127',pickupDate:'2026-11-27'});
 const b=f.run({houseNumber:'SIT-B',customerId:'CLIENT',batchId:'SIT-ROUND-1',driverId:'SIT-DRIVER',vehiclePlate:'SIT-1127',pickupDate:'2026-11-27'});
 assert.equal(a.batchId,'SIT-ROUND-1');assert.equal(b.batchId,a.batchId);
 f.run({houseNumber:'SIT-A',completedAt:'irrelevant'});assert.equal(a.batchId,b.batchId);
 a.completedAt='2026-11-27T06:00:00Z';
 const mobile=readFileSync(new URL('../public/legacy/mobile.js',import.meta.url),'utf8');
 const start=mobile.indexOf('function pickupRoundKeyForMobile('),end=mobile.indexOf('function releaseDocumentRoundJobs(',start);
 const context=vm.createContext({jobsFromSelection:()=>[a],visibleDriverJobs:()=>f.db.jobs});
 vm.runInContext(mobile.slice(start,end),context);
 assert.equal(vm.runInContext('pickupRoundJobsForMobile().filter(job=>!job.completedAt).length',context),1);
 assert.equal(require('../src/server/workflow-integrity.cjs').tripCount([a,b],{}),1);
 // Another assignment is a separate run; no grouping by number plate alone.
 const c=f.run({houseNumber:'SIT-C',customerId:'CLIENT',batchId:'SIT-ROUND-2',driverId:'SIT-DRIVER',vehiclePlate:'SIT-1127',pickupDate:'2026-11-27'});
 assert.notEqual(c.batchId,a.batchId);
 assert.equal(vm.runInContext('pickupRoundJobsForMobile().length',context),2);
});
