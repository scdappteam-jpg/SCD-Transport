import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
const require=createRequire(import.meta.url);
const m=require('../src/server/master-rehearsal.cjs');
const actor={id:'sit-role-admin',role:'Admin'},at='2026-11-26T06:00:00Z';
function fixture(){return {users:[{id:'person',pin:'unchanged'}],hr:{data:'unchanged'},attendance:[{id:'today'}],jobs:[...m.HOUSES.map((houseNumber:string,i:number)=>({id:'j'+i,houseNumber,mawbNumber:m.MASTER,customerName:'CUSTOMER',driverId:'sit-role-driver',transportRoundId:'test-round',status:'Billed',csConfirmed:true,invoiceId:'INV-2026-0004',tagInspection:{done:true},qaApproval:{done:true},locationId:'A1',loadingDetailUploaded:true,readyForBilling:false,pieceCount:i+1,packageCounts:{CTN:i+1},invoiceNo:'SIT',operationsEvents:[{action:'price'}]})),{id:'other',houseNumber:'OTHER',mawbNumber:'OTHER-MASTER',status:'Stored',transportRoundId:'other-round'}],billing:[{id:'INV-2026-0004',testOnly:true,status:'Billed',amount:1000,houseNumber:m.HOUSES[0],houseNumbers:m.HOUSES},{id:'OTHER-INVOICE',amount:999,houseNumber:'OTHER'}],attachments:[{fileId:'file',houseNumber:m.HOUSES[0],url:'/storage/file'},{fileId:'other-file',houseNumber:'OTHER'}],taskGroups:[],notifications:[],serviceRecords:[],activityLogs:[{houseNumber:m.HOUSES[0],action:'original'}],loadPlans:[{id:'all-plan',rows:[{houseNumber:'OTHER'},{houseNumber:m.HOUSES[0]}]}],warehouseMap:{locations:[{id:'A1',currentHouseId:'OTHER',occupiedBy:[{houseNumber:'OTHER'}]}]},dock:{queue:[],bays:[]}};}
function backup(db:ReturnType<typeof fixture>){const p=m.prepare(db,actor);return m.archive(db,actor,p.sha256,[{fileId:'file',sha256:'hash',size:20}],at);}
test('scoped reset archives full originals and leaves personnel other jobs inventory and imports byte-identical',()=>{
 const db=fixture(),original=structuredClone(db),record=backup(db);const snapshot=structuredClone(record.snapshot);
 const result=m.apply(db,actor,record.id,'RESET:'+m.MASTER,at);
 assert.equal(result.status,'PendingCSApproval');
 assert.deepEqual(record.snapshot,snapshot);
 for(const key of ['users','hr','attendance','activityLogs','loadPlans','warehouseMap','dock'] as const)assert.deepEqual(db[key],original[key]);
 assert.deepEqual(db.jobs.at(-1),original.jobs.at(-1));assert.deepEqual(db.billing[1],original.billing[1]);assert.deepEqual(db.attachments,[original.attachments[1]]);
 assert.equal(db.billing.length,2);assert.equal(db.billing[0].status,'ArchivedSIT');assert.equal(db.billing[0].id,original.billing[0].id);assert.deepEqual(db.billing[0].houseNumbers,[]);
 for(const j of db.jobs.slice(0,6)){assert.equal(j.csConfirmed,false);assert.equal(j.status,'Pending');for(const k of ['invoiceId','tagInspection','qaApproval','locationId','loadingDetailUploaded','operationsEvents','transportRoundId'])assert.equal(Object.hasOwn(j,k),false);assert.ok(j.packageCounts);}
 assert.equal(record.snapshot.jobs[0].invoiceId,'INV-2026-0004');assert.equal(record.snapshot.records.billing[0].amount,1000);
 const once=JSON.stringify(db);assert.equal(m.apply(db,actor,record.id,'RESET:'+m.MASTER,at).replayed,true);assert.equal(JSON.stringify(db),once);
});
test('any update after backup blocks reset without partial mutations',()=>{const db=fixture(),record=backup(db);db.jobs[0].pieceCount=999;const before=JSON.stringify(db);assert.throws(()=>m.apply(db,actor,record.id,'RESET:'+m.MASTER,at),/เปลี่ยน/);assert.equal(JSON.stringify(db),before);});
test('reset retains shipment inputs and Terminal destination for CS to verify again',()=>{const d=fixture();Object.assign(d.jobs[0],{terminalDestination:'TGINT',contact:'SIT Contact',tel:'0000000000',shippingDoc:'source-document'});const r=backup(d);m.apply(d,actor,r.id,'RESET:'+m.MASTER,at);assert.equal(d.jobs[0].terminalDestination,'TGINT');assert.equal(d.jobs[0].contact,'SIT Contact');assert.equal(d.jobs[0].invoiceNo,'SIT');assert.equal(d.jobs[0].csConfirmed,false);});
test('reset survives schema normalization and only repairs automatic plan reapproval before any user progress',()=>{
 const d=fixture(),r=backup(d);m.apply(d,actor,r.id,'RESET:'+m.MASTER,at);
 const source=readFileSync(new URL('../src/server/legacy-api.cjs',import.meta.url),'utf8');const condition=source.match(/if \((!job.approvalStatus[^\n]+)\) \{/)![1];
 const context=vm.createContext({job:d.jobs[0],result:false});vm.runInContext('result=('+condition+')',context);assert.equal(context.result,false);
 for(const j of d.jobs.slice(0,6))Object.assign(j,{csConfirmed:true,approvalStatus:'ConfirmedByPlan',csApprovalRequired:false,evidenceRequired:false,planDate:'2026-11-26',planMatched:true,manualExtra:false,afterFinalRound:false,flightRiskStatus:'Breached',minutesToAirportDue:-30});
 assert.equal(m.apply(d,actor,r.id,'RESET:'+m.MASTER,at).repaired,true);assert.equal(d.jobs[0].csConfirmed,false);assert.equal(d.jobs[0].mustReturnWh3,true);assert.equal(d.jobs[0].doorClosedPhotoRequired,true);
 d.jobs[0].csConfirmed=true;d.jobs[0].csConfirmedAt=at;assert.throws(()=>m.apply(d,actor,r.id,'RESET:'+m.MASTER,at),/ทำรายการ/);
});
test('non-SIT invoices, mixed invoice scope, shared rounds and occupied locations fail closed',()=>{
 const cases=[(d:ReturnType<typeof fixture>)=>{d.billing[0].testOnly=false;},(d:ReturnType<typeof fixture>)=>{d.billing[0].houseNumbers=[...m.HOUSES,'OTHER'];},(d:ReturnType<typeof fixture>)=>{d.jobs.at(-1)!.transportRoundId='test-round';},(d:ReturnType<typeof fixture>)=>{d.warehouseMap.locations[0].currentHouseId=m.HOUSES[0];}];
 for(const change of cases){const d=fixture();change(d);const before=JSON.stringify(d);assert.throws(()=>m.prepare(d,actor));assert.equal(JSON.stringify(d),before);}
});
test('missing evidence backup, non-admin, wrong confirmation and changed House set are rejected',()=>{
 const d=fixture(),p=m.prepare(d,actor);assert.throws(()=>m.archive(d,actor,p.sha256,[],at));assert.equal(Object.hasOwn(d,'masterRehearsalArchives'),false);
 assert.throws(()=>m.prepare(d,{role:'CS'}),{statusCode:403});const r=backup(d);assert.throws(()=>m.apply(d,actor,r.id,'RESET:OTHER',at));d.jobs.splice(0,1);assert.throws(()=>m.prepare(d,actor));
});
test('reset is recoverable through the product without touching unrelated records; new progress blocks restore',()=>{
 const d=fixture(),before=structuredClone(d),r=backup(d);m.apply(d,actor,r.id,'RESET:'+m.MASTER,at);m.restore(d,actor,r.id,'RESTORE:'+m.MASTER,at);
 assert.deepEqual(d.jobs,before.jobs);assert.deepEqual(d.billing,before.billing);assert.deepEqual(d.users,before.users);assert.deepEqual(d.hr,before.hr);assert.deepEqual(d.loadPlans,before.loadPlans);
 assert.deepEqual([...d.attachments].sort((a,b)=>a.fileId.localeCompare(b.fileId)),[...before.attachments].sort((a,b)=>a.fileId.localeCompare(b.fileId)));
 const e=fixture(),q=backup(e);m.apply(e,actor,q.id,'RESET:'+m.MASTER,at);e.jobs[0].csConfirmed=true;const state=JSON.stringify(e);assert.throws(()=>m.restore(e,actor,q.id,'RESTORE:'+m.MASTER,at),/รอบใหม่/);assert.equal(JSON.stringify(e),state);
});
test('isolated persistence does not dispatch other vehicles or normalize personnel and unrelated jobs',()=>{
 const source=readFileSync(new URL('../src/server/legacy-api.cjs',import.meta.url),'utf8');
 let automatic=0,saves=0;
 const context=vm.createContext({refreshFlightSla:()=>automatic++,dockAutoDispatch:{dispatch:()=>automatic++},ensureCoreUsers:()=>automatic++,ensureDbShape:()=>automatic++,supabaseEnabled:()=>true,scheduleSupabasePersist:()=>saves++,fs:{writeFileSync:()=>{},renameSync:()=>{}},DB_FILE:'test',dbCache:null,console});
 vm.runInContext(source.match(/^function writeDb\([\s\S]*?^}/m)![0],context);
 vm.runInContext('writeDb({jobs:[]},{isolatedWorkflow:true})',context);assert.equal(automatic,0);assert.equal(saves,1);
 vm.runInContext('writeDb({jobs:[]})',context);assert.equal(automatic,4);assert.equal(saves,2);
});
test('backup includes original generated Invoice HTML bytes and every evidence file with correct hashes',async()=>{
 const d=fixture();const p=m.prepare(d,actor);const html='<!doctype html><title>SIT ONLY ใบวางบิล</title>';
 p.snapshot.records.attachments.push({fileId:'INVOICE-DOC-INV-2026-0004',houseNumber:m.HOUSES[0],fileType:'InvoiceDocument',url:'/storage/invoices/INV-2026-0004.html',htmlContent:html});
 const files=await m.backupFiles(p.snapshot,async()=>Buffer.from('evidence'));
 assert.equal(files.length,2);assert.equal(Buffer.from(files[1].base64,'base64').toString('utf8'),html);assert.equal(files[1].sha256,crypto.createHash('sha256').update(Buffer.from(html)).digest('hex'));
 p.snapshot.records.attachments[1].fileId='INVOICE-DOC-WRONG';await assert.rejects(()=>m.backupFiles(p.snapshot,async()=>Buffer.from('ok')),/Invoice HTML/);
});
