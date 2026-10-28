/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS compatibility guards. */
const receipts = require('./inbound-receipts.cjs');
const whInbound = require('./warehouse-inbound.cjs');
function fail(message, statusCode = 409) { const error = new Error(message); error.statusCode = statusCode; throw error; }
function selection(db, payload, findJob) {
    const houses = Array.isArray(payload.houseNumbers) && payload.houseNumbers.length ? payload.houseNumbers : [payload.houseNumber];
    if (!houses.length || houses.some(house => typeof house !== 'string' || !house.trim())) fail('กรุณาระบุ House ให้ครบ',422);
    const unique = [...new Set(houses.map(house => house.trim()))];
    const jobs = unique.map(house => findJob(db,house));
    if (jobs.some(job => !job)) fail(`ไม่พบ House ${unique.filter((house,i)=>!jobs[i]).join(', ')} กรุณาตรวจทั้งชุด`,404);
    return jobs;
}
function rejectCs(db,payload,findJob) {
    const jobs = selection(db,payload,findJob);
    if (!String(payload.reason || '').trim()) fail('กรุณาระบุเหตุผลการปฏิเสธงาน',422);
    if (jobs.some(job=>job.invoiceId || ['InvoiceDrafted','InvoiceSent','Billed'].includes(job.status))) fail('งานมีเอกสารวางบิลแล้ว ต้องตรวจฝ่ายบัญชีก่อนยกเลิก');
    return jobs;
}
// Receipt math remains reusable for previews; persisted inbound actions must
// establish physical arrival and the warehouse document workflow first.
function inbound(job,phase,payload={}) {
    const recorded=value=>!!value&&Number.isFinite(new Date(value).getTime());
    if(job.status==='Cancelled'||job.csRejected)fail('งานถูกพักหรือยกเลิก ต้องตรวจ CS ก่อนรับเข้าคลัง');
    if(!recorded(job.arrivedWh3At))fail('ต้องยืนยันรถถึง WH3 ก่อนดำเนินการรับเข้าคลัง');
    if(['documents','open','receipt','close'].includes(phase)&&job.shipmentSource!=='CustomerDirect'&&!recorded(job.releaseDocumentReceivedAt))fail('ต้องรับใบตรวจปล่อยหลังถึง WH3 ก่อนดำเนินงานขาเข้า');
    if(phase==='open'){
        if(!['Found','Missing'].includes(job.inboundDocStatus))fail('ต้องตรวจเอกสารขาเข้าก่อนเปิดงาน');
        if(job.inboundDocStatus==='Missing'&&payload.eiConfirmed!==true)fail('EI confirm is required before opening inbound job',422);
    }
    if(phase==='close'&&!recorded(job.inboundOpenedAt))fail('ต้องเปิดงานขาเข้าหลังตรวจเอกสารก่อนปิดรับ');
    if(['receipt','close'].includes(phase)){
        whInbound.assertUnloaded(job);
        if(phase==='close'){whInbound.assertNotHeld(job);if(!job.inboundInspection?.checkedAt)fail('ต้องตรวจสภาพสินค้าและเลขอ้างอิงก่อนปิดรับ');}
        if(!['Found','Missing'].includes(job.inboundDocStatus))fail('ต้องตรวจเอกสารขาเข้าก่อนยืนยันยอดรับ');
        if(!recorded(job.inboundOpenedAt))fail('ต้องเปิดงานขาเข้าหลังตรวจเอกสารก่อนยืนยันยอดรับ');
        const opened=Date.parse(job.inboundOpenedAt);
        if(opened<Date.parse(job.arrivedWh3At)||(job.shipmentSource!=='CustomerDirect'&&opened<Date.parse(job.releaseDocumentReceivedAt))||(recorded(job.inboundDocumentCheckedAt)&&opened<Date.parse(job.inboundDocumentCheckedAt)))fail('เอกสารหรือเวลาถึงคลังเปลี่ยนแล้ว ต้องเปิดงานรับเข้าอีกครั้ง');
        if(job.inboundDocStatus==='Missing'&&(!recorded(job.inboundEiConfirmedAt)||Date.parse(job.inboundEiConfirmedAt)!==opened))fail('ต้องบันทึก EI confirm ผ่านขั้นเปิดงานก่อนยืนยันยอดรับ');
    }
}
function terminal(job,payload={},complete=false) {
    if (!job.csConfirmed || job.csRejected) fail(`House ${job.houseNumber} ยังไม่ผ่าน CS`);
    if (!receipts.house(job).complete) fail(`House ${job.houseNumber} ยังไม่ยืนยันยอดรับจริงครบที่ WH3`);
    if (!job.terminalArrivedAt) fail('ต้องยืนยันถึง Terminal ก่อนเริ่มหรือบันทึกการชั่ง');
    if (payload.packing && (job.invoiceId || ['InvoiceSent','Billed'].includes(job.status))) fail('งานมีเอกสารวางบิลแล้ว ต้องตรวจฝ่ายบัญชีก่อนแก้ Packing');
    if (complete && !payload.packing) {
        if (!job.weighStartedAt) fail('ต้องเริ่มชั่งก่อนบันทึกผลชั่ง');
        if (typeof payload.weight !== 'string' && typeof payload.weight !== 'number') fail('กรุณาระบุน้ำหนักจริง',422);
        if (!String(payload.weight).trim() || !Number.isFinite(Number(payload.weight)) || Number(payload.weight)<=0 || !String(payload.dimension||'').trim()) fail('กรุณาระบุน้ำหนักมากกว่าศูนย์และ Dimension ให้ครบ',422);
    }
    if (complete && payload.packing && (!job.weighEndedAt || !job.terminalWeight || !job.terminalDimension)) fail('ต้องมีผลชั่งและ Dimension ก่อน Packing');
}
function billing(db,jobs,payload,documentStatus,{batch=false}={}) {
    if (!jobs.length) fail('ไม่พบงานวางบิล',404);
    if (batch && (new Set(jobs.map(job=>job.customerId)).size!==1 || jobs.some(job=>!job.customerId))) fail('Invoice รวมต้องเป็นลูกค้าเดียวกันและมีรหัสลูกค้าทุกงาน');
    for (const job of jobs) {
        if (job.csRejected || job.status==='Cancelled') fail(`House ${job.houseNumber} ถูกพักหรือยกเลิก ต้องตรวจ CS ก่อนวางบิล`);
        if (!job.readyForBilling) fail(`House ${job.houseNumber} ยังไม่พร้อมวางบิล`);
        if (job.billingReviewStatus!=='Reviewed') fail(`House ${job.houseNumber} ต้องผ่านการตรวจเอกสารก่อนสร้าง Invoice`);
        if (!documentStatus(db,job).ready) fail(`House ${job.houseNumber} เอกสารวางบิลปัจจุบันไม่ครบ`,422);
        if (job.invoiceId || (db.billing||[]).some(bill=>bill.status!=='Cancelled' && (bill.houseNumbers||[bill.houseNumber]).includes(job.houseNumber))) fail(`House ${job.houseNumber} มี Invoice แล้ว ห้ามสร้างซ้ำ`);
        const customer=(db.customers||[]).find(customer=>customer.id===job.customerId);
        if (!customer || !String(customer.name||'').trim() || !String(customer.address||'').trim()) fail(`House ${job.houseNumber} ยังไม่มีชื่อลูกค้าและที่อยู่ออกบิลครบ`,422);
    }
    const values=batch && payload.amount!=null && payload.amount!=='' ? [payload.amount] : jobs.map(job=>job.amount);
    if (values.some(value=>value==null || String(value).trim()==='' || !Number.isFinite(Number(value)) || Number(value)<0)) fail('กรุณายืนยันราคางานให้เป็นตัวเลขไม่ติดลบก่อนสร้าง Invoice',422);
    if(batch)tripCount(jobs,payload);
}
function tripCount(jobs,payload){
    if(payload.tripCount!=null&&String(payload.tripCount).trim()!==''){
        const count=Number(payload.tripCount);if(!Number.isSafeInteger(count)||count<1)fail('จำนวนรอบรถต้องเป็นจำนวนเต็มมากกว่าศูนย์',422);return count;
    }
    const rounds=jobs.map(job=>job.transportRoundId||job.billingTripId||job.pickupBatchId||job.batchId);
    if(rounds.some(round=>!round))fail('กรุณาผูกรหัสรอบรถหรือยืนยันจำนวนรอบก่อนออกบิลรวม ห้ามนับ House เป็นรอบรถ',422);
    return new Set(rounds.map((round,i)=>`${jobs[i].workDate||jobs[i].pickupDate||''}|${round}`)).size;
}
module.exports={inbound,selection,rejectCs,terminal,billing,tripCount};
