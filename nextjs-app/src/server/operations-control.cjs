/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS compatibility service. */
const receipts=require('./inbound-receipts.cjs');
const integrity=require('./workflow-integrity.cjs');
const crypto=require('node:crypto');
const roles=['Admin','Executive','Team_Transport','Terminal','CS','Billing'];
const stages=['queue','arrival','weigh','xray','rexray','load'];
function fail(message,code=422){const error=new Error(message);error.statusCode=code;throw error;}
function allow(actor,allowed){if(!actor||!allowed.includes(actor.role))fail('ไม่มีสิทธิ์ดำเนินการขั้นตอนนี้',403);}
const text=value=>String(value??'').trim();
const masterKey=value=>text(value).replace(/[\s-]/g,'').toUpperCase();
const dayFormatter=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'});
const dateKey=value=>{if(!value)return '';const d=new Date(value);return Number.isFinite(+d)?dayFormatter.format(d):'';};
const minutes=(start,end)=>start&&end&&Number.isFinite(+new Date(start))&&Number.isFinite(+new Date(end))&&+new Date(end)>=+new Date(start)?Math.round((+new Date(end)-+new Date(start))/60000):null;
const roundMoney=value=>Math.round((value+Number.EPSILON)*100)/100;
const money=value=>value!=null&&text(value)!==''&&Number.isFinite(Number(value))&&Number(value)>=0?Number(value):null;
const esc=value=>text(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function evidence(file,label='หลักฐาน'){
    if(!file||typeof file.base64!=='string')fail(`ต้องแนบ${label}`);
    const clean=file.base64.split(',').pop().replace(/\s/g,'');
    if(!clean||clean.length%4||!/^[A-Za-z0-9+/]+={0,2}$/.test(clean))fail('ไฟล์หลักฐานไม่ถูกต้อง');
    const b=Buffer.from(clean,'base64'),mime=text(file.mimeType).toLowerCase();
    const signatures={'image/png':b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),'image/jpeg':b[0]===255&&b[1]===216&&b[2]===255,'application/pdf':b.subarray(0,5).toString()==='%PDF-','image/webp':b.subarray(0,4).toString()==='RIFF'&&b.subarray(8,12).toString()==='WEBP'};
    if(!b.length||b.length>10*1024*1024||!signatures[mime])fail('หลักฐานต้องเป็น PDF JPG PNG หรือ WebP ที่ตรงชนิดไฟล์และไม่เกิน 10 MB');
}
function selected(db,p){return integrity.selection(db,p,(d,h)=>d.jobs.find(j=>j.houseNumber===h));}
function terminalJobs(db,p){
    const master=masterKey(p.master);if(!master)fail('กรุณาระบุ Master');
    const candidates=db.jobs.filter(j=>masterKey(j.mawbNumber||j.masterNumber)===master);
    if(!candidates.length)fail('ไม่พบ Master',404);
    const flights=[...new Set(candidates.map(j=>text(j.flightNo)))];
    if(flights.length>1&&!text(p.flightNo))fail('Master มีหลาย Flight ต้องเลือก Flight ที่จะทำงานให้ชัดเจน',409);
    const jobs=text(p.flightNo)?candidates.filter(j=>text(j.flightNo)===text(p.flightNo)):candidates;
    if(!jobs.length)fail('ไม่พบ Flight ใน Master',404);
    return jobs;
}
function auditPlan(jobs,patches,actor,p,at,files=[]){
    return {jobs,patches,files,event:{at,action:p.action,stage:p.stage||p.event||'',phase:p.phase||'',actorId:actor.id,channel:p.channel||'App',reportedBy:text(p.reportedBy)||actor.name||actor.id,note:text(p.note)}};
}
function prepare(db,p,actor,at=new Date().toISOString()){
    allow(actor,roles);
    if(!Number.isFinite(+new Date(at)))fail('เวลาไม่ถูกต้อง');
    if(p.action==='cancel-request'){
        allow(actor,['Admin','Executive','CS']);
        const jobs=selected(db,p);if(!text(p.note))fail('กรุณาระบุเหตุผลคำขอยกเลิก');
        return auditPlan(jobs,jobs.map(j=>({csConfirmed:false,csRejected:true,approvalStatus:'CSRejected',csApprovalRequired:true,evidenceRequired:true,csRejectedReason:text(p.note),csRejectedAt:at,cancellationRequestedAt:at,cancellationRequestedBy:actor.id,cancellationReviewStatus:j.invoiceId?'BillingReviewRequired':'OperationsReviewRequired'})),actor,p,at);
    }
    if(p.action==='assign'){
        allow(actor,['Admin','Executive','Team_Transport']);
        const jobs=selected(db,p),driver=(db.users||[]).find(u=>u.id===p.driverId&&u.role==='Driver');
        if(!driver||!text(p.vehiclePlate)||!text(p.vehicleType))fail('กรุณาเลือกคนขับ ทะเบียน และประเภทรถให้ครบ');
        if(!/^\d{4}-\d{2}-\d{2}$/.test(text(p.planDate))||dateKey(p.planDate)!==p.planDate)fail('วันที่แผนไม่ถูกต้อง');
        if(jobs.some(j=>j.routeStartedAt||j.goodsLoadedAt||j.completedAt))fail('งานเริ่มปฏิบัติแล้ว ต้องตรวจแผนก่อนเปลี่ยนรถ',409);
        const roundId=text(p.roundId)||`OP-${crypto.randomUUID()}`;
        return auditPlan(jobs,jobs.map(()=>({driverId:driver.id,driverName:driver.name,vehiclePlate:text(p.vehiclePlate),vehicleType:text(p.vehicleType),pickupDate:p.planDate,workDate:p.planDate,transportRoundId:roundId,transportPlannedAt:at})),actor,p,at);
    }
    if(p.action==='transport-event'){
        allow(actor,['Admin','Executive','Team_Transport']);
        if(!['App','Call','Radio'].includes(p.channel))fail('กรุณาระบุช่องทาง App Call หรือ Radio');
        if(p.channel!=='App'&&(!text(p.note)||!text(p.reportedBy)))fail('งานแจ้งทางโทรศัพท์หรือวิทยุต้องมีผู้แจ้งและหมายเหตุ');
        const jobs=selected(db,p),event=p.event,patches=[];
        if(!['start','arrive','door-close','wh3-arrive','wh3-depart','wh3-load-start','available'].includes(event))fail('ขั้นตอนรถไม่ถูกต้อง');
        if(['door-close','wh3-depart'].includes(event))evidence(p.proof,'ภาพประตูปิด');
        else if(p.proof)evidence(p.proof);
        if(event==='door-close'){evidence(p.productProof,'ภาพสินค้า');evidence(p.signedProof,'ใบรับสินค้าลงชื่อ');}
        for(const j of jobs){
            if(!j.csConfirmed||j.csRejected||j.status==='Cancelled'||!j.cargoIssuedAt)fail(`House ${j.houseNumber} ต้องผ่าน CS และเปิดใบงานก่อน`,409);
            const patch={};
            if(event==='start'){if(j.routeStartedAt)fail('เริ่มรอบแล้ว',409);if(!j.driverId||!j.vehiclePlate)fail('ยังไม่มีคนขับหรือทะเบียนรถ',409);Object.assign(patch,{routeStartedAt:at,driverRouteStatus:'EnRouteToPickup'});}
            if(event==='arrive'){if(!j.routeStartedAt||j.arrivedAtPickupAt)fail('ต้องเริ่มรอบและยังไม่บันทึกถึงลูกค้า',409);Object.assign(patch,{arrivedAtPickupAt:at,checkInAt:at,status:'ArrivedAtPickup',driverRouteStatus:'ArrivedAtPickup'});}
            if(event==='door-close'){if(!j.arrivedAtPickupAt||j.doorClosedPhotoAt)fail('ต้องถึงลูกค้าและยังไม่ปิดประตู',409);Object.assign(patch,{doorClosedPhotoAt:at,completedAt:at,status:'PickedUp',driverRouteStatus:'ReturningWH3',returningWh3At:at});}
            if(event==='wh3-arrive'){if(!j.doorClosedPhotoAt||j.arrivedWh3At)fail('ต้องปิดประตูก่อนกลับถึง WH3 และไม่บันทึกซ้ำ',409);Object.assign(patch,{arrivedWh3At:at,status:'WaitingForDock',driverRouteStatus:'ArrivedWH3'});}
            if(event==='wh3-load-start'){if(!receipts.house(j).complete||!j.aotApprovedAt||j.wh3LoadingStartedAt||j.goodsLoadedAt)fail('ต้องรับครบ อนุมัติ AOT และยังไม่เริ่มโหลด WH3',409);patch.wh3LoadingStartedAt=at;}
            if(event==='wh3-depart'){if(!receipts.house(j).complete||!j.aotApprovedAt||!j.cargoTransferIssuedAt||j.goodsLoadedAt)fail('ต้องรับครบ อนุมัติ AOT ออก Cargo Transfer และยังไม่ออก WH3',409);Object.assign(patch,{releasedWh3At:at,goodsLoadedAt:at,status:'GoodsLoaded',driverRouteStatus:'EnRouteToTerminal'});}
            if(event==='available'){if(!j.arrivedWh3At&&!j.terminalClosedAt)fail('ต้องส่งถึง WH3 หรือปิด Terminal ก่อนยืนยันรถว่าง',409);Object.assign(patch,{vehicleAvailableAt:at,driverRouteStatus:'Available'});}
            patches.push(patch);
        }
        const files=p.proof?[{...p.proof,fileType:event==='door-close'?'PickupDoorClosedPhoto':event==='wh3-depart'?'PreLoadPhoto':'TransportEventEvidence'}]:[];
        if(event==='door-close')files.push({...p.productProof,fileType:'ProductImage'},{...p.signedProof,fileType:'CargoPickupForm'});
        return auditPlan(jobs,patches,actor,p,at,files);
    }
    if(p.action==='terminal'){
        allow(actor,['Admin','Executive','Terminal']);
        if(!stages.includes(p.stage)||!['start','complete'].includes(p.phase))fail('กรุณาเลือกขั้น Terminal และเริ่มหรือเสร็จให้ถูกต้อง');
        const jobs=terminalJobs(db,p),patches=[],s=p.stage,finish=p.phase==='complete';
        if(p.expectedHouses && (!Array.isArray(p.expectedHouses)||p.expectedHouses.length!==jobs.length||new Set(p.expectedHouses).size!==jobs.length||jobs.some(j=>!p.expectedHouses.includes(j.houseNumber))))fail('ชุด House ของ Master เปลี่ยนแล้ว กรุณารีเฟรชและตรวจขอบเขตก่อนบันทึก',409);
        if(['queue','arrival'].includes(s)&&!finish)fail('รับคิวและรับสินค้าใช้ยืนยันเสร็จเท่านั้น');
        if(finish&&!['queue','arrival'].includes(s))evidence(p.proof,`ภาพหรือเอกสาร ${s}`);
        else if(p.proof)evidence(p.proof);
        if(s==='weigh'&&finish&&(money(p.weight)===null||Number(p.weight)<=0||!text(p.dimension)))fail('ต้องมีน้ำหนักจริงมากกว่าศูนย์และ Dimension ของ Master');
        if(['xray','rexray'].includes(s)&&finish&&!['Passed','Hold','ReXRayRequired'].includes(p.result))fail('กรุณาระบุผล X-Ray');
        for(const j of jobs){
            if(!j.csConfirmed||j.csRejected||!receipts.house(j).complete)fail(`House ${j.houseNumber} ยังไม่ผ่าน CS หรือยอดรับ WH3`,409);
            if(j.readyForBilling||j.invoiceId)fail('Master นี้มีงานปิด Terminal หรือเข้าวางบิลแล้ว ต้องตรวจแก้ไขเฉพาะรายการ',409);
            const patch={},startKey={weigh:'weighStartedAt',xray:'xrayStartedAt',rexray:'reXrayStartedAt',load:'loadStartedAt'}[s],endKey={weigh:'weighEndedAt',xray:'xrayCompletedAt',rexray:'reXrayCompletedAt',load:'loadEndedAt'}[s];
            if(s==='queue'){if(!j.aotApprovedAt||j.queueReceivedAt)fail('ต้องอนุมัติ AOT และยังไม่บันทึกรับคิว',409);patch.queueReceivedAt=at;}
            if(s==='arrival'){if(!j.goodsLoadedAt||j.cargoReceivedAt)fail('ต้องโหลดออก WH3 และยังไม่บันทึกรับสินค้า Terminal',409);Object.assign(patch,{cargoReceivedAt:at,terminalArrivedAt:j.terminalArrivedAt||at,status:'TerminalArrived',driverRouteStatus:'TerminalArrived'});}
            if(startKey){
                if(!j.terminalArrivedAt)fail('ต้องถึง Terminal ก่อนเริ่มขั้นตอน',409);
                if(s==='xray'&&!j.weighEndedAt)fail('ต้องชั่งเสร็จก่อน X-Ray',409);
                if(s==='rexray'&&!j.requiresRescan&&j.xrayStatus!=='Hold')fail('ไม่มีคำสั่ง Re-X-Ray หรือ Hold',409);
                if(s==='load'&&(j.xrayStatus!=='Passed'||j.requiresRescan||['XRayHold','ReXRayRequired'].includes(j.status)))fail(`House ${j.houseNumber} ยังไม่ผ่าน X-Ray`,409);
                if(finish){if(!j[startKey]||j[endKey])fail('ต้องเริ่มขั้นตอนก่อน และห้ามยืนยันเสร็จซ้ำ',409);patch[endKey]=at;}
                else {if(j[startKey]&&!j[endKey])fail('ขั้นตอนเริ่มแล้ว',409);if(j[endKey]&&s!=='rexray')fail('ขั้นตอนเสร็จแล้ว',409);patch[startKey]=at;if(s==='rexray')patch.reXrayCompletedAt=null;}
                if(finish&&s==='weigh')Object.assign(patch,{terminalMasterWeight:Number(p.weight),terminalMasterDimension:text(p.dimension),status:'WeightDimensionRecorded'});
                if(finish&&['xray','rexray'].includes(s))Object.assign(patch,{xrayStatus:p.result==='Passed'?'Passed':'Hold',requiresRescan:p.result!=='Passed',status:p.result==='Passed'?'XRayPassed':p.result==='Hold'?'XRayHold':'ReXRayRequired',reXrayCount:Number(j.reXrayCount||0)+(s==='rexray'?1:0)});
                if(finish&&s==='load')Object.assign(patch,{terminalClosedAt:at,loadingDetailUploaded:true,readyForBilling:true,readyForBillingAt:at,status:'ReadyForBilling'});
            }
            patches.push(patch);
        }
        return auditPlan(jobs,patches,actor,p,at,finish&&p.proof?[{...p.proof,fileType:{queue:'TerminalQueueEvidence',arrival:'TerminalArrivalEvidence',weigh:'MasterWeightSlip',xray:'MasterXRayEvidence',rexray:'MasterReXRayEvidence',load:'LoadingDetail'}[s]}]:[]);
    }
    if(p.action==='price'){
        allow(actor,['Admin','Executive','Billing']);const jobs=selected(db,p);
        if(money(p.amount)===null||money(p.cost)===null)fail('ต้องยืนยันราคางานและต้นทุนเป็นตัวเลขไม่ติดลบ');
        if(jobs.length!==1)fail('บันทึกราคาทีละ House เพื่อไม่คิดยอดซ้ำทั้งชุด');
        if(jobs[0].invoiceId)fail('มี Invoice แล้ว ต้องตรวจเอกสารเดิมก่อนแก้ราคา',409);
        if(p.fuelCost!=null && text(p.fuelCost)!=='' && (money(p.fuelCost)===null||Number(p.fuelCost)>Number(p.cost)))fail('ค่าเชื้อเพลิงต้องไม่เกินต้นทุนรวมและไม่ติดลบ');
        return auditPlan(jobs,[{amount:Number(p.amount),transportCost:Number(p.cost),fuelCost:money(p.fuelCost),priceConfirmedAt:at,costConfirmedAt:at,priceConfirmedBy:actor.id}],actor,p,at);
    }
    fail('ไม่รองรับคำสั่งนี้');
}
function apply(plan){for(let i=0;i<plan.jobs.length;i++){const j=plan.jobs[i];Object.assign(j,plan.patches[i],{updatedAt:plan.event.at});j.operationsEvents||=[];j.operationsEvents.push({...plan.event});}}
function summary(db,filters={},at=new Date().toISOString(),includeFinance=true){
    const period=['day','month','year'].includes(filters.period)?filters.period:'day';
    const dateBasis=filters.dateBasis==='pickup'?'pickup':'work';
    const planDay=j=>dateKey(dateBasis==='pickup'?j.pickupDate:(j.workDate||j.pickupDate||j.planDate));
    const all=(db.jobs||[]).filter(j=>!j.mergedInto),jobs=all.filter(j=>{const day=planDay(j);return((!filters.from&&!filters.to)||!!day)&&(!filters.from||day>=filters.from)&&(!filters.to||day<=filters.to)&&(!filters.query||[j.houseNumber,j.onhandNumber,j.mawbNumber,j.customerName,j.vehiclePlate].some(v=>text(v).toLowerCase().includes(text(filters.query).toLowerCase())));});
    const drivers=(db.users||[]).filter(u=>u.role==='Driver').map(u=>({id:u.id,name:u.name,phone:u.phone||u.tel||'',vehiclePlate:u.vehiclePlate||''}));
    const selectedJobs=new Set(jobs),selectedMasters=new Set(jobs.map(j=>j.mawbNumber||j.masterNumber).filter(Boolean));
    const allRows=all.filter(j=>selectedJobs.has(j)||selectedMasters.has(j.mawbNumber||j.masterNumber)).map(j=>{
        const driver=drivers.find(d=>d.id===j.driverId),r=receipts.house(j),pickupMinutes=minutes(j.arrivedAtPickupAt||j.checkInAt,j.doorClosedPhotoAt),dispatchMinutes=minutes(j.wh3LoadingStartedAt,j.releasedWh3At),waitStart=j.queueReceivedAt&&j.cargoReceivedAt?(+new Date(j.queueReceivedAt)>+new Date(j.cargoReceivedAt)?j.queueReceivedAt:j.cargoReceivedAt):null;
        return {id:j.id,houseNumber:j.houseNumber,onhandNumber:j.onhandNumber||'',master:j.mawbNumber||j.masterNumber||'',flight:j.flightNo||'',customerId:j.customerId||'',customerName:j.customerName||'',status:j.status,csConfirmed:!!j.csConfirmed,csRejected:!!j.csRejected,planDate:planDay(j),pickupDate:dateKey(j.pickupDate),workDate:dateKey(j.workDate||j.planDate),driverId:j.driverId||'',driverName:j.driverName||driver?.name||'',phone:driver?.phone||'',plate:j.vehiclePlate||'',vehicleType:j.vehicleType||'',round:j.transportRoundId||j.pickupBatchId||j.batchId||'',transportState:j.driverRouteStatus||(!j.driverId||!j.vehiclePlate?'ยังไม่จัดรถครบ':'มีแผน ยังไม่ยืนยันเริ่ม'),tripStarted:!!(j.routeStartedAt||j.goodsLoadedAt||j.doorClosedPhotoAt||j.terminalClosedAt),outboundPlate:j.aotVehiclePlate||'',outboundDriver:j.aotDriverName||'',planCounts:r.planned,receipt:r,receivedCounts:r.confirmed?r.received:null,pickupMinutes,pickupKpi:pickupMinutes===null?'ยังไม่มีเวลาครบ':pickupMinutes<=30?'Within30':'Over30',dispatchMinutes,dispatchKpi:dispatchMinutes===null?'ยังไม่มีเวลาครบ':dispatchMinutes<=30?'Within30':'Over30',queueReceivedAt:j.queueReceivedAt||null,cargoReceivedAt:j.cargoReceivedAt||null,queueWaitingMinutes:minutes(waitStart,j.weighStartedAt||at),weighStartedAt:j.weighStartedAt||null,weighEndedAt:j.weighEndedAt||null,terminalMasterWeight:j.terminalMasterWeight??null,terminalMasterDimension:j.terminalMasterDimension||'',xrayStartedAt:j.xrayStartedAt||null,xrayCompletedAt:j.xrayCompletedAt||null,reXrayStartedAt:j.reXrayStartedAt||null,reXrayCompletedAt:j.reXrayCompletedAt||null,loadStartedAt:j.loadStartedAt||null,loadEndedAt:j.loadEndedAt||null,readyForBilling:!!j.readyForBilling,invoiceId:j.invoiceId||'',billingWaitingMinutes:j.readyForBilling&&!j.invoiceId?minutes(j.readyForBillingAt||j.terminalClosedAt,at):null,amount:money(j.amount),cost:money(j.transportCost),completedPickupAt:j.doorClosedPhotoAt||null,completedTerminalAt:j.terminalClosedAt||null,events:j.operationsEvents||[]};
    });
    const selectedKeys=new Set(jobs.map(j=>JSON.stringify([j.houseNumber,j.mawbNumber||j.masterNumber||''])));
    const rows=allRows.filter(r=>selectedKeys.has(JSON.stringify([r.houseNumber,r.master])));
    const groups=new Map(),vehicles=new Map(),series=new Map();
    for(const r of rows){
        const key=`${r.planDate}|${r.customerId||r.customerName}`;if(!groups.has(key))groups.set(key,{date:r.planDate,customer:r.customerName,total:0,planned:0,pending:0,received:0});const g=groups.get(key);g.total++;if(r.driverId&&r.plate&&r.vehicleType)g.planned++;else g.pending++;if(r.receipt.complete)g.received++;
        if(r.plate){if(!vehicles.has(r.plate))vehicles.set(r.plate,{plate:r.plate,jobs:0,rounds:new Set(),plannedRounds:new Set(),states:new Set(),unlinked:0,planCounts:{},receiptCounts:{},driver:r.driverName,phone:r.phone});const v=vehicles.get(r.plate);v.states.add(r.transportState);v.jobs++;if(r.round){v.plannedRounds.add(`${r.planDate}|${r.round}`);if(r.tripStarted)v.rounds.add(`${r.planDate}|${r.round}`);}else v.unlinked++;for(const[u,n]of Object.entries(r.planCounts))v.planCounts[u]=(v.planCounts[u]||0)+Number(n||0);for(const[u,n]of Object.entries(r.receivedCounts||{}))v.receiptCounts[u]=(v.receiptCounts[u]||0)+Number(n||0);}
        
    }
    for(const j of all.filter(j=>!filters.query||[j.houseNumber,j.onhandNumber,j.mawbNumber,j.customerName,j.vehiclePlate].some(v=>text(v).toLowerCase().includes(text(filters.query).toLowerCase())))){for(const [kind,time]of [['pickup',j.doorClosedPhotoAt],['terminal',j.terminalClosedAt]]){const day=dateKey(time);if(day&&(!filters.from||day>=filters.from)&&(!filters.to||day<=filters.to)){const k=period==='year'?day.slice(0,4):period==='month'?day.slice(0,7):day;if(!series.has(k))series.set(k,{period:k,pickup:0,terminal:0});series.get(k)[kind]++;}}}
    const masters=[...new Set(rows.map(r=>r.master).filter(Boolean))].map(master=>({master,flights:[...new Set(allRows.filter(r=>r.master===master).map(r=>r.flight))],houses:allRows.filter(r=>r.master===master)}));
    const visibleEvidenceHouses=new Set([...rows.map(r=>r.houseNumber),...masters.flatMap(m=>m.houses.map(r=>r.houseNumber))]);
    const pending=rows.filter(r=>r.readyForBilling&&!r.invoiceId),known=rows.filter(r=>r.amount!==null&&r.cost!==null),bills=(db.billing||[]).filter(b=>(b.houseNumbers||[b.houseNumber]).length>0&&(b.houseNumbers||[b.houseNumber]).every(h=>rows.some(r=>r.houseNumber===h))&&b.status!=='Cancelled');
    const billJobs=rows.filter(r=>bills.some(b=>(b.houseNumbers||[b.houseNumber]).includes(r.houseNumber))),billedAmount=bills.every(b=>money(b.amount)!==null)?roundMoney(bills.reduce((sum,b)=>sum+Number(b.amount),0)):null;
    const report={checkedAt:at,period,dateBasis,scope:'จำนวนงานเป็นราย House รอบรถนับเฉพาะงานที่ผูกรหัสรอบ ยอดรับใช้ receipt ที่ยืนยัน ไม่ใช้แผนแทนยอดจริง',rows,drivers,plans:[...groups.values()],vehicles:[...vehicles.values()].map(v=>({...v,rounds:v.rounds.size,plannedRounds:v.plannedRounds.size,state:[...v.states].join(' / '),states:undefined})),series:[...series.values()].sort((a,b)=>a.period.localeCompare(b.period)),masters,pendingBilling:pending,billing:{count:pending.length,missingWaitingTime:pending.filter(r=>r.billingWaitingMinutes===null).length,confirmedPricedJobs:known.length,missingPrice:rows.filter(r=>r.amount===null).length,missingCost:rows.filter(r=>r.cost===null).length,quotedRevenue:roundMoney(rows.reduce((sum,r)=>sum+(r.amount??0),0)),quotedCost:roundMoney(rows.reduce((sum,r)=>sum+(r.cost??0),0)),quotedMargin:known.length===rows.length?roundMoney(known.reduce((sum,r)=>sum+r.amount-r.cost,0)):null,knownSubsetMargin:roundMoney(known.reduce((sum,r)=>sum+r.amount-r.cost,0)),invoiceCount:bills.length,invoiceAmount:billedAmount,invoiceMargin:billJobs.every(r=>r.cost!==null)&&billedAmount!==null?roundMoney(billedAmount-billJobs.reduce((sum,r)=>sum+r.cost,0)):null},evidence:(db.attachments||[]).filter(f=>visibleEvidenceHouses.has(f.houseNumber)&&String(f.url||'').startsWith('/storage/')).map(f=>({fileId:f.fileId,houseNumber:f.houseNumber,fileType:f.fileType,url:f.url,createdAt:f.createdAt})),invoices:bills.map(b=>({id:b.id,customerName:b.customerName||'',status:b.status,amount:money(b.amount),pdfUrl:String(b.pdfUrl||'').startsWith('/storage/')?b.pdfUrl:''})),customers:(db.customers||[]).map(c=>({id:c.id,name:c.name,address:c.address||'',phone:c.phone||'',billingEmail:c.billingEmail||'',taxId:c.taxId||'',creditTerm:c.creditTerm||0}))};
    if(!includeFinance){for(const r of allRows){r.amount=null;r.cost=null;r.events=r.events.filter(e=>e.action!=='price');}for(const key of ['quotedRevenue','quotedCost','quotedMargin','knownSubsetMargin','invoiceAmount','invoiceMargin'])report.billing[key]=null;report.invoices=[];report.customers=report.customers.map(c=>({id:c.id,name:c.name,address:'',phone:c.phone,billingEmail:'',taxId:'',creditTerm:0}));}
    return report;
}
function weighSlip(db,p){
    const jobs=terminalJobs(db,p);
    if(jobs.some(j=>!j.weighEndedAt||money(j.terminalMasterWeight)===null))fail('ต้องบันทึกผลชั่ง Master ครบก่อนออกใบชั่ง',409);
    const weights=[...new Set(jobs.map(j=>`${j.weighEndedAt}|${j.terminalMasterWeight}|${j.terminalMasterDimension}`))];
    if(weights.length!==1)fail('ผลชั่งราย House ไม่ใช่การชั่ง Master ชุดเดียวกัน กรุณาตรวจข้อมูล',409);
    const j=jobs[0];return `<!doctype html><html lang="th"><meta charset="utf-8"><title>ใบชั่ง Master ${esc(j.mawbNumber)}</title><style>body{font:16px Tahoma,sans-serif;margin:30px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #aaa;padding:10px}</style><h1>ใบชั่งสินค้า Master</h1><p>Master ${esc(j.mawbNumber)} Flight ${esc(j.flightNo)}</p><p>น้ำหนักรวม Master ${esc(j.terminalMasterWeight)} kg Dimension ${esc(j.terminalMasterDimension)}</p><p>เริ่ม ${esc(j.weighStartedAt)} เสร็จ ${esc(j.weighEndedAt)}</p><table><tr><th>House</th><th>Onhand</th></tr>${jobs.map(r=>`<tr><td>${esc(r.houseNumber)}</td><td>${esc(r.onhandNumber)}</td></tr>`).join('')}</table><p>น้ำหนักนี้เป็นยอดรวม Master ไม่ใช่น้ำหนักซ้ำต่อ House</p></html>`;
}
module.exports={roles,prepare,apply,summary,weighSlip,terminalJobs,evidence,minutes};
