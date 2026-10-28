/* eslint-disable @typescript-eslint/no-require-imports -- inbound domain boundary */
const crypto=require('node:crypto');
const receipts=require('./inbound-receipts.cjs');
const evidence=(file,label)=>require('./operations-control.cjs').evidence(file,label);
const fail=(message,statusCode=409)=>{throw Object.assign(new Error(message),{statusCode});};
const wdKeys=['house_tag','sticker','piece_count','packing_type','condition','docs','corner','seal'];
const whRoles=['Admin','WH3_TeamLeader','WH_Staff'];
const roles=(actor,list)=>{if(!actor||!list.includes(actor.role))fail('ไม่มีสิทธิ์ดำเนินการรับเข้า',403);};
const recorded=v=>typeof v==='string'&&Number.isFinite(Date.parse(v));
function assertUnloaded(job){
    if(job.shipmentSource==='CustomerDirect')return;
    const events=(job.driverDockHistory||[]).filter(e=>e.assignedAt===job.dockAssignedAt&&['D8','D9','D10','D11'].includes(e.bayId));
    const rows=['arrive','unload-start','unload-complete'].map(name=>events.find(e=>e.event===name));
    if(!recorded(job.dockAssignedAt)||rows.some(e=>!e||!recorded(e.at)||e.by!==job.driverId)||new Set(rows.map(e=>e.bayId)).size!==1||rows.some((e,i)=>Date.parse(e.at)<Date.parse(i?rows[i-1].at:job.dockAssignedAt))||Date.parse(rows[0].at)<Date.parse(job.arrivedWh3At)||!rows[2].evidenceFileIds?.length)fail('ต้องยืนยันเข้าท่า เริ่มลง และลงสินค้าเสร็จพร้อมหลักฐานของรอบ Dock ล่าสุดก่อนรับเข้าคลัง');
    if(rows[2].at!==job.wh3UnloadCompletedAt)fail('เวลาลงสินค้าไม่ตรงกับประวัติ Dock กรุณาตรวจผู้รับผิดชอบ');
}
function assertNotHeld(job){if(job.inboundHold?.state==='Open'||job.inboundHold?.state==='Rejected')fail('งานรับเข้าถูกพัก: '+job.inboundHold.reason+' ต้องให้หัวหน้าตรวจและบันทึกการตัดสินใจก่อน');}
function assertChecklist(job,p){
    if(/wd|western digital/i.test(job.customerName||'')){
        const set=new Set(p.wdChecklist||job.wdChecklist||[]);
        if(wdKeys.some(key=>!set.has(key))||!String(p.stickerColor||job.inboundStickerColor||'').trim())fail('สินค้า WD ต้องตรวจ Checklist ครบทั้ง 8 ข้อและระบุสีแท็ก',422);
    }
}
function locations(db){return [...(db.locations||[]),...(db.warehouseMap?.locations||[]),...(db.warehouseMaps||[]).flatMap(m=>(m.zones||[]).flatMap(z=>z.slots||[]))];}
function validateLocation(db,job,p){
    const key=String(p.newLocationId||p.locationId||'').trim().toLowerCase();
    const loc=locations(db).find(l=>[l.id,l.code].some(v=>String(v||'').toLowerCase()===key));
    if(!loc)fail('ไม่พบ Location',404);
    if(loc.active===false||['Closed','Blocked'].includes(loc.status))fail('Location ปิดใช้งานหรือถูกบล็อก');
    const zone=(db.warehouseMap?.zones||[]).find(z=>z.id===loc.zoneId);
    if(zone?.active===false)fail('Zone ปิดใช้งาน');
    if(zone?.capacityUnit==='Area'&&Number(p.areaSqm||0)<=0)fail('โซนนี้ต้องระบุพื้นที่จัดเก็บมากกว่าศูนย์',422);
    if(zone?.capacityUnit==='Volume'&&Number(p.volumeCbm||0)<=0)fail('โซนนี้ต้องระบุปริมาตรจัดเก็บมากกว่าศูนย์',422);
    const level=p.level===undefined?1:Number(p.level);
    if(!Number.isSafeInteger(level)||level<1||(loc.maxLevels&&level>loc.maxLevels))fail('ระดับ Location ไม่ถูกต้อง',422);
    if(loc.status==='Occupied'&&loc.currentHouseId!==job.houseNumber)fail('Location มี House อื่นอยู่');
    const other=(loc.occupiedBy||[]).filter(o=>o.houseNumber!==job.houseNumber);
    if(zone?.storageMode!=='Flexible'&&other.some(o=>o.level==null||o.level===level))fail('ระดับ Location ถูกใช้งานแล้ว');
    for(const [field,max] of [['pallets','maxPallets'],['boxes','maxBoxes'],['areaSqm','maxAreaSqm'],['volumeCbm','maxVolumeCbm']]){
        const value=Number(p[field]??0);
        if(!Number.isFinite(value)||value<0||(['pallets','boxes'].includes(field)&&!Number.isSafeInteger(value)))fail('จำนวนจัดเก็บต้องเป็นค่าที่ไม่ติดลบและถูกหน่วย',422);
        const used=other.reduce((sum,o)=>sum+Number(o[field]||0),0);
        if(Number(loc[max])>0&&used+value>Number(loc[max]))fail('เกินความจุ Location: '+field);
        if(Number(zone?.[max])>0){const zoneUsed=(db.warehouseMap?.locations||[]).filter(l=>l.zoneId===zone.id).flatMap(l=>l.occupiedBy||[]).filter(o=>o.houseNumber!==job.houseNumber).reduce((sum,o)=>sum+Number(o[field]||0),0);if(zoneUsed+value>Number(zone[max]))fail('เกินความจุ Zone: '+field);}
    }
    return loc;
}
function storageQuantities(db,job,p){
    const current=locations(db).flatMap(l=>l.occupiedBy||[]).find(o=>o.houseNumber===job.houseNumber)||{};
    const received=receipts.house(job).received;
    return Object.fromEntries(['pallets','boxes','areaSqm','volumeCbm'].map(k=>[k,p[k]!==undefined?p[k]:current[k]??(k==='pallets'?job.warehousePallets??received.PLT:k==='boxes'?job.warehouseBoxes??received.CTN:0)??0]));
}
function assertPutaway(db,job,p){
    assertNotHeld(job);assertUnloaded(job);
    require('./workflow-integrity.cjs').inbound(job,'receipt');
    if(!receipts.house(job).confirmed)fail('ต้องยืนยันยอดรับจริงก่อนจัดเก็บ');
    if(!job.inboundInspection?.checkedAt)fail('ต้องตรวจสภาพสินค้าและเลขอ้างอิงก่อนจัดเก็บ');
    assertChecklist(job,p);Object.assign(p,storageQuantities(db,job,p));validateLocation(db,job,p);
}
function assertRelease(db,bay,p){
    if(!bay.houseNumber)return;
    if(p.confirmVehicleDeparted!==true)fail('ต้องยืนยันว่ารถออกจากช่องจริงก่อนคืน Dock',422);
    const related=(db.dock?.bays||[]).filter(b=>b.houseNumber&&(b.id===bay.id||(bay.vehiclePlate&&b.vehiclePlate===bay.vehiclePlate)));
    for(const b of related){const j=(db.jobs||[]).find(j=>j.houseNumber===b.houseNumber);if(!j)fail('ไม่พบงานของ Dock');if(j.shipmentSource==='CustomerDirect'){if(!j.inboundInspection?.checkedAt)fail('ต้องตรวจรับลูกค้ามาส่งเองก่อนคืน Dock');}else assertUnloaded(j);}
}
function checkRevision(job,p){if(p.expectedRevision!==(job.inboundControlRevision||0))fail('ข้อมูลรับเข้าเปลี่ยนแล้ว กรุณารีเฟรช');}
function request(job,p){
    if(!/^[A-Za-z0-9-]{8,100}$/.test(String(p.requestId||'')))fail('ต้องมีรหัสคำขอ',422);
    const fingerprint=crypto.createHash('sha256').update(JSON.stringify([p.action,p.kind||'',p.reason||'',p.decision||'',p.checks||null,p.wdChecklist||null,p.evidence||null])).digest('hex');
    const prior=(job.inboundControlHistory||[]).find(r=>r.requestId===p.requestId);
    if(prior){if(prior.fingerprint!==fingerprint)fail('รหัสคำขอใช้กับรายการอื่นแล้ว');return prior;}
    checkRevision(job,p);return null;
}
function snapshot(db,job){
    const qa=require('./warehouse-quality.cjs');
    let unloadError='',putawayError='';try{assertUnloaded(job);}catch(e){unloadError=e.message;}
    try{assertNotHeld(job);}catch(e){putawayError=e.message;}
    const keys=['houseNumber','hawbNumber','onhandNumber','mawbNumber','customerName','invoiceNo','driverId','vehiclePlate','status','shipmentSource','arrivedWh3At','releaseDocumentReceivedAt','dockBayId','dockAssignedAt','dockArrivedAt','wh3UnloadStartedAt','wh3UnloadCompletedAt','inboundDocStatus','inboundDocumentCheckedAt','inboundOpenedAt','inboundEiConfirmedAt','inboundClosedAt','inboundClosedRevision','locationId','warehouseLocation','trackType','inboundHold','inboundInspection','inboundControlHistory','inboundControlRevision','tagInspection','qaApproval','inboundReceipt','updatedAt'];
    return {job:Object.fromEntries(keys.map(k=>[k,job[k]??null])),receipt:receipts.house(job),masterReceipt:receipts.overview(db.jobs||[]).masters.get(receipts.masterKey(job))||null,qaApproved:qa.approved(job),unloadError,holdError:putawayError,locations:locations(db).filter(l=>l.active!==false&&!['Closed','Blocked'].includes(l.status)).map(l=>({id:l.id,code:l.code||l.id,mapped:(db.warehouseMap?.locations||[]).includes(l),storageMode:(db.warehouseMap?.zones||[]).find(z=>z.id===l.zoneId)?.storageMode||'Fixed',status:l.status,occupiedBy:l.occupiedBy||[],currentHouseId:l.currentHouseId||'',maxLevels:l.maxLevels||1})),attachments:(db.attachments||[]).filter(f=>f.houseNumber===job.houseNumber).map(f=>({fileId:f.fileId,fileType:f.fileType,url:f.url||f.filePath||f.path})),dock:(db.dock?.bays||[]).filter(b=>b.houseNumber===job.houseNumber),geofencingEnabled:!!db.meetingSafety?.geofencingEnabled};
}
async function handle({db,actor,method,p={},query={},at,saveFiles}){
    roles(actor,['Admin','Executive','WH3_TeamLeader','WH_Staff','Check_House','QA_Inspector','Tagging_Staff']);
    if(method==='POST'&&p.action==='create-sit'){
        roles(actor,['Admin']);
        const house=String(p.houseNumber||'');if(!/^SIT-WH3-INBOUND-\d{8}-[A-Z]\d{1,2}$/.test(house)||p.simulation!==true)fail('สร้างได้เฉพาะชุด SIT-WH3-INBOUND และต้องยืนยันข้อมูลจำลอง',422);
        const existing=(db.jobs||[]).find(j=>j.houseNumber===house);if(existing){if(existing.sitFixture?.simulation!==true)fail('เลขนี้มีงานเดิมที่ไม่ได้สร้างจาก fixture นี้ ห้ามเขียนทับ');return {...snapshot(db,existing),replayed:true};}
        const driver=(db.users||[]).find(u=>u.id==='sit_ui_driver'&&u.role==='Driver'&&u.status!=='Inactive');if(!driver)fail('ไม่พบ SIT Driver ที่ใช้งานได้');
        const j={id:crypto.randomUUID(),houseNumber:house,hawbNumber:house,onhandNumber:'SIT-F-'+house.slice(16),mawbNumber:'SIT-MASTER-'+house.slice(16),customerName:'SIT ONLY WH3 INBOUND',invoiceNo:'SIT-INV-'+house,contact:'SIT ONLY',tel:'0000000000',shipmentSource:'SCD',pieceCount:3,packageType:'CTN',packageCounts:{CTN:3},driverId:driver.id,driverName:driver.name,vehiclePlate:'SIT-INBOUND',status:'WaitingForDock',driverRouteStatus:'ReleasedForDock',csConfirmed:true,csConfirmedAt:at,cargoIssuedAt:at,arrivedWh3At:at,releaseDocumentReceivedAt:at,trackType:'Single',flightNo:'SIT-WH3',flightTime:new Date(Date.parse(at)+48*3600000).toISOString(),destination:'WH3',routeType:'WH3',amount:0,createdAt:at,updatedAt:at,sitFixture:{simulation:true,createdBy:actor.id,at,note:'SIT initial state at WH3/release document; no unload, receipt, QA, location or close fabricated'}};
        db.jobs.push(j);db.locations||=[];const sitLocation='SIT-LOC-'+house.slice(16);if(!db.locations.some(l=>l.id===sitLocation))db.locations.push({id:sitLocation,status:'Available',currentHouseId:'',maxBoxes:3,simulation:true,sitHouseNumber:house});db.meetingSafety||={enabled:false,geofencingEnabled:false,queueMinutes:15};db.meetingSafety.sitHouseNumbers=[...new Set([...(db.meetingSafety.sitHouseNumbers||[]),house])];
        return {...snapshot(db,j),mutated:true,activity:'SITInboundCreated'};
    }
    const h=method==='GET'?query.houseNumber:p.houseNumber;
    const job=(db.jobs||[]).find(j=>j.houseNumber===h);if(!job)fail('ไม่พบ House กรุณาค้นเลขหลักที่ชัดเจน',404);
    if(method==='GET')return snapshot(db,job);
    if(method!=='POST')fail('Method not allowed',405);
    roles(actor,whRoles);if(request(job,p))return {...snapshot(db,job),replayed:true};
    if((job.inboundClosedAt&&job.inboundClosedRevision===job.inboundReceipt?.revision)||job.invoiceId||job.readyForBilling||job.status==='Cancelled'||job.csRejected)fail('งานปิดรับ ส่งต่อ หรือพักโดย CS แล้ว ต้องตรวจผู้รับผิดชอบก่อนแก้รับเข้า');
    if(!recorded(at))fail('เวลาบันทึกไม่ถูกต้อง');
    if(!['inspection','hold','resolve'].includes(p.action))fail('คำสั่งรับเข้าไม่ถูกต้อง',422);
    if(p.action==='inspection'){
        assertUnloaded(job);assertNotHeld(job);
        const checks=['references','invoice','packing','condition'];if(checks.some(k=>p.checks?.[k]!==true))fail('ต้องตรวจเลขอ้างอิง Invoice หีบห่อ และสภาพสินค้าครบ',422);
        assertChecklist(job,p);
        job.inboundInspection={checks:Object.fromEntries(checks.map(k=>[k,true])),checkedAt:at,checkedBy:actor.id,wdChecklist:p.wdChecklist||[]};
    }else{
        const reason=String(p.reason||'').trim();if(reason.length<5||reason.length>1000)fail('ระบุเหตุผลอย่างน้อย 5 ตัวอักษร',422);
        if(p.action==='hold'){
            if(!['Damage','Over','Short','Reference','Document'].includes(p.kind))fail('เลือกประเภทพักรับ',422);
            if(['Open','Rejected'].includes(job.inboundHold?.state))fail('มีรายการพักที่ยังไม่ตัดสินใจหรือถูกปฏิเสธแล้ว ห้ามเขียนทับ');
            evidence(p.evidence,'หลักฐานพักรับ');
            const files=saveFiles(job.houseNumber,'InboundHoldEvidence',[p.evidence]);
            job.inboundHold={id:crypto.randomUUID(),state:'Open',kind:p.kind,reason,openedAt:at,openedBy:actor.id,fileIds:files.map(f=>f.fileId)};
        }else{
            roles(actor,['Admin','WH3_TeamLeader']);
            if(job.inboundHold?.state!=='Open')fail('ไม่มีรายการพักที่รอตัดสินใจ');
            if(!['Resume','Reject'].includes(p.decision))fail('เลือกกลับมาตรวจรับต่อหรือปฏิเสธ',422);
            if(p.decision==='Resume'&&Object.values(receipts.house(job).over).some(n=>n>0))fail('ยังมียอดเกิน ต้องตรวจแก้แผนหรือยอดกับ CS ก่อนปลดพัก');
            evidence(p.evidence,'หลักฐานการตัดสินใจ');const files=saveFiles(job.houseNumber,'InboundHoldDecision',[p.evidence]);
            job.inboundHold={...job.inboundHold,state:p.decision==='Resume'?'Resolved':'Rejected',decision:p.decision,decisionReason:reason,decidedBy:actor.id,decidedAt:at,decisionFileIds:files.map(f=>f.fileId)};
            job.inboundInspection=null;
            // Re-inspect and scan QA again after a hold; never turn a resolution into QA approval.
            job.qaApproval=null;
        }
    }
    job.inboundControlRevision=(job.inboundControlRevision||0)+1;
    job.inboundControlHistory=[...(job.inboundControlHistory||[]),{requestId:p.requestId,fingerprint:crypto.createHash('sha256').update(JSON.stringify([p.action,p.kind||'',p.reason||'',p.decision||'',p.checks||null,p.wdChecklist||null,p.evidence||null])).digest('hex'),action:p.action,revision:job.inboundControlRevision,at,by:actor.id,hold:job.inboundHold?{...job.inboundHold}:null}];job.updatedAt=at;
    return {...snapshot(db,job),mutated:true,activity:'InboundControl:'+p.action};
}
module.exports={assertUnloaded,assertNotHeld,assertChecklist,assertPutaway,assertRelease,validateLocation,storageQuantities,handle,wdKeys};
