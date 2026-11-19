"use client";
import {QRCodeSVG} from "qrcode.react";

export default function AttendanceQrPage(){
 const url="https://scd-transport.onrender.com/attendance-auth";
 return <main style={{minHeight:"100dvh",display:"grid",placeItems:"center",padding:24,background:"#eef4fb"}}><section style={{width:"min(100%,520px)",padding:32,borderRadius:24,background:"white",textAlign:"center",boxShadow:"0 18px 55px #143d7730"}}>
  <div style={{display:"inline-grid",width:58,height:58,placeItems:"center",borderRadius:16,color:"white",background:"#0b4ea2",fontWeight:800}}>SCD</div><h1>QR เช็กอินพนักงาน</h1><p>QR นี้เป็นลิงก์กลางสำหรับเปิดระบบเท่านั้น ไม่มีรหัสพนักงานหรือรหัสผ่านอยู่ใน QR</p>
  <div style={{display:"inline-block",padding:20,border:"1px solid #dbe6f3",borderRadius:18,background:"white"}}><QRCodeSVG value={url} size={280} level="H" includeMargin title="SCD employee attendance"/></div><p style={{wordBreak:"break-all",color:"#475569"}}>{url}</p>
  <button onClick={()=>window.print()} style={{minHeight:50,padding:"0 24px",border:0,borderRadius:12,color:"white",background:"#0b4ea2",fontWeight:800}}>พิมพ์ QR</button>
 </section></main>;
}
