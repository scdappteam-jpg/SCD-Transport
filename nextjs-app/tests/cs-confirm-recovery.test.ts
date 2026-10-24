import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../public/legacy/app.js',import.meta.url),'utf8');
const payload={houseNumbers:['H1','H2'],invoiceNo:'INV-TEST'};
const rows=()=>payload.houseNumbers.map(houseNumber=>({houseNumber,csInvoiceNo:'INV-TEST',csConfirmedAt:new Date().toISOString()}));
function fixture(responses: Array<Response|Error>){
 const calls: string[]=[]; const c=vm.createContext({Date,JSON,Error,Map,Set,fetch:async(path:string)=>{calls.push(path);const r=responses.shift();if(r instanceof Error)throw r;if(!r)throw new Error('Unexpected request');return r;},apiUrl:(s:string)=>s});
 for(const name of ['apiErrorMessage','parseApiResponse','requestCsConfirmation']){
  const pattern=new RegExp(`^(?:async )?function ${name}\\([\\s\\S]*?^}`,'m');vm.runInContext(source.match(pattern)![0],c);
 }
 return {c,calls,run:()=>c.requestCsConfirmation(payload)};
}
const json=(body:unknown,status=200)=>Response.json(body,{status});
test('CS confirmation returns saved results without an extra request',async()=>{const f=fixture([json({ok:true,confirmed:2,jobs:rows()})]);assert.equal((await f.run()).confirmed,2);assert.deepEqual(f.calls,['/api/jobs/cs-confirm']);});
test('CS recovers all Houses after a gateway failure without repeating approval',async()=>{const f=fixture([new Response('<html>Bad Gateway</html>',{status:502}),json({jobs:rows()})]);const r=await f.run();assert.equal(r.recovered,true);assert.ok(r.jobs.every((j:Record<string,unknown>)=>j.csConfirmed));assert.deepEqual(f.calls,['/api/jobs/cs-confirm','/api/jobs/cs-history']);});
test('CS recovers network failure only when the complete matching invoice was saved',async()=>{const f=fixture([new Error('Failed to fetch'),json({jobs:rows()})]);assert.equal((await f.run()).recovered,true);});
for(const [name,history] of [['partial',rows().slice(0,1)],['different invoice',rows().map(r=>({...r,csInvoiceNo:'OTHER'}))],['old confirmation',rows().map(r=>({...r,csConfirmedAt:'2026-01-01T00:00:00Z'}))]]){
 test(`CS does not report success for ${name}`,async()=>{const f=fixture([new Error('Failed to fetch'),json({jobs:history})]);await assert.rejects(f.run(),/ประวัติ/);assert.equal(f.calls.length,2);});
}
test('CS authorization error stays actionable when history also fails',async()=>{const f=fixture([json({error:'forbidden'},403),json({error:'forbidden'},403)]);await assert.rejects(f.run(),/เข้าสู่ระบบใหม่/);});
test('A reservation or refresh failure after approval does not report failed approval, and cache retains receipt fields',async()=>{
 const f=fixture([]),messages:string[]=[],button={disabled:false};const job={houseNumber:'H1',inboundReceipt:{CTN:1},mawbNumber:'M1'};
 const group={querySelectorAll:()=>[{value:'H1'}],querySelector:()=>button};
 Object.assign(f.c,{document:{querySelector:()=>group,getElementById:(id:string)=>id.startsWith('csInvoice')?{value:'INV-TEST'}:null},currentWebUser:()=>({name:'CS'}),filesToCompressedBase64:async()=>[],requestCsConfirmation:async()=>({ok:true,confirmed:1,jobs:[{houseNumber:'H1',csConfirmed:true}],recovered:true}),toast:(s:string)=>messages.push(s),state:{dashboard:{jobs:[job]}},mergeCsConfirmedJobs: (jobs: {houseNumber:string}[])=>{for(const updated of jobs){const old=f.c.state.dashboard.jobs.find((j:{houseNumber:string})=>j.houseNumber===updated.houseNumber);Object.assign(old,updated);}},renderAdminApprovedQueue:()=>{},renderAdminWorkQueue:()=>{},renderCsQueue:async()=>{throw new Error('refresh failed');},openWarehouseReservationModal:async()=>{},_csHistoryData:[]});
 vm.runInContext('const csConfirmInFlight=new Set();'+source.match(/^async function submitCsConfirm\([\s\S]*?^}/m)![0],f.c);
 await f.c.submitCsConfirm('GROUP');assert.equal(button.disabled,false);assert.equal(f.c.state.dashboard.jobs[0].mawbNumber,'M1');assert.ok(messages.some(s=>s.includes('ยืนยันงานสำเร็จแล้ว')));assert.ok(!messages.includes('เกิดข้อผิดพลาด'));
});
