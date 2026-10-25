/* eslint-disable @typescript-eslint/no-require-imports -- compatibility boundary */
const qa=require('./warehouse-quality.cjs');
const safety=require('./meeting-policy.cjs');
const scanner=require('./barcode-evidence.cjs');
const logs=require('./driver-time-log.cjs');
const crypto=require('node:crypto');
const paths=new Set(['/api/warehouse/quality','/api/warehouse/quality/tag','/api/warehouse/quality/scan','/api/warehouse/external-intake','/api/meeting/settings','/api/driver/time-log']);
const fail=(message,statusCode=422)=>{throw Object.assign(new Error(message),{statusCode});};
function allowed(actor,roles){if(!actor||!roles.includes(actor.role))fail('ไม่มีสิทธิ์ดำเนินการ',403);}
async function handle({db,actor,path,method,payload:p={},query={},at,scanUrl,saveFiles,alert,scanImage=scanner.scanImage}) {
    if(!paths.has(path))return null;
    const policy={enabled:false,geofencingEnabled:false,queueMinutes:15,...db.meetingSafety};
    if(path==='/api/meeting/settings'){
        allowed(actor,['Admin','Executive','WH3_TeamLeader']);
        if(method==='GET')return {policy,canEdit:actor.role==='Admin',geofenceLocations:(db.hr?.checkInLocations||[]).filter(l=>l.active!==false),roles:{tagging:['WH_Staff','WH3_TeamLeader','Tagging_Staff'],qa:['Check_House','QA_Inspector']}};
        allowed(actor,['Admin']);
        if(method!=='POST')fail('Method not allowed',405);
        if(typeof p.enabled!=='boolean'||typeof p.geofencingEnabled!=='boolean'||!Number.isSafeInteger(p.queueMinutes)||p.queueMinutes<1||p.queueMinutes>120)fail('ระบุ enabled, Geofencing และนาทีต่อคิวให้ถูกต้อง');
        if(p.enabled&&p.acknowledgeExistingJobs!==true)fail('ต้องยืนยันว่ากติกา QA จะครอบคลุมงานเดิมที่ยังไม่ผ่าน QA ด้วย');
        if(p.geofencingEnabled&&(!(db.hr?.checkInLocations||[]).some(l=>l.active!==false)||!db.hr?.settings?.attendance?.enforceAssignedLocations))fail('ตั้งค่าพิกัดจริงและเปิดบังคับจุดเช็คอินใน HR ก่อนเปิด Geofencing');
        const sitHouseNumbers=p.sitHouseNumbers===undefined?(db.meetingSafety?.sitHouseNumbers||[]):p.sitHouseNumbers;
        if(!Array.isArray(sitHouseNumbers)||sitHouseNumbers.length>100||sitHouseNumbers.some(h=>typeof h!=='string'||!/^SIT[-A-Z0-9]/i.test(h)||!db.jobs.some(j=>j.houseNumber===h)))fail('เปิดทดสอบได้เฉพาะเลข SIT ที่มีอยู่ในระบบ ห้ามระบุงานจริง');
        db.meetingSafety={enabled:p.enabled,geofencingEnabled:p.geofencingEnabled,queueMinutes:p.queueMinutes,sitHouseNumbers:[...new Set(sitHouseNumbers)],updatedAt:at,updatedBy:actor.id};
        db.meetingSafetyHistory=[...db.meetingSafetyHistory||[],{...db.meetingSafety}];
        if(p.enabled){db.dock||={};db.dock.bays||=[];for(let n=7;n<=11;n++)if(!db.dock.bays.some(b=>b.id===`D${n}`))db.dock.bays.push({id:`D${n}`,name:`ท่า ${n}`,zone:'WH3',status:'Available',note:n===7?'Customer Direct':'Inbound'});}
        return {ok:true,policy:db.meetingSafety,mutated:true};
    }
    if(path==='/api/driver/time-log'){
        if(method!=='GET')fail('Method not allowed',405);
        const result=logs.report(db,actor,query);return query.format==='html'?{html:logs.html(result)}:result;
    }
    allowed(actor,['Admin','Executive','WH3_TeamLeader','WH_Staff','Tagging_Staff','Check_House','QA_Inspector']);
    if(path==='/api/warehouse/quality'&&method==='GET'){
        const term=String(query.query||'').trim().toLowerCase();
        return {policy,actor:{id:actor.id,role:actor.role},jobs:(db.jobs||[]).filter(j=>!['Billed','InvoiceSent','Cancelled'].includes(j.status)&&(!term||[j.houseNumber,j.hawbNumber,j.onhandNumber,j.mawbNumber,j.customerName,j.invoiceNo].some(v=>String(v||'').toLowerCase().includes(term)))).slice(0,100).map(j=>({houseNumber:j.houseNumber,hawbNumber:j.hawbNumber||'',onhandNumber:j.onhandNumber||'',master:j.mawbNumber||'',customerName:j.customerName||'',invoiceNo:j.invoiceNo||'',shipmentSource:j.shipmentSource||'SCD',status:j.status,updatedAt:j.updatedAt,trackType:j.trackType||'Single',stickerColor:j.inboundStickerColor||j.stickerColor||'',tagInspection:j.tagInspection||null,qaApproval:j.qaApproval||null,qaApproved:qa.approved(j),qaRequired:Boolean(safety.active(db,[j])||j.qaRequired)}))};
    }
    if(method!=='POST')fail('Method not allowed',405);
    if(path==='/api/warehouse/external-intake'){
        allowed(actor,['Admin','WH3_TeamLeader','WH_Staff']);
        const house=String(p.houseNumber||'').trim(),invoice=String(p.invoiceNo||'').trim();
        if(!/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(house)||!invoice||invoice.length>160)fail('กรอก House และ Invoice ให้ครบ ใช้เลข/ตัวอักษรและขีดใน House เท่านั้น');
        let job=(db.jobs||[]).find(j=>[j.houseNumber,j.hawbNumber,j.onhandNumber].includes(house));
        if(job){
            if(job.invoiceNo&&job.invoiceNo!==invoice)fail('House นี้มี Invoice อื่นอยู่แล้ว ต้องตรวจยืนยันก่อน ห้ามทับข้อมูลเดิม',409);
            if(p.expectedUpdatedAt!==job.updatedAt)fail('ข้อมูลเปลี่ยนแล้ว กรุณารีเฟรช',409);
        }else{
            if(p.shipmentSource!=='CustomerDirect'||p.receivedAtFrontDesk!==true||!String(p.customerName||'').trim()||!Number.isSafeInteger(Number(p.pieceCount))||Number(p.pieceCount)<1||!['CTN','PLT'].includes(p.packageType))fail('งานลูกค้ามาส่งเองต้องยืนยันถึงหน้าคลัง ชื่อลูกค้า จำนวนและหน่วยให้ครบ');
            job={id:crypto.randomUUID(),houseNumber:house,hawbNumber:house,customerName:String(p.customerName).trim(),shipmentSource:'CustomerDirect',pieceCount:Number(p.pieceCount),packageType:p.packageType,pickupDate:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(at)),destination:'WH3',routeType:'WH3',status:'PendingEI',csConfirmed:false,csApprovalRequired:true,arrivedWh3At:at,frontDeskReceivedAt:at,frontDeskReceivedBy:actor.id,createdAt:at,updatedAt:at};
            db.jobs.push(job);
            if(policy.enabled){db.dock||={};db.dock.queue||=[];db.dock.queue.push({id:crypto.randomUUID(),houseNumber:house,queueType:'External',arrivedAt:at,createdAt:at,createdBy:actor.id});}
        }
        job.invoiceNo=invoice;job.externalInvoiceLinks=[...job.externalInvoiceLinks||[],{houseNumber:house,invoiceNo:invoice,linkedBy:actor.id,linkedAt:at}];job.updatedAt=at;
        return {ok:true,houseNumber:job.houseNumber,shipmentSource:job.shipmentSource||'SCD',csApprovalRequired:!job.csConfirmed,mutated:true};
    }
    const job=(db.jobs||[]).find(j=>j.houseNumber===p.houseNumber);
    if(!job)fail('ไม่พบ House ที่เลือก',404);
    if(!Array.isArray(p.scanImages)||!p.scanImages.length||p.scanImages.length>2)fail('ต้องส่งภาพสแกนบาร์โค้ด 1 หรือ 2 ภาพ ไม่มีการอนุมัติด้วยมือ');
    if(path.endsWith('/tag'))allowed(actor,['WH_Staff','WH3_TeamLeader','Tagging_Staff']);
    if(path.endsWith('/scan'))allowed(actor,['QA_Inspector','Check_House']);
    // Never accept barcode strings or flags supplied by the browser as scan proof.
    const scans=[];for(const image of p.scanImages)scans.push(await scanImage(image,scanUrl));
    if(path==='/api/warehouse/quality/tag'){
        const record=qa.tagPlan(db,job,actor,p,scans,at);
        const files=saveFiles(job.houseNumber,'TaggingBarcodeEvidence',p.scanImages);record.fileIds=files.map(f=>f.fileId);
        qa.applyTag(job,record);job.updatedAt=at;
        await alert(`แท็ก House ${job.houseNumber} เปลี่ยน revision ${record.revision} ต้องสแกน QA ใหม่ — ตรวจระบบป้ายเดิม ไม่สั่งพิมพ์ป้ายซ้ำ`);
        return {ok:true,tagInspection:record,qaApproved:false,mutated:true};
    }
    if(path==='/api/warehouse/quality/scan'){
        const record=qa.approvalPlan(db,job,actor,p,scans,at);
        const files=saveFiles(job.houseNumber,'QABarcodeEvidence',p.scanImages);record.fileIds=files.map(f=>f.fileId);
        job.qaApproval=record;job.qaHistory=[...job.qaHistory||[],record];job.updatedAt=at;
        return {ok:true,qaApproval:record,qaApproved:true,mutated:true};
    }
    fail('ไม่รองรับคำสั่ง',404);
}
module.exports={handle,paths};
