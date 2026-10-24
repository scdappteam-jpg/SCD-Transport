import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const require=createRequire(import.meta.url),handoff=require('../src/server/cs-dispatch.cjs');
const front=readFileSync(new URL('../public/legacy/app.js',import.meta.url),'utf8');
const mobile=readFileSync(new URL('../public/legacy/mobile.js',import.meta.url),'utf8');
const server=readFileSync(new URL('../src/server/legacy-api.cjs',import.meta.url),'utf8');
function fn(source:string,name:string){return source.match(new RegExp(`^(?:async )?function ${name}\\([\\s\\S]*?^}`,'m'))![0];}
const base=()=>({houseNumber:'F001',hawbNumber:'484001',mawbNumber:'205-86393230',pieceCount:3,contactPerson:'Old',pickupPhone:'OLD',invoiceNo:'OLD-INV',pickupItems:[{houseNumber:'F001',invoiceNo:'OLD-ROW',contact:'Old row',tel:'OLD'},{houseNumber:'OTHER',invoiceNo:'KEEP'}],inboundReceipt:{CTN:1},flightNo:'TBC'});
const payload={invoiceNo:'SIM-INVOICE',contactName:'SIM New Contact',contactPhone:'SIM-Phone-Ext123'};
test('CS edits survive Cargo hand-off without changing other House quantities or workflow',()=>{
 const job=base(),before=structuredClone(job);handoff.applyCsDetails(job,payload);
 assert.equal(job.invoiceNo,payload.invoiceNo);assert.equal(job.contactPerson,payload.contactName);assert.equal(job.pickupPhone,payload.contactPhone);
 assert.deepEqual(job.pickupItems[0],{houseNumber:'F001',invoiceNo:payload.invoiceNo,contact:payload.contactName,tel:payload.contactPhone});
 assert.deepEqual(job.pickupItems[1],before.pickupItems[1]);for(const key of ['houseNumber','hawbNumber','mawbNumber','pieceCount','inboundReceipt','flightNo'] as const)assert.deepEqual(job[key],before[key]);
});
test('Omitted CS fields preserve existing contact and phone',()=>{const j=base();handoff.applyCsDetails(j,{invoiceNo:'NEW'});assert.equal(j.pickupPhone,'OLD');assert.equal(j.contactPerson,'Old');});
test('Assignment resolves real Driver name, accepts chosen truck and rejects invalid drivers before mutation',()=>{
 const db={users:[{id:'A',name:'Driver A',role:'Driver',status:'Active',vehiclePlate:'TRUCK-A'},{id:'X',role:'Driver',status:'Inactive'}]};
 assert.deepEqual(handoff.assignment(db,{driverId:'A',driverName:'SPOOF'}),{driverId:'A',driverName:'Driver A',vehiclePlate:'TRUCK-A'});
 assert.equal(handoff.assignment(db,{driverId:'A',vehiclePlate:'CHOSEN'}).vehiclePlate,'CHOSEN');
 const before=JSON.stringify(db);assert.throws(()=>handoff.assignment(db,{driverId:'X'}));assert.throws(()=>handoff.assignment(db,{driverId:'missing'}));assert.equal(JSON.stringify(db),before);
});
test('Actual CS route persists dedicated phone and returns canonical values for the next queue',async()=>{
 const db={jobs:[base()]},path='/api/jobs/cs-confirm',a=server.indexOf(`    if (req.method === "POST" && pathname === "${path}")`),b=server.indexOf('\n    if (req.method ===',a+12);
 const c=vm.createContext({req:{method:'POST'},res:{},pathname:path,parseBody:async()=>({...payload,houseNumbers:['F001']}),readDb:()=>db,requireSessionRole:()=>({id:'CS',name:'CS'}),sendJson:(_r:unknown,status:number,body:unknown)=>({status,body}),nowIso:()=>new Date().toISOString(),csDispatch:handoff,writeDb:()=>{},normalizeJob:(j:unknown)=>j,logActivity:()=>{},saveBase64Files:()=>{}});
 const result=await vm.runInContext(`(async()=>{${server.slice(a,b)}})()`,c);assert.equal(result.status,200);assert.equal(result.body.jobs[0].csContactPhone,payload.contactPhone);assert.equal(result.body.jobs[0].invoiceNo,payload.invoiceNo);
});
test('Single-job actual route validates and persists all assignment fields before issuing',async()=>{
 const job={houseNumber:'F001',csConfirmed:true},db={users:[{id:'A',name:'Driver A',role:'Driver',vehiclePlate:'TRUCK-A'}]},path='/api/admin/job',a=server.indexOf(`    if (req.method === "POST" && pathname === "${path}")`),b=server.indexOf('\n    if (req.method ===',a+12);
 let saved:Record<string,unknown>={};const c=vm.createContext({req:{method:'POST'},res:{},pathname:path,db,parseBody:async()=>({driverId:'A',houseNumber:'F001'}),requireSessionRole:()=>({id:'TRANSPORT'}),csDispatch:handoff,upsertJob:(_db:unknown,p:Record<string,unknown>)=>{saved=p;return Object.assign(job,p);},nowIso:()=>new Date().toISOString(),createAlert:async()=>{},writeDb:()=>{},normalizeJob:(j:unknown)=>j,buildDashboard:()=>({}),sendJson:(_r:unknown,status:number,body:unknown)=>({status,body})});
 const r=await vm.runInContext(`(async()=>{${server.slice(a,b)}})()`,c);assert.equal(r.status,200);assert.equal(saved.driverName,'Driver A');assert.equal(saved.vehiclePlate,'TRUCK-A');
 assert.match(server,/driverName: payload.driverName \?\? job.driverName/);assert.match(server,/vehiclePlate: payload.vehiclePlate \?\? job.vehiclePlate/);
});
test('CS response adds jobs outside the bounded dashboard cache, keeps unrelated data, and queue sees them immediately',()=>{
 const c=vm.createContext({state:{dashboard:{jobs:[{houseNumber:'OLD',inboundReceipt:{CTN:1}}]}},operationalJobs:()=>c.state.dashboard.jobs});
 vm.runInContext(fn(front,'mergeCsConfirmedJobs')+'\n'+fn(front,'adminUnopenedJobs'),c);
 c.mergeCsConfirmedJobs([{houseNumber:'NEW',csConfirmed:true,csConfirmedAt:new Date().toISOString()}]);assert.equal(c.adminUnopenedJobs()[0].houseNumber,'NEW');assert.equal(c.state.dashboard.jobs[0].inboundReceipt.CTN,1);
 c.mergeCsConfirmedJobs([{houseNumber:'NEW',invoiceNo:'UPDATED'}]);assert.equal(c.state.dashboard.jobs.length,2);assert.equal(c.adminUnopenedJobs()[0].invoiceNo,'UPDATED');
});
test('Editable four-column rows retain each House CS details in Preview and Create payload',()=>{
 const one={...base(),...{csInvoiceNo:'SIM-INV1',csContactName:'SIM-CS1',csContactPhone:'SIM-TEL1'}},two={houseNumber:'F002',csInvoiceNo:'SIM-INV2',csContactName:'SIM-CS2',csContactPhone:'SIM-TEL2'};
 const c=vm.createContext({state:{dashboard:{jobs:[one,two]}},syncAdminPickupRowsText:()=>{},$:()=>({value:'4-column text'}),parsePickupLines:()=>[{houseNumber:'F001',carton:3},{houseNumber:'F002',carton:7}]});vm.runInContext(fn(front,'adminPickupRows'),c);
 const rows=c.adminPickupRows();assert.equal(rows[0].invoiceNo,'SIM-INV1');assert.equal(rows[1].invoiceNo,'SIM-INV2');assert.equal(rows[0].contact,'SIM-CS1');assert.equal(rows[1].tel,'SIM-TEL2');assert.equal(rows[0].carton,3);
 assert.match(front,/pickupItems: rows,\s+invoiceNo: rows\[0\]/);
});
test('Cargo renderer reads CS invoice and edited contact and phone, with escaped HTML',()=>{
 const c=vm.createContext({toDateInput:()=>''});vm.runInContext(fn(front,'jobCargoData')+'\n'+fn(front,'cargoSheetHtml'),c);
 const job={...base(),pickupItems:[],csInvoiceNo:'SIM-INV',csContactName:'<SIM>',csContactPhone:'SIM-PHONE'};const data=c.jobCargoData(job);assert.equal(data.invoiceNo,'SIM-INV');assert.equal(data.rows[0].invoiceNo,'SIM-INV');assert.equal(data.contact,'<SIM>');assert.equal(data.tel,'SIM-PHONE');assert.match(c.cargoSheetHtml(data),/&lt;SIM&gt;/);
});
test('Driver sees the real House Onhand Master CS details and selected truck without starting any route',()=>{
 const box={hidden:true,innerHTML:''};const c=vm.createContext({$:()=>box,escapeHtmlMobile:(v:unknown)=>String(v).replaceAll('<','&lt;')});vm.runInContext(fn(mobile,'renderDriverCsHandoff'),c);
 c.renderDriverCsHandoff([{...base(),...payload,csInvoiceNo:'SIM-INV',csContactName:'SIM Contact',csContactPhone:'SIM-PHONE',driverName:'A',vehiclePlate:'TRUCK-A'}]);for(const text of ['484001','F001','205-86393230','SIM-INV','SIM Contact','SIM-PHONE','TRUCK-A'])assert.ok(box.innerHTML.includes(text));assert.equal(box.hidden,false);
 c.renderDriverCsHandoff([]);assert.equal(box.hidden,true);
});
