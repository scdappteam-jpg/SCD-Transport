const fields=[['routeStartedAt','เริ่มรอบ'],['checkInAt','ถึงจุดรับ'],['loadedAt','ยืนยันโหลดขึ้นรถ'],['completedAt','ออกจากโรงงาน/เริ่มกลับ WH3'],['arrivedWh3At','ถึง WH3'],['releaseDocumentReceivedAt','รับใบตรวจปล่อย'],['dockArrivedAt','เข้าท่า Dock'],['wh3UnloadStartedAt','เริ่มลงสินค้า WH3'],['wh3UnloadCompletedAt','ลงสินค้า WH3 เสร็จ']];
const date = value => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value)) : '';
const escape = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function report(db,actor,filters={}) {
    if (!actor || !['Admin','Executive','Team_Transport','WH3_TeamLeader','Driver'].includes(actor.role)) throw Object.assign(new Error('ไม่มีสิทธิ์ดูรายงานเวลา Driver'),{statusCode:403});
    if (actor.role==='Driver' && filters.driverId && filters.driverId!==actor.id) throw Object.assign(new Error('ดูได้เฉพาะเวลางานของตนเอง'),{statusCode:403});
    const driverId=actor.role==='Driver'?actor.id:filters.driverId;
    const rows=(db.jobs||[]).filter(j=>!driverId||j.driverId===driverId).filter(j=>filters.includeSIT==='true'||!/^SIT/i.test(j.houseNumber||'')).map(j=>{
        const files=(db.attachments||[]).filter(f=>f.houseNumber===j.houseNumber);
        const photoAt=files.filter(f=>f.fileType==='ProductImage').map(f=>f.createdAt).filter(t=>date(t)).sort()[0]||null;
        const checkIn=j.checkInAt||j.arrivedAtPickupAt||null;
        const times=Object.fromEntries(fields.map(([key])=>[key,key==='checkInAt'?checkIn:j[key]||null]));
        const start=times.arrivedWh3At,end=times.releaseDocumentReceivedAt;
        return {houseNumber:j.houseNumber,onhandNumber:j.onhandNumber||'',houseReference:j.hawbNumber||'',master:j.mawbNumber||'',customerName:j.customerName||'',driverId:j.driverId||'',driverName:(db.users||[]).find(u=>u.id===j.driverId)?.name||j.driverName||'',vehiclePlate:j.vehiclePlate||'',synthetic:/^SIT/i.test(j.houseNumber||''),photoAt,times,documentWaitMinutes:start&&end&&Date.parse(end)>=Date.parse(start)?Math.round((Date.parse(end)-Date.parse(start))/60000):null};
    }).filter(r=>{
        const day=date(r.times.routeStartedAt||r.times.checkInAt);
        if (filters.from && (!day||day<filters.from)) return false;
        if (filters.to && (!day||day>filters.to)) return false;
        return !filters.query || [r.houseNumber,r.onhandNumber,r.houseReference,r.master,r.customerName,r.driverName].some(v=>v.toLowerCase().includes(String(filters.query).toLowerCase()));
    });
    return {generatedAt:new Date().toISOString(),timeZone:'Asia/Bangkok',fields,rows};
}
function html(result) {
    const time=value=>value&&date(value)?new Date(value).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'}):'ยังไม่มีเวลา';
    return `<!doctype html><html lang="th"><meta charset="utf-8"><title>Driver Time Log Report</title><style>body{font:14px/1.6 Tahoma,Arial;margin:24px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #bbc7d1;padding:8px;vertical-align:top}.sit{background:#fff2ce}@media print{button{display:none}}</style><h1>Driver Time Log Report</h1><p>เวลา Asia/Bangkok • เป็นเอกสารอ้างอิงแยกจากใบ Cargo เดิม • ช่องที่ยังไม่มีเวลาจะไม่ใช้เวลาสร้างหรือแก้ไขแทน</p><table><thead><tr><th>งาน/คนขับ</th>${result.fields.map(([,label])=>`<th>${escape(label)}</th>`).join('')}<th>รูปสินค้า</th><th>รอเอกสาร (นาที)</th></tr></thead><tbody>${result.rows.map(r=>`<tr class="${r.synthetic?'sit':''}"><td>${escape(r.houseNumber)}<br>${escape(r.houseReference)}<br>${escape(r.master)}<br>${escape(r.customerName)}<br>${escape(r.driverName)} / ${escape(r.vehiclePlate)}${r.synthetic?'<br><b>SIT — ข้อมูลจำลอง</b>':''}</td>${result.fields.map(([key])=>`<td>${escape(time(r.times[key]))}</td>`).join('')}<td>${escape(time(r.photoAt))}</td><td>${r.documentWaitMinutes??'ยังไม่มีเวลาครบ'}</td></tr>`).join('')}</tbody></table></html>`;
}
module.exports={report,html};
