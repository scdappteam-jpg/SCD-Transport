/* eslint-disable @typescript-eslint/no-require-imports -- server-only domain service */
const crypto = require('node:crypto');
const policy = require('./meeting-policy.cjs');
const inbound = require('./warehouse-inbound.cjs');
const references = require('../../public/legacy/shipment-references.js');
const movementPaths = new Set(['/api/inbound/twin-scan','/api/inbound/move-location','/api/warehouse/location/assign','/api/warehouse/location/release','/api/outbound/picking','/api/outbound/return','/api/outbound/load-bay','/api/outbound/transfer-form','/api/outbound/loading-detail']);
const inboundPutawayPaths=new Set(['/api/inbound/twin-scan','/api/inbound/move-location','/api/warehouse/location/assign']);
const clean = value => String(value || '').replace(/[^A-Za-z0-9]/g,'').toUpperCase();
const identity = job => crypto.createHash('sha256').update(JSON.stringify([job.houseNumber,job.hawbNumber||'',job.onhandNumber||'',job.trackType||'Single',job.stickerColor||'',job.inboundStickerColor||''])).digest('hex');
function fail(message, statusCode=409) { throw Object.assign(new Error(message),{statusCode}); }
function roles(actor, allowed) { if (!actor || !allowed.includes(actor.role)) fail('ไม่มีสิทธิ์ดำเนินการ QA/ติดแท็ก',403); }
function matchingCodes(db, job) {
    const refs = references.grouped(job,references.createIndex(db.jobs || []));
    return new Set([job.houseNumber,...refs.house,...refs.onhand].map(clean).filter(Boolean));
}
function scanSet(db, job, mode, scans) {
    const count = mode === 'Pair' ? 2 : mode === 'Single' ? 1 : 0;
    if (!count || !Array.isArray(scans) || scans.length !== count) fail('ต้องสแกนรูปแท็กให้ครบตามชนิด Single/Pair',422);
    const expected = matchingCodes(db,job), hashes = new Set();
    return scans.map(scan => {
        if (!scan.imageHash || !Array.isArray(scan.barcodes)) fail('ต้องใช้ผลสแกนภาพจากเซิร์ฟเวอร์เท่านั้น',422);
        const matches = [...new Set(scan.barcodes.map(clean))];
        if (matches.length !== 1 || !expected.has(matches[0])) fail('บาร์โค้ดไม่ตรงกับ House/Onhand หรือมีหลายเลขที่ไม่ชัดเจน',422);
        if (hashes.has(scan.imageHash)) fail('แท็กคู่ต้องสแกนหลักฐานคนละภาพ ห้ามใช้ภาพเดิมซ้ำ',422);
        hashes.add(scan.imageHash);
        return {barcode:matches[0],imageHash:scan.imageHash};
    });
}
function tagPlan(db, job, actor, p, scans, at) {
    roles(actor,['WH_Staff','WH3_TeamLeader','Tagging_Staff']);
    if (job.csRejected || job.status==='Cancelled') fail('งานถูกพักหรือยกเลิก');
    if (job.invoiceId || job.readyForBilling || job.terminalClosedAt) fail('งานผ่าน Terminal/วางบิลแล้ว ต้องตรวจแก้ไขผ่านผู้รับผิดชอบก่อนเปลี่ยนแท็ก');
    const mode = p.tagMode || job.trackType || 'Single';
    const tags = scanSet(db,job,mode,scans);
    const revision = job.tagInspection?.revision || 0;
    if (p.expectedRevision !== revision) fail('แท็กเปลี่ยนแล้ว กรุณารีเฟรช');
    const stickerColor=String(p.stickerColor??job.inboundStickerColor??job.stickerColor??'').trim();
    if (stickerColor.length>80) fail('สีแท็กยาวเกินกำหนด',422);
    return {revision:revision+1,mode,stickerColor,tags,taggedBy:actor.id,taggedAt:at};
}
function approvalPlan(db, job, actor, p, scans, at) {
    roles(actor,['QA_Inspector','Check_House']);
    const tagging = job.tagInspection;
    if (!tagging) fail('ยังไม่มีบันทึกติดแท็ก');
    if (tagging.taggedBy===actor.id) fail('ผู้ติดแท็กและผู้ตรวจ QA ต้องเป็นคนละคน',403);
    if (p.expectedRevision!==tagging.revision) fail('แท็กเปลี่ยนแล้ว ต้องสแกน QA ใหม่');
    if (job.csRejected || job.status==='Cancelled') fail('งานถูกพักหรือยกเลิก');
    const tags = scanSet(db,job,tagging.mode,scans);
    if (tags.some((tag,i)=>tag.barcode!==tagging.tags[i].barcode)) fail('ผลสแกนไม่ตรงกับแท็กที่ลงทะเบียน');
    if (tags.some(tag=>tagging.tags.some(original=>original.imageHash===tag.imageHash))) fail('QA ต้องถ่าย/สแกนตรวจใหม่ ไม่ใช้ภาพเดิมของผู้ติดแท็ก');
    return {id:crypto.randomUUID(),revision:tagging.revision,approvedBy:actor.id,approvedAt:at,tags};
}
function applyTag(job, record) {
    job.trackType=record.mode;
    job.inboundStickerColor=record.stickerColor;
    record.identity=identity(job);
    job.tagInspectionHistory = [...job.tagInspectionHistory || [],record];
    job.tagInspection = record;
    job.qaRequired = true;
    job.qaApproval = null;
}
function approved(job) {
    const tag=job.tagInspection,qa=job.qaApproval;
    return Boolean(tag && qa && tag.identity===identity(job) && qa.revision===tag.revision && qa.approvedBy && qa.approvedBy!==tag.taggedBy && qa.tags?.length===tag.tags?.length && qa.tags.every((t,i)=>t.barcode===tag.tags[i].barcode));
}
function assertApproved(job) { inbound.assertNotHeld(job); if (!approved(job)) fail('ไม่อนุญาตให้ย้ายของจนกว่า QA จะอนุมัติ'); }
function assertStoredLocation(db,job){
    assertApproved(job);
    const key=String(job.warehouseLocation||job.locationId||'').trim().toLowerCase();
    if(!key)fail('ยังปิดรับเป็น Stored ไม่ได้: ต้องจัด Location หลังผ่าน QA');
    const level=key.match(/-l(\d+)$/i),base=level?key.slice(0,level.index):key;
    const matches=l=>[l.id,l.code].some(v=>String(v||'').trim().toLowerCase()===base);
    const legacy=(db.locations||[]).find(matches);
    const mapped=[...db.warehouseMap?.locations||[],...(db.warehouseMaps||[]).flatMap(m=>(m.zones||[]).flatMap(z=>z.slots||[]))].filter(matches);
    const legacyOwned=legacy?.status==='Occupied'&&legacy.currentHouseId===job.houseNumber;
    const mapOwned=mapped.some(l=>l.active!==false&&!['Closed','Blocked'].includes(l.status)&&(l.occupiedBy||[]).some(o=>o.houseNumber===job.houseNumber&&(!level||Number(o.level)===Number(level[1]))));
    if(legacy?.status==='Occupied'&&legacy.currentHouseId!==job.houseNumber)fail('Location ถูกใช้งานโดย House อื่น ต้องตรวจตำแหน่งก่อนปิดรับ');
    if(!legacyOwned&&!mapOwned)fail('Location ไม่พบการจัดเก็บของ House นี้ ต้องตรวจตำแหน่งก่อนปิดรับ');
}
function movementJobs(db,path,p) {
    let moves = movementPaths.has(path);
    if (path==='/api/operations/control') moves = (['driver-event','transport-event'].includes(p.action)&&['wh3-load-start','wh3-depart'].includes(p.event)) || (p.action==='terminal'&&['arrival','load'].includes(p.stage));
    if (!moves) return [];
    let houses = p.houseNumbers || p.houses || p.houseNumber && [p.houseNumber];
    if (typeof houses === 'string') houses=houses.split(/[\s,;]+/).filter(Boolean);
    if (path==='/api/warehouse/location/release' && p.locationId) {
        houses=(db.warehouseMap?.locations || []).find(l=>l.id===p.locationId)?.occupiedBy?.map(o=>o.houseNumber);
    }
    if (p.master && !houses) return (db.jobs || []).filter(j=>clean(j.mawbNumber||j.masterNumber)===clean(p.master)&&(!p.flightNo || j.flightNo===p.flightNo));
    return (houses || []).map(h=>db.jobs.find(j=>j.houseNumber===h)).filter(Boolean);
}
function enforceMovement(db,path,p) {
    for (const job of movementJobs(db,path,p)) {
        inbound.assertNotHeld(job);
        if (!(inboundPutawayPaths.has(path) || policy.active(db,[job]) || job.qaRequired)) continue;
        assertApproved(job);
        if(inboundPutawayPaths.has(path))inbound.assertPutaway(db,job,p);
        if ((p.trackType && p.trackType!==(job.trackType||'Single')) || (p.stickerColor && p.stickerColor!==(job.inboundStickerColor||''))) fail('ข้อมูลแท็กเปลี่ยน ต้องลงทะเบียนและสแกน QA ใหม่ก่อนย้าย');
    }
}
module.exports={tagPlan,approvalPlan,applyTag,approved,assertApproved,assertStoredLocation,enforceMovement,movementPaths};
