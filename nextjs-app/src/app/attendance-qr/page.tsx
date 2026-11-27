"use client";
import {QRCodeSVG} from "qrcode.react";
import "./attendance-qr.css";

// Wall / counter display for staff check-in. The QR scales with the screen so it scans from a distance;
// it only opens the sign-in page and carries no employee ID or password.
export default function AttendanceQrPage(){
 const url="https://scd-transport.onrender.com/attendance-auth";
 return <main className="aq-screen">
  <section className="aq-card">
   <header className="aq-head">
    <div className="aq-mark" aria-hidden="true">SCD</div>
    <div>
     <p className="aq-eyebrow">S.C.D. TRANSPORT</p>
     <h1>สแกนเพื่อลงเวลาเข้า-ออกงาน</h1>
    </div>
   </header>
   <div className="aq-body">
    <div className="aq-qr"><QRCodeSVG value={url} size={512} level="H" includeMargin title="QR ลงเวลาพนักงาน SCD"/></div>
    <ol className="aq-steps">
     <li><b>สแกน QR</b><span>เปิดกล้องมือถือแล้วส่องที่ QR นี้</span></li>
     <li><b>ใส่รหัสพนักงาน + PIN 6 หลัก</b><span>ใช้ PIN ชุดเดียวกับระบบงาน</span></li>
     <li><b>เปิด GPS แล้วกดลงเวลา</b><span>เข้างานหรือออกงาน · ต้องอยู่ในพื้นที่ทำงาน</span></li>
    </ol>
   </div>
   <p className="aq-note">QR นี้เป็นลิงก์กลางสำหรับเปิดระบบเท่านั้น ไม่มีรหัสพนักงานหรือรหัสผ่านอยู่ใน QR</p>
   <p className="aq-url">{url}</p>
   <button type="button" className="aq-print" onClick={()=>window.print()}>พิมพ์ QR</button>
  </section>
 </main>;
}
