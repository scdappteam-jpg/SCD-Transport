"""Create the detailed report from measured live SIT results, never private sessions."""
import json,html
from pathlib import Path
from datetime import datetime
from zoneinfo import ZoneInfo
R=Path(__file__).resolve().parents[1];D=R/'docs'
def load(n):return json.loads((D/n).read_text(encoding='utf8'))
data=load('booking-timeout-fixed-live-2026-10-25.json');audit=load('booking-timeout-isolation-audit-2026-10-25.json');integrity=load('booking-timeout-booking-integrity-2026-10-25.json')
assert all(v['result']=='PASS' for v in data['cases'])
def th(v):return datetime.fromisoformat(v.replace('Z','+00:00')).astimezone(ZoneInfo('Asia/Bangkok')).strftime('%d/%m/%Y %H:%M:%S')
def fig(name,caption):return f'<figure><a href="{name}"><img src="{name}" alt="{html.escape(caption)}"></a><figcaption>{html.escape(caption)} — ภาพหน้าจอ production จริง คลิกเพื่อเปิดขนาดเต็ม</figcaption></figure>'
booking=[v for v in data['cases'] if 'containsDashboard' in v]
rows=''.join(f'<tr><td>{html.escape(v["name"])}</td><td>{v["httpStatus"]}</td><td>{v["durationMs"]/1000:.3f} วินาที</td><td>{v["responseBytes"]:,} bytes</td><td>{"ใช่" if v["idempotent"] else "ไม่ใช่"}</td><td>{"มี" if v["containsDashboard"] else "ไม่มี"}</td><td>PASS</td></tr>' for v in booking)
allrows=''.join(f'<tr><td>{i}</td><td>{html.escape(v["name"])}</td><td>{v["expected"]} / {v["httpStatus"]}</td><td>{v["durationMs"]/1000:.3f}</td><td>{v["result"]}</td></tr>' for i,v in enumerate(data['cases'],1))
page=f'''<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SCD — แก้ timeout จองคิวรถและทดสอบ Live SIT 25 ต.ค. 2026</title>
<style>body{{font:16px/1.75 Tahoma,Arial;color:#16334d;background:#edf2f7;margin:0}}main{{max-width:1180px;margin:auto;padding:28px;background:white}}h1{{font-size:28px}}h2{{margin-top:32px;border-bottom:2px solid #dae4ee}}table{{border-collapse:collapse;width:100%;margin:18px 0;font-size:14px}}th,td{{border:1px solid #cbd5e1;padding:10px;text-align:left;vertical-align:top;overflow-wrap:anywhere}}th{{background:#e8f0fa}}.pass,.notice{{padding:18px;border-left:5px solid #25874c;background:#e7f7ee;margin:14px 0}}.notice{{border-color:#cb9b1a;background:#fff2d0}}img{{max-width:100%;border:1px solid #ccd6df}}figure{{margin:24px 0}}figcaption{{font-size:14px;color:#486078}}code{{background:#eef3f7;padding:2px 4px;overflow-wrap:anywhere}}li{{margin-bottom:10px}}@media print{{body{{background:white}}main{{padding:0}}figure,tr{{break-inside:avoid}}}}</style><main>
<h1>แก้ timeout ตอนจองคิวรถ — ผลทดสอบซ้ำบนระบบจริง</h1>
<p>25 ตุลาคม 2026 • Asia/Bangkok • <a href="https://scd-transport.onrender.com">SCD Transport Production</a><br>โค้ดแก้หลัก <code>e50393d</code> และป้องกันผลสำเร็จผิดบนเว็บ <code>44fa954</code> • Render แสดง Live รุ่น 44fa954 ก่อนเริ่มจองครั้งแรก</p>
<div class="pass"><b>การจองใหม่และอนุมัติผ่าน ไม่มี timeout ในรอบทดสอบนี้</b><br>ใช้ House เดิมที่ยังไม่เคยจอง <b>SIT-MEETING-20261025-L2</b> และรถจำลอง <b>SIT-BOOK-L2</b> ทดสอบผ่าน API จริงพร้อม header แบบ Mobile และกดจอง/อนุมัติซ้ำจากหน้าจอเว็บจริง ตรวจอ่านกลับว่าเวลาและประวัติไม่เพิ่มซ้ำ</div>
<div class="notice"><b>แยกสิ่งที่เกิดในระบบกับสิ่งที่จำลอง</b><br>HTTP, เวลาเซิร์ฟเวอร์, การเก็บสถานะ, หน้าเว็บ และไฟล์หลักฐานที่เปิดจาก production เป็นผลจริงของระบบ แต่สินค้า 2 CTN รถ คนขับในสถานการณ์ ภาพ ลายเซ็น เอกสาร และ GPS ของ L2 เป็นข้อมูล SIT ทั้งหมด ไม่มีรถวิ่งจริง ไม่มีการจองกับ AOT ภายนอก และไม่ใช้แทนยอดสินค้าเข้าคลังจริงของลูกค้า</div>
<h2>1. ขอบเขตชุดทดสอบ</h2><table><tr><th>รายการ</th><th>ข้อมูล</th></tr>
<tr><td>House ที่เปลี่ยนได้</td><td>SIT-MEETING-20261025-L2 เท่านั้น ใช้ชุด Pair เดิม ไม่สร้างงานใหม่ ไม่รีเซ็ต L1</td></tr>
<tr><td>ก่อนทดสอบ</td><td>ยังไม่มี aotBookedAt; CS Confirm และออก Cargo แล้ว; มี QA Pair revision 1 เดิม; ยังไม่รับเข้า WH3 ในระบบ</td></tr>
<tr><td>เตรียมก่อนจอง</td><td>รับสินค้าจำลอง 2 CTN → กลับ WH3 → ใบตรวจปล่อย → ตรวจเอกสาร → รับนับ 2 CTN → ปิด Inbound → เบิกออกด้วย QA เดิม → EI อนุมัติ → ตรวจเอกสาร WH3 ครบ ไม่มีการใช้หรือสร้างพื้นที่คลังจริง</td></tr>
<tr><td>Master / F</td><td>L2 ยังไม่มี Master/F โดยเจตนา ทดสอบการจองราย House ได้ ไม่เติมเลขสมมติลงงานจริง และไม่ผูกกับ Master จริง 205-86393230</td></tr>
<tr><td>รถ / คนขับ / Terminal</td><td>SIT-BOOK-L2 / SIT UI Driver / TG เป็นการจองภายในระบบเท่านั้น</td></tr>
<tr><td>จอง / อนุมัติ</td><td>{th(integrity['aotBookedAt'])} / {th(integrity['aotApprovedAt'])} น. ตามเวลาไทย</td></tr>
<tr><td>สถานะท้าย</td><td>AOTQueueApproved; รับนับจำลอง 2 CTN; ยังไม่ส่ง Terminal ไม่ปิดเที่ยว และไม่ออก Invoice</td></tr>
<tr><td>Geofencing</td><td>ปิดตลอดการทดสอบ ไม่มีพิกัด WH3 จริง 0 จุด Global Safety ยังปิดและคง allowlist เฉพาะ SIT เดิม</td></tr></table>
<h2>2. สิ่งที่แก้และเหตุผล</h2><ol>
<li><b>คำตอบแบบ Mobile ไม่สร้าง dashboard ทั้งระบบ</b> เดิมเส้นทาง AOT ส่ง dashboard รวมหลายพันงานแม้ผู้เรียกขอ compact แล้ว เปลี่ยนครบทั้งการจอง การอนุมัติ และการกดซ้ำ ให้คืนเฉพาะผลกับงานเป้าหมาย หน้า desktop ยังคงสัญญาคำตอบ dashboard เดิม</li>
<li><b>การจองไม่รอไฟล์ของคำขออื่น</b> เส้นทางนี้ไม่อัปโหลดไฟล์ จึงรอเฉพาะการยืนยัน snapshot ฐานข้อมูลกลาง ไม่รอคิวอัปโหลดหลักฐานทั่วระบบ</li>
<li><b>กำหนดเวลาคำขอฐานข้อมูล</b> ครอบคลุมทั้งเชื่อมต่อและอ่าน body ต่อครั้งสูงสุด 3 วินาที รวม retry สูงสุด 3 ครั้งใน budget 10 วินาที ไม่ retry 4xx ยกเว้น 429</li>
<li><b>ไม่ตอบสำเร็จก่อนยืนยันการบันทึก</b> ชั้นยืนยันการจองรอได้สูงสุด 25 วินาที หากยังมี snapshot ค้างหรือยังไม่ได้รับ acknowledgement จะตอบ 503 รหัส BOOKING_SAVE_UNCONFIRMED พร้อมข้อความให้ตรวจสถานะก่อนกดซ้ำ การเขียนเบื้องหลังอาจสำเร็จภายหลัง จึงไม่แปลว่า “จองไม่สำเร็จแน่นอน”</li>
<li><b>ทั้งเว็บและ Mobile ไม่กู้เป็นสำเร็จจากข้อมูล cache เมื่อได้รับรหัสนี้</b> และเว็บไม่เข้าคิว offline เพื่อแสดงว่าสำเร็จแทน</li>
<li><b>คงสิทธิ์และการป้องกันกดซ้ำ</b> Transport จองได้แต่อนุมัติไม่ได้ Admin อนุมัติได้ กดซ้ำไม่เปลี่ยนเวลาเดิมและไม่เพิ่มกิจกรรมจองซ้ำ</li></ol>
<p>ข้อผิดพลาดเดิมใน L1 คือคำตอบไม่มาภายใน 90 วินาทีทั้งที่ข้อมูลถูกเก็บแล้ว ข้อบกพร่องที่แก้ข้างต้นพบจากโค้ดและทดสอบได้ แต่ไม่มี trace เดิมที่พิสูจน์ว่าสาเหตุใดเป็นต้นเหตุเพียงอย่างเดียว จึงไม่สรุปว่า RAM เต็มหรือเครือข่ายเป็นสาเหตุแน่นอน</p>
<h2>3. ผลจับเวลาคำขอจริงหลัง deploy</h2><p>เริ่มจับจากโปรแกรมส่งคำขอจนอ่าน JSON จบ รวมเครือข่ายและเวลาเซิร์ฟเวอร์ คำขอทั้งหมดในตารางใช้ <code>X-SCD-Mobile-Compact: 1</code> ตัวเลขนี้เป็นผลรอบที่ทดสอบ ไม่ใช่ SLA หรือการรับประกันกรณี cold start/เครือข่ายล่ม</p>
<table><tr><th>กรณี</th><th>HTTP</th><th>เวลารวม</th><th>ขนาดคำตอบ</th><th>Idempotent</th><th>Dashboard</th><th>ผล</th></tr>{rows}</table>
<p>จองครั้งแรกเพิ่มกิจกรรมจอง 1 ครั้ง จากนั้นการจองซ้ำ API 3 ครั้งและอนุมัติซ้ำ API 2 ครั้งไม่เปลี่ยนเวลา จอง/อนุมัติซ้ำผ่าน UI อีกอย่างละ 1 ครั้งแล้วตรวจ timeline เทียบเดิม จำนวนกิจกรรมและเวลายังเท่าเดิม</p>
<h2>4. ขั้นตอนทำซ้ำบนหน้าเว็บ</h2><ol>
<li>เข้าระบบด้วยบัญชีที่ได้รับสิทธิ์ เปิด <b>งานภาคสนาม / Field Ops → Outbound → AOT</b> กรอก House <code>SIT-MEETING-20261025-L2</code> ตรวจว่าเป็นลูกค้า SIT ONLY ก่อนกดปุ่มใด</li>
<li>กรอก TG, ทะเบียน <code>SIT-BOOK-L2</code>, คนขับ <code>SIT UI / Driver</code>, รุ่น <code>SIT ONLY virtual vehicle</code>, ชนิด <code>4W-SIT</code> ชุดนี้จองและอนุมัติแล้ว ให้ใช้ทดสอบ <b>การกดซ้ำ</b> เท่านั้น ไม่ใช่การจองใหม่อีกครั้ง</li>
<li>กด <b>จองคิวรถ</b> หนึ่งครั้ง รอปุ่มกลับมาใช้งานและข้อความ <b>Queue booked</b> จากนั้นกด <b>อนุมัติคิว</b> ด้วย Admin ควรได้ <b>Queue approved</b> ห้ามกดโหลดขึ้นรถ/ถึง Terminal เพราะไม่อยู่ในขอบเขตรอบนี้</li>
<li>เปิด <b>Transport · Terminal · วางบิล</b> ค้นหา L2 แล้วกดรีเฟรช ควรเห็น <b>AOTQueueApproved</b>, รถส่ง Terminal <b>SIT-BOOK-L2</b> และแผน/รับนับ SIT <b>2 CTN / 2 CTN</b> ไม่ตีความว่ารับสินค้าลูกค้าจริงแล้ว</li>
<li>ตรวจ timeline: เวลาจองต้องคง {th(integrity['aotBookedAt'])} และอนุมัติ {th(integrity['aotApprovedAt'])} ไม่เพิ่มรายการจอง/อนุมัติใหม่จากการกดซ้ำ</li>
<li>หากขึ้น “ยังยืนยันการบันทึกคิวกับฐานข้อมูลกลางไม่ได้” หรือ 503 BOOKING_SAVE_UNCONFIRMED ให้หยุดกดซ้ำ ตรวจสถานะและประวัติก่อน หากจองแล้วให้ใช้ข้อมูลเดิม หากยังไม่พบให้ผู้ดูแลตรวจ pending write/ฐานข้อมูลก่อน ห้ามถือข้อความนี้ว่าจองสำเร็จแล้ว</li></ol>
<p><b>วิธีทดสอบการจองครั้งแรกครั้งถัดไป:</b> ต้องใช้ House SIT ที่ยังไม่เคยจองและผ่าน EI/เอกสาร WH3 แล้ว ไม่ลบ aotBookedAt ของ L2 และไม่ย้อนสถานะ L1 เพื่อสร้างผลทดสอบใหม่</p>
<p><b>ขอบเขตหน้าจอ:</b> การกดปุ่มจริงรอบนี้ใช้หน้าเว็บ Field Ops; สัญญาแบบ Mobile ทดสอบผ่าน HTTP จริงและ unit test ไม่ได้อ้างว่ากดปุ่มจองจากหน้าจอ Mobile ใหม่ครั้งแรก หน้าจอ Mobile ต้องผ่านตัวจับขั้นตอนของ UI ตาม workflow เดิม</p>
<h2>5. ภาพหน้าจอจริง</h2>
{fig('booking-timeout-render-live-2026-10-25.png','Render แสดง Live commit 44fa954')}
{fig('booking-timeout-ui-approved-2026-10-25.png','หน้าเว็บ AOT ที่ใช้กดจองและอนุมัติซ้ำ เห็น House และรถ SIT ครบ')}
{fig('booking-timeout-l2-approved-2026-10-25.png','อ่านข้อมูลกลับจาก production: AOTQueueApproved / รถส่ง Terminal SIT-BOOK-L2 / รับนับ SIT 2 CTN')}
{fig('booking-timeout-geofencing-off-2026-10-25.png','Geofencing ปิดและไม่มีพิกัดจริง 0 จุด คงขอบเขต SIT เดิม')}
<h2>6. การแยกจากงานจริงและผลจำลอง</h2><table><tr><th>ตรวจ</th><th>ผล</th></tr>
<tr><td>งานทั้งหมด / งานนอก L2 ที่ตรวจเทียบ</td><td>{audit['existingJobs']:,} / {audit['nonTargetJobsVerified']:,} รายการ — เทียบฟิลด์ธุรกิจ สถานะ จำนวน Invoice ผู้ติดต่อ การรับเข้า QA รถ Flight และเหตุการณ์ขาออก ไม่ใช่การเทียบ metadata เวลา refresh ทุกฟิลด์</td></tr>
<tr><td>งานนอก L2 ที่เปลี่ยน / งานเพิ่มหรือลบ</td><td>0 / 0 รวม L1 ที่คง ReadyForBilling และ L3 เดิม</td></tr>
<tr><td>Hash ฟิลด์ธุรกิจก่อน/หลังของงานนอก L2</td><td><code>{audit['beforeNonTargetSha256']}</code><br>ก่อนและหลังเท่ากัน</td></tr>
<tr><td>Dock / พื้นที่ / ผู้ใช้</td><td>Dock bays และคิวนอก L2 ไม่เปลี่ยน แผนที่คลังไม่เปลี่ยน ผู้ใช้/บทบาทไม่เปลี่ยน L2 มีคิวเข้า SIT เพิ่มตาม flow โดยไม่ยึด Dock จริง</td></tr>
<tr><td>หลักฐานจำลอง</td><td>สร้าง PNG แยก L2 ทั้งภาพสินค้า Cargo ประตูปิด ลายเซ็น ใบตรวจปล่อย เอกสารขาออก และ EI มีข้อความ SIT ONLY / SYNTHETIC ห้ามใช้กับ House ลูกค้าจริง ไม่เปลี่ยน QA Pair เดิม</td></tr>
<tr><td>สิทธิ์ชั่วคราว</td><td>ใช้ยูส SIT ที่มีอยู่แล้ว และ revoke API test grant หลังจบ ไม่สร้างผู้ใช้ ไม่เปลี่ยนรหัสผ่าน ไม่เปิด browser user picker</td></tr>
<tr><td>ข้อมูลจริงที่ไม่ได้ยืนยันจากภาคสนาม</td><td>ยังไม่ยืนยันรถ คนขับ การเคลื่อนสินค้า พิกัด การส่งมอบ Terminal หรือการจอง AOT ภายนอก</td></tr></table>
<h2>7. ตรวจโค้ดและกรณีความล้มเหลวจำลอง</h2><p>Automated tests <b>258/258 ผ่าน</b> รวม regression จองคิว 12 กรณี; TypeScript ผ่าน; production build ของโค้ดหลักผ่าน; ตรวจ syntax JavaScript ส่วน desktop ที่เพิ่มภายหลังผ่าน; Render build รุ่น 44fa954 ผ่านและ Live Targeted lint ผ่าน ส่วน whole-repository lint เดิมยังมี 4 errors / 3 warnings ในไฟล์ที่ไม่ได้แก้ ไม่อ้างว่า lint ทั้ง repository ผ่าน</p>
<p>การจำลองฐานข้อมูลค้าง/อ่าน body ค้าง/เขียนยังไม่ยืนยัน และการป้องกัน cache แสดงสำเร็จ ทดสอบใน automated test แบบแยก ไม่ตัดอินเทอร์เน็ตหรือทำฐานข้อมูล production ล่มเพื่อทดสอบ กรณี production รอบนี้ไม่เกิด 503 และไม่เกิด timeout</p>
<h2>8. หลักฐานข้อมูลและรายการตรวจทั้งหมด</h2><ul>
<li><a href="booking-timeout-fixed-live-2026-10-25.json">ผล HTTP พร้อมเวลาและขนาดคำตอบ</a></li>
<li><a href="booking-timeout-booking-integrity-2026-10-25.json">เวลาจอง/อนุมัติและการไม่สร้างซ้ำ</a></li>
<li><a href="booking-timeout-isolation-audit-2026-10-25.json">ผลเทียบงานนอก SIT และ Geofencing</a></li>
<li><a href="booking-timeout-unbooked-2026-10-25.json">ก่อนจองครั้งแรก</a> · <a href="booking-timeout-initial-booking-saved-2026-10-25.json">หลังจองครั้งแรก</a> · <a href="booking-timeout-final-2026-10-25.json">หลังอนุมัติ</a></li>
<li><a href="SCD-SIT-L1-Outbound-Terminal-2026-10-25.html">รายงาน L1 เดิม เก็บ TIMEOUT เดิมเป็นประวัติ ไม่แก้ให้กลายเป็น PASS</a></li></ul>
<p>จำนวน PASS ในไฟล์ผล {data['passed']} คือจำนวนคำขอตรวจ รวมอ่าน baseline/ไฟล์/สิทธิ์และการตรวจซ้ำ ไม่ใช่จำนวน business scenario ที่ไม่ซ้ำ</p>
<table><tr><th>#</th><th>รายการคำขอ</th><th>HTTP คาดหวัง / ได้จริง</th><th>วินาที</th><th>ผล</th></tr>{allrows}</table>
<div class="notice">Render เป็น Free instance หน้า dashboard ระบุว่าอาจพักเมื่อไม่ใช้งานและ cold start ทำให้คำขอช้าลงตั้งแต่ 50 วินาทีขึ้นไป การแก้ครั้งนี้ลดงานตอบกลับและกำหนดเวลารอ persistence ไม่ได้เปลี่ยนแพ็กเกจหรือรับประกันการปลุก instance ภายในเวลาของ Mobile</div>
</main></html>'''
(D/'SCD-Booking-Timeout-Fixed-SIT-2026-10-25.html').write_text(page,encoding='utf8')
old=D/'SCD-SIT-L1-Outbound-Terminal-2026-10-25.html';s=old.read_text(encoding='utf8');banner='<div class="pass"><b>อัปเดตผลแก้ timeout จองคิว 25 ต.ค. 2026</b><br>Deploy 44fa954 แล้ว ทดสอบการจองใหม่ด้วย SIT L2 ผ่าน พร้อมตรวจการกดซ้ำและงานนอกชุดทดสอบ L1 ที่ปิดงานแล้วไม่เปลี่ยน <a href="SCD-Booking-Timeout-Fixed-SIT-2026-10-25.html">เปิดผลทดสอบและภาพจริงฉบับแก้ไข</a> ข้อ TIMEOUT ด้านล่างเป็นผลเดิมและยังคงไว้เป็นประวัติ</div>'
if 'SCD-Booking-Timeout-Fixed-SIT-2026-10-25.html' not in s:s=s.replace('<main>','<main>'+banner,1);old.write_text(s,encoding='utf8')
print('Detailed report generated; historical L1 timeout preserved; all live cases PASS',data['passed'])
