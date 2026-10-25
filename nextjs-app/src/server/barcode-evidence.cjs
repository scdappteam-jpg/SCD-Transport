/* eslint-disable @typescript-eslint/no-require-imports -- server scanner adapter */
const crypto=require('node:crypto');
const {evidence}=require('./operations-control.cjs');
async function scanImage(file,url,fetcher=fetch) {
    evidence(file,'ภาพบาร์โค้ด');
    if (!String(file.mimeType).startsWith('image/')) throw Object.assign(new Error('QA รับเฉพาะรูปบาร์โค้ด ไม่รับ PDF'),{statusCode:422});
    const bytes=Buffer.from(file.base64.split(',').pop(),'base64');
    const form=new FormData();form.append('image',new Blob([bytes],{type:file.mimeType}),'barcode.png');
    form.append('strict_barcode','true');
    const response=await fetcher(url,{method:'POST',body:form,signal:AbortSignal.timeout(30000)});
    if (!response.ok) throw Object.assign(new Error('บริการสแกนบาร์โค้ดไม่พร้อม กรุณาลองใหม่ ห้ามอนุมัติด้วยมือ'),{statusCode:503});
    const result=await response.json();
    if (result.strictBarcode!==true) throw Object.assign(new Error('บริการสแกนยังไม่รองรับโหมด Barcode-only สำหรับ QA'),{statusCode:503});
    if (!Array.isArray(result.barcodes)||!result.barcodes.length) throw Object.assign(new Error('ไม่พบบาร์โค้ดในภาพ กรุณาสแกนใหม่'),{statusCode:422});
    return {barcodes:result.barcodes,imageHash:crypto.createHash('sha256').update(bytes).digest('hex')};
}
module.exports={scanImage};
