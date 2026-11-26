/* eslint-disable @typescript-eslint/no-require-imports -- isolated server operation */
const crypto = require('node:crypto');
const MASTER = '312-93478766';
const HOUSES = Array.from({length:6},(_,i)=>String(4840809294+i));
const clone = value => JSON.parse(JSON.stringify(value));
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail = message => {throw Object.assign(new Error(message),{statusCode:409});};
const keys = ['id','houseNumber','hawbNumber','onhandNumber','mawbNumber','masterNumber','icNumber','customerId','customerName','invoiceNo','contact','tel','shippingDoc','shipperName','terminalDestination','terminalBranch','airlineCode','flightNo','flightTime','destination','destAirport','consigneeName','booking','pieceCount','packageType','packageCounts','weight','volWeight','cbm','cargoType','productType','isLithium','requiresLithiumDocs','dgType','cargoDesc','readyTime','closeTime','cargoCutoffAt','airportDueAt','pickupDate','workDate','pickupLocation','routeType','shipmentSource','createdAt','source','sourceChannel','sourceFile','importedAt','planSource','planRound'];
const collections = ['attachments','billing','taskGroups','notifications','serviceRecords'];
async function backupFiles(snapshot,readEvidence){
 const output=[],registered=snapshot.records.attachments;
 for(let start=0;start<registered.length;start+=4){
  const batch=await Promise.all(registered.slice(start,start+4).map(async file=>{
   let bytes;
   if(file.fileType==='InvoiceDocument'){
    const bill=snapshot.records.billing.find(b=>file.fileId==='INVOICE-DOC-'+b.id&&file.url===`/storage/invoices/${b.id}.html`&&file.houseNumber===b.houseNumber);
    if(!bill||typeof file.htmlContent!=='string'||!file.htmlContent.length)fail('สำรอง Invoice HTML ไม่สำเร็จ '+file.fileId);
    bytes=Buffer.from(file.htmlContent,'utf8');
   }else bytes=await readEvidence(file);
   if(!bytes?.length)fail('ไม่พบหลักฐาน '+file.fileId+' ยังไม่รีเซ็ต');
   return {fileId:file.fileId,size:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),base64:bytes.toString('base64'),url:file.url,mimeType:file.mimeType};
  }));
  output.push(...batch);
 }
 return output;
}
function refs(row){
 const result = new Set();
 function walk(v,k='') {
  if(Array.isArray(v)){for(const item of v)walk(item,k);return;}
  if(v&&typeof v==='object'){for(const [key,item]of Object.entries(v))walk(item,key);return;}
  if(typeof v==='string'&&/^(houseNumber|house|hawb|jobHouseNumber|houseNumbers|houses|currentHouseId)$/.test(k)&&v)result.add(v);
 }
 walk(row);return [...result];
}
function selected(db){
 const jobs=(db.jobs||[]).filter(j=>String(j.mawbNumber||j.masterNumber||'').replaceAll('-','')===MASTER.replaceAll('-',''));
 if(jobs.length!==6||new Set(jobs.map(j=>j.houseNumber)).size!==6||jobs.some(j=>!HOUSES.includes(j.houseNumber)))fail('ชุด House ของ Master ไม่ตรงกับ 6 House ที่อนุมัติ');
 return jobs;
}
function related(row){return refs(row).some(h=>HOUSES.includes(h));}
function scope(db){
 const jobs=selected(db),records={};
 const rounds=new Set(jobs.map(j=>j.transportRoundId).filter(Boolean));
 if((db.jobs||[]).some(j=>!HOUSES.includes(j.houseNumber)&&rounds.has(j.transportRoundId)))fail('รอบรถมีงานอื่นร่วมอยู่ ห้ามรีเซ็ต');
 for(const key of collections){
  records[key]=(db[key]||[]).filter(r=>related(r)||(key==='billing'&&jobs.some(j=>j.invoiceId===r.id)));
  if(records[key].some(r=>refs(r).some(h=>!HOUSES.includes(h))))fail('พบเอกสารร่วมกับ House อื่น: '+key);
 }
 if(records.billing.some(b=>b.testOnly!==true||['Sent','EmailQueued'].includes(b.status)||b.emailDeliveryStatus==='Sent'))fail('ย้อนรอบได้เฉพาะใบวางบิล SIT ที่ไม่ได้ส่งออกภายนอก');
 if(jobs.some(j=>j.driverId&&!/^sit[_-]/i.test(j.driverId)))fail('งานนี้ไม่ได้ใช้คนขับ SIT');
 const busy=[...(db.dock?.queue||[]),...(db.dock?.bays||[]),...(db.locations||[]),...(db.warehouseMap?.locations||[]),...(db.warehouseMaps||[]).flatMap(m=>(m.zones||[]).flatMap(z=>z.slots||[]))].filter(related);
 if(busy.length)fail('ยังมีคิว Dock หรือ Location ของ Master นี้ ต้องตรวจให้ว่างก่อนรีเซ็ต');
 return clone({jobs,records});
}
function prepare(db,actor){
 if(actor?.role!=='Admin')throw Object.assign(new Error('Admin required'),{statusCode:403});
 const snapshot=scope(db);
 if(snapshot.jobs.some(j=>j.workflowRehearsalId&&j.status==='Pending'&&!j.csConfirmed))fail('Master นี้พร้อมเริ่มจาก CS อยู่แล้ว');
 return {master:MASTER,houseNumbers:HOUSES,snapshot,sha256:hash(snapshot)};
}
function archive(db,actor,expectedHash,files,at){
 const p=prepare(db,actor);if(p.sha256!==expectedHash)fail('ข้อมูลเปลี่ยนหลังตรวจ กรุณาสำรองใหม่');
 if(files.length!==p.snapshot.records.attachments.length||files.some((f,i)=>f.fileId!==p.snapshot.records.attachments[i].fileId||!f.sha256))fail('สำรองหลักฐานไม่ครบ');
 const record={id:crypto.randomUUID(),master:MASTER,houseNumbers:HOUSES,createdAt:at,createdBy:actor.id,sha256:p.sha256,snapshot:p.snapshot,files:files.map(({fileId,sha256,size})=>({fileId,sha256,size})),status:'BackedUp'};
 db.masterRehearsalArchives||=[];db.masterRehearsalArchives.push(record);return record;
}
function resetJob(j,id,at){
 const base=Object.fromEntries(keys.filter(k=>j[k]!==undefined).map(k=>[k,clone(j[k])]));
 return {...base,status:'Pending',csConfirmed:false,csApprovalRequired:true,approvalStatus:'PendingCSApproval',manualExtra:true,evidenceRequired:true,evidenceChannel:'SIT',evidenceNote:'SIT rehearsal reset; original workflow retained in archive '+id,driverId:'',driverName:'',vehiclePlate:'',readyForBilling:false,workflowRehearsalId:id,workflowResetAt:at,updatedAt:at};
}
function apply(db,actor,id,confirm,at){
 if(actor?.role!=='Admin')throw Object.assign(new Error('Admin required'),{statusCode:403});
 const record=(db.masterRehearsalArchives||[]).find(r=>r.id===id&&r.master===MASTER);
 if(!record||confirm!=='RESET:'+MASTER)fail('ต้องมี Backup และยืนยันเลข Master ให้ตรง');
 if(record.status==='Reset')return {replayed:true,archiveId:id,houseNumbers:HOUSES};
 if(record.status!=='BackedUp'||hash(scope(db))!==record.sha256)fail('ข้อมูลเปลี่ยนหลังสำรอง ห้ามเขียนทับ กรุณาสำรองใหม่');
 const next=record.snapshot.jobs.map(j=>resetJob(j,id,at));
 // Validate the complete scope before changing anything. Preserve all original
 // records in the durable archive; never delete stored evidence bytes.
 db.jobs=db.jobs.map(j=>HOUSES.includes(j.houseNumber)?next.find(n=>n.houseNumber===j.houseNumber):j);
 for(const key of collections){
  const rows=record.snapshot.records[key];
  if(key==='billing'){
   // Keep invoice IDs reserved: the legacy generator allocates by array length.
   db.billing=(db.billing||[]).map(b=>rows.some(r=>r.id===b.id)?{id:b.id,status:'ArchivedSIT',testOnly:true,amount:0,houseNumbers:[],houseNumber:'',archiveId:id,originalStatus:b.status}:b);
  }else if(rows.length){
   const serialized=new Set(rows.map(r=>JSON.stringify(r)));
   db[key]=(db[key]||[]).filter(r=>!serialized.has(JSON.stringify(r)));
  }
 }
 record.status='Reset';record.resetAt=at;record.resetBy=actor.id;record.resetJobsHash=hash(next);
 return {archiveId:id,master:MASTER,houseNumbers:HOUSES,status:'PendingCSApproval'};
}
function restore(db,actor,id,confirm,at){
 if(actor?.role!=='Admin')throw Object.assign(new Error('Admin required'),{statusCode:403});
 const record=(db.masterRehearsalArchives||[]).find(r=>r.id===id&&r.master===MASTER);
 if(!record||confirm!=='RESTORE:'+MASTER||record.status!=='Reset')fail('ไม่พบรอบรีเซ็ตที่กู้คืนได้');
 if(hash(selected(db))!==record.resetJobsHash)fail('เริ่มทำรอบใหม่แล้ว ห้ามกู้ทับข้อมูลล่าสุด');
 for(const key of collections){
  if(key==='billing'){
   const originals=record.snapshot.records.billing;
   if(originals.some(b=>!(db.billing||[]).some(v=>v.id===b.id&&v.archiveId===id&&v.status==='ArchivedSIT')))fail('บิลเปลี่ยนแล้ว ห้ามกู้ทับ');
  }else if((db[key]||[]).some(related))fail('พบรายการใหม่หลังรีเซ็ต ห้ามกู้ทับ');
 }
 db.jobs=db.jobs.map(j=>HOUSES.includes(j.houseNumber)?clone(record.snapshot.jobs.find(v=>v.houseNumber===j.houseNumber)):j);
 for(const key of collections){
  if(key==='billing')db.billing=(db.billing||[]).map(b=>clone(record.snapshot.records.billing.find(v=>v.id===b.id)||b));
  else if(record.snapshot.records[key].length)db[key]=[...(db[key]||[]),...clone(record.snapshot.records[key])];
 }
 record.status='Restored';record.restoredAt=at;record.restoredBy=actor.id;
 return {archiveId:id,master:MASTER,houseNumbers:HOUSES,status:'Restored'};
}
module.exports={MASTER,HOUSES,prepare,archive,apply,restore,hash,backupFiles};
