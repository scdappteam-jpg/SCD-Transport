const timestamp = value => value && Number.isFinite(Date.parse(value)) ? Date.parse(value) : Infinity;
const fail = message => {throw Object.assign(new Error(message),{statusCode:409});};
function kind(job,entry={}) {return entry.queueType==='Outbound'?'Outbound':job?.shipmentSource==='CustomerDirect'?'External':'Inbound';}
function bayKind(bay) {const n=Number(String(bay.id).replace(/^D/i,''));return n===7?'External':n>=8&&n<=11?'Inbound':'Outbound';}
function isActive(job,entry={}) {
    if(!job)return true; // Preserve unmatched legacy entries for staff review.
    if(['Cancelled','Completed','Rejected','Billed','InvoiceSent'].includes(job.status))return false;
    if(kind(job,entry)!=='Outbound' && ['TerminalArrived','WeightDimensionRecorded','XRayPassed','PackingConsolidation','ReadyForBilling','BillingReviewed','InvoiceDrafted'].includes(job.status))return false;
    return true;
}
function queue(db) {
    const jobs=new Map((db.jobs||[]).map(j=>[j.houseNumber,j]));
    const entries=(db.dock?.queue||[]).filter(e=>isActive(jobs.get(e.houseNumber),e)).map(e=>({...e,queueType:kind(jobs.get(e.houseNumber),e)}));
    entries.sort((a,b)=>{
        if (a.queueType!==b.queueType) return a.queueType.localeCompare(b.queueType);
        if (a.queueType===b.queueType && a.queueType!=='External') {
            const aj=jobs.get(a.houseNumber)||{},bj=jobs.get(b.houseNumber)||{};
            const delta=timestamp(aj.cargoCutoffAt||aj.airportDueAt||aj.flightTime)-timestamp(bj.cargoCutoffAt||bj.airportDueAt||bj.flightTime);
            if (!Number.isNaN(delta)&&delta!==0) return delta;
        }
        return timestamp(a.arrivedAt||a.createdAt)-timestamp(b.arrivedAt||b.createdAt)||String(a.id).localeCompare(String(b.id));
    });
    const seen={};
    const minutes=Number(db.meetingSafety?.queueMinutes)||15;
    return entries.map(e=>{const ahead=seen[e.queueType]||0;seen[e.queueType]=ahead+1;return {...e,position:ahead+1,queueAhead:ahead,estimatedWaitMinutes:ahead*minutes};});
}
function suggest(db,job,entry={}) {return (db.dock?.bays||[]).find(b=>b.status==='Available'&&!b.houseNumber&&bayKind(b)===kind(job,entry)) || null;}
function assignment(db,job,entry,bay) {
    if (bayKind(bay)!==kind(job,entry)) fail('ช่อง Dock ไม่ตรงประเภท: Inbound D8–D11 / Customer Direct D7');
    const eligible=queue(db).filter(e=>e.queueType===kind(job,entry));
    if (eligible.length && eligible[0].houseNumber!==job?.houseNumber) fail('ต้องเรียกคิวที่มี Flight ด่วนที่สุดในประเภทนี้ก่อน');
}
module.exports={kind,bayKind,queue,suggest,assignment,isActive};
