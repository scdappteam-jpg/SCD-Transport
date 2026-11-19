"use client";

import {useState} from "react";
import {Amplify} from "aws-amplify";
import {FaceLivenessDetector} from "@aws-amplify/ui-react-liveness";
import "@aws-amplify/ui-react/styles.css";
import styles from "./styles.module.css";

type StartResult={sessionId:string;nonce:string;region:string;identityPoolId:string;user:{id:string;name:string};error?:string;code?:string};

export default function AttendanceAuthPage(){
 const [login,setLogin]=useState("");const [pin,setPin]=useState("");const [start,setStart]=useState<StartResult|null>(null);const [status,setStatus]=useState("");const [busy,setBusy]=useState(false);
 async function begin(event:React.FormEvent){
  event.preventDefault();setBusy(true);setStatus("กำลังตรวจสอบ PIN…");
  try{
   if(!/^\d{6}$/.test(pin))throw new Error("PIN ต้องเป็นตัวเลข 6 หลัก");
   const response=await fetch("/api/auth/face/start",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({login,pin})});
   const data=await response.json() as StartResult;if(!response.ok)throw new Error(data.error||"เริ่มสแกนใบหน้าไม่ได้");
   Amplify.configure({Auth:{Cognito:{identityPoolId:data.identityPoolId,allowGuestAccess:true}}});setStart(data);setStatus("จัดใบหน้าให้อยู่ในกรอบและทำตามคำแนะนำ");
  }catch(error){setStatus(error instanceof Error?error.message:"เริ่มยืนยันไม่ได้");}finally{setBusy(false);}
 }
 async function finish(){
  if(!start)return;setBusy(true);setStatus("กำลังตรวจว่าเป็นคนจริงและเทียบกับรูปพนักงาน…");
  try{
   const response=await fetch("/api/auth/face/complete",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionId:start.sessionId,nonce:start.nonce})});
   const data=await response.json();if(!response.ok)throw new Error(data.error||"ยืนยันใบหน้าไม่ผ่าน");
   localStorage.setItem("scdTransportMobileAuth","true");localStorage.setItem("scdTransportMobileSession",data.token);localStorage.setItem("smartLogisticsMobileUser",data.user.id);
   setStatus("ยืนยันสำเร็จ กำลังเปิดหน้าเช็กอิน…");location.replace("/legacy/mobile.html?view=attendance&verified=face");
  }catch(error){setStatus(error instanceof Error?error.message:"ยืนยันใบหน้าไม่ผ่าน");setStart(null);}finally{setBusy(false);}
 }
 return <main className={styles.page}><section className={styles.card}>
  <div className={styles.brand}>SCD</div><h1>เช็กอินพนักงาน</h1><p>QR นี้ใช้เปิดระบบเท่านั้น ทุกคนต้องยืนยันบัญชี PIN และใบหน้าของตนเอง</p>
  {!start?<form onSubmit={begin} className={styles.form}><label>รหัสพนักงาน / Username<input value={login} onChange={e=>setLogin(e.target.value)} autoComplete="username" required placeholder="สแกนบัตรหรือพิมพ์รหัส"/></label><label>PIN ตัวเลข 6 หลัก<input value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,"").slice(0,6))} inputMode="numeric" autoComplete="current-password" type="password" pattern="[0-9]{6}" required placeholder="••••••"/></label><button disabled={busy}>{busy?"กำลังตรวจสอบ…":"ยืนยัน PIN และสแกนใบหน้า"}</button><a href="/legacy/mobile.html">กลับหน้าเข้าสู่ระบบปกติ</a></form>:
  <div className={styles.camera}><div className={styles.user}>กำลังยืนยัน: <b>{start.user.name}</b></div><FaceLivenessDetector sessionId={start.sessionId} region={start.region} onAnalysisComplete={finish} onUserCancel={()=>setStart(null)} onError={error=>{setStatus(error.error?.message||"กล้องหรือการตรวจคนจริงมีปัญหา");setStart(null);}}/></div>}
  <p className={styles.status} role="status">{status}</p><small>หากกล้องใช้งานไม่ได้หรือใบหน้าไม่ผ่าน กรุณาติดต่อหัวหน้าเพื่อยืนยันสำรอง ระบบจะไม่ตัดสินขาดงานอัตโนมัติ</small>
 </section></main>;
}
