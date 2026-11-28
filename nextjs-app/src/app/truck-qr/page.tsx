"use client";
import {useSyncExternalStore} from "react";
import {QRCodeSVG} from "qrcode.react";
import "../attendance-qr/attendance-qr.css";

// QR for a subcontractor / customer truck. The link token arrives in the URL
// fragment (#t=...) so it never reaches server logs; the QR opens the truck's
// own status page, which works without a login until the link expires.
const subscribe=(onChange:()=>void)=>{window.addEventListener("hashchange",onChange);return ()=>window.removeEventListener("hashchange",onChange);};
const readHash=()=>`${window.location.origin}|${window.location.hash.slice(1)}`;

export default function TruckQrPage(){
 const snapshot=useSyncExternalStore(subscribe,readHash,()=>"|");
 const [origin,hash]=[snapshot.slice(0,snapshot.indexOf("|")),snapshot.slice(snapshot.indexOf("|")+1)];
 const params=new URLSearchParams(hash);
 const token=params.get("t")||"";
 const plate=params.get("plate")||"";
 const link=token&&origin?`${origin}/legacy/truck.html?t=${encodeURIComponent(token)}`:"";
 return <main className="aq-screen">
  <section className="aq-card">
   <header className="aq-head">
    <div className="aq-mark" aria-hidden="true">SCD</div>
    <div>
     <p className="aq-eyebrow">S.C.D. TRANSPORT</p>
     <h1>{plate?`รถ ${plate}: สแกนเพื่อดูสถานะ`:"สแกนเพื่อดูสถานะรถ"}</h1>
    </div>
   </header>
   {link?<div className="aq-body">
    <div className="aq-qr"><QRCodeSVG value={link} size={512} level="M" includeMargin title={`QR สถานะรถ ${plate}`}/></div>
    <ol className="aq-steps">
     <li><b>สแกน QR</b><span>เปิดกล้องมือถือแล้วส่องที่ QR นี้</span></li>
     <li><b>ดูสถานะรถของคุณ</b><span>ขั้นตอนงาน คิวและท่าที่ต้องเข้า</span></li>
     <li><b>ถึงคลังแล้วกดแจ้ง</b><span>เจ้าหน้าที่จะได้รับแจ้งทันที</span></li>
    </ol>
   </div>:<p className="aq-note">ลิงก์ไม่ครบ กรุณาสร้าง QR ใหม่จากระบบ</p>}
   <p className="aq-note">QR นี้ใช้ได้เฉพาะรถคันนี้และหมดอายุตามที่ตั้งไว้ ห้ามส่งต่อให้คนอื่น</p>
   <button type="button" className="aq-print" onClick={()=>window.print()}>พิมพ์ QR</button>
  </section>
 </main>;
}
