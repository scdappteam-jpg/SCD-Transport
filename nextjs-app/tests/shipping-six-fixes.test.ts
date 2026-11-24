import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const require=createRequire(import.meta.url);
const view=require('../src/server/shipping-presentation.cjs');
const quality=require('../src/server/warehouse-quality.cjs');
const pdf=require('../src/server/cargo-transfer-pdf.cjs');
const timing=require('../src/server/outbound-timing.cjs');
const invoice=require('../src/server/invoice-document.cjs');
const api=readFileSync(new URL('../src/server/legacy-api.cjs',import.meta.url),'utf8');
const escapeHtml=(v:unknown)=>String(v??'').replaceAll('<','&lt;');
test('one truck keeps all mixed CTN and PLT quantities across four Houses without adding unlike units',()=>{
 const jobs=[{packageCounts:{PLT:26,CTN:32}},{packageCounts:{CTN:12}},{packageCounts:{PLT:11,CTN:40}},{packageCounts:{PLT:1,CTN:3}}];
 assert.deepEqual(view.packageCounts(jobs),{PLT:38,CTN:87});assert.equal(view.quantity(jobs[0]),'26 PLT / 32 CTN');
});
test('CS confirmed-history API keeps Master Onhand House and units for the history filter',async()=>{
 const job={houseNumber:'4840812447',onhandNumber:'F842114317',mawbNumber:'189-05549401',packageCounts:{PLT:26,CTN:32},csConfirmed:true,csConfirmedAt:'2026-11-24T05:00:00Z'};
 const start=api.indexOf('    if (req.method === "GET" && pathname === "/api/jobs/cs-history")'),end=api.indexOf('    if (req.method === "GET" && pathname === "/api/jobs/pending-cs")',start);
 const ctx=vm.createContext({req:{method:'GET'},pathname:'/api/jobs/cs-history',res:{},readDb:()=>({jobs:[job]}),shippingPresentation:view,formatBangkok:(s:string)=>s,sendJson:(_r:unknown,status:number,body:unknown)=>({status,body})});
 const r=await vm.runInContext(`(async()=>{${api.slice(start,end)}})()`,ctx);assert.equal(r.status,200);assert.equal(r.body.jobs[0].mawbNumber,job.mawbNumber);assert.equal(r.body.jobs[0].onhandNumber,job.onhandNumber);assert.deepEqual({...r.body.jobs[0].packageCounts},job.packageCounts);
});
test('PDF derives QA from the approved matching revision and never trusts a stale raw qaVerified flag',()=>{
 const job={houseNumber:'SIT-QA',cargoTransferIssuedAt:'2026-11-24T05:00:00Z'};
 quality.applyTag(job,{mode:'Single',stickerColor:'Blue',revision:1,taggedBy:'tagger',tags:[{barcode:'SITQA',imageHash:'tag-image'}]});
 Object.assign(job,{qaApproval:{revision:1,approvedBy:'qa',tags:[{barcode:'SITQA',imageHash:'new-image'}]}});
 assert.equal(quality.approved(job),true);const db={jobs:[job]};const find=()=>job;
 assert.equal(pdf.select(db,['SIT-QA'],find)[0].rows[0].inspected,true);
 Object.assign(job,{qaVerified:true,qaApproval:{revision:0,approvedBy:'qa',tags:[{barcode:'SITQA'}]}});
 assert.equal(pdf.select(db,['SIT-QA'],find)[0].rows[0].inspected,false);
});
test('single and batch invoice documents retain both CTN and PLT rather than a primary pieceCount',()=>{
 const job={houseNumber:'SIT-1',packageCounts:{PLT:26,CTN:32},pieceCount:26};
 const html=invoice.render({id:'INV-SIT',amount:0},job,{}, {escapeHtml,formatBangkok:()=>''});assert.ok(html.includes('26 PLT / 32 CTN'));
 const source=api.match(/^function generateBatchInvoiceHtml\([\s\S]*?^}/m)![0];let output='';
 const ctx=vm.createContext({shippingPresentation:view,escapeHtml,formatBangkok:()=>'',path:{join:()=>''},INVOICE_DIR:'',fs:{writeFileSync:(_p:string,h:string)=>output=h},invoiceDocument:{register:()=>{}}});
 vm.runInContext(source,ctx);ctx.bill={id:'INV-SIT',tripCount:1,amount:0};ctx.jobs=[job];
 vm.runInContext('generateBatchInvoiceHtml({},bill,jobs,{})',ctx);assert.ok(output.includes('26 PLT / 32 CTN'));
});
test('legacy X-Ray records actual result time and retains an explicitly recorded start without inventing it',()=>{
 const at='2026-11-24T05:00:00Z';assert.deepEqual(timing.xray({}, {}, at),{xrayCompletedAt:at});
 assert.deepEqual(timing.xray({xrayStartedAt:'actual-start'}, {}, at),{xrayStartedAt:'actual-start',xrayCompletedAt:at});
 const again=timing.xray({xrayStatus:'Hold',xrayCompletedAt:'first-result',reXrayStartedAt:'repeat-start'}, {}, at);
 assert.deepEqual(again,{xrayCompletedAt:'first-result',reXrayStartedAt:'repeat-start',reXrayCompletedAt:at});
});
test('Master source-link review is read-only and only proposes exact Pickup HAWB matches in the selected Master',()=>{
 const db={jobs:[{source:'PickupReportXlsx',houseNumber:'F842114317',hawbNumber:'4840812447',pieceCount:26},{source:'GlobalConsolCSV',houseNumber:'4840812447',mawbNumber:'189-05549401',pieceCount:26,packageCounts:{PLT:26,CTN:32}},{source:'PickupReportXlsx',houseNumber:'F842114999',hawbNumber:'4840812999',pieceCount:2},{source:'GlobalConsolCSV',houseNumber:'4840812999',mawbNumber:'OTHER',pieceCount:2,packageCounts:{CTN:2}}]};
 const before=structuredClone(db);const rows=view.sourceLinks(db,'18905549401');assert.equal(rows.length,1);assert.equal(rows[0].onhand,'F842114317');assert.deepEqual(rows[0].source.units,{PLT:26,CTN:32});assert.deepEqual(db,before);assert.throws(()=>view.sourceLinks(db,''),/Master/);
});
test('SIT invoice UI explicitly marks test documents while actual billing accounts retain the original contract',()=>{
 const app=readFileSync(new URL('../public/legacy/app.js',import.meta.url),'utf8');
 const source=app.match(/^function billingSitOptions\([\s\S]*?^}/m)![0];
 for(const [id,testOnly] of [['sit-role-billing',true],['actual-billing',false]] as const){
  const ctx=vm.createContext({currentWebUser:()=>({id})});vm.runInContext(source,ctx);const opts=vm.runInContext('billingSitOptions()',ctx);assert.equal(opts.testOnly===true,testOnly);if(testOnly)assert.match(opts.billingAddress,/^SIT ONLY/);else assert.equal(Object.keys(opts).length,0);
 }
});

test('QA distinguishes scanner rate limits and scanner contract failures without exposing arbitrary gateway errors',()=>{
 const app=readFileSync(new URL('../public/legacy/app.js',import.meta.url),'utf8');
 const fn=app.match(/^function apiErrorMessage\([\s\S]*?^}/m)![0];const ctx=vm.createContext({});vm.runInContext(fn,ctx);
 const limited='บริการอ่านบาร์โค้ดจำกัดจำนวนคำขอชั่วคราว กรุณารอแล้วลองใหม่ ยังไม่อนุมัติ QA';
 ctx.message=limited;assert.equal(vm.runInContext('apiErrorMessage("/api/warehouse/quality/tag",503,{error:message},"")',ctx),limited);
 const contract='บริการสแกนยังไม่รองรับโหมด Barcode-only สำหรับ QA';ctx.message=contract;
 assert.equal(vm.runInContext('apiErrorMessage("/api/warehouse/quality/scan",503,{error:message},"")',ctx),contract);
 assert.doesNotMatch(vm.runInContext('apiErrorMessage("/api/warehouse/quality/tag",502,{error:"private stack"},"")',ctx),/private stack/);
});
