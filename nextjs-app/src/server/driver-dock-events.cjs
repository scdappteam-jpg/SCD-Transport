/* eslint-disable @typescript-eslint/no-require-imports -- server domain boundary */
const core=require('../../public/legacy/driver-dock-core.js');
const {evidence}=require('./operations-control.cjs');
const driverHistory=require('./operations-driver-history.cjs');
const fail=(message,statusCode=409)=>{throw Object.assign(new Error(message),{statusCode});};
const steps=['arrive','unload-start','unload-complete'];
function prepare(db,actor,p,at=new Date().toISOString()){
    if(actor?.role!=='Driver')fail('คนขับต้องยืนยันขั้นตอน Dock ด้วยบัญชีของตนเอง',403);
    const job=(db.jobs||[]).find(j=>j.houseNumber===p.houseNumber);
    if(!job)fail('ไม่พบ House',404);
    if(job.driverId!==actor.id)fail('ทำได้เฉพาะ House ที่มอบหมายให้คุณ',403);
    if(!core.active(job)||job.csRejected)fail('งานถูกพัก ยกเลิก หรือจบแล้ว');
    if(!job.csConfirmed||!job.cargoIssuedAt)fail('ต้องผ่าน CS และเปิดใบงานก่อนดำเนินการ Dock');
    if(!Number.isFinite(Date.parse(job.arrivedWh3At))||!Number.isFinite(Date.parse(job.releaseDocumentReceivedAt)))fail('ต้องถึง WH3 และรับใบตรวจปล่อยก่อนยืนยันเข้าท่า');
    const bay=(db.dock?.bays||[]).find(b=>b.houseNumber===job.houseNumber&&b.status==='Occupied');
    if(!bay||!Number.isFinite(Date.parse(bay.assignedAt))||bay.id!==p.bayId||bay.assignedAt!==p.assignedAt)fail('ช่อง Dock เปลี่ยนแล้วหรือยังไม่ถูกเรียก กรุณารีเฟรช');
    if(!['D8','D9','D10','D11'].includes(bay.id))fail('ต้องเป็นช่องรับเข้า WH3 D8-D11');
    if(!steps.includes(p.event))fail('ขั้นตอน Dock ไม่ถูกต้อง',422);
    if(typeof p.simulation!=='boolean')fail('ระบุประเภทข้อมูลจำลองให้ชัดเจน',422);
    const sit=/^SIT(?:UI)?[-A-Z0-9]/i.test(job.houseNumber);
    if(p.simulation!==sit)fail(sit?'งาน SIT ต้องยืนยันว่าใช้ข้อมูลจำลอง':'ห้ามใช้หลักฐานจำลองกับงานจริง',403);
    if(!/^[A-Za-z0-9-]{8,100}$/.test(String(p.requestId||'')))fail('ต้องมีรหัสคำขอ Dock',422);
    const progress=core.progress(job,bay);
    const request=(job.driverDockHistory||[]).find(e=>e.requestId===p.requestId);
    if(request&&(request.event!==p.event||request.bayId!==bay.id||request.assignedAt!==bay.assignedAt))fail('รหัสคำขอนี้ถูกใช้กับขั้นตอนอื่นแล้ว');
    const prior=progress.events.find(e=>e.event===p.event);
    if(prior)return {job,bay,progress,replayed:true,record:prior};
    if(p.expectedRevision!==progress.revision)fail('ขั้นตอน Dock เปลี่ยนแล้ว กรุณารีเฟรช');
    const index=steps.indexOf(p.event);
    if(progress.events.length!==index)fail(index===1?'ต้องยืนยันเข้าท่าก่อนเริ่มลงสินค้า':index===2?'ต้องเริ่มลงสินค้าก่อนยืนยันลงเสร็จ':'ลำดับ Dock ไม่ถูกต้อง');
    if(!sit&&p.event==='arrive'&&job.inboundReceipt)fail('งานนี้มียอดรับแล้ว ต้องตรวจผู้รับผิดชอบก่อนบันทึกเข้าท่าย้อนหลัง');
    if(!Number.isFinite(Date.parse(at))||Date.parse(at)<Date.parse(bay.assignedAt)||progress.events.some(e=>Date.parse(e.at)>Date.parse(at)))fail('เวลา Dock ไม่ถูกต้อง');
    if(p.event==='unload-complete')evidence(p.evidence,'ภาพหรือเอกสารยืนยันลงสินค้าเสร็จ');
    const roundId=driverHistory.round(job).id;
    const roundJobs=roundId?(db.jobs||[]).filter(j=>j.driverId===job.driverId&&driverHistory.round(j).id===roundId):[job];
    return {job,bay,progress,roundJobs,replayed:false,record:{requestId:p.requestId,event:p.event,at,by:actor.id,bayId:bay.id,assignedAt:bay.assignedAt,queueNumber:bay.queueNumber||null,simulation:sit,note:String(p.note||'').trim().slice(0,500),evidenceFileIds:[]}};
}
function apply(plan,files=[]){
    if(plan.replayed)return plan.record;
    if(plan.record.event==='unload-complete'&&!files.length)fail('ยังไม่บันทึกหลักฐานลงสินค้าเสร็จ');
    plan.record.evidenceFileIds=files.map(f=>f.fileId);
    plan.job.driverDockHistory=[...plan.job.driverDockHistory||[],plan.record];
    const current=core.progress(plan.job,plan.bay);
    Object.assign(plan.job,{dockArrivedAt:current.arrivedAt,wh3UnloadStartedAt:current.unloadStartedAt,wh3UnloadCompletedAt:current.unloadCompletedAt,updatedAt:plan.record.at});
    if(plan.record.event==='unload-complete'&&(plan.roundJobs||[plan.job]).every(j=>Number.isFinite(Date.parse(j.wh3UnloadCompletedAt)))){
        for(const job of plan.roundJobs||[plan.job])Object.assign(job,{driverCompletedAt:plan.record.at,vehicleAvailableAt:plan.record.at,driverRouteStatus:'Available',updatedAt:plan.record.at});
    }
    return plan.record;
}
module.exports={prepare,apply};
