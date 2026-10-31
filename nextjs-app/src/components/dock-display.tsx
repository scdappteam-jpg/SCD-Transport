'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {readDockDisplay,type DockBoard,type DockRow} from '@/services/dock-display';
import Link from 'next/link';
import styles from './dock-display.module.css';
const ticket=(value:number|null)=>value?String(value).padStart(3,'0'):'—';
function Rows({rows,called}:{rows:DockRow[];called:boolean}){
  return <div className={styles.scroll}><table><thead><tr><th>เลขคิว</th><th>ทะเบียนรถ</th><th>House</th><th>{called?'ช่อง Dock':'รอเรียก'}</th></tr></thead><tbody>{rows.map(row=>{const houses=row.houseNumbers?.length?row.houseNumbers:[row.houseNumber];return <tr key={row.id}><td className={styles.ticket}>{ticket(row.queueNumber)}</td><td>{row.vehiclePlate}</td><td className={styles.house} title={houses.join(', ')}>{row.houseNumber}{houses.length>1&&<small>+{houses.length-1} House · รถคันเดียว</small>}</td><td className={styles.dock}>{called?row.dockId:'—'}</td></tr>;})}</tbody></table>{!rows.length&&<p className={styles.empty}>{called?'ยังไม่มีรถที่ถูกเรียกเข้าท่า':'ไม่มีรถรอเรียกในขณะนี้'}</p>}</div>;
}
export function DockDisplay({scope}:{scope:'live'|'sit'}){
  const [board,setBoard]=useState<DockBoard|null>(null);
  const [error,setError]=useState('');
  const [now,setNow]=useState(0);
  const [busy,setBusy]=useState(false);
  const mounted=useRef(false),inflight=useRef(false);
  const refresh=useCallback(async(selected:'live'|'sit')=>{
    if(inflight.current)return;
    inflight.current=true;setBusy(true);
    try{const next=await readDockDisplay(selected);if(mounted.current){setBoard(next);setError('');setNow(Date.now());}}
    catch(e){if(mounted.current){setBoard(null);setError(e instanceof Error?e.message:'เชื่อมต่อไม่สำเร็จ');}}
    finally{inflight.current=false;if(mounted.current)setBusy(false);}
  },[]);
  useEffect(()=>{
    mounted.current=true;
    const selected=scope;
    const initial=setTimeout(()=>void refresh(selected),0);
    const timer=setInterval(()=>void refresh(selected),10000);
    const clock=setInterval(()=>setNow(Date.now()),1000);
    return()=>{mounted.current=false;clearTimeout(initial);clearInterval(timer);clearInterval(clock);};
  },[refresh,scope]);
  const stale=!!board&&now-Date.parse(board.updatedAt)>30000;
  return <main className={styles.screen}>
    <header className={styles.header}><div><p>S.C.D. TRANSPORT · WH3</p><h1>จอประกาศคิวหน้าคลัง</h1></div><div className={styles.tools}><span>{scope==='sit'?'ชุดทดสอบ SIT':'คิวปฏิบัติงาน'}</span><button disabled={busy} onClick={()=>void refresh(scope)}>{busy?'กำลังอัปเดต…':'รีเฟรช'}</button><button onClick={()=>void document.documentElement.requestFullscreen().catch(()=>setError('เบราว์เซอร์ไม่รองรับเต็มจอ'))}>เต็มจอ</button><Link prefetch={false} href="/legacy/index.html?view=dock">จัดการคิว</Link></div></header>
    {scope==='sit'&&<div className={styles.sit}>SIT — ข้อมูลจำลองสำหรับทดสอบ แยกจากงานจริง</div>}
    <div className={styles.meta}>อัปเดตอัตโนมัติทุก 10 วินาที · ล่าสุด {board?new Date(board.updatedAt).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'}):'—'} · ต้องเรียกผ่านหน้าจัดการคิวก่อนจึงจะแสดงช่อง Dock</div>
    {(error||stale)&&<div role="alert" className={styles.error}>{error||'ข้อมูลเกิน 30 วินาที กรุณาตรวจการเชื่อมต่อ'} <Link prefetch={false} href="/legacy/index.html">เข้าสู่ระบบ</Link></div>}
    {!board&&!error&&<p role="status">กำลังโหลดคิว…</p>}
    {board&&!stale&&<><section className={styles.called}><h2>เรียกเข้าช่อง Dock <span>{board.called.length} คัน</span></h2><Rows rows={board.called} called/></section>
    <section className={styles.waiting}><h2>รอเรียก <span>{board.queue.length} คัน</span></h2><Rows rows={board.queue} called={false}/></section>
    <section><h2>ช่องเทียบท่า</h2><div className={styles.bays}>{board.bays.map(b=><div key={b.id} className={b.status==='Called'?styles.activeBay:styles.bay}><strong>{b.id}</strong><span>{b.name}</span><small>{b.status==='Called'?'เรียกเข้าแล้ว':b.status==='Available'?'ว่าง':b.status==='Closed'?'ปิด':b.status==='SIT'?'SIT':b.status==='Reserved'?'จอง':'ใช้งานอยู่'}</small></div>)}</div></section></>}
    <footer className={styles.meta}>ช่อง Dock ที่แสดงคือช่องที่เจ้าหน้าที่เรียกเข้า ไม่ใช่การยืนยันตำแหน่งรถจาก GPS · จออ่านอย่างเดียว</footer>
  </main>;
}
