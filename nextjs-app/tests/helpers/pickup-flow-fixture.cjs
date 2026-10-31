/* eslint-disable @typescript-eslint/no-require-imports -- isolated route integration fixture */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),server=path.join(root,'src/server');
const source=fs.readFileSync(path.join(server,'legacy-api.cjs'),'utf8'),input={timeline:{job:{houseNumber:'SIM-F001',hawbNumber:'4840807196',pieceCount:'5',status:'Pending',driverId:'u_driver_01',driverName:'SIM Driver A',vehiclePlate:'SIM-A',csConfirmed:true,cargoIssuedAt:'2026-10-24T08:00:00Z',csInvoiceNo:'SIM-INV',csContactName:'SIM Contact',csContactPhone:'SIM-PHONE',flightNo:'TBC'}}};
const operationsControl=require(path.join(server,'operations-control.cjs')),pickupFlow=require(path.join(server,'pickup-flow.cjs'));
const seed=input.timeline.job,house=seed.houseNumber,actor={id:'u_driver_01',role:'Driver',name:'Driver A / สมชาย'},cases=[],snapshots=[];
const fn=name=>source.match(new RegExp(`^(?:async )?function ${name}\\([\\s\\S]*?^}`,'m'))[0];
const fixture=()=>({jobs:[structuredClone(seed),{houseNumber:'SIM-OTHER',driverId:'SIM-B',pieceCount:7,status:'Pending'}],activityLogs:[],attachments:[]});
const image={base64:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL7WQAAAABJRU5ErkJggg==',mimeType:'image/png'};

function signatureImage(blank=false){
 const zlib=require('node:zlib'),header=Buffer.alloc(13);header.writeUInt32BE(32,0);header.writeUInt32BE(16,4);header[8]=8;header[9]=6;
 const crc=data=>{let c=0xffffffff;for(const b of data){c^=b;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;};
 const chunk=(name,data)=>{const type=Buffer.from(name),n=Buffer.alloc(4),c=Buffer.alloc(4);n.writeUInt32BE(data.length);c.writeUInt32BE(crc(Buffer.concat([type,data])));return Buffer.concat([n,type,data,c]);};
 const raw=Buffer.alloc((32*4+1)*16);if(!blank)for(let x=4;x<26;x++)raw[8*(32*4+1)+1+x*4+3]=255;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]).toString('base64');
}

let minute=0;
async function route(db,name,p={},who=actor){
 const pathname='/api/pickup/'+name,a=source.indexOf(`    if (req.method === "POST" && pathname === "${pathname}")`),b=source.indexOf('\n    if (req.method ===',a+12),io={writes:0,files:0};assert.ok(a>=0&&b>a);
 const payload={houseNumber:house,houseNumbers:[house],gpsLat:13.1,gpsLong:100.1,...p}; // SIM coordinates: copies only.
 const at=new Date(Date.parse('2026-10-24T09:00:00Z')+(minute++)*60000).toISOString();
 const save=(_db,args)=>{if(!args.base64&&!args.files?.length)return null;io.files++;const row={houseNumber:args.houseNumber,fileType:args.fileType,simulated:true};db.attachments.push(row);return row;};
 const c=vm.createContext({db,req:{method:'POST'},res:{},pathname,crypto,Date,Buffer,parseBody:async()=>payload,requireSessionRole:(_db,_req,roles)=>who&&roles.includes(who.role)?who:null,findJob:(_db,h)=>_db.jobs.find(j=>[j.houseNumber,j.hawbNumber].includes(h)),nowIso:()=>at,writeDb:()=>io.writes++,normalizeJob:j=>j,sendJson:(_r,status,body)=>({status,body}),operationsControl,pickupFlow,meetingPolicy:require(path.join(server,'meeting-policy.cjs')),saveBase64Files:save,saveBase64File:save});
 for(const name of ['findPayloadJobs','pickupRoundKey','findPickupArrivalRoundJobs','pickupDispatchIsReady','requirePickupActor','normalizePickupItems','logActivity','findOpenActivity'])vm.runInContext(fn(name),c);
 return {...await vm.runInContext(`(async()=>{${source.slice(a,b)}})()`,c),io};
}
async function check(name,run){try{await run();cases.push({name,result:'PASS'});}catch(e){cases.push({name,result:'FAIL',detail:e.message});}}
const valid=()=>({pickupCase:'GeneralManual',checklist:pickupFlow.checks,pickupItems:[{houseNumber:house,carton:'5',pickupDestination:'WH3'}],productImages:[image],cargoImages:[image],doorClosedImages:[image],signatureBase64:signatureImage(),inspectorName:'SIM inspector',receiverName:'SIM receiver',pieceCount:'5',packageType:seed.packageType||'Carton'});
async function arrived(){const d=fixture();assert.equal((await route(d,'route-start')).status,200);assert.equal((await route(d,'checkin')).status,200);return d;}
async function loaded(){const d=await arrived();assert.equal((await route(d,'load',valid())).status,200);return d;}
async function completed(){const d=await loaded();assert.equal((await route(d,'complete',valid())).status,200);return d;}
const reject=r=>assert.ok(r.status>=400,'Expected rejection, got HTTP '+r.status);
module.exports=async()=>{
 await check('ข้อมูลก่อนเทสตรง House 4840807196, 5 ชิ้น, CS และ Driver A พร้อม ไม่มีรับจริง',()=>{assert.equal(seed.hawbNumber,'4840807196');assert.equal(Number(seed.pieceCount),5);assert.ok(seed.csConfirmed&&seed.cargoIssuedAt&&!seed.routeStartedAt&&!seed.inboundReceipt);});
 await check('Driver B ทำงานของ A ไม่ได้ และไม่เขียนข้อมูล',async()=>{const d=fixture(),before=JSON.stringify(d),r=await route(d,'route-start',{}, {id:'SIM-B',role:'Driver'});assert.equal(r.status,403);assert.equal(JSON.stringify(d),before);});
 await check('ยังไม่ผ่าน CS หรือยังไม่ออกใบต้องเริ่มรอบไม่ได้',async()=>{for(const key of ['csConfirmed','cargoIssuedAt']){const d=fixture();d.jobs[0][key]=false;reject(await route(d,'route-start'));}});
 await check('เริ่มรอบซ้ำต้องไม่เพิ่มเหตุการณ์ RouteStarted ซ้ำ',async()=>{const d=fixture();await route(d,'route-start');await route(d,'route-start');assert.equal(d.activityLogs.filter(l=>l.activityType==='RouteStarted').length,1);});
 await check('API ต้องไม่ยอมถึงจุดรับก่อนเริ่มรอบ',async()=>reject(await route(fixture(),'checkin')));
 await check('API ต้องไม่ยอมโหลดก่อนถึงจุดรับ',async()=>reject(await route(fixture(),'load',valid())));
 await check('API ต้องไม่ยอมจบรับก่อนโหลดขึ้นรถ',async()=>reject(await route(await arrived(),'complete',valid())));
 await check('API ต้องไม่ยอมจบรับเมื่อ checklist ไม่ครบสิบ',async()=>reject(await route(await loaded(),'complete',{...valid(),checklist:['SIM-only-one']})));
 await check('API ต้องไม่ยอมจบรับด้วยลายเซ็นว่าง',async()=>reject(await route(await loaded(),'complete',{...valid(),signatureBase64:''})));
 for(const [key,label] of [['productImages','รูปสินค้า'],['cargoImages','ใบ Cargo ลงชื่อ'],['doorClosedImages','รูปประตูปิด']])await check('ไม่มี'+label+'ต้องปฏิเสธก่อนเขียนไฟล์หรือเปลี่ยนสถานะ',async()=>{const d=await loaded(),before=JSON.stringify(d),r=await route(d,'complete',{...valid(),[key]:[]});assert.equal(r.status,422);assert.equal(r.io.files,0);assert.equal(JSON.stringify(d),before);});
 await check('หลักฐานจำลองติด flag ใช้กับ House จริงไม่ได้',async()=>{const d=await loaded(),before=JSON.stringify(d);assert.equal((await route(d,'complete',{...valid(),simulation:true})).status,403);assert.equal(JSON.stringify(d),before);});
 await check('เส้นทางไป Terminal โดยข้าม WH3 ต้องถูกบล็อก',async()=>reject(await route(await loaded(),'complete',{...valid(),pickupItems:[{houseNumber:house,carton:'5',pickupDestination:'TG'}]})));
 await check('ถึง WH3 ก่อนจบรับต้องถูกบล็อก',async()=>reject(await route(await arrived(),'arrive-wh3')));
 await check('GPS ว่างต้องไม่ถูกอ้างว่าเก็บพิกัดสำเร็จและควรบล็อกการเริ่มรอบ',async()=>reject(await route(fixture(),'route-start',{gpsLat:null,gpsLong:null})));
 await check('จำนวนรับติดลบต้องถูกบล็อกก่อนเปลี่ยนจำนวนตามแผน',async()=>reject(await route(await loaded(),'complete',{...valid(),pieceCount:'-5',pickupItems:[{houseNumber:house,carton:'-5',pickupDestination:'WH3'}]})));
 await check('ลำดับจำลองครบ เริ่มรอบ ถึงโรงงาน โหลด รับครบ กลับ WH3 โดยไม่สร้างยอดรับคลัง',async()=>{
  const d=fixture(),other=JSON.stringify(d.jobs[1]);
  for(const [name,p] of [['route-start',{}],['checkin',{}],['load',valid()],['complete',valid()],['arrive-wh3',{}]]){const r=await route(d,name,p);assert.equal(r.status,200,name);snapshots.push({step:name,simulated:true,job:structuredClone(d.jobs[0]),files:d.attachments.length,activities:structuredClone(d.activityLogs)});}
  assert.equal(d.jobs[0].status,'AwaitingReleaseDocument');assert.equal(d.jobs[0].driverRouteStatus,'ArrivedWH3');assert.ok(!d.jobs[0].inboundReceipt&&!d.jobs[0].locationId);assert.equal(JSON.stringify(d.jobs[1]),other);
  for(const key of ['houseNumber','hawbNumber','mawbNumber','flightNo','flightTime','pieceCount','csInvoiceNo','csContactName','csContactPhone','driverId','driverName','vehiclePlate'])assert.equal(String(d.jobs[0][key]||''),String(seed[key]||''),key);
 });
 await check('หลังถึง WH3 แล้ว API ต้องไม่ย้อนกลับไปเริ่มรอบเดิม',async()=>{const d=await completed();await route(d,'arrive-wh3');reject(await route(d,'route-start'));});
 await check('กดถึง WH3 จาก House เดียวต้องอัปเดตทุก House ในรอบรถเดียวกัน',async()=>{
  const d=await completed(),first=d.jobs[0],second={...structuredClone(first),houseNumber:'SIM-F002',hawbNumber:'4840807197'};
  first.batchId=second.batchId='BATCH-SAME-TRUCK';d.jobs.push(second);
  const r=await route(d,'arrive-wh3');assert.equal(r.status,200);assert.equal(r.body.updatedCount,2);
  assert.deepEqual(r.body.roundHouseNumbers.sort(),['SIM-F001','SIM-F002']);
  for(const job of [first,second]){assert.equal(job.status,'AwaitingReleaseDocument');assert.equal(job.driverRouteStatus,'ArrivedWH3');assert.ok(job.arrivedWh3At);}
 });
 await check('ถ้า House ใดในรอบรถยังรับไม่ครบ ต้องบล็อกทั้งรอบโดยไม่อัปเดตบางส่วน',async()=>{
  const d=await completed(),first=d.jobs[0],second={...structuredClone(first),houseNumber:'SIM-F002',hawbNumber:'4840807197',completedAt:null,status:'Loading',driverRouteStatus:'Loading'};
  first.batchId=second.batchId='BATCH-INCOMPLETE-TRUCK';d.jobs.push(second);const before=structuredClone(d.jobs);
  const r=await route(d,'arrive-wh3');assert.equal(r.status,409);assert.deepEqual(d.jobs,before);
 });
 await check('จบรับซ้ำต้องไม่เพิ่มไฟล์ซ้ำหรือเลื่อนเวลารับเดิม',async()=>{const d=await completed(),files=d.attachments.length,at=d.jobs[0].completedAt;await route(d,'complete',valid());assert.equal(d.attachments.length,files);assert.equal(d.jobs[0].completedAt,at);});
 await check('สลับขั้นตอนหรือแปลภาษาแล้วข้อมูลชื่อคนขับและทะเบียนต้องไม่ถูกตัด',()=>{
 const mobile=fs.readFileSync(path.join(root,'public/legacy/mobile.js'),'utf8'),line='คนขับ: Driver A / สมชาย · รถ กข-1234';
 const node={nodeValue:line,parentElement:{closest:selector=>selector==='[data-no-i18n]'?{}:null,tagName:'DIV'}};
 const c=vm.createContext({state:{lang:'th'},NodeFilter:{FILTER_REJECT:2,FILTER_ACCEPT:1,FILTER_SKIP:3,SHOW_TEXT:4},i18nOriginalText:new WeakMap(),$:()=>null,$$:()=>[],document:{body:{},documentElement:{},createTreeWalker:(_root,_show,opts)=>{let done=false;return{nextNode(){if(done)return false;done=true;if(opts.acceptNode(node)!==1)return false;this.currentNode=node;return true;}};}}});
 vm.runInContext(mobile.match(/^function localizeText\([\s\S]*?^}/m)[0]+'\n'+mobile.match(/^function applyLanguage\([\s\S]*?^}/m)[0],c);c.applyLanguage();assert.equal(node.nodeValue,line);
 });
 await check('ลายเซ็น PNG โปร่งใสหรือขาวล้วนต้องถูกปฏิเสธ',()=>{assert.throws(()=>pickupFlow.signature(signatureImage(true)));pickupFlow.signature(signatureImage(false));});
 await check('Checklist ซ้ำสิบครั้งต้องไม่แทนสิบรายการจริง',async()=>reject(await route(await arrived(),'load',{...valid(),checklist:Array(10).fill('date')})));
 await check('พิกัด 0 เป็นค่าจริงที่ใช้ได้ แต่ค่าว่าง NaN และนอกโลกถูกบล็อก',async()=>{assert.equal((await route(fixture(),'route-start',{gpsLat:0,gpsLong:0})).status,200);for(const p of [{gpsLat:'',gpsLong:1},{gpsLat:91,gpsLong:100},{gpsLat:1,gpsLong:181}])reject(await route(fixture(),'route-start',p));});
 await check('รับ 4 จากแผน 5 ต้องเก็บยอดคนขับแยก ไม่เปลี่ยนจำนวนแผนหรือสร้างรับคลัง',async()=>{const d=await loaded(),p={...valid(),pieceCount:'4',pickupItems:[{houseNumber:house,carton:'4',pickupDestination:'WH3'}]};assert.equal((await route(d,'complete',p)).status,200);assert.equal(String(d.jobs[0].pieceCount),'5');assert.equal(String(d.jobs[0].pickupReceivedCount),'4');assert.ok(!d.jobs[0].inboundReceipt);});

 const result={scope:'SIMULATION ONLY on an isolated copy of House 4840807196; every GPS, photo, signature, checklist, inspector and event time here is synthetic. No network or production writes.',cases,summary:{pass:cases.filter(c=>c.result==='PASS').length,fail:cases.filter(c=>c.result==='FAIL').length,total:cases.length},snapshots};
 return result;
};
