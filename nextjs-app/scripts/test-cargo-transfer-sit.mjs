// Real HTTP tests against an isolated file-backed legacy API. Never connects to Production.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import net from 'node:net';
const require=createRequire(import.meta.url), root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.resolve(process.argv[2] || path.join(root,'storage/sit-ctf-proof'));
fs.mkdirSync(out,{recursive:true});
const dataDir=path.join(out,'isolated-db');fs.mkdirSync(dataDir,{recursive:true});
const dbFile=path.join(dataDir,'db.json');
if(fs.existsSync(dbFile))throw new Error('Use a fresh output directory; previous SIT evidence is preserved');
const receipts=require('../src/server/inbound-receipts.cjs'), quality=require('../src/server/warehouse-quality.cjs');
const users=[['transport','Team_Transport'],['billing','Billing'],['driver','Driver']].map(([id,role])=>({id:'SIT-local-'+id,name:'SIT '+role,code:'SIT-'+id,role,status:'Active'}));
const tokens=Object.fromEntries(users.map(u=>[u.role,crypto.randomBytes(32).toString('hex')]));
const db={users,customers:[{id:'SIT-customer',name:'SIT บริษัททดสอบคลังสินค้า'}],jobs:[],warehouseMaps:[{id:'sit-map',zones:[]}],authSessions:users.map(u=>({userId:u.id,tokenHash:crypto.createHash('sha256').update(tokens[u.role]).digest('hex'),expiresAt:'2099-01-01T00:00:00Z'})),meetingSafety:{enabled:true}};
function group(label,count) {
 const jobs=Array.from({length:count},(_,i)=>({id:crypto.randomUUID(),houseNumber:`SIT-CTF-20261123-${label}-${String(i+1).padStart(2,'0')}`,onhandNumber:`SIT-ONHAND-${label}-${i+1}`,mawbNumber:'SIT-189-05549401',icNumber:'SIT-BKK1208517',flightNo:'SIT001/23',customerId:'SIT-customer',customerName:'SIT บริษัททดสอบคลังสินค้า',destAirport:'TPE',packageCounts:{CTN:i+2,PLT:1},status:'Stored',csConfirmed:true,qaVerified:true,xrayStatus:'Passed',cargoTransferNote:'SIT ONLY — isolated HTTP fixture, no real cargo',productType:'General'}));
 db.jobs.push(...jobs);
 for(const job of jobs){
  receipts.receiveCounts(job,{counts:job.packageCounts,expectedRevision:0,requestId:'SIT-RECEIPT-'+job.houseNumber},'SIT-WH');
  quality.applyTag(job,quality.tagPlan(db,job,{id:'SIT-TAG',role:'WH_Staff'},{tagMode:'Single',expectedRevision:0},[{imageHash:'SIT-TAG-'+job.houseNumber,barcodes:[job.houseNumber]}],'2026-11-23T01:00:00Z'));
  job.qaApproval=quality.approvalPlan(db,job,{id:'SIT-QA',role:'QA_Inspector'},{expectedRevision:1},[{imageHash:'SIT-QA-'+job.houseNumber,barcodes:[job.houseNumber]}],'2026-11-23T01:05:00Z');
 }
 return jobs.map(j=>j.houseNumber);
}
const one=group('ONE',1),a=group('TRUCK-A',2),b=group('TRUCK-B',2),many=group('MANY',15),pending=group('CS-PENDING',1),missing=group('NO-PERMIT',1),partial=group('PARTIAL-RECEIPT',1);
db.jobs.find(j=>j.houseNumber===pending[0]).csConfirmed=false;
db.jobs.find(j=>j.houseNumber===partial[0]).inboundReceipt.counts.CTN=0;
fs.writeFileSync(dbFile,JSON.stringify(db));
const reservation=net.createServer();await new Promise(r=>reservation.listen(0,'127.0.0.1',r));const port=reservation.address().port;await new Promise(r=>reservation.close(r));
const env={...process.env,HOST:'127.0.0.1',PORT:String(port),DATA_DIR:dataDir,STORAGE_DIR:path.join(out,'isolated-storage'),SEED_BUNDLE_DB:'false'};
for(const key of Object.keys(env))if(/SUPABASE|WEBHOOK|CARTRACK|SCD_AUTH_PASSWORD|EMAIL_PROVIDER|RELATIONAL_MIRROR/i.test(key))delete env[key];
const log=fs.openSync(path.join(out,'server.log'),'a');let child;
const origin='http://127.0.0.1:'+port, results=[];
async function start(){child=spawn(process.execPath,[path.join(root,'src/server/legacy-api.cjs')],{cwd:root,env,stdio:['ignore',log,log],windowsHide:true});for(let i=0;i<60;i++){try{const r=await fetch(origin+'/api/bootstrap',{headers:{Authorization:'Bearer '+tokens.Billing,'x-scd-mobile-compact':'1'}});if(r.ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw new Error('SIT API did not start');}
async function stop(){if(child && child.exitCode===null){const done=new Promise(r=>child.once('exit',r));child.kill();await done;}}
async function call(name,route,body,expected=200,role='Team_Transport'){
 const r=await fetch(origin+route,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(role?{Authorization:'Bearer '+tokens[role]}:{}),'x-scd-mobile-compact':'1'},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const binary=r.headers.get('content-type')?.startsWith('application/pdf'),data=binary?Buffer.from(await r.arrayBuffer()):await r.json();
 results.push({name,expected,status:r.status,passed:r.status===expected,...(!binary&&data.error?{message:data.error}:{})});assert.equal(r.status,expected,name+': '+JSON.stringify(data));return data;
}
const png={base64:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',mimeType:'image/png',name:'SIT-only-permit.png'};
const issue=(houses,plate)=>({action:'issue',houses,transferDate:'2026-11-23',transferTime:'08:30',transferFrom:'WH3',transferTo:'TGINT',driverName:'SIT คนขับทดสอบ',vehiclePlate:plate,vehicleType:'6W',releaseBy:'SIT หัวหน้าคลัง',permitFiles:[png],note:'SIT fixture only; no actual cargo or signature'});
const save=(name,b)=>fs.writeFileSync(path.join(out,name),b);
try {
 await start();
 await call('CS pending rejected','/api/outbound/transfer-form',issue(pending,'SIT-X'),409);
 await call('missing permit rejected','/api/outbound/transfer-form',{...issue(missing,'SIT-X'),permitFiles:[]},422);
 await call('partial actual receipt rejected','/api/outbound/transfer-form',issue(partial,'SIT-X'),409);
 await call('unknown House rejected','/api/outbound/transfer-form',issue(['SIT-UNKNOWN'],'SIT-X'),404);
 for(const [houses,plate] of [[one,'SIT-ONE'],[a,'SIT-A'],[b,'SIT-B'],[many,'SIT-MANY']])await call('issue '+plate,'/api/outbound/transfer-form',issue(houses,plate));
 await call('duplicate issue rejected','/api/outbound/transfer-form',issue(one,'SIT-ONE'),409);
 const api='/api/outbound/transfer-form/pdf';
 save('01-single-before.pdf',await call('single House PDF',api,{houses:one},200,'Billing'));
 save('02-multi-house.pdf',await call('multiple Houses PDF',api,{houses:a},200,'Billing'));
 save('03-two-trucks-same-flight.pdf',await call('two trucks same Flight PDF',api,{houses:[...a,...b]},200,'Billing'));
 save('04-fifteen-houses.pdf',await call('15 Houses PDF',api,{houses:many},200,'Billing'));
 await call('partial document PDF rejected',api,{houses:many.slice(0,1)},409,'Billing');
 await call('unissued PDF rejected',api,{houses:missing},409,'Billing');
 await call('anonymous PDF rejected',api,{houses:one},401,null);
 await call('Driver PDF rejected',api,{houses:one},403,'Driver');
 const before=JSON.parse(fs.readFileSync(dbFile,'utf8')).jobs.find(j=>j.houseNumber===one[0]);
 const details={unloadBy:'SIT ผู้ลงสินค้า',tmoReceivedBy:'SIT ผู้รับ Terminal',whReleasedAt:'2026-11-23T08:30:00+07:00',driverTransferredAt:'2026-11-23T08:35:00+07:00',tmoReceivedAt:'2026-11-23T09:00:00+07:00',unloadStartedAt:'2026-11-23T09:05:00+07:00',unloadFinishedAt:'2026-11-23T09:20:00+07:00',damage:'no',issueCause:'',operationNote:'SIT ทดสอบบันทึกแล้วเปิดใหม่ ไม่มีการขนส่งจริง',supervisorContact:'SIT ไม่มีเบอร์จริง'};
 const recorded=await call('footer saved','/api/outbound/transfer-form',{action:'record',houses:one,expectedUpdatedAt:'',details});
 await call('stale footer rejected','/api/outbound/transfer-form',{action:'record',houses:one,expectedUpdatedAt:'',details},409);
 const revision=recorded.jobs[0].cargoTransferDetails.updatedAt;
 await call('invalid calendar rejected','/api/outbound/transfer-form',{action:'record',houses:one,expectedUpdatedAt:revision,details:{unloadStartedAt:'2026-02-30T09:00:00+07:00'}},422);
 await call('reverse unload time rejected','/api/outbound/transfer-form',{action:'record',houses:one,expectedUpdatedAt:revision,details:{unloadFinishedAt:'2026-11-23T08:00:00+07:00'}},422);
 await call('Driver footer rejected','/api/outbound/transfer-form',{action:'record',houses:one,expectedUpdatedAt:revision,details},403,'Driver');
 await stop();await start();
 const reopened=await call('reopen after server restart','/api/bootstrap',undefined,200,'Billing');
 const j=reopened.dashboard.jobs.find(j=>j.houseNumber===one[0]);
 assert.equal(j.cargoTransferDetails.tmoReceivedBy,details.tmoReceivedBy);assert.equal(j.cargoTransferDetails.damage,'no');assert.ok(j.cargoTransferDetailsHistory.length);assert.equal(j.cargoTransferDetails.updatedBy,'SIT-local-transport');assert.equal(j.status,before.status);assert.deepEqual(j.cargoTransferDocument,before.cargoTransferDocument);
 results.push({name:'persisted footer audit and original issue snapshot after restart',passed:true});
 save('05-single-reopened.pdf',await call('reopened saved footer PDF',api,{houses:one},200,'Billing'));
 save('persisted-jobs.json',JSON.stringify(reopened.dashboard.jobs,null,2));
 console.log('SIT HTTP checks passed: '+results.length+'; output '+out);
}finally{await stop();fs.closeSync(log);save('results.json',JSON.stringify({source:'isolated HTTP API; file-backed SIT database; no Production connection',at:new Date().toISOString(),results},null,2));}
