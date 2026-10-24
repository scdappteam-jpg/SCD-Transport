/* eslint-disable @typescript-eslint/no-require-imports -- server-only compatibility service */
const crypto=require('node:crypto'),zlib=require('node:zlib');
const checks=['date','customer','place','driver','house','package','inspector','receiver','route-log','destination'];
function fail(message,statusCode=422){throw Object.assign(new Error(message),{statusCode});}
function gps(p){
    const valid=v=>v!==null&&v!==undefined&&String(v).trim()!==''&&Number.isFinite(Number(v));
    if(!valid(p.gpsLat)||!valid(p.gpsLong)||Math.abs(Number(p.gpsLat))>90||Math.abs(Number(p.gpsLong))>180)fail('ไม่พบพิกัด GPS ที่ใช้ได้ กรุณาเปิดตำแหน่งและลองใหม่ก่อนบันทึก');
}
function signature(value){
    try {
        const b=Buffer.from(String(value||'').split(',').pop(),'base64');
        if(b.length>1024*1024||!b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Error();
        let w=0,h=0,channels=0;const parts=[];
        for(let i=8;i+12<=b.length;){const n=b.readUInt32BE(i),type=b.toString('ascii',i+4,i+8);if(i+n+12>b.length)throw Error();const d=b.subarray(i+8,i+8+n);
            if(type==='IHDR'){w=d.readUInt32BE(0);h=d.readUInt32BE(4);channels=d[9]===6?4:d[9]===2?3:0;if(d[8]!==8||d[10]||d[11]||d[12])throw Error();}
            if(type==='IDAT')parts.push(d);i+=n+12;
        }
        if(w<16||h<8||w>2048||h>2048||!channels)throw Error();
        const stride=w*channels,raw=zlib.inflateSync(Buffer.concat(parts),{maxOutputLength:(stride+1)*h});if(raw.length!==(stride+1)*h)throw Error();
        let prev=Buffer.alloc(stride),ink=0;
        const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
        for(let y=0;y<h;y++){const f=raw[y*(stride+1)],row=Buffer.from(raw.subarray(y*(stride+1)+1,(y+1)*(stride+1)));if(f>4)throw Error();
            for(let x=0;x<stride;x++){const a=x>=channels?row[x-channels]:0,b=prev[x],c=x>=channels?prev[x-channels]:0;row[x]=(row[x]+(f===1?a:f===2?b:f===3?Math.floor((a+b)/2):f===4?paeth(a,b,c):0))&255;}
            for(let x=0;x<stride;x+=channels)if((channels===3||row[x+3]>16)&&Math.min(row[x],row[x+1],row[x+2])<240)ink++;
            prev=row;
        }
        if(ink<8)throw Error();
    }catch{fail('กรุณาลงลายเซ็นจริงก่อนยืนยันรับสินค้า (ไม่รับภาพว่างหรือไฟล์ลายเซ็นที่ใช้ไม่ได้)');}
}
function fingerprint(p,rows){
    const h=crypto.createHash('sha256');h.update(JSON.stringify({rows,checklist:[...p.checklist||[]].sort(),pickupCase:p.pickupCase||'',stickerColor:p.stickerColor||'',pieceCount:String(p.pieceCount||''),packageType:p.packageType||'',inspectorName:p.inspectorName||'',receiverName:p.receiverName||''}));
    for(const v of [p.signatureBase64,p.imageBase64,...(p.productImages||[]).map(f=>f.base64),...(p.cargoImages||[]).map(f=>f.base64),...(p.doorClosedImages||[]).map(f=>f.base64)])h.update(JSON.stringify(String(v||''))); 
    return h.digest('hex');
}
function prepare(action,jobs,p,normalize){
    const rows=normalize(p.pickupItems||''),fp=fingerprint(p,rows);
    const replay=field=>jobs.every(j=>j[field]===fp);
    if(action==='route-start'){
        if(jobs.every(j=>j.driverRouteStatus==='EnRouteToPickup'&&j.routeStartedAt))return {replayed:true};
        if(jobs.some(j=>j.routeStartedAt||j.checkInAt||j.loadedAt||j.completedAt||j.arrivedWh3At||j.driverRouteStatus&&!['Assigned','Pending'].includes(j.driverRouteStatus)||!['Pending','Assigned'].includes(j.status)))fail('รอบนี้เริ่มหรือผ่านขั้นตอนแล้ว ไม่สามารถเริ่มย้อนซ้ำได้',409);
    }else if(action==='checkin'){
        if(jobs.every(j=>j.driverRouteStatus==='ArrivedAtPickup'&&j.checkInAt))return {replayed:true};
        if(jobs.some(j=>!j.routeStartedAt||j.driverRouteStatus!=='EnRouteToPickup'))fail('ต้องเริ่มรอบก่อนบันทึกถึงจุดรับ และห้ามย้อนขั้นตอน',409);
    }else if(action==='load'){
        if(jobs.every(j=>j.driverRouteStatus==='Loading'&&j.loadedAt)&&replay('pickupLoadFingerprint'))return {replayed:true};
        if(jobs.some(j=>!j.checkInAt||j.driverRouteStatus!=='ArrivedAtPickup'))fail('ต้องถึงจุดรับสินค้าก่อนโหลด และห้ามย้อนขั้นตอน',409);
    }else if(action==='complete'){
        if(jobs.some(j=>j.completedAt)){
            if(jobs.every(j=>j.completedAt)&&replay('pickupCompletionFingerprint'))return {replayed:true};
            fail('งานนี้จบรับแล้ว ห้ามบันทึกหลักฐานซ้ำหรือเปลี่ยนเวลารับเดิม',409);
        }
        if(jobs.some(j=>!j.checkInAt||!j.loadedAt||j.driverRouteStatus!=='Loading'))fail('ต้องถึงจุดรับและโหลดสินค้าขึ้นรถก่อนจบรับ',409);
    }else if(action==='arrive-wh3'){
        if(jobs.every(j=>j.arrivedWh3At&&j.driverRouteStatus==='ArrivedWH3'))return {replayed:true};
        if(jobs.some(j=>!j.completedAt||j.driverRouteStatus!=='ReturningWH3'))fail('ต้องรับสินค้าครบและอยู่ระหว่างกลับ WH3 ก่อนยืนยันถึงคลัง',409);
    }
    gps(p);
    if(['load','complete'].includes(action)){
        const set=new Set(p.checklist||[]);if(set.size!==10||checks.some(c=>!set.has(c)))fail('ต้องตรวจสินค้าให้ครบทั้ง 10 รายการที่กำหนด');
        if(rows.length!==jobs.length||new Set(rows.map(r=>r.houseNumber)).size!==rows.length||jobs.some(j=>!rows.some(r=>r.houseNumber===j.houseNumber)))fail('รายการ House ต้องครบและตรงกับงานที่เลือก');
        for(const row of rows){const n=Number(row.carton);if(String(row.carton??'').trim()===''||!Number.isSafeInteger(n)||n<=0)fail('จำนวนรับต้องเป็นจำนวนเต็มมากกว่า 0 ห้ามติดลบ');if(String(row.pickupDestination||row.route||'WH3').toUpperCase()!=='WH3')fail('สินค้าต้องกลับ WH3 ก่อนส่ง Terminal');}
        if(p.pieceCount!==undefined&&p.pieceCount!==''&&(!Number.isSafeInteger(Number(p.pieceCount))||Number(p.pieceCount)<=0))fail('จำนวนรับต้องมากกว่า 0 ห้ามติดลบ');
    }
    if(action==='complete'){signature(p.signatureBase64);if(!String(p.inspectorName||'').trim()||!String(p.receiverName||'').trim())fail('กรุณาระบุชื่อผู้ตรวจและผู้รับสินค้า');}
    return {replayed:false,fingerprint:fp};
}
module.exports={prepare,signature,checks};
