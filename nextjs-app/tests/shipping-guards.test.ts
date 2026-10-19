import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const require=createRequire(import.meta.url);
const guards=require('../src/server/shipping-guards.cjs');
const receipts=require('../src/server/inbound-receipts.cjs');
const source=readFileSync(new URL('../src/server/legacy-api.cjs',import.meta.url),'utf8');
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
type Job=Record<string,unknown> & {houseNumber:string;flightNo:string;status:string};
function fixture(): Job[] {
    return ['4840805485','4840805589','4840805590'].map((houseNumber,i)=>{
        const j:Job={houseNumber,onhandNumber:`F${i}`,mawbNumber:'205-86393230',flightNo:'NH850/20',status:'XRayPassed',csConfirmed:true,packageCounts:{CTN:[216,10,9][i]},aotApprovedAt:'approved',goodsLoadedAt:'loaded',terminalArrivedAt:'arrived',weighEndedAt:'weighed',terminalWeight:'12',terminalDimension:'10 x 20 x 30',xrayStatus:'Passed',requiresRescan:false};
        receipts.receiveCounts(j,{counts:j.packageCounts,expectedRevision:0,requestId:`shipping-fixture-${i}`},'test');return j;
    });
}
function route(jobs=fixture()) {
    const start=source.indexOf('    if (req.method === "POST" && pathname === "/api/outbound/load-bay")');
    const end=source.indexOf('    if (req.method === "POST" && pathname === "/api/billing/review-batch")',start);
    const db={jobs,attachments:[] as unknown[],alerts:[] as string[]},io={writes:0,files:0,logs:0};
    const ctx=vm.createContext({db,payload:{},pathname:'',req:{method:'POST'},res:{},shippingGuards:guards,parseBody:async()=>ctx.payload,requireSessionRole:()=>({id:'test'}),findJob:(d:typeof db,h:string)=>d.jobs.find(j=>j.houseNumber===h),sendJson:(_r:unknown,code:number,body:unknown)=>({code,body}),normalizeTerminal:()=> 'TG',TERMINAL_PROFILES:{TG:{}},normalizeJob:(j:Job)=>j,buildDashboard:()=>({}),nowIso:()=>new Date().toISOString(),writeDb:()=>io.writes++,logActivity:()=>io.logs++,saveBase64File:()=>{io.files++;db.attachments.push({});},createAlert:async()=>db.alerts.push('test')});
    vm.runInContext(`async function run(){${source.slice(start,end)}}`,ctx);
    return{db,io,call:async(name:string,p:Record<string,unknown>)=>{ctx.pathname=`/api/outbound/${name}`;ctx.payload={houseNumber:jobs[0].houseNumber,...p};return vm.runInContext('run()',ctx);}};
}
test('load requires CS and every receipt unit; arrival requires previous load',()=>{
    const j=fixture()[0];j.csConfirmed=false;assert.throws(()=>guards.load(j,{}),/CS/);
    j.csConfirmed=true;j.inboundReceipt={counts:{CTN:215},revision:2};assert.throws(()=>guards.load(j,{}),/ยอดรับ/);
    const complete=fixture()[0];delete complete.goodsLoadedAt;assert.throws(()=>guards.load(complete,{arrived:true}),/โหลดออก/);
});
test('XRay requires terminal arrival and complete measurements and rejects contradictory result flags',()=>{
    const j=fixture()[0];delete j.terminalArrivedAt;assert.throws(()=>guards.xray(j,{passed:true}),/Terminal/);
    j.terminalArrivedAt='arrived';j.terminalDimension=' ';assert.throws(()=>guards.xray(j,{passed:true}),/Dimension/);
    j.terminalDimension='1 x 2 x 3';assert.throws(()=>guards.xray(j,{passed:true,requiresRescan:true}),/พร้อมกัน/);
    assert.throws(()=>guards.xray(j,{passed:true,hold:true}),/พร้อมกัน/);
    assert.doesNotThrow(()=>guards.xray(j,{passed:true,requiresRescan:false}));
});
test('any active rescan or Hold in current Flight blocks all closing before evidence',()=>{
    for(const flags of [{requiresRescan:true},{status:'XRayHold'},{status:'ReXRayRequired'},{xrayStatus:'Hold'}]){
        const jobs=fixture();Object.assign(jobs[2],flags);const before=structuredClone(jobs);
        assert.throws(()=>guards.loading({jobs},jobs[0],{imageBase64:png,mimeType:'image/png'}),/X-Ray/);assert.deepEqual(jobs,before);
    }
});
test('closing requires a nonempty valid upload and validates every file',()=>{
    const jobs=fixture();for(const payload of [{},{imageBase64:' '},{imageBase64:'abcd',mimeType:'image/png'},{imageBase64:png,mimeType:'image/png',loadingImage2Base64:'bad',loadingImage2MimeType:'image/png'}]) assert.throws(()=>guards.loading({jobs},jobs[0],payload));
    assert.equal(guards.loading({jobs},jobs[0],{palletPhotos:[{base64:png,mimeType:'image/png'}]}).length,3);
});
test('four failed scenarios reject in actual routes without files logs writes or House mutation',async()=>{
    for(const name of ['cs','receipt','pending-xray','rescan','missing-file','second-file']){
        const f=route(),j=f.db.jobs[0];let endpoint='loading-detail',payload:Record<string,unknown>={imageBase64:png,mimeType:'image/png'};
        if(name==='cs'){j.csConfirmed=false;endpoint='load-bay';}
        if(name==='receipt'){delete j.inboundReceipt;endpoint='load-bay';}
        if(name==='pending-xray'){j.status='Pending';delete j.terminalArrivedAt;endpoint='xray';payload={passed:true};}
        if(name==='rescan')f.db.jobs[2].requiresRescan=true;
        if(name==='missing-file')payload={};
        if(name==='second-file')payload.loadingImage2Base64='bad';
        const before=structuredClone(f.db),result=await f.call(endpoint,payload);
        assert.ok([409,422].includes(result.code),name);assert.deepEqual(f.db,before,name);assert.deepEqual(f.io,{writes:0,files:0,logs:0},name);
    }
});
test('valid close changes only current Flight; references quantities and other Flights stay intact',async()=>{
    const f=route();f.db.jobs[0].flightNo='NH850/21';const before=structuredClone(f.db.jobs);
    const result=await f.call('loading-detail',{imageBase64:png,mimeType:'image/png'});
    assert.equal(result.code,200);assert.equal(f.db.jobs[0].status,'ReadyForBilling');assert.equal(f.io.files,1);assert.equal(f.io.writes,1);
    assert.deepEqual(f.db.jobs.slice(1),before.slice(1));for(const key of ['houseNumber','onhandNumber','mawbNumber','packageCounts','inboundReceipt','csConfirmed','flightNo'])assert.deepEqual(f.db.jobs[0][key],before[0][key]);
});
test('valid same-Flight close still closes all three, while repeated load preserves later status',async()=>{
    const f=route();let r=await f.call('load-bay',{arrived:false});assert.equal(r.body.idempotent,true);assert.equal(f.db.jobs[0].status,'XRayPassed');
    r=await f.call('loading-detail',{imageBase64:png,mimeType:'image/png'});assert.equal(r.code,200);assert.ok(f.db.jobs.every(j=>j.status==='ReadyForBilling'));
});
