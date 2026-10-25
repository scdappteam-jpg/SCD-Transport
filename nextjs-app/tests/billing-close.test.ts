import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const require=createRequire(import.meta.url);
const billingClose=require('../src/server/billing-close.cjs');
const api=readFileSync(new URL('../src/server/legacy-api.cjs',import.meta.url),'utf8');
const start=api.indexOf('    if (req.method === "POST" && pathname === "/api/billing/mark-billed")');
const handler=api.slice(start,api.indexOf('    if (req.method === "POST" && pathname === "/api/customers/upsert")',start));
const INV='INV-SIT',H='SIT-HOUSE',FIRST='2026-10-25T09:41:58.744Z';
function route(status='Draft',role='Billing',refresh=false){
 const db={billing:[{id:INV,houseNumber:H,status,billedDate:status==='Billed'?FIRST:undefined,amount:1000,dueDate:'2026-10-25'}],jobs:[{houseNumber:H,status:status==='Billed'?'Billed':'InvoiceDrafted',readyForBilling:status!=='Billed'}]};
 let writes=0,alerts=0,clock=0,loads=0;
 const ctx=vm.createContext({db,billingClose,req:{method:'POST'},res:{},pathname:'/api/billing/mark-billed',parseBody:async()=>({invoiceId:INV}),sessionUser:()=>({id:'SIT',role}),sendJson:(_r:unknown,status:number,body:unknown)=>({status,body}),supabaseEnabled:()=>refresh,loadDbFromSupabase:async()=>{loads++;db.billing[0].status='Billed';db.billing[0].billedDate=FIRST;},readDb:()=>db,findJob:(d:typeof db,h:string)=>d.jobs.find(j=>j.houseNumber===h),nowIso:()=>{clock++;return '2026-10-25T10:00:00Z';},createAlert:async()=>{alerts++;},writeDb:()=>{writes++;},buildDashboard:()=>({})});
 vm.runInContext(api.match(/^function requireBillingActor\([\s\S]*?^}/m)![0],ctx);
 return {db,run:()=>vm.runInContext('(async()=>{'+handler+'})()',ctx),stats:()=>({writes,alerts,clock,loads})};
}
test('first close updates invoice and jobs once without changing amount',async()=>{const r=route();assert.equal((await r.run()).status,200);assert.equal(r.db.billing[0].amount,1000);assert.equal(r.db.jobs[0].readyForBilling,false);assert.deepEqual(r.stats(),{writes:1,alerts:1,clock:1,loads:0});});
test('sequential repeated close preserves original bill and job with no write/alert/clock',async()=>{const r=route('Billed');const before=JSON.stringify(r.db);for(let n=0;n<2;n++)assert.equal((await r.run()).status,200);assert.equal(JSON.stringify(r.db),before);assert.deepEqual(r.stats(),{writes:0,alerts:0,clock:0,loads:0});});
test('Driver cannot close even an existing Billed invoice',async()=>{const r=route('Billed','Driver');assert.equal((await r.run()).status,403);assert.equal(r.stats().writes,0);});
test('warm Draft refreshes the stored Billed result before deciding to write',async()=>{const r=route('Draft','Billing',true);assert.equal((await r.run()).status,200);assert.equal(r.db.billing[0].billedDate,FIRST);assert.deepEqual(r.stats(),{writes:0,alerts:0,clock:0,loads:1});});
test('old Billed invoice without a timestamp is not assigned a fabricated close time',async()=>{const r=route('Billed');r.db.billing[0].billedDate=undefined;await r.run();assert.equal(r.db.billing[0].billedDate,undefined);assert.equal(r.stats().writes,0);});
test('an already closed worker does not reload a pending remote Draft',async()=>{const r=route('Billed','Billing',true);await r.run();assert.equal(r.db.billing[0].billedDate,FIRST);assert.deepEqual(r.stats(),{writes:0,alerts:0,clock:0,loads:0});});

const source=readFileSync(new URL('../public/legacy/app.js',import.meta.url),'utf8');
const helper=source.slice(source.indexOf('function confirmBillingClose('),source.indexOf('function updateBillingCloseButton('));
function dialog(status='Draft'){
 type E={textContent:string;hidden:boolean;disabled:boolean;handlers:Record<string,(event?:unknown)=>void>;addEventListener:(n:string,f:(event?:unknown)=>void)=>void;focus:()=>void};
 const nodes:Record<string,E>={};for(const k of ['h2','p','[data-close-cancel]','[data-close-confirm]'])nodes[k]={textContent:'',hidden:false,disabled:false,handlers:{},addEventListener(n,f){this.handlers[n]=f;},focus(){}};
 let removed=false,opened=false;const handlers:Record<string,(event?:unknown)=>void>={};
 const d={className:'',innerHTML:'',setAttribute(){},querySelector:(k:string)=>nodes[k],addEventListener:(n:string,f:(event?:unknown)=>void)=>{handlers[n]=f;},showModal:()=>{opened=true;},close(){handlers.close?.();},remove(){removed=true;}};
 const c=vm.createContext({document:{createElement:()=>d,body:{append(){}}},Date});vm.runInContext(helper,c);
 return {promise:c.confirmBillingClose({id:INV,status,billedDate:FIRST}),nodes,handlers,state:()=>({removed,opened})};
}
test('HTML confirmation confirms a Draft without a blocking window.confirm',async()=>{const d=dialog();assert.equal(d.state().opened,true);d.nodes['[data-close-confirm]'].handlers.click();assert.equal(await d.promise,true);assert.equal(d.state().removed,true);});
test('Cancel exits without submitting',async()=>{const d=dialog();d.nodes['[data-close-cancel]'].handlers.click();assert.equal(await d.promise,false);});
test('Escape cancels and removes the dialog',async()=>{const d=dialog();let prevented=false;d.handlers.cancel({preventDefault(){prevented=true;}});assert.equal(await d.promise,false);assert.equal(prevented,true);assert.equal(d.state().removed,true);});
test('Billed status dialog cannot confirm a second close and shows original date',async()=>{const d=dialog('Billed');assert.equal(d.nodes['[data-close-confirm]'].hidden,true);assert.equal(d.nodes['[data-close-confirm]'].disabled,true);assert.match(d.nodes.p.textContent,/ไม่ปิดซ้ำ/);d.nodes['[data-close-confirm]'].handlers.click();d.nodes['[data-close-cancel]'].handlers.click();assert.equal(await d.promise,false);});
