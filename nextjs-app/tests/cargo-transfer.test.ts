import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const require=createRequire(import.meta.url);
const cargoTransfer=require('../src/server/cargo-transfer.cjs');
const receipts=require('../src/server/inbound-receipts.cjs');
const api=readFileSync(new URL('../src/server/legacy-api.cjs',import.meta.url),'utf8');
const front=readFileSync(new URL('../public/legacy/app.js',import.meta.url),'utf8');
const cut=(s:string,a:string,b:string)=>{const start=s.indexOf(a),end=s.indexOf(b,start);assert.ok(start>=0&&end>start);return s.slice(start,end);};
const png={base64:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',mimeType:'image/png'};
type Job=Record<string,unknown>&{houseNumber:string;status:string;flightNo:string};
function jobs():Job[]{return ['4840805485','4840805589','4840805590'].map((houseNumber,i)=>{
    const job:Job={houseNumber,onhandNumber:`F${842089695+i}`,mawbNumber:'205-86393230',flightNo:'NH850/20',status:'Stored',csConfirmed:true,packageCounts:{CTN:[216,10,9][i]},pieceCount:[216,10,9][i],productType:'General'};
    receipts.receiveCounts(job,{counts:job.packageCounts,expectedRevision:0,requestId:`transfer-fixture-${i}`},'test');return job;
});}
function request(){return{action:'issue',houses:jobs().map(j=>j.houseNumber),transferDate:'2026-10-19',transferTime:'14:00',transferFrom:'WH3',transferTo:'TG',driverName:'test-driver',vehiclePlate:'test-plate',vehicleType:'6W',releaseBy:'test-admin',permitFiles:[png]};}
function fixture(){
    const db={jobs:jobs(),attachments:[] as unknown[],logs:[] as unknown[]},io={writes:0,files:0};
    const ctx=vm.createContext({db,payload:{},req:{method:'POST'},res:{},pathname:'/api/outbound/transfer-form',cargoTransfer,parseBody:async()=>ctx.payload,requireSessionRole:()=>({id:'test'}),findJob:(d:typeof db,h:string)=>d.jobs.find(j=>j.houseNumber===h),sendJson:(_r:unknown,code:number,body:unknown)=>({code,body}),nowIso:()=> '2026-10-19T07:00:00.000Z',normalizeJob:(j:Job)=>j,buildDashboard:()=>({}),saveBase64File:(_d:unknown,p:unknown)=>{io.files++;db.attachments.push(p);},saveBase64Files:(_d:unknown,p:{files?:unknown[]})=>{for(const file of p.files||[]){io.files++;db.attachments.push(file);}},logActivity:(_d:unknown,p:unknown)=>db.logs.push(p),writeDb:()=>io.writes++});
    vm.runInContext(`async function run(){${cut(api,'    if (req.method === "POST" && pathname === "/api/outbound/transfer-form")','    if (req.method === "POST" && pathname === "/api/outbound/picking")')}}`,ctx);
    return{db,io,call:async(payload:Record<string,unknown>)=>{ctx.payload=payload;return vm.runInContext('run()',ctx);}};
}
async function rejectsWithoutMutation(f:ReturnType<typeof fixture>,p:Record<string,unknown>,code:number){const before=structuredClone(f.db),io={...f.io};const r=await f.call(p);assert.equal(r.code,code);assert.deepEqual(structuredClone(f.db),before);assert.deepEqual(f.io,io);return r;}

test('Cargo Transfer rejects CS pending and 2/3 actual receipt before any file or job mutation',async()=>{
    for(const kind of ['cs','missing','partial','unconfirmed','over']){
        const f=fixture(),j=f.db.jobs[2];
        if(kind==='cs')j.csConfirmed=false;
        if(kind==='missing')delete j.inboundReceipt;
        if(kind==='partial')j.inboundReceipt={counts:{CTN:8},revision:2,confirmedAt:'test',confirmedBy:'test'};
        if(kind==='unconfirmed')j.inboundReceipt={counts:{CTN:9}};
        if(kind==='over')j.inboundReceipt={counts:{CTN:10},revision:2,confirmedAt:'test',confirmedBy:'test'};
        await rejectsWithoutMutation(f,request(),409);
    }
});
test('Cargo Transfer validates all selected Houses and rejects unknown without partial issue',async()=>{
    const f=fixture();await rejectsWithoutMutation(f,{...request(),houses:[f.db.jobs[0].houseNumber,'UNKNOWN']},404);
    for(const houses of [[],[''],[null],'4840805485'])await rejectsWithoutMutation(f,{...request(),houses},422);
});
test('Cargo Transfer requires real permit contents and validates every attachment before writes',async()=>{
    for(const permitFiles of [[],[{}],[png,{}],[{base64:'abcd',mimeType:'image/png'}],[{...png,mimeType:'application/pdf'}],[{base64:'!@#$',mimeType:'image/png'}]]) await rejectsWithoutMutation(fixture(),{...request(),permitFiles},422);
});
test('Cargo Transfer Lithium documents required for flag or product and validated before writes',async()=>{
    for(const key of ['requiresLithiumDocs','productType']){
        const f=fixture();f.db.jobs[2][key]=key==='productType'?'Lithium battery':true;
        await rejectsWithoutMutation(f,request(),422);await rejectsWithoutMutation(f,{...request(),lithiumFiles:[{}]},422);
        const r=await f.call({...request(),lithiumFiles:[png]});assert.equal(r.code,200);
    }
});
test('Cargo Transfer rejects return before issue and return with missing or invalid evidence',async()=>{
    let f=fixture();await rejectsWithoutMutation(f,{action:'return',houses:request().houses,imageBase64:png.base64,mimeType:png.mimeType},409);
    f=fixture();await f.call(request());
    for(const payload of [{},{imageBase64:' '},{imageBase64:'abcd',mimeType:'image/png'}])await rejectsWithoutMutation(f,{action:'return',houses:request().houses,...payload},422);
});
test('Cargo Transfer rejects unsupported or missing action without mutation',async()=>{
    for(const action of ['TYPO','',undefined])await rejectsWithoutMutation(fixture(),{...request(),action},422);
});
test('Cargo Transfer requires dispatch metadata and valid calendar date time and Terminal',async()=>{
    const p=request();for(const key of ['transferDate','transferTime','transferFrom','transferTo','driverName','vehiclePlate','vehicleType','releaseBy'])await rejectsWithoutMutation(fixture(),{...p,[key]:' '},422);
    for(const data of [{transferDate:'2026-02-30'},{transferTime:'24:10'},{transferTo:'ATL'}])await rejectsWithoutMutation(fixture(),{...p,...data},422);
});
test('Cargo Transfer 3/3 issue and return preserve references latest Flight receipts CS and status',async()=>{
    const f=fixture();f.db.jobs[0].flightNo='NH851/21';const before=structuredClone(f.db.jobs);
    const r=await f.call(request());assert.equal(r.code,200);assert.equal(f.io.writes,1);assert.equal(f.io.files,3);assert.equal(f.db.logs.length,3);
    for(const [i,j] of f.db.jobs.entries()){
        assert.ok(j.cargoTransferIssuedAt);assert.equal(j.aotDriverName,'test-driver');assert.equal(j.aotVehiclePlate,'test-plate');assert.equal(j.cargoTransferPermitAttached,true);assert.deepEqual(Array.from(j.cargoTransferGroup as string[]),request().houses);
        for(const key of ['houseNumber','mawbNumber','onhandNumber','flightNo','packageCounts','csConfirmed','inboundReceipt','status'])assert.deepEqual(j[key],before[i][key]);
    }
    const returned=await f.call({action:'return',houses:request().houses,imageBase64:png.base64,mimeType:png.mimeType});assert.equal(returned.code,200);assert.equal(f.io.files,6);assert.ok(f.db.jobs.every(j=>j.cargoTransferReturnedAt));
});
test('Cargo Transfer may issue only selected ready Houses without moving outstanding House',async()=>{
    const f=fixture();delete f.db.jobs[2].inboundReceipt;const outstanding=structuredClone(f.db.jobs[2]);
    const r=await f.call({...request(),houses:request().houses.slice(0,2)});assert.equal(r.code,200);assert.deepEqual(f.db.jobs[2],outstanding);assert.equal(f.io.files,2);
});
test('Cargo Transfer preview includes House Onhand Master separate latest Flight planned units and escapes text',()=>{
    const rows=jobs();rows[0].flightNo='NH851/21';rows[0].customerName='<script>alert(1)</script>';rows[1].packageCounts={CTN:10,PLT:2};
    const fields:Record<string,{value:string}>={'#transferHouseList':{value:rows.map(j=>j.houseNumber).join('\n')},'#terminalHouse':{value:rows[0].houseNumber}};
    const ctx=vm.createContext({state:{dashboard:{jobs:rows}},$: (id:string)=>fields[id],InboundReceipts:receipts});
    vm.runInContext(cut(front,'function normalizeHouseBarcode(','function money(')+cut(front,'function jobPackingLabel(','let receiptJobs =')+cut(front,'function safeHtml(','function alertActionItems(')+cut(front,'function transferHouseNumbers(','function renderTransferPreview('),ctx);
    const html=vm.runInContext('transferSheetHtml()',ctx);
    assert.ok(html.includes('<th>Master</th><th>Flight</th>'));assert.ok(html.includes('205-86393230'));assert.ok(html.includes('NH851/21'));assert.ok(html.includes('10 CTN / 2 PLT'));assert.ok(!html.includes('<script>'));assert.ok(rows.every(j=>html.includes(j.houseNumber)&&html.includes(j.onhandNumber as string)));
    fields['#transferHouseList'].value+='\nUNKNOWN';assert.ok(vm.runInContext('transferSheetHtml()',ctx).includes('ไม่พบ House'));
    assert.throws(()=>vm.runInContext('validateTransferSelection("issue")',ctx),/ไม่พบ House/);
    fields['#transferHouseList'].value=rows[0].houseNumber;rows[0].csConfirmed=false;assert.throws(()=>vm.runInContext('validateTransferSelection("issue")',ctx),/CS/);
    assert.throws(()=>vm.runInContext('validateTransferSelection("return")',ctx),/ยังไม่ออก/);
});
