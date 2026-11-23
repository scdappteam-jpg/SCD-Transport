// Isolated HTTP rehearsal only. Never reads production credentials or sends email.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import readline from 'node:readline/promises';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.resolve(process.argv[2]),interactive=process.argv.includes('--interactive'),baseline=process.argv.includes('--baseline');
const build=process.env.SCD_CTF_NEXT_BUILD,config=path.join(root,'next.config.ts'),before=fs.readFileSync(config,'utf8');
if(build&&(!/^[.A-Za-z0-9_-]+$/.test(build)||!fs.existsSync(path.join(root,build,'BUILD_ID'))))throw Error('Invalid Next build');
fs.mkdirSync(out,{recursive:true});const dataDir=path.join(out,'isolated-db'),storage=path.join(out,'isolated-storage');fs.mkdirSync(dataDir,{recursive:true});
const dbFile=path.join(dataDir,'db.json');if(fs.existsSync(dbFile))throw Error('Use fresh evidence directory');
const roles=['Admin','Team_Transport','WH_Staff','Terminal','Billing'];
const users=roles.map((role,i)=>{const salt=crypto.randomBytes(16);return{id:'sit-role-'+role.toLowerCase(),code:'SIT'+String(i+1).padStart(3,'0'),name:'SIT '+role,role,status:'Active',passwordHash:'scrypt$'+salt.toString('base64')+'$'+crypto.scryptSync('123321',salt,64).toString('base64')};});
const db={users,customers:[{id:'sit-customer',name:'SIT ONLY Customer',address:'SIT ONLY no physical address',billingEmail:'',creditTerm:0}],jobs:[],warehouseMaps:[{id:'sit-map',zones:[]}],meetingSafety:{enabled:true},attachments:[],billing:[]};
const receipts=require('../src/server/inbound-receipts.cjs'),quality=require('../src/server/warehouse-quality.cjs');
const houses=[1,2,3].map(i=>'SIT-TB-20261123-0'+i),master='999-00001123';
for(const [i,houseNumber] of houses.entries()){
 const j={id:crypto.randomUUID(),houseNumber,mawbNumber:master,flightNo:'SIT001/23',customerId:'sit-customer',customerName:'SIT ONLY Customer',onhandNumber:'SIT-ONHAND-'+(i+1),icNumber:'SIT-IC',destAirport:'TPE',packageCounts:{CTN:i+1},status:'EIApproved',csConfirmed:true,approvalStatus:'CSApproved',workDate:'2026-11-23',pickupDate:'2026-11-23',planRound:'08:00',qaVerified:true,productType:'General',eiApproved:true,eiApprovedAt:'2026-11-23T01:00:00Z',outboundPickedAt:'2026-11-23T01:00:00Z',transportRoundId:i<2?'SIT-ROUND-A':'SIT-ROUND-B',amount:0,evidenceNote:'SIT ONLY simulated upstream fixture'};
 db.jobs.push(j);receipts.receiveCounts(j,{counts:j.packageCounts,expectedRevision:0,requestId:'SIT-RECEIPT-'+i},'SIT-WH');
 quality.applyTag(j,quality.tagPlan(db,j,{id:'SIT-TAG',role:'WH_Staff'},{tagMode:'Single',expectedRevision:0},[{imageHash:'SIT-TAG-'+i,barcodes:[houseNumber]}],'2026-11-23T01:00:00Z'));
 j.qaApproval=quality.approvalPlan(db,j,{id:'SIT-QA',role:'QA_Inspector'},{expectedRevision:1},[{imageHash:'SIT-QA-'+i,barcodes:[houseNumber]}],'2026-11-23T01:05:00Z');
}
fs.writeFileSync(dbFile,JSON.stringify(db));
const reserve=net.createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));const port=reserve.address().port;await new Promise(r=>reserve.close(r));const origin='http://127.0.0.1:'+port;
const env={...process.env,HOST:'127.0.0.1',PORT:String(port),DATA_DIR:dataDir,STORAGE_DIR:storage,SEED_BUNDLE_DB:'false'};
for(const key of Object.keys(env))if(/SUPABASE|WEBHOOK|CARTRACK|SCD_AUTH_PASSWORD|EMAIL_PROVIDER|RELATIONAL_MIRROR/i.test(key))delete env[key];
const png={base64:fs.readFileSync(path.join(root,'tests/fixtures/sit-terminal-evidence.png')).toString('base64'),mimeType:'image/png',name:'SIT-ONLY-simulated-evidence.png'},image={imageBase64:png.base64,mimeType:png.mimeType};
const results=[],stages=[],tokens={},bugs=[];let child,bill;
const log=fs.openSync(path.join(out,'server.log'),'a'),rl=interactive?readline.createInterface({input:process.stdin,output:process.stdout}):null;
const save=(name,obj)=>fs.writeFileSync(path.join(out,name),typeof obj==='string'||Buffer.isBuffer(obj)?obj:JSON.stringify(obj,null,2));
const state=()=>JSON.parse(fs.readFileSync(dbFile,'utf8'));
async function start(){if(build)fs.writeFileSync(config,before.replace('const nextConfig: NextConfig = {',`const nextConfig: NextConfig = {\n  distDir: "${build}",`));child=spawn(process.execPath,build?[path.join(root,'node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port',String(port)]:[path.join(root,'src/server/legacy-api.cjs')],{cwd:root,env,stdio:['ignore',log,log],windowsHide:true});for(let i=0;i<150;i++){try{if((await fetch(origin+'/api/auth/users')).ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw Error('Server did not start');}
async function stop(){if(child&&child.exitCode===null){const exit=new Promise(r=>child.once('exit',r));child.kill();await exit;}}
async function call(name,route,body,role='Terminal',expected=200){const r=await fetch(origin+route,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(tokens[role]?{Authorization:'Bearer '+tokens[role]}:{}),'x-scd-mobile-compact':'1'},...(body===undefined?{}:{body:JSON.stringify(body)})});const type=r.headers.get('content-type')||'',data=type.includes('application/pdf')?Buffer.from(await r.arrayBuffer()):type.includes('json')?await r.json():await r.text();results.push({name,route,role,status:r.status,expected,passed:r.status===expected,...(data?.error?{error:data.error}:{})});assert.equal(r.status,expected,name+': '+JSON.stringify(data));return data;}
async function stage(name){const s=state();const entry={step:stages.length,name,at:new Date().toISOString(),jobs:s.jobs.map(j=>({houseNumber:j.houseNumber,status:j.status,transportRoundId:j.transportRoundId,terminalWeight:j.terminalWeight,xrayStatus:j.xrayStatus,requiresRescan:j.requiresRescan,loadingDetailUploaded:j.loadingDetailUploaded,readyForBilling:j.readyForBilling,invoiceId:j.invoiceId})),billing:s.billing};stages.push(entry);save('stages.json',stages);save('results.json',{source:build?'isolated compiled Next production server':'isolated legacy HTTP server',master,houses,results,bugs});console.log('STAGE '+entry.step+' '+name);if(rl)await rl.question('Capture actual UI, then Enter to continue: ');}
const each=async(name,endpoint,body,role='Terminal')=>{for(const h of houses)await call(name+' '+h,endpoint,{houseNumber:h,...body},role);};
const loading={houseNumber:houses[0],master,flightNo:'SIT001/23',expectedHouses:houses,...image,loadingImage2Base64:png.base64,loadingImage2MimeType:png.mimeType,palletPhotos:[png],trayNumber:'SIT-TRAY',loadingDetailCount:2,note:'SIT ONLY'};
try{
 await start();save('harness.json',{origin,master,houses,users:users.map(({code,role})=>({code,role})),source:'Isolated SIT; upstream receipt and QA seeded, not camera-tested'});
 for(const u of users){const r=await call('Real password login '+u.role,'/api/auth/login',{userId:u.id,password:'123321'},u.role);tokens[u.role]=r.token||r.session?.token;assert.ok(tokens[u.role],'login token');}
 const checklist=['outbound_weighing_slip','security_original','airline_specific','permit','tginter_document_tracking','manifest_review'];
 await each('WH3 document readiness','/api/outbound/wh3-dispatch-check',{terminalDestination:'TGINT',checklist,evidenceFiles:[png],note:'SIT ONLY'},'WH_Staff');
 for(const [group,plate]of[[houses.slice(0,2),'SIT-A'],[houses.slice(2),'SIT-B']])await call('Issue CTF '+plate,'/api/outbound/transfer-form',{action:'issue',houses:group,transferDate:'2026-11-23',transferTime:'08:30',transferFrom:'WH3',transferTo:'TGINT',driverName:'SIT simulated driver',vehiclePlate:plate,vehicleType:'6W',releaseBy:'SIT WH3',permitFiles:[png],note:'SIT ONLY no physical shipment'},'Team_Transport');
 save('Cargo-Transfer-SIT.pdf',await call('Two truck CTF PDF','/api/outbound/transfer-form/pdf',{houses},'Billing'));
 await stage('Cargo Transfer issued: 3 Houses / 2 trucks');
 await call('Terminal cannot approve AOT','/api/outbound/aot-booking',{houseNumber:houses[0],approved:true},'Terminal',403);
 await each('AOT request','/api/outbound/aot-booking',{terminalDestination:'TGINT',vehiclePlate:'SIT',driverName:'SIT driver',vehicleType:'6W',note:'SIT ONLY'},'Team_Transport');await stage('AOT requested');
 await each('AOT approve','/api/outbound/aot-booking',{approved:true,terminalDestination:'TGINT'},'Admin');await stage('AOT approved');
 await each('WH3 load','/api/outbound/load-bay',{...image,arrived:false,note:'SIT ONLY simulated loading'});await stage('Goods loaded');
 await each('Terminal arrival','/api/outbound/load-bay',{arrived:true,note:'SIT ONLY simulated arrival'});await stage('Terminal arrived');
 await each('Begin weighing','/api/outbound/weigh-start',{});
 const first=state().jobs[0].weighStartedAt;await new Promise(r=>setTimeout(r,20));await call('Retry begin weighing','/api/outbound/weigh-start',{houseNumber:houses[0]});
 if(state().jobs[0].weighStartedAt!==first){bugs.push('Duplicate weigh-start overwrote original start time');if(!baseline)assert.fail(bugs.at(-1));}
 await stage('Weighing started');
 await each('Record weight and dimensions','/api/outbound/weight-dimension',{weight:123,dimension:'100 x 80 x 60 cm (SIT)',note:'SIT ONLY simulated measurement'});await stage('Weight and dimensions recorded');
 await call('Hold and rescan','/api/outbound/xray',{houseNumber:houses[0],passed:false,hold:true,requiresRescan:true,reason:'SIT simulated unreadable label',...image});
 await call('Hold blocks Master close','/api/outbound/loading-detail',loading,'Terminal',409);await stage('Hold / Re-X-Ray blocks close');
 await each('X-Ray passed','/api/outbound/xray',{passed:true,hold:false,requiresRescan:false,...image,note:'SIT ONLY simulated X-Ray result'});await stage('X-Ray passed all Houses');
 await each('Packing','/api/outbound/weight-dimension',{packing:true,note:'SIT ONLY'});await stage('Packing complete');
 await call('Return CTF proof','/api/outbound/transfer-form',{action:'return',houses,...image,note:'SIT ONLY unsigned simulated return'},'Team_Transport');
 await call('Close Master','/api/outbound/loading-detail',loading);assert.ok(state().jobs.every(j=>j.status==='ReadyForBilling'));await stage('Loading Detail closes whole Master to ReadyForBilling');
 const closeAt=state().jobs[0].terminalClosedAt,attachmentCount=state().attachments.length;
 await call('Duplicate Terminal close','/api/outbound/loading-detail',loading);
 if(state().jobs[0].terminalClosedAt!==closeAt||state().attachments.length!==attachmentCount){bugs.push('Duplicate close created evidence and overwrote close time');if(!baseline)assert.fail(bugs.at(-1));}
 await each('Billing document review','/api/billing/review',{status:'Reviewed',note:'SIT ONLY'},'Billing');await stage('Billing reviewed');
 const drafted=await call('Draft one invoice / two trips','/api/billing/generate-batch',{houseNumbers:houses,testOnly:true,billingAddress:'SIT ONLY - NOT FOR PAYMENT',amount:0,billingMonth:'2026-11',billingPeriod:'FullMonth',billingPlan:'General'},'Billing');bill=drafted.bill;assert.equal(bill.tripCount,2);assert.equal(bill.amount,0);assert.equal(bill.testOnly,true);
 const invoice=await call('Invoice document HTTP',''+bill.pdfUrl,undefined,'Billing');assert.ok(houses.every(h=>invoice.includes(h)));save('Invoice-SIT.html',invoice);await stage('Invoice Draft: 3 Houses / 2 trips / 0 THB');
 const emailed=await call('Simulate email without external delivery','/api/billing/send-email',{invoiceId:bill.id,emailFiles:[png]},'Billing');assert.equal(emailed.bill.emailDeliveryStatus,'SITOnlyNoExternalDelivery');assert.equal(emailed.bill.status,'EmailQueued');await stage('EmailQueued: SITOnlyNoExternalDelivery');
 await call('Close Billed','/api/billing/mark-billed',{invoiceId:bill.id},'Billing');assert.ok(state().jobs.every(j=>j.status==='Billed'&&!j.readyForBilling));await stage('Billed: billing queue empty / history retained');
 const billed=JSON.stringify(state().jobs),billedAt=state().billing[0].billedDate;
 await call('Repeated Billed','/api/billing/mark-billed',{invoiceId:bill.id},'Billing');assert.equal(JSON.stringify(state().jobs),billed);assert.equal(state().billing[0].billedDate,billedAt);
 if(baseline){await call('Late Terminal close baseline','/api/outbound/loading-detail',loading);if(state().jobs.some(j=>j.status!=='Billed'))bugs.push('Late Terminal close reopened Billed Houses');await call('Late email baseline','/api/billing/send-email',{invoiceId:bill.id},'Billing');if(state().billing[0].status!=='Billed')bugs.push('Late email reopened Billed invoice and Houses');}
 else{await call('Late Terminal close rejected','/api/outbound/loading-detail',loading,'Terminal',409);await call('Late email rejected','/api/billing/send-email',{invoiceId:bill.id,emailFiles:[png]},'Billing',409);assert.equal(JSON.stringify(state().jobs),billed);assert.equal(state().billing[0].status,'Billed');}
 await stop();await start();const reopened=await call('Restart persistence','/api/bootstrap',undefined,'Admin');assert.ok(reopened.dashboard.jobs.every(j=>baseline||j.status==='Billed'));assert.equal(state().billing.length,1);await stage('Restart and retry regression checks');
 if(rl)await rl.question('Finished. Press Enter to stop isolated server: ');
 console.log(JSON.stringify({checks:results.length,bugs,output:out}));
}finally{await stop();if(build)fs.writeFileSync(config,before);fs.closeSync(log);rl?.close();save('results.json',{source:build?'isolated compiled Next production server':'isolated legacy HTTP server',master,houses,results,bugs});}
