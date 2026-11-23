/* eslint-disable @typescript-eslint/no-require-imports -- Server-only PDF renderer. */
const {PDFDocument} = require('pdfkit');
const path = require('node:path');
const fs = require('node:fs');
const ctf = require('../../public/legacy/ctf-core/index.js');

function fail(message, statusCode=422) {throw Object.assign(new Error(message),{statusCode});}
function select(db, houses, findJob) {
    if(!Array.isArray(houses)||!houses.length||houses.length>200||houses.some(h=>typeof h!=='string'||!h.trim()))fail('กรุณาเลือก House ที่ถูกต้องไม่เกิน 200 งาน');
    const selected=[...new Set(houses.map(h=>h.trim()))], jobs=selected.map(h=>findJob(db,h));
    if(jobs.some(j=>!j))fail('ไม่พบ House ในระบบ',404);
    if(jobs.some(j=>!j.cargoTransferIssuedAt))fail('ต้องออกใบ Cargo Transfer ให้เรียบร้อยก่อนดาวน์โหลด PDF',409);
    const models=ctf.models({rows:jobs,jobs});
    if(models.some(m=>m.partial||m.missing))fail('กรุณาเลือก House ให้ครบทุกงานในแต่ละใบก่อนดาวน์โหลด PDF',409);
    return models;
}

async function render(models) {
    // Turbopack rewrites __dirname to /ROOT/src/server. Runtime font files live
    // under the application cwd; do not resolve them through the bundled path.
    const fonts=[path.join(process.cwd(),'public/legacy/fonts'),path.join(process.cwd(),'nextjs-app/public/legacy/fonts'),path.join(__dirname,'../../public/legacy/fonts')].find(dir=>fs.existsSync(path.join(dir,'Sarabun-Regular.ttf'))&&fs.existsSync(path.join(dir,'Sarabun-Bold.ttf')));
    if(!fonts)throw new Error('Cargo Transfer PDF Thai fonts are missing');
    // Also avoid PDFKit's implicit Helvetica AFM lookup in a bundled server.
    const doc=new PDFDocument({font:path.join(fonts,'Sarabun-Regular.ttf'),autoFirstPage:false,margin:20,size:'A4',compress:true,info:{Title:'Cargo Transfer Form',Author:'S.C.D. Transport'}});
    doc.registerFont('Thai',path.join(fonts,'Sarabun-Regular.ttf'));
    doc.registerFont('ThaiBold',path.join(fonts,'Sarabun-Bold.ttf'));
    doc.font('Thai');
    const chunks=[], ready=new Promise((resolve,reject)=>{doc.on('data',b=>chunks.push(b));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);});
    const X=20,W=555.28,BOTTOM=817;
    const val=v=>String(v??'');
    const format=ctf.localDate;
    function height(value,width,size=7.5,bold=false) {doc.font(bold?'ThaiBold':'Thai').fontSize(size);return Math.max(size+2,doc.heightOfString(val(value),{width:width-8,lineGap:1}))+8;}
    function text(value,x,y,width,size=7.5,bold=false) {doc.font(bold?'ThaiBold':'Thai').fontSize(size).fillColor('#111111').text(val(value),x+4,y+4,{width:width-8,lineGap:1});}
    function cells(values,widths,y,minHeight=22,size=7.5,bold=false) {
        const h=Math.max(minHeight,...values.map((v,i)=>height(v,widths[i],size,bold)));
        let x=X;
        values.forEach((v,i)=>{doc.lineWidth(.5).strokeColor('#222222').rect(x,y,widths[i],h).stroke();text(v,x,y,widths[i],size,bold);x+=widths[i];});
        return y+h;
    }
    const widths=[.17,.14,.17,.07,.13,.20,.04,.04,.04].map(n=>W*n);
    function header(model,page,total) {
        text('Expeditors (Thailand) Ltd.\nWarehouse No. 3, Free Zone, Suvarnabhumi Airport\nBang Phli, Samut Prakan',X,16,370,7);
        text('Expeditors®',X+W-140,16,140,19,true);
        text('CARGO TRANSFER FORM',X+145,58,290,12,true);
        let y=83;
        if(model.testOnly)y=cells(['SIT — ข้อมูลทดสอบ / ห้ามใช้ส่งสินค้าจริง'],[W],y,20,8,true);
        const date=/^\d{4}-\d{2}-\d{2}$/.test(model.date||'')?model.date.split('-').reverse().join('/'):model.date;
        y=cells([`Transfer Date / วันที่ส่ง\n${date||''}`,`Time / เวลา\n${model.time||''}`,`Release Shipment by\n${model.releaseBy||''}`],[W*.25,W*.25,W*.5],y,30);
        y=cells([`Transfer From\n${model.from||''}`,`To TMO\n${model.to==='TGINT'?'INTER':model.to||''}`],[W*.5,W*.5],y,30);
        y=cells([`Driver's Name / คนขับ\n${model.driver||''}`,`Truck License / ทะเบียน\n${model.plate||''}`,`Vehicle type\n${model.vehicleType||''}`],[W*.5,W*.25,W*.25],y,30);
        y=cells(['HAWB / Onhand','IC','SHIPPER','DEST','QTY / UNIT','MAWB / FLIGHT','P','S','I'],widths,y,22,6.5,true);
        return {y,page,total};
    }
    function footerRows(m) {
        const d=m.details;
        return [
            {v:[`WH release by / ผู้ปล่อยสินค้า: ${m.releaseBy||''}\nลายเซ็น ____________________`,`Date / Time\n${format(d.whReleasedAt)}`],w:[W*.58,W*.42],h:30},
            {v:[`Driver Transfer Shipment / คนขับ: ${m.driver||''}\nลายเซ็น ____________________`,`Date / Time\n${format(m.driverTransferredAt)}`],w:[W*.58,W*.42],h:30},
            {v:[`TMO Received by / ผู้รับ: ${d.tmoReceivedBy||''}\nลายเซ็น ____________________`,`Date / Time\n${format(m.tmoReceivedAt)}`],w:[W*.58,W*.42],h:30},
            {v:[`Unload by / ผู้ลงสินค้า: ${d.unloadBy||''}\nจองคิว: ${format(m.queueBookedAt)} · ได้คิว: ${format(m.queueArrivedAt)}`],w:[W],h:28},
            {v:[`Start unload / เริ่มลงสินค้า\n${format(m.unloadStart)}`,`Unload finished / ลงเสร็จ\n${format(m.unloadEnd)}`],w:[W*.5,W*.5],h:28},
            {v:[`Found any damage / สินค้าเสียหาย: ${d.damage==='yes'?'พบ':d.damage==='no'?'ไม่พบ':'ยังไม่บันทึก'}`,`Issue cause / สาเหตุ: ${d.issueCause||''}`],w:[W*.5,W*.5],h:26},
            {v:[`Seamless operation / ปัญหาการทำงาน: ${d.operationNote||''}`,`Supervisor contact / เบอร์ติดต่อหัวหน้า: ${d.supervisorContact||''}`],w:[W*.5,W*.5],h:26}
        ];
    }
    function rowValues(r) {return [`${r.houseNumber}\n${r.onhandNumber||''}`,r.icNumber,r.customerName,r.destination,r.quantity,`${r.mawbNumber||''}\n${r.flight||''}`,'','',''];}
    try {
        let any=false;
        for(const model of models) {
            // Measure against the same fonts and widths that will be printed.
            doc.addPage();
            const top=header(model,1,1).y;
            const footer=footerRows(model);
            const footerHeight=footer.reduce((sum,row)=>sum+Math.max(row.h,...row.v.map((v,i)=>height(v,row.w[i]))),0)+37;
            const room=BOTTOM-top-footerHeight;
            const pages=[];
            let rows=[], used=0;
            for(const r of model.rows) {
                const h=Math.max(22,...rowValues(r).map((v,i)=>height(v,widths[i])));
                if(h>room)fail('ข้อมูลในใบยาวเกินพื้นที่ A4 กรุณาย่อหมายเหตุหรือข้อมูลผู้รับก่อนดาวน์โหลด PDF');
                if(rows.length && (rows.length===14||used+h>room)){pages.push(rows);rows=[];used=0;}
                rows.push({row:r,h});used+=h;
            }
            if(rows.length)pages.push(rows);
            if(!pages.length)fail('ไม่มีรายการสินค้าในใบ');
            for(let i=0;i<pages.length;i++) {
                if(i>0)doc.addPage();
                let y=i===0?top:header(model,i+1,pages.length).y;
                for(const item of pages[i]) {
                    const rowY=y;
                    y=cells(rowValues(item.row),widths,y,item.h);
                    let tickX=X+widths.slice(0,6).reduce((a,b)=>a+b,0);
                    [item.row.permit,item.row.security,item.row.inspected].forEach((yes,k)=>{if(yes){const cx=tickX+widths[6+k]/2,cy=rowY+item.h/2;doc.lineWidth(.8).moveTo(cx-3,cy).lineTo(cx-1,cy+3).lineTo(cx+4,cy-4).stroke();}tickX+=widths[6+k];});
                }
                const maxPadding=Math.min(14-pages[i].length,Math.floor((BOTTOM-y-footerHeight)/22));
                for(let n=0;n<maxPadding;n++)y=cells(Array(9).fill(''),widths,y,22);
                footer.forEach(row=>{y=cells(row.v,row.w,y,row.h);});
                text(`S.C.D. Transport · ${model.id||'Legacy CTF'} · ${i+1}/${pages.length}\nP = มี Permit แนบ · S = X-Ray ผ่าน · I = QA ผ่าน · ชื่อที่แสดงไม่ใช่ลายเซ็น\n${model.details.updatedAt?'บันทึกท้ายใบ: '+format(model.details.updatedAt)+' โดย '+model.details.updatedBy:''}`,X,y+2,W,6.5);
                any=true;
            }
        }
        if(!any)fail('ไม่มีใบ Cargo Transfer');
        doc.end();return await ready;
    } catch(error){doc.end();await ready;throw error;}
}
module.exports={select,render};
