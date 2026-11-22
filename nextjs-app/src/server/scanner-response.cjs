async function readScannerResponse(response) {
    if (!response.ok) {
        const busy=response.status===429;
        throw Object.assign(new Error(busy
            ? 'บริการอ่านบาร์โค้ดจำกัดจำนวนคำขอชั่วคราว กรุณารอแล้วลองใหม่ ยังไม่อนุมัติ QA'
            : 'บริการอ่านบาร์โค้ดตอบข้อผิดพลาด กรุณาลองใหม่ ยังไม่อนุมัติ QA'),
            {statusCode:busy?503:502,upstreamStatus:response.status});
    }
    try { return await response.json(); }
    catch { throw Object.assign(new Error('บริการอ่านบาร์โค้ดส่งข้อมูลไม่ถูกต้อง กรุณาตรวจบริการสแกน ยังไม่อนุมัติ QA'),{statusCode:502}); }
}
module.exports={readScannerResponse};
