'use client';
import {useState} from 'react';
import Link from 'next/link';
import {operationsRequest,operationsProof} from '@/services/operations-control';
import './operations-control.css';
type MergeRow={onhand:string;hawb:string;eligible:boolean;reasons:string[];packageCounts:Record<string,number>;fingerprint:string};
type Review={rows:MergeRow[];evidence:unknown[]};
export function CargoImport(){
 const [file,setFile]=useState<File|null>(null),[master,setMaster]=useState(''),[message,setMessage]=useState('เลือกไฟล์และตรวจขอบเขตก่อนนำเข้า'),[busy,setBusy]=useState(false),[review,setReview]=useState<Review|null>(null),[checked,setChecked]=useState(false);
 async function importFile(){
  if(!file||!window.confirm(`นำเข้าไฟล์งาน ${file.name}\nตรวจว่าเป็นไฟล์และจำนวนงานที่ต้องการก่อนยืนยัน`))return;
  setBusy(true);try{const data=await operationsProof(file);if(!data)throw Error('กรุณาเลือกไฟล์');const r=await operationsRequest<{kind:string;imported:number;newJobs:number;changedJobs:number}>('/api/admin/import-xlsx',{fileName:file.name,fileBase64:data.base64});setMessage(`นำเข้า ${r.kind} สำเร็จ ${r.imported} รายการ · ใหม่ ${r.newJobs} · อัปเดต ${r.changedJobs}`);setReview(null);}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}
 }
 async function preview(){setBusy(true);setReview(null);setChecked(false);try{const r=await operationsRequest<Review>('/api/admin/shipment-merges/preview',{master});setReview(r);setMessage(`พบ ${r.rows.length} คู่จาก Master ที่เลือก กรุณาตรวจเลขและหน่วยก่อนเชื่อม`);}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}
 async function apply(){if(!review||!checked)return;setBusy(true);try{const selection=review.rows.filter(r=>r.eligible);const r=await operationsRequest<{merged:unknown[]}>('/api/admin/shipment-merges/apply',{evidence:review.evidence,selection});setMessage(`เชื่อมข้อมูลสำเร็จ ${r.merged.length} House พร้อมสำรองรายการต้นทางในประวัติการเชื่อม`);setReview(null);setChecked(false);}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}
 return <main className="ops-control"><header><div><p>S.C.D. TRANSPORT</p><h1>นำเข้าและเชื่อมไฟล์งาน</h1><p>Pickup Report และ Consol Planning ก่อนส่งต่อ CS</p></div><Link href="/legacy/index.html?view=cs-queue">กลับคิว CS</Link></header><p className="ops-message" role="status">{message}</p>
 <section className="ops-record"><h2>1. นำเข้าไฟล์ต้นทาง</h2><p>นำเข้า Consol และ Pickup ทีละไฟล์ ระบบยังไม่ยืนยัน CS หรือเปิดใบงานแทนผู้ปฏิบัติงาน</p><label>ไฟล์ Excel งานขนส่ง<input type="file" accept=".xlsx" onChange={e=>setFile(e.target.files?.[0]||null)}/></label><div className="ops-actions"><button disabled={busy||!file} onClick={()=>void importFile()}>ยืนยันนำเข้าไฟล์งาน</button></div></section>
 <section className="ops-record"><h2>2. Admin ตรวจเชื่อม Onhand กับ House</h2><p>เลือกเฉพาะ Master ที่ต้องการตรวจ ใช้ HAWB จาก Pickup เทียบ House ของ Consol และตรวจจำนวนแยกหน่วย งานที่เริ่ม Flow แล้วหรือมีข้อมูลขัดแย้งจะไม่ให้เชื่อม</p><div className="ops-form"><label>Master ที่ตรวจเชื่อม<input value={master} onChange={e=>{setMaster(e.target.value);setReview(null);setChecked(false);}} placeholder="เช่น 189-05549401"/></label><button disabled={busy||!master.trim()} onClick={()=>void preview()}>ตรวจคู่ข้อมูลต้นทาง</button></div>
 {review&&<><div className="ops-scroll"><table><thead><tr><th>Onhand จาก Pickup</th><th>House จาก Consol</th><th>จำนวนตาม Consol</th><th>ผลตรวจ</th></tr></thead><tbody>{review.rows.map(r=><tr key={r.onhand}><td>{r.onhand}</td><td>{r.hawb}</td><td>{Object.entries(r.packageCounts).map(([u,n])=>`${n} ${u}`).join(' / ')}</td><td>{r.eligible?'พร้อมเชื่อม':r.reasons.join(', ')}</td></tr>)}</tbody></table></div><label className="ops-merge-check"><input type="checkbox" checked={checked} onChange={e=>setChecked(e.target.checked)}/>ตรวจเลขและจำนวนทุกคู่ที่พร้อมเชื่อมแล้ว</label><div className="ops-actions"><button disabled={busy||!checked||!review.rows.some(r=>r.eligible)} onClick={()=>void apply()}>ยืนยันเชื่อมคู่ที่ผ่านการตรวจ</button></div></>}
 </section></main>;
}
