"use client";

import {useEffect, useState} from "react";
import styles from "./styles.module.css";

const DEVICE_KEY="scdAttendanceDeviceToken";
const SESSION_KEY="scdTransportMobileSession";
type LoginResult={token?:string;user?:{id:string;name:string};error?:string};
type ChangeRequest={id:string;userId:string;userName:string;deviceLabel:string;requestedAt:string};

function deviceToken(){
 let value=localStorage.getItem(DEVICE_KEY)||"";
 if(!value){const bytes=new Uint8Array(32);crypto.getRandomValues(bytes);value=btoa(String.fromCharCode(...bytes)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");localStorage.setItem(DEVICE_KEY,value);}
 return value;
}

function deviceLabel(){
 const platform=navigator.userAgentData?.platform||navigator.platform||"Mobile";
 return `${platform} · ${navigator.userAgent.includes("Android")?"Android":navigator.userAgent.includes("iPhone")?"iPhone":"Browser"}`;
}

export default function AttendanceAuthPage(){
 const [login,setLogin]=useState("");const [pin,setPin]=useState("");const [status,setStatus]=useState("");const [busy,setBusy]=useState(false);const [requests,setRequests]=useState<ChangeRequest[]>([]);const [canApprove,setCanApprove]=useState(false);
 async function loadRequests(){
  const token=localStorage.getItem(SESSION_KEY);if(!token)return;
  const response=await fetch("/api/attendance/device-change/requests",{headers:{Authorization:`Bearer ${token}`}});
  if(!response.ok)return;const data=await response.json();setRequests(data.requests||[]);setCanApprove(true);
 }
 useEffect(()=>{const timer=window.setTimeout(()=>void loadRequests().catch(()=>undefined),0);return()=>window.clearTimeout(timer);},[]);
 async function begin(event:React.FormEvent){
  event.preventDefault();setBusy(true);setStatus("กำลังตรวจสอบ PIN และอุปกรณ์…");
  try{
   if(!/^\d{6}$/.test(pin))throw new Error("PIN ต้องเป็นตัวเลข 6 หลัก");
   const response=await fetch("/api/auth/device/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({login,pin,deviceToken:deviceToken(),deviceLabel:deviceLabel()})});
   const data=await response.json() as LoginResult;if(!response.ok)throw new Error(data.error||"ยืนยันอุปกรณ์ไม่ได้");
   localStorage.setItem("scdTransportMobileAuth","ok");localStorage.setItem(SESSION_KEY,data.token||"");localStorage.setItem("smartLogisticsMobileUser",data.user?.id||"");
   setStatus("ยืนยันสำเร็จ กำลังเปิดหน้าลงเวลา…");location.replace("/legacy/mobile.html?view=attendance&verified=device");
  }catch(error){setStatus(error instanceof Error?error.message:"ยืนยันไม่ได้");}finally{setBusy(false);}
 }
 async function decide(requestId:string,decision:"Approved"|"Rejected"){
  const token=localStorage.getItem(SESSION_KEY);if(!token)return;setBusy(true);
  try{const response=await fetch("/api/attendance/device-change/decide",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},body:JSON.stringify({requestId,decision})});const data=await response.json();if(!response.ok)throw new Error(data.error||"บันทึกผลไม่ได้");setStatus(decision==="Approved"?"อนุมัติเปลี่ยนอุปกรณ์แล้ว":"ปฏิเสธคำขอแล้ว");await loadRequests();}catch(error){setStatus(error instanceof Error?error.message:"บันทึกผลไม่ได้");}finally{setBusy(false);}
 }
 return <main className={styles.page}><section className={styles.card}>
  <div className={styles.brand}>SCD</div><h1>ลงเวลาพนักงาน</h1><p>QR นี้ใช้เปิดระบบเท่านั้น กรอกรหัสพนักงานและ PIN เพื่อยืนยันอุปกรณ์ประจำตัว</p>
  <form onSubmit={begin} className={styles.form}><label>รหัสพนักงาน / Username<input value={login} onChange={e=>setLogin(e.target.value)} autoComplete="username" required placeholder="สแกนบัตรหรือพิมพ์รหัส"/></label><label>PIN ตัวเลข 6 หลัก<input value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,"").slice(0,6))} inputMode="numeric" autoComplete="current-password" type="password" pattern="[0-9]{6}" required placeholder="••••••"/></label><button disabled={busy}>{busy?"กำลังตรวจสอบ…":"ยืนยัน PIN และเข้าหน้าลงเวลา"}</button><a href="/legacy/mobile.html">กลับหน้าเข้าสู่ระบบปกติ</a></form>
  <p className={styles.status} role="status">{status}</p><small>อุปกรณ์แรกจะถูกผูกกับบัญชีนี้อัตโนมัติ หากเปลี่ยนโทรศัพท์ต้องรอหัวหน้าหรือ Admin อนุมัติ</small>
  {canApprove&&<div className={styles.approvals}><h2>คำขอเปลี่ยนอุปกรณ์ ({requests.length})</h2>{requests.length===0?<p>ไม่มีคำขอรออนุมัติ</p>:requests.map(item=><div className={styles.request} key={item.id}><div><b>{item.userName}</b><br/><span>{item.deviceLabel}</span></div><div><button disabled={busy} onClick={()=>decide(item.id,"Approved")}>อนุมัติ</button><button className={styles.reject} disabled={busy} onClick={()=>decide(item.id,"Rejected")}>ปฏิเสธ</button></div></div>)}</div>}
 </section></main>;
}

declare global{interface Navigator{userAgentData?:{platform?:string}}}
