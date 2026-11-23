import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const require=createRequire(import.meta.url);
const pdf=require('../src/server/cargo-transfer-pdf.cjs');
const ctf=require('../public/legacy/ctf-core/index.js');
type Job=Record<string,unknown>&{houseNumber:string};
function fixture(count=1,plate='SIT-A'):Job[]{
 const jobs:Job[]=Array.from({length:count},(_,i)=>({houseNumber:`SIT-CTF-${plate}-${String(i+1).padStart(3,'0')}`,icNumber:'BKK-SIT',customerName:'SIT ทดสอบเอกสาร',mawbNumber:'SIT-MASTER',flightNo:'SIT001/23',destAirport:'TPE',packageCounts:{CTN:i+1,PLT:1},qaVerified:true,xrayStatus:'Passed',cargoTransferPermitAttached:true}));
 const payload={transferDate:'2026-11-23',transferTime:'08:00',transferFrom:'WH3',transferTo:'TGINT',driverName:'SIT คนขับ',vehiclePlate:plate,vehicleType:'6W',releaseBy:'SIT คลัง'};
 const snapshot=ctf.snapshot(jobs,payload,'2026-11-23T01:00:00Z','SIT-admin');
 jobs.forEach(j=>Object.assign(j,{cargoTransferIssuedAt:snapshot.issuedAt,cargoTransferDocument:snapshot,cargoTransferGroup:jobs.map(j=>j.houseNumber)}));return jobs;
}
const find=(db:{jobs:Job[]},h:string)=>db.jobs.find(j=>j.houseNumber===h);
const pageCount=(b:Buffer)=>(b.toString('latin1').match(/\/Type \/Page\b/g)||[]).length;
test('SIT PDF is a single A4 document with embedded Thai font and leaves source jobs unchanged',async()=>{
 const jobs=fixture(1),before=structuredClone(jobs),models=pdf.select({jobs},jobs.map(j=>j.houseNumber),find);
 const bytes=await pdf.render(models);assert.ok(bytes.subarray(0,5).equals(Buffer.from('%PDF-')));assert.equal(pageCount(bytes),1);assert.ok(bytes.includes(Buffer.from('/FontFile2')));assert.ok(bytes.includes(Buffer.from('/MediaBox [0 0 595.28 841.89]')));assert.deepEqual(jobs,before);
});
test('SIT 15 Houses paginate as two pages without dropping a House',async()=>{
 const jobs=fixture(15);const models=pdf.select({jobs},jobs.map(j=>j.houseNumber),find);
 assert.equal(models[0].rows.length,15);assert.equal(pageCount(await pdf.render(models)),2);
});
test('SIT two vehicles on one Flight remain two documents and two PDF pages',async()=>{
 const jobs=[...fixture(2,'SIT-A'),...fixture(2,'SIT-B')];const models=pdf.select({jobs},jobs.map(j=>j.houseNumber),find);
 assert.equal(models.length,2);assert.deepEqual(models.map((m:{plate:string})=>m.plate),['SIT-A','SIT-B']);assert.equal(pageCount(await pdf.render(models)),2);
});
test('PDF rejects unknown unissued invalid and partial selections before rendering',()=>{
 const jobs=fixture(2),db={jobs};
 for(const houses of [[],[''],[null],'SIT-01'])assert.throws(()=>pdf.select(db,houses,find),/House/);
 assert.throws(()=>pdf.select(db,['UNKNOWN'],find),/ไม่พบ/);assert.throws(()=>pdf.select(db,[jobs[0].houseNumber],find),/ให้ครบ/);
 delete jobs[0].cargoTransferIssuedAt;assert.throws(()=>pdf.select(db,jobs.map(j=>j.houseNumber),find),/ต้องออกใบ/);
});
test('PDF handles long notes with measured pagination and rejects content that cannot fit without clipping',async()=>{
 const jobs=fixture(15);jobs.forEach(j=>j.cargoTransferDetails={operationNote:'SIT note '.repeat(50)});
 const bytes=await pdf.render(pdf.select({jobs},jobs.map(j=>j.houseNumber),find));assert.ok(pageCount(bytes)>=2);
 jobs.forEach(j=>j.cargoTransferDetails={operationNote:'SIT note '.repeat(4000)});
 await assert.rejects(()=>pdf.render(pdf.select({jobs},jobs.map(j=>j.houseNumber),find)),/ยาวเกิน/);
});
test('PDF API allows Billing, rejects Driver and unauthenticated requests, and never writes database',async()=>{
 const api=readFileSync(new URL('../src/server/legacy-api.cjs',import.meta.url),'utf8');const start=api.indexOf('    if (req.method === "POST" && pathname === "/api/outbound/transfer-form/pdf")'),end=api.indexOf('    if (req.method === "POST" && pathname === "/api/outbound/transfer-form")',start);
 assert.ok(start>0&&end>start);
 for(const role of [null,'Driver','Billing']){
  const jobs=fixture(),db={jobs},before=structuredClone(db);let status=0,body:unknown,headers:unknown;
  const ctx=vm.createContext({req:{method:'POST'},pathname:'/api/outbound/transfer-form/pdf',db,cargoTransferPdf:pdf,parseBody:async()=>({houses:jobs.map(j=>j.houseNumber)}),requireSessionRole:(_d:unknown,_r:unknown,roles:string[])=>role&&roles.includes(role)?{id:'SIT',role}:null,findJob:find,res:{writeHead:(code:number,h:unknown)=>{status=code;headers=h;},end:(b:unknown)=>{body=b;}},sendJson:(_r:unknown,code:number,b:unknown)=>{status=code;body=b;}});
  await vm.runInContext(`(async()=>{${api.slice(start,end)}})()`,ctx);
  assert.equal(status,role==='Billing'?200:403);assert.deepEqual(db,before);
  if(role==='Billing'){assert.ok(Buffer.isBuffer(body));assert.equal((headers as Record<string,string>)['Content-Type'],'application/pdf');assert.equal((headers as Record<string,string>)['Cache-Control'],'private, no-store');}
 }
});
