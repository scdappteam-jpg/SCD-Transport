/* eslint-disable @typescript-eslint/no-explicit-any -- Execute legacy handlers against isolated synthetic cargo and protected sentinel state. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const require=createRequire(import.meta.url);
const inbound=require('../src/server/warehouse-inbound.cjs'), quality=require('../src/server/warehouse-quality.cjs');
const receipts=require('../src/server/inbound-receipts.cjs'), integrity=require('../src/server/workflow-integrity.cjs');
const planning=require('../src/server/dock-planning.cjs'), auto=require('../src/server/dock-auto-dispatch.cjs'), driver=require('../src/server/meeting-driver-policy.cjs');
const rounds=require('../public/legacy/transport-round-core.js'), flight=require('../src/server/flight-risk.cjs');
const at='2026-11-24T03:00:00.000Z', H='SIT-SEVEN-20261124-A';
function fixture() {
 const job:any={houseNumber:H,driverId:'SIT-DRIVER',vehiclePlate:'SIT-100',transportRoundId:'SIT-ROUND',status:'WaitingForDock',csConfirmed:true,cargoIssuedAt:at,arrivedWh3At:at,releaseDocumentReceivedAt:at,packageCounts:{CTN:3},pieceCount:3,packageType:'CTN',inboundDocStatus:'Found',inboundOpenedAt:at,inboundInspection:{checkedAt:at},dockAssignedAt:at,wh3UnloadCompletedAt:at};
 job.driverDockHistory=['arrive','unload-start','unload-complete'].map((event,i)=>({event,at,by:job.driverId,bayId:'D8',assignedAt:at,evidenceFileIds:i===2?['SIT-PROOF']:[]}));
 const db:any={jobs:[job,{houseNumber:'UNRELATED-CARGO-SENTINEL',status:'Billed'}],users:[{id:'PROTECTED-ACCOUNT-SENTINEL'}],hr:{employeeProfiles:{sentinel:{photoUrl:'unchanged'}}},meetingSafety:{enabled:false},locations:[],warehouseMap:{zones:[{id:'SIT-ZONE',storageMode:'Flexible',maxBoxes:8}],locations:[{id:'SIT-M1',code:'SIT-01',zoneId:'SIT-ZONE',occupiedBy:[{houseNumber:'SIT-OTHER',boxes:2}]},{id:'SIT-M2',code:'SIT-02',zoneId:'SIT-ZONE',occupiedBy:[]}]},dock:{queue:[],bays:[]},activityLogs:[]};
 return {db,job};
}
function approve(db:any,job:any){
 quality.applyTag(job,quality.tagPlan(db,job,{id:'SIT-TAGGER',role:'Tagging_Staff'},{expectedRevision:job.tagInspection?.revision||0},[{barcodes:[H],imageHash:'SIT-TAG-'+Date.now()}],at));
 job.qaApproval=quality.approvalPlan(db,job,{id:'SIT-QA',role:'QA_Inspector'},{expectedRevision:job.tagInspection.revision},[{barcodes:[H],imageHash:'SIT-QA-NEW'}],at);
}
function count(job:any,qty=3){receipts.receiveCounts(job,{counts:{CTN:qty},expectedRevision:job.inboundReceipt?.revision||0,requestId:'SIT-COUNT-'+qty},'SIT-WH');}

test('G01 SIT: desktop/mobile receipt forms stay blocked until unloading and current document opening',()=>{
 const {db,job}=fixture();delete job.inboundOpenedAt;
 assert.equal(receipts.receivingReady(job),false);assert.throws(()=>integrity.inbound(job,'receipt'),/เปิดงาน/);
 const window:any={InboundReceipts:receipts};vm.runInNewContext(readFileSync(new URL('../public/legacy/inbound-receipt-ui.js',import.meta.url),'utf8'),{window});
 const html=window.ReceiptUI.panel(db.jobs,job,true);assert.match(html,/data-receipt-save disabled/);assert.match(html,/เปิดรับเข้า/);
 job.inboundOpenedAt=at;assert.equal(receipts.receivingReady(job),true);assert.doesNotThrow(()=>integrity.inbound(job,'receipt'));
 job.inboundDocumentCheckedAt='2026-11-24T04:00:00Z';assert.equal(receipts.receivingReady(job),false);
});

test('G02 SIT: Stored with partial counts cannot Pick or load, despite valid QA',()=>{
 const {db,job}=fixture();job.status='Stored';count(job,2);approve(db,job);
 const before=structuredClone(db);for(const path of ['/api/outbound/picking','/api/outbound/load-bay','/api/outbound/transfer-form'])assert.throws(()=>quality.enforceMovement(db,path,{houseNumber:H}),/ยอดรับจริงครบ/);
 assert.deepEqual(JSON.parse(JSON.stringify(db)),JSON.parse(JSON.stringify(before)));count(job,3);approve(db,job);assert.doesNotThrow(()=>quality.enforceMovement(db,'/api/outbound/picking',{houseNumber:H}));
});

test('G03 SIT: Dock order follows the same WH3 deadline as SLA even when raw cutoff order conflicts',()=>{
 const a={houseNumber:'SIT-DEADLINE-A',status:'WaitingForDock',flightTime:'2026-11-26T02:00:00+07:00',cargoCutoffAt:'2026-11-25T18:00:00+07:00'};
 const b={houseNumber:'SIT-DEADLINE-B',status:'WaitingForDock',flightTime:'2026-11-26T06:00:00+07:00',cargoCutoffAt:'2026-11-25T16:30:00+07:00'};
 const db={jobs:[a,b],dock:{queue:[{id:'b',houseNumber:b.houseNumber},{id:'a',houseNumber:a.houseNumber}]}};
 assert.ok(Date.parse(flight.derive(a).wh3DueAt)<Date.parse(flight.derive(b).wh3DueAt));assert.deepEqual(planning.queue(db).map((r:any)=>r.houseNumber),[a.houseNumber,b.houseNumber]);
 assert.equal(flight.derive(a).wh3DueAt,'2026-11-25T05:00:00.000Z');
});

test('G04 SIT: manual and auto skip the same unready head without deleting or splitting its round',()=>{
 const {db,job}=fixture();delete job.wh3UnloadCompletedAt;
 const head={...job,houseNumber:'SIT-UNREADY',transportRoundId:'SIT-HEAD',vehiclePlate:'SIT-HEAD',releaseDocumentReceivedAt:''};
 db.jobs.unshift(head);db.dock.queue=[{id:'head',houseNumber:head.houseNumber,createdAt:'2026-11-24T00:00:00Z'},{id:'ready',houseNumber:H,createdAt:at}];
 db.dock.bays=[{id:'D8',status:'Available',houseNumber:''}];const before=structuredClone(db);
 assert.doesNotThrow(()=>planning.assignment(db,job,db.dock.queue[1],db.dock.bays[0]));assert.deepEqual(JSON.parse(JSON.stringify(db)),JSON.parse(JSON.stringify(before)));
 assert.throws(()=>planning.assignment(db,head,db.dock.queue[0],db.dock.bays[0]),/ยังไม่พร้อม/);
 assert.deepEqual(auto.dispatch(db,at).map((r:any)=>r.houseNumbers),[[H]]);assert.equal(db.dock.queue[0].houseNumber,head.houseNumber);
});

test('G04 SIT: pause, missing documents, mixed plate or mixed driver prevent both dispatch paths',()=>{
 for(const change of [{vehiclePlate:'SIT-OTHER'},{driverId:'SIT-OTHER'},{releaseDocumentReceivedAt:''}]) {
  const {db,job}=fixture();delete job.wh3UnloadCompletedAt;db.jobs.push({...job,houseNumber:'SIT-ROUND-B',...change});
  db.dock.queue=[{id:'round',houseNumber:H,houseNumbers:[H,'SIT-ROUND-B']}];db.dock.bays=[{id:'D8',status:'Available'}];
  assert.throws(()=>planning.assignment(db,job,db.dock.queue[0],db.dock.bays[0]),/ยังไม่พร้อม/);assert.deepEqual(auto.dispatch(db,at),[]);
 }
});

test('G05 SIT: disabled rollout flags cannot bypass QA or pickup evidence; protected state is unchanged',()=>{
 const {db,job}=fixture();delete job.qaRequired;const protectedBefore=JSON.stringify({users:db.users,hr:db.hr,other:db.jobs[1]});const before=structuredClone(db);
 for(const path of quality.movementPaths)assert.throws(()=>quality.enforceMovement(db,path,{houseNumber:H}),/QA/);
 assert.throws(()=>driver.preflight(db,'/api/pickup/load',{houseNumber:H},{id:'SIT-DRIVER',role:'Driver'},at),/แนบ/);
 assert.deepEqual(JSON.parse(JSON.stringify(db)),JSON.parse(JSON.stringify(before)));assert.equal(JSON.stringify({users:db.users,hr:db.hr,other:db.jobs[1]}),protectedBefore);
});

test('G06 SIT: legacy physical round fallback is identical in Driver, Billing Preview and invoice API',()=>{
 const base={driverId:'SIT-DRIVER',vehiclePlate:'SIT-100',routeStartedAt:at,workDate:'2026-11-24',customerId:'SIT-CUSTOMER',readyForBilling:true,amount:100};
 const jobs=[{...base,houseNumber:'SIT-ROUND-A'},{...base,houseNumber:'SIT-ROUND-B'}];
 assert.equal(rounds.identity(jobs[0]).id,rounds.identity(jobs[1]).id);assert.equal(integrity.tripCount(jobs,{}),1);
 assert.throws(()=>integrity.tripCount(jobs,{tripCount:2}),/ไม่ตรง/);
 const source=readFileSync(new URL('../public/legacy/app.js',import.meta.url),'utf8');
 const helpers=source.slice(source.indexOf('function billingJobDate('),source.indexOf('function renderBillingBatchBuilder('));
 const ctx=vm.createContext({TransportRounds:rounds,state:{dashboard:{jobs}},$:()=>null});vm.runInContext(helpers,ctx);
 const groups=vm.runInContext('buildBillingBatchGroups()',ctx);assert.equal(groups[0].trips.length,1);assert.equal(groups[0].tripCountKnown,true);
 const unknown=jobs.map(job=>({houseNumber:job.houseNumber,workDate:job.workDate,customerId:job.customerId,readyForBilling:job.readyForBilling,amount:job.amount}));
 ctx.state.dashboard.jobs=unknown;const unresolved=vm.runInContext('buildBillingBatchGroups()',ctx);assert.equal(unresolved[0].tripCountKnown,false);assert.equal(unresolved[0].unresolvedTrips.length,2);assert.throws(()=>integrity.tripCount(unknown,{}),/ผูกรหัสรอบ/);
});

async function placementRoute(db:any,path:string,payload:any) {
 const src=readFileSync(new URL('../src/server/legacy-api.cjs',import.meta.url),'utf8');
 const start=src.indexOf('    if (req.method === "POST" && pathname === "'+path+'")');
 const next=src.indexOf('    if (req.method === "POST"',start+12);const block=src.slice(start,next);
 let writes=0;quality.enforceMovement(db,path,payload);
 const ctx=vm.createContext({req:{method:'POST'},res:{},pathname:path,db,warehouseInbound:inbound,parseBody:async()=>payload,requireSessionRole:()=>({id:'SIT-WH',role:'WH_Staff'}),findJob:(d:any,h:string)=>d.jobs.find((j:any)=>j.houseNumber===h),warehouseMapLocations:(d:any)=>d.warehouseMap.locations,nowIso:()=>at,normalizeJob:(j:any)=>j,writeDb:()=>{writes++;},logActivity:()=>{},sendJson:(_r:any,status:number,body:any)=>({status,body})});
 const result=await vm.runInContext('(async()=>{'+block+'})()',ctx);return {result,writes};
}
test('G07 SIT actual handlers: configured Flexible permits shared capacity, Fixed/overflow reject without mutation',async()=>{
 const {db,job}=fixture();count(job);approve(db,job);
 const original=structuredClone({users:db.users,hr:db.hr,other:db.jobs[1]});
 const stored=await placementRoute(db,'/api/inbound/twin-scan',{houseNumber:H,locationId:'SIT-01',boxes:3});assert.equal(stored.result.status,200);assert.equal(stored.writes,1);
 assert.deepEqual(db.warehouseMap.locations[0].occupiedBy.map((r:any)=>r.houseNumber),['SIT-OTHER',H]);
 const moved=await placementRoute(db,'/api/inbound/move-location',{houseNumber:H,newLocationId:'SIT-02'});assert.equal(moved.result.status,200);assert.equal(db.warehouseMap.locations[0].occupiedBy.length,1);assert.equal(job.previousLocationId,'SIT-01');
 db.warehouseMap.zones[0].storageMode='Fixed';const before=structuredClone(db);
 await assert.rejects(placementRoute(db,'/api/inbound/move-location',{houseNumber:H,newLocationId:'SIT-01'}),/House อื่น/);assert.deepEqual(JSON.parse(JSON.stringify(db)),JSON.parse(JSON.stringify(before)));
 db.warehouseMap.zones[0].storageMode='Flexible';db.warehouseMap.zones[0].maxBoxes=4;const noRoom=structuredClone(db);
 await assert.rejects(placementRoute(db,'/api/inbound/move-location',{houseNumber:H,newLocationId:'SIT-01'}),/ความจุ/);assert.deepEqual(JSON.parse(JSON.stringify(db)),JSON.parse(JSON.stringify(noRoom)));
 assert.deepEqual({users:db.users,hr:db.hr,other:db.jobs[1]},original);
});

test('G01 SIT: Customer Direct receipt follows its own arrival/opening gate without a Driver dock event',()=>{
 const {job}=fixture();job.shipmentSource='CustomerDirect';delete job.releaseDocumentReceivedAt;delete job.wh3UnloadCompletedAt;delete job.driverDockHistory;
 assert.equal(receipts.receivingReady(job),true);assert.doesNotThrow(()=>integrity.inbound(job,'receipt'));job.csRejected=true;assert.equal(receipts.receivingReady(job),false);
});
