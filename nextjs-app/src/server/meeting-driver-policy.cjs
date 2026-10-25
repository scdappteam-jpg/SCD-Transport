/* eslint-disable @typescript-eslint/no-require-imports -- server-only domain service */
const crypto=require('node:crypto');
const policy=require('./meeting-policy.cjs');
const pickup=require('./pickup-flow.cjs');
const evidence=require('./operations-control.cjs').evidence;
const day = at => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(at));
function fail(message,statusCode=422){throw Object.assign(new Error(message),{statusCode});}
function simulation(db,actor,p) {
    if (p.simulation!==undefined && typeof p.simulation!=='boolean') fail('simulation ต้องเป็น boolean');
    if (!p.simulation) return false;
    const houses=p.houseNumbers || [p.testHouse || p.houseNumber];
    if (!houses.length || houses.some(h=>!/^SIT(?:UI)?[-A-Z0-9]/i.test(String(h)) || !db.jobs.some(j=>j.houseNumber===h&&j.driverId===actor?.id))) fail('หลักฐานจำลองใช้ได้เฉพาะ SIT ที่มอบหมายให้ยูสนี้',403);
    return true;
}
function attendance(db,actor,p,at) {
    if (simulation(db,actor,p)) return;
    const records=(db.attendance || []).filter(r=>r.userId===actor.id && r.date===day(at) && !r.checkOutTime && !r.simulation);
    if (!records.some(r=>!db.meetingSafety?.geofencingEnabled || r.attendanceStatus==='normal'&&r.checkInLocationId)) fail('ต้อง Check-in เริ่มงานก่อนเริ่มรอบรับงาน และอยู่ในจุดที่กำหนดเมื่อเปิด Geofencing',409);
}
function pickupEvidence(p) {
    for (const [key,label] of [['productImages','รูปสินค้า/ฉลาก'],['cargoImages','ใบ Cargo ลงชื่อแล้ว'],['doorClosedImages','รูปปิดตู้/ท้ายรถ']]) {
        if (!Array.isArray(p[key]) || !p[key].length) fail(`ต้องแนบ${label}ก่อนยืนยันโหลด`);
        p[key].forEach(f=>{evidence(f,label);if(!String(f.mimeType).startsWith('image/'))fail(`${label}ต้องเป็นรูปภาพ`);});
    }
    if (!String(p.inspectorName||'').trim() || !String(p.receiverName||'').trim()) fail('ระบุชื่อผู้ตรวจและเจ้าหน้าที่รับของให้ครบ');
    pickup.signature(p.signatureBase64);pickup.signature(p.receiverSignatureBase64);
    if (p.signatureBase64===p.receiverSignatureBase64) fail('ต้องลงลายเซ็นผู้ตรวจและผู้รับแยกกัน');
    const required=pickup.checks;
    if (!Array.isArray(p.checklist) || required.some(k=>!p.checklist.includes(k))) fail('Checklist ต้องครบก่อนยืนยันโหลด');
    return crypto.createHash('sha256').update(JSON.stringify({product:p.productImages,cargo:p.cargoImages,door:p.doorClosedImages,inspector:p.inspectorName,receiver:p.receiverName,signature:p.signatureBase64,receiverSignature:p.receiverSignatureBase64})).digest('hex');
}
function preflight(db,path,p,actor,at=new Date().toISOString()) {
    const selected=policy.jobs(db,p);
    if (!db.meetingSafety?.enabled && selected.some(j=>policy.active(db,[j])) && !policy.active(db,selected)) fail('ห้ามรวมชุด SIT ที่เปิดกติกากับงานอื่นในคำขอเดียวกัน',409);
    if (!policy.active(db,selected)) return;
    if (path.startsWith('/api/dock/')) {
        const job=db.jobs.find(j=>j.houseNumber===p.houseNumber);
        if (['/api/dock/queue','/api/dock/assign'].includes(path)&&!job) fail('ไม่พบงานสำหรับเข้าคิว Dock',404);
        if (path==='/api/dock/queue' && actor?.role==='Driver') {
            if (!db.jobs.some(j=>j.houseNumber===p.houseNumber&&j.driverId===actor.id)) fail('คนขับเข้าคิวได้เฉพาะงานตนเอง',403);
            if (!job.arrivedWh3At) fail('ต้องบันทึกถึง WH3 ก่อนเข้าคิวรับสินค้า',409);
        } else if (!['Admin','Executive','Team_Transport','WH3_TeamLeader','WH_Staff'].includes(actor?.role)) fail('ไม่มีสิทธิ์จัดการคิว/ช่อง Dock',403);
        p.userId=actor.id;
    }
    if (path.startsWith('/api/pickup/') || path==='/api/attendance/checkin') simulation(db,actor,p);
    if (path==='/api/pickup/route-start' && actor?.role!=='Driver') fail('คนขับต้องเริ่มรอบด้วยยูสของตนเอง',403);
    if (path==='/api/pickup/route-start') attendance(db,actor,p,at);
    if (path==='/api/operations/control'&&p.action==='transport-event') {
        if (['start','arrive','door-close','release-document'].includes(p.event)) fail('กติกาใหม่: ใช้ Driver App บันทึกขั้นรับสินค้า พร้อม GPS Checklist รูปและลายเซ็น ห้ามข้ามผ่าน Console',409);
    }
    if (path==='/api/pickup/load') pickupEvidence(p);
    if (path==='/api/pickup/complete') {
        const hash=pickupEvidence(p);
        for (const house of p.houseNumbers || [p.houseNumber]) {
            const job=db.jobs.find(j=>j.houseNumber===house);
            if (job?.safetyPickupEvidenceFingerprint && job.safetyPickupEvidenceFingerprint!==hash) fail('หลักฐานถูกแก้หลังยืนยันโหลด ต้องตรวจสอบก่อนปิดรับ',409);
        }
    }
    if (path==='/api/pickup/release-document') {
        if (!Array.isArray(p.releaseDocumentFiles)||!p.releaseDocumentFiles.length) fail('ต้องสแกน/แนบภาพใบตรวจปล่อยก่อนยืนยันรับเอกสาร');
        p.releaseDocumentFiles.forEach(f=>evidence(f,'ใบตรวจปล่อย'));
    }
    if (path==='/api/attendance/checkin') {
        if (p.userId!==actor?.id) fail('ต้องเช็คอินด้วยยูสของตนเอง',403);
        if (p.simulation===true) return;
        const active=(db.hr?.checkInLocations||[]).filter(l=>l.active!==false);
        if (db.meetingSafety.geofencingEnabled && (!active.length || !db.hr?.settings?.attendance?.enforceAssignedLocations)) fail('ยังไม่ได้กำหนดพิกัดเช็คอิน กรุณาให้ Admin ตั้งค่าจาก Google Maps ก่อน',409);
        if (p.gpsLat===null||p.gpsLon===null||String(p.gpsLat??'').trim()===''||String(p.gpsLon??'').trim()===''||!Number.isFinite(Number(p.gpsLat))||!Number.isFinite(Number(p.gpsLon))||Math.abs(Number(p.gpsLat))>90||Math.abs(Number(p.gpsLon))>180) fail('ต้องส่งพิกัด GPS ที่ใช้ได้');
    }
}
module.exports={preflight,pickupEvidence,simulation,attendance};
