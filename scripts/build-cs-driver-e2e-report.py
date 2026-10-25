"""Build the public SIT report from verified readbacks and real UI captures only."""
from pathlib import Path
import json,html,hashlib,zipfile,re
from datetime import datetime,timedelta,timezone
from html.parser import HTMLParser
from PIL import Image,ImageDraw,ImageFont
R=Path(__file__).resolve().parents[1];D=R/'docs';P=R/'.sit-meeting/cs-driver-e2e-20261025-N1'
H='SIT-CS-DRIVER-20261025-N1';DATE='2026-10-25';BASE='https://scd-transport.onrender.com'
def read(name):return json.loads((D/name).read_text(encoding='utf8'))
def esc(v):return html.escape(str(v))
def thai(v):return datetime.fromisoformat(v.replace('Z','+00:00')).astimezone(timezone(timedelta(hours=7))).strftime('%d/%m/%Y %H:%M:%S') if v else 'ยังไม่ยืนยัน'
final=read('cs-driver-e2e-final-'+DATE+'.json');j=final['job'];audit=read('cs-driver-e2e-isolation-audit-'+DATE+'.json');results=read('cs-driver-e2e-results-'+DATE+'.json');files=read('cs-driver-e2e-evidence-readback-'+DATE+'.json')
assert j['status']=='WaitingForDock' and audit['existingJobsChanged']==0 and len(files)==6
captions=[
('CS: เลือกงานที่ยังไม่ Confirm','ติ๊กเลือกชุด SIT เพื่อเปิดช่อง Invoice และข้อมูลผู้ติดต่อ ก่อนบันทึก'),
('CS: กรอก Invoice ผู้ติดต่อและเบอร์','กรอกข้อมูลจำลองครบ เลือกช่องทาง Phone และหมายเหตุว่าไม่ได้โทรจริง ภาพก่อนกด Confirm'),
('CS: Confirm และประวัติส่งต่อ','ผลหลังบันทึกจริงด้วยยูส SIT UI / CS ตรวจ Invoice และข้อมูลผู้ติดต่ออ่านกลับตรงกัน'),
('Transport: เปิดใบงานจากคิว CS','เลือกงานชุดเดิมเพื่อออก Cargo ไม่สร้างงานซ้ำ'),
('Transport: เลือกคนขับและทะเบียน','เลือก SIT UI / Driver และ SIT-ONLY ตั้ง Pickup Case เป็น GeneralManual'),
('Transport: Preview ใบ Cargo','ตรวจ Invoice ผู้ติดต่อ เบอร์โทร และรายละเอียดก่อนออกใบ ไม่ต้องพิมพ์ซ้ำ'),
('Transport: ออกใบงานสำเร็จ','กด Create Job ครั้งเดียว บันทึก cargoIssuedAt และเปิด Print/Track ได้'),
('Driver: เปิดใบงานที่ได้รับ','แสดงลูกค้า รถ และจุดรับจำลอง ก่อนเริ่มรอบ ปุ่มถึงจุดรับยังไม่เปิด'),
('Driver: รายละเอียดสินค้า','3 Carton / House เดียว / ปลายทาง WH3 เป็นยอดแผน ยังไม่ใช่ยอดรับเข้าคลัง'),
('Driver: ฟอร์ม Checklist และรูป 3 หมวด','แสดงฟอร์มตรวจ 10 รายการ ภาพสินค้า Cargo และประตู ภาพนี้ยังเป็นฟอร์มก่อนบันทึกหลักฐานผ่าน API'),
('Driver: ฟอร์มลายเซ็น','แสดงลายเซ็นสองฝ่ายและปุ่มโหลด/ยืนยันที่ยังปิดในฟอร์มว่าง ไม่อ้างว่าได้วาดลายเซ็นจริงบนมือถือ'),
('Driver: เริ่มรอบบันทึกแล้ว','POST route-start แบบ simulation สำเร็จ อ่านกลับผ่าน UI ปุ่มเริ่มรอบปิดและถึงจุดรับเปิด'),
('Driver: ข้อมูลที่ CS ส่งถึงคนขับ','Invoice SIT-CS-INV-20261025-N1 / SIT CONTACT N1 / 0000000000 / SIT-ONLY ครบ'),
('Driver: ถึงจุดรับบันทึกแล้ว','POST checkin แบบ simulation สำเร็จ ปุ่มเริ่มรอบและถึงจุดรับปิดเพื่อไม่กดซ้ำ'),
('Driver: Loading','บันทึก Checklist 10 รายการ รูปจำลอง 3 หมวด ลายเซ็นจำลอง 2 ฝั่ง และจำนวน 3 CTN ผ่าน API อ่านสถานะ Loading บน UI'),
('Driver: PickedUp และเริ่มกลับ WH3','ยืนยันรับด้วย payload หลักฐานชุดเดียวกับตอน Load ได้ completedAt และ returningWh3At ไม่ยืนยัน receipt ของคลัง'),
('Driver: ถึง WH3 รอใบตรวจปล่อย','สถานะ AwaitingReleaseDocument หลังบันทึก arrivedWh3At ด้วย GPS จำลอง'),
('Driver: ส่งใบตรวจปล่อยและรอ Dock','สถานะ WaitingForDock หลังแนบใบตรวจปล่อยจำลอง ไม่มีการจอง/เข้าช่องจริง'),
('Transport: อ่านแผนและรถหลังจบรอบ','แผน 3 CTN / รับเข้าคลังยังไม่ยืนยัน พบสรุปจัดรถ 0 และยังไม่ผูกรอบ 1 แม้มีคนขับและเริ่มรอบแล้ว'),
('Transport: ทะเบียนหลักฐาน 6 ไฟล์','มีลิงก์ ProductImage CargoForm DoorClosedAudit InspectorSignature ReceiverSignature ReleaseDocument ส่วนตารางประวัติ Transport ยังว่าง'),
('Transport: สถานะสุดท้ายและ KPI','WaitingForDock / ReleasedForDock แผน 3 CTN รับยังไม่ยืนยัน KPI จากนาฬิกาการจำลอง ไม่ใช้วัดผลงานคนขับจริง'),
('เปิดไฟล์ ProductImage จริง','ภาพหน้าจอเบราว์เซอร์เปิดไฟล์ที่เก็บบน production เป็นภาพจำลองติดป้าย SIT ONLY'),
('เปิดไฟล์ CargoForm จริง','เอกสาร Cargo จำลอง ไม่ใช่ใบรับสินค้าที่ลงชื่อจริง'),
('เปิดไฟล์ DoorClosedAudit จริง','ภาพแทนการปิดประตูจำลอง ไม่มีการปิดรถจริง'),
('เปิดไฟล์ InspectorSignature จริง','แผ่นหลักฐานจำลองแทนลายเซ็นผู้ตรวจ ไม่ใช่ลายเซ็นบุคคลจริง'),
('เปิดไฟล์ ReceiverSignature จริง','แผ่นหลักฐานจำลองแทนลายเซ็นผู้รับ ไม่ใช่ลายเซ็นบุคคลจริง'),
('เปิดไฟล์ ReleaseDocument จริง','ใบตรวจปล่อยจำลอง เปิดจาก storage ได้ ไม่พบ 404'),
('Driver Time Log: เวลาครบทุกขั้น','รายงานจริงในระบบติดป้าย SIT — ข้อมูลจำลอง แสดงเริ่มรอบ ถึงจุดรับ โหลด ออกโรงงาน ถึง WH3 และรับใบตรวจปล่อย'),
('Driver Time Log: ภาพเต็มหน้า','เก็บบริบทตัวกรอง รวม SIT และรายงาน ไม่สั่งพิมพ์ใบ Cargo ซ้ำ'),
('ปิดโหมดทดสอบเบราว์เซอร์','ออกจากระบบหลังจบงาน ปิดตัวเลือกยูสชั่วคราว ไม่เปลี่ยนรหัสผ่านหรือสิทธิ์ยูสเดิม'),
]
shots=sorted(D.glob('cs-driver-e2e-[0-9][0-9]-*-'+DATE+'.png'))
assert len(shots)==len(captions),(len(shots),len(captions))
manifest=[]
for i,(p,(title,detail)) in enumerate(zip(shots,captions),1):
 assert int(p.name.split('-')[3])==i,p.name
 im=Image.open(p);assert im.width>=1000 and im.height>=600
 manifest.append({'number':i,'file':p.name,'title':title,'description':detail,'source':'actual production browser screenshot','width':im.width,'height':im.height,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
(D/('cs-driver-e2e-screenshot-manifest-'+DATE+'.json')).write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
stepRows=[
('1 CS รับงาน','UI · SIT CS','คิวงาน Transport → ค้นหา H → ติ๊กเลือกแถว','ฟอร์ม Invoice และผู้ติดต่อปรากฏ โดยยังไม่จัดรถ','ผ่าน · created.csConfirmed=false แล้ว CS เป็นผู้ Confirm', '01–03'),
('2 ใส่ข้อมูล CS','UI · SIT CS','กรอก Invoice ชื่อ เบอร์ ช่องทาง Phone และหมายเหตุ SIT → Confirm ครั้งเดียว','เก็บค่าทั้งใน CS และช่องใช้งานต่อโดยไม่หาย','ผ่าน · csInvoiceNo=invoiceNo, csContactName=contactPerson, csContactPhone=pickupPhone', '02–03'),
('3 จัดรถและส่งงาน','UI · SIT Transport','เปิดใบงาน → เลือก H → GeneralManual → SIT UI / Driver → SIT-ONLY → Preview → Create Job','ผูกคนขับและรถกับงานเดิม ออก Cargo และเห็นในบัญชีคนขับ','ผ่าน · driverId=sit_ui_driver, cargoIssuedAt มีค่า งานไม่ซ้ำ','04–08'),
('4 รับ/เปิดงานฝั่ง Driver','UI · SIT Driver','สแกน → ค้นหา H → เลือกใบงาน → Open Job','แสดง Invoice ผู้ติดต่อ เบอร์ รถ และแผน 3 CTN ตรงกับ CS','ผ่าน · เปิดดูงานได้ ไม่มี endpoint acceptedAt แยกจึงไม่อ้างเวลารับงานที่ไม่มี','08–13'),
('5 เริ่มรอบ','API simulation · SIT Driver + UI readback','POST /api/pickup/route-start เฉพาะ H','บันทึก routeStartedAt และให้ไปขั้นถึงจุดรับได้','ผ่าน · เวลาเริ่มรอบมีจริงในระบบ แต่ไม่ได้เริ่มขับรถจริง','12'),
('6 ถึงจุดรับ','API simulation · SIT Driver + UI readback','POST /api/pickup/checkin ด้วย GPS จำลอง 13.1,100.1','บันทึก checkInAt / arrivedAtPickupAt','ผ่าน · ArrivedAtPickup ไม่ใช้ตำแหน่งอุปกรณ์จริง','14'),
('7 โหลดสินค้า','API simulation · SIT Driver + UI readback','POST /api/pickup/load พร้อม Checklist 10 ข้อ รูป3ประเภท ลายเซ็น2ฝั่ง','บันทึก Loading และเก็บไฟล์5รายการครบ','ผ่าน · หลักฐานเป็น PNG ติดป้ายจำลองทั้งหมด','10–11,15,22–26'),
('8 รับสินค้าและกลับ WH3','API simulation · SIT Driver + UI readback','POST /api/pickup/complete ใช้ข้อมูลหลักฐานชุดเดิม','บันทึก PickedUp, completedAt, returningWh3At, doorClosedPhotoAt','ผ่าน · ยังไม่ใช่ WH receipt','16'),
('9 กลับถึง WH3','API simulation · SIT Driver + UI readback','POST /api/pickup/arrive-wh3','บันทึก arrivedWh3At และ AwaitingReleaseDocument','ผ่าน · ถึงคลังในชุดทดสอบตามขอบเขตที่ผู้ใช้ยืนยัน','17'),
('10 ส่งใบตรวจปล่อย','API simulation · SIT Driver + UI readback','POST /api/pickup/release-document เฉพาะ H พร้อมภาพจำลอง','บันทึก releaseDocumentReceivedAt และ WaitingForDock','ผ่าน · จบที่รอ Dock ไม่ย้ายของ ไม่รับเข้า/จัดเก็บต่อ','18,27'),
('11 อ่านกลับและเปิดหลักฐาน','GET + UI จริง','ตรวจ timeline, bootstrap, storage6ไฟล์ และ Driver Time Log','Invoice/ผู้ติดต่อ/เบอร์คงเดิม ไฟล์200 และ logเวลาครบ','ผ่านส่วนข้อมูล · พบช่องว่างสรุป Transport ตามหัวข้อสิ่งที่ต้องแก้','19–29'),
('12 ปิดสิทธิ์ชั่วคราว','API + UI','stop API grant และปิดโหมดเลือกยูสในเบราว์เซอร์','ปิด session ทดสอบหลังบันทึกเสร็จ','ดำเนินการแล้ว · ดูภาพ Login หลังปิดโหมด','30'),
]
def table(headers,rows):return '<div class="tablewrap"><table><thead><tr>'+''.join('<th>'+esc(x)+'</th>' for x in headers)+'</tr></thead><tbody>'+''.join('<tr>'+''.join('<td>'+esc(x)+'</td>' for x in row)+'</tr>' for row in rows)+'</tbody></table></div>'
timelineRows=[(label,thai(j.get(key))) for label,key in [('สร้างชุด SIT','createdAt'),('CS Confirm','csConfirmedAt'),('Transport ออก Cargo','cargoIssuedAt'),('Driver เริ่มรอบ','routeStartedAt'),('ถึงจุดรับ','arrivedAtPickupAt'),('โหลดสินค้าขึ้นรถ','loadedAt'),('รับสินค้า / ออกจากโรงงาน','completedAt'),('เริ่มกลับ WH3','returningWh3At'),('ถึง WH3','arrivedWh3At'),('รับใบตรวจปล่อย','releaseDocumentReceivedAt')]]
evidenceRows=[(f['fileType'],f['fileId'],'HTTP '+str(f['httpStatus']),f['sha256']) for f in files]
requestRows=[(v['name'],str(v['expected']),str(v['httpStatus']),v['result'],v.get('message','')) for v in results['cases']]
gallery=''.join('<figure id="screen'+str(m['number'])+'"><figcaption><b>'+str(m['number']).zfill(2)+'. '+esc(m['title'])+'</b><p>'+esc(m['description'])+'</p></figcaption><a href="'+m['file']+'"><img loading="lazy" src="'+m['file']+'" alt="'+esc(m['title'])+'"></a><small>ภาพหน้าจอจริงจาก production · '+str(m['width'])+'×'+str(m['height'])+' · คลิกเพื่อดูต้นฉบับ</small></figure>' for m in manifest)
links=sorted(D.glob('cs-driver-e2e-*-'+DATE+'.json'))
sourceLinks='<ul>'+''.join('<li><a href="'+p.name+'">'+p.name+'</a></li>' for p in links)+'</ul>'
body=f'''<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>CS → Transport → Driver → WH3 | SIT N1</title>
<style>*{{box-sizing:border-box}}body{{margin:0;background:#eef3f7;color:#14273d;font:16px/1.7 Tahoma,Arial,sans-serif}}main{{max-width:1250px;margin:auto;padding:32px}}header{{background:#12395b;color:white;padding:32px;border-radius:16px}}h1{{font-size:29px;line-height:1.45}}h2{{margin-top:40px;border-bottom:2px solid #b9cddd;padding-bottom:8px}}a{{color:#1262a8}}header a{{color:#cfedff}}.notice{{background:#fff1cc;border-left:5px solid #d08b00;padding:18px;margin:22px 0}}.good{{background:#e5f6ee;border-left:5px solid #16875b;padding:18px}}.tablewrap{{overflow-x:auto}}table{{border-collapse:collapse;width:100%;background:white;margin:15px 0;font-size:14px}}th,td{{text-align:left;padding:12px;border:1px solid #d4e0e9;vertical-align:top;overflow-wrap:anywhere}}th{{background:#dae9f4}}figure{{background:white;border-radius:12px;padding:18px;margin:24px 0;break-inside:avoid}}figure img{{display:block;max-width:100%;height:auto;margin:14px auto;border:1px solid #dae3ea}}figcaption b{{font-size:19px}}small{{color:#617389}}code{{overflow-wrap:anywhere}}nav{{padding:18px;background:white;margin:20px 0}}nav a{{margin-right:18px}}@media print{{body{{background:white}}main{{padding:0}}header{{color:black;background:white}}figure img{{max-height:900px}}nav{{display:none}}}}</style>
<main><header><p>S.C.D. TRANSPORT · ทดสอบบนระบบจริง วันที่ 25 ตุลาคม 2026</p><h1>CS รับงาน → ใส่ Invoice / ผู้ติดต่อ / เบอร์โทร<br>จัดรถ → ส่งงานถึงคนขับ → กลับ WH3</h1><p><b>{H}</b><br>ใช้ชุดใหม่ บันทึกสถานะจริงในระบบ production และใช้หลักฐานจำลองเฉพาะ SIT</p></header>
<nav><a href="#outcome">ผลทดสอบ</a><a href="#manual">ขั้นตอนทำซ้ำ</a><a href="#issues">จุดที่ต้องแก้ต่อ</a><a href="#gallery">ภาพหน้าจอทั้งหมด {len(shots)} ภาพ</a><a href="#sources">ข้อมูลตรวจสอบ</a></nav>
<section id="outcome"><h2>ผลที่ทำได้จริง</h2><div class="good">บันทึก CS และจัดรถผ่านหน้าระบบจริงด้วยบทบาท SIT CS / SIT Transport จากนั้นคนขับ SIT เปิดดูงานได้ครบ ข้อมูล Invoice ผู้ติดต่อและเบอร์คงเดิมตลอดทาง บันทึกขั้น Driver แบบ API simulation จนกลับ WH3 และส่งใบตรวจปล่อย สถานะสุดท้าย <b>WaitingForDock</b> เปิดหลักฐานได้ครบ 6 ไฟล์ และ Driver Time Log มีเวลาครบ</div>
<div class="notice"><b>ยังไม่สรุปว่าใช้งานจริงผ่านครบทุกส่วน:</b> Driver GPS/กล้อง/วาดลายเซ็นบนอุปกรณ์จริงไม่ได้ทดสอบ การเปลี่ยนสถานะ Driver รอบนี้ส่งผ่าน API ของระบบด้วย simulation=true แล้วอ่านผลบน UI จริง มีจุดไม่สอดคล้องในรายงาน Transport ตามรายการด้านล่าง ไม่ได้แก้โค้ดหรือ deploy เพิ่มในรอบนี้</div>
<p>ระบบ: <a href="{BASE}/legacy/index.html">SCD production</a> · live code 166af83 · Geofencing ยังคงปิด · ไม่ส่งอีเมล SMS หรือโทรหาคนจริง · ไม่มีการเคลื่อนรถหรือสินค้าจริง</p>
{table(['ข้อมูล','ค่าชุดทดสอบ'],[('House',H),('ลูกค้า','SIT ONLY CS DRIVER E2E 20261025 N1'),('CS Invoice อ้างอิง','SIT-CS-INV-20261025-N1 (ไม่ใช่ Invoice การเงิน)'),('ผู้ติดต่อ / เบอร์','SIT CONTACT N1 / 0000000000'),('คนขับ / รถ','sit_ui_driver · SIT UI / Driver / SIT-ONLY'),('วันรับ / ปลายทาง','2026-10-25 / WH3'),('แผน / รับคลังจริง','3 CTN / ยังไม่ยืนยัน receipt ไม่ใช้แผนแทนยอดจริง'),('Flight จำลอง','SIT200 / 26 ต.ค. 2026 19:00 น. ไทย'),('Onhand / Master','ไม่ได้กำหนด F และ Master ให้ชุดใหม่ หน้าคนขับแสดง House เป็น Onhand fallback จึงไม่ถือว่ามีเลข F จริง'),('สถานะจบ','WaitingForDock / transport ReleasedForDock'),('เอกสารการเงิน','ไม่สร้าง Invoice การเงินใหม่ ไม่แตะ INV-2026-0001 เดิม')])}</section>
<section id="manual"><h2>วิธีทดสอบทีละขั้น พร้อมผลที่ควรได้และผลจริง</h2><p>ใช้ H = {H} สำหรับเปิดอ่านย้อนหลังเท่านั้น หากจะทำรอบใหม่ ให้สร้างเลข SIT ใหม่และยืนยันขอบเขตก่อน ห้ามกด Confirm / Create / complete ซ้ำบนชุดที่เสร็จแล้วเพื่อจำลองการเริ่มใหม่</p>
{table(['ขั้นตอน','วิธี / ผู้ทำ','ทำอย่างไร','ผลที่ควรได้','ผลที่พบ','ภาพ'],stepRows)}
<h3>ข้อมูลที่ต้องกรอกในหน้าจอ CS</h3><ol><li>เปิดคิวงาน Transport ด้วย SIT CS ค้นหา H แล้วติ๊กเลือกงาน ช่องข้อมูล CS จะปรากฏ</li><li>Invoice = SIT-CS-INV-20261025-N1, ผู้ติดต่อ = SIT CONTACT N1, โทร = 0000000000</li><li>ช่องทาง Phone ใช้เพื่อทดสอบบันทึกช่องทางเท่านั้น หมายเหตุ “SIT ONLY - บันทึกทดสอบ ไม่ได้โทรจริง ไม่ส่งข้อความหาลูกค้า”</li><li>กด Confirm หนึ่งครั้ง รอผลบันทึกและเปิดประวัติส่งต่อ ตรวจชื่อผู้ทำและค่าทั้งสามก่อนจัดรถ</li></ol>
<h3>ข้อมูลที่ต้องตรวจใน Transport</h3><ol><li>เปิดใบงานจากคิว CS เลือก House เดิม ไม่สร้าง House ใหม่</li><li>เลือกงานทั่วไป GeneralManual (ฟอร์มเริ่มต้นเคยแสดงงานพิเศษ/MD จึงเปลี่ยนก่อนบันทึก) เลือก sit_ui_driver และทะเบียน SIT-ONLY</li><li>กด Preview ตรวจ Invoice ชื่อ เบอร์ รถ คนขับ และยอด 3 Carton ให้ตรง แล้วกด Create Job ครั้งเดียว</li><li>ตรวจผล Print / Track และเข้าบัญชี SIT Driver เพื่อยืนยันว่าได้รับงาน ไม่ใช้การเห็นจาก Admin แทน</li></ol>
<h3>วิธีที่ใช้ฝั่ง Driver ในรอบนี้</h3><p>เปิดเมนูสแกน ค้นหา House เลือก Assigned Job และ Open Job ผ่าน UI จริง ตรวจหน้ารายละเอียดสินค้า Checklist รูป3หมวด และลายเซ็นทั้งสอง ช่องว่างในภาพฟอร์มคือสภาพก่อนบันทึก ไม่ได้แต่งภาพให้เหมือนอัปโหลดผ่าน UI แล้ว จากนั้นใช้ API ของระบบด้วย token บทบาท SIT Driver บันทึกทีละขั้นตามตาราง โดยส่ง simulation=true และ GPS สมมติ 13.1,100.1 ไม่ใช้หรือปลอมตำแหน่งอุปกรณ์จริง</p><p>ตอน Load ส่ง Checklist date/customer/place/driver/house/package/inspector/receiver/route-log/destination ครบ 10 ข้อ, pickupItems House เดียว carton=3 destination=WH3, packageType=Carton, pickupCase=GeneralManual, ชื่อผู้ตรวจ SIT SYNTHETIC INSPECTOR และผู้รับ SIT SYNTHETIC RECEIVER พร้อมภาพ3หมวดและลายเซ็น2ฝั่ง ตอน complete ใช้ข้อมูลและหลักฐานชุดเดียวกัน ก่อน arrive-wh3 และ release-document อ่าน timeline หลังทุกขั้นและรีเฟรช UI เพื่อแคปผล</p>
<div class="notice">การรับ/เปิดใบงานไม่มี acceptedAt แยก จึงยืนยันได้ว่า Driver เห็นและเปิดงานได้ ไม่สร้างเวลารับงานขึ้นเอง การเช็คอินเข้างานประจำวัน / กล้องจริง / ลายเซ็นสัมผัส / Geofencing / สัญญาณ GPS จริง ยังเป็นรายการต้องทดสอบบนอุปกรณ์หน้างานต่อ</div></section>
<section><h2>เวลาที่บันทึกจริงในระบบ (เหตุการณ์การจำลอง)</h2>{table(['ขั้นตอน','เวลาไทย Asia/Bangkok'],timelineRows)}<p>เวลารอเอกสารใน Driver Time Log แสดง 1 นาที เป็นค่าปัดตามการทดสอบสั้น ๆ ไม่ใช่ KPI งานขนส่งจริง ไม่มีเวลารับเข้าคลัง QA จัดเก็บ หรือปิดงานคลังในรอบนี้</p></section>
<section id="issues"><h2>จุดที่ต้องแก้ต่อและขอบเขตที่ยังไม่ผ่านการยืนยัน</h2>{table(['รายการ','หลักฐานที่พบ','ผลกระทบ / ผลที่ควรได้'],[
('1 สรุปจัดรถและรอบไม่เชื่อมกับการเปิด Cargo เดิม','ภาพ19: จัดรถแล้ว 0 ยังไม่จัด 1 และรอบ 0/0/1 ทั้งที่ driverId / vehiclePlate / routeStartedAt มีค่า','ควรสรุปการจัดรถจากข้อมูลจริงให้สอดคล้อง หรือแยกคำว่ามอบหมายรถกับสร้างแผน/รอบให้ชัด ปัจจุบัน Driver ได้รับงาน แต่ตัวเลขสรุปยังไม่สะท้อน'),
('2 ตารางประวัติ Transport ไม่รวมเหตุการณ์ Driver','ภาพ20: ตารางประวัติไม่มีแถว แต่ timeline API มี6กิจกรรมและ Driver Time Log ภาพ28–29 มีเวลาครบ','ควรรวม/เชื่อม event จาก Driver หรือระบุขอบเขตประวัติให้ชัด เพื่อให้ Transport ตรวจย้อนหลังจากหน้าเดียว'),
('3 ป้ายการ์ดคนขับชวนเข้าใจผิด','ภาพ18: การ์ดรับเข้า WH3 แสดง “ขาออก” และข้อความ “ตรวจสอบแล้ว / ได้รับแล้ว” ทั้งที่ยังไม่มี receipt/QA ในชุดนี้','ควรแสดงชนิดงานและป้ายจากสถานะจริง ไม่ใช้ข้อความคงที่แทนการรับเข้าหรือ QA; ไม่ใช้ป้ายเหล่านี้เป็นหลักฐานว่าของเข้าคลังครบ'),
('การทดสอบมือถือจริงยังไม่ครบ','Driver transitions ผ่าน API simulation ส่วน UI ใช้เปิดดู/อ่านกลับ','ยังไม่รับรอง GPS กล้อง upload จากมือถือ ลายเซ็นสัมผัส หรือการกดปุ่มครบทุกขั้นบนเครื่องคนขับจริง'),
('จำนวนรับคลังยังไม่ยืนยัน','ไม่มี inboundReceipt.confirmedAt และไม่มีการรับเข้า/จัดเก็บ','แผน3 CTN และรับสินค้าจำลอง3 CTN ไม่เท่ากับยอดรับเข้าคลังจริง; จบที่กลับWH3/รอDockตามคำสั่ง')])}</section>
<section><h2>การแยกชุด SIT ออกจากงานจริง</h2><p>เปรียบเทียบข้อมูลธุรกิจที่สคริปต์ตรวจของงานเดิม {audit['existingJobsVerified']:,} งาน พบเปลี่ยน 0 งาน เพิ่ม House ใหม่1งานและลูกค้าจำลอง1ราย ข้อมูลลูกค้าเดิม ผู้ใช้งานเดิม และทะเบียน Invoice เดิมไม่เปลี่ยน แฮชข้อมูลธุรกิจเดิมก่อนและหลังตรงกัน:</p><code>{audit['beforeSha256']}</code><p>ผังคลังและช่อง Dock จริงไม่เปลี่ยน จำนวนงานรวมเพิ่ม1ตามชุดใหม่ คิวเพิ่มเฉพาะ H ค่าจำนวนคิว/เวลารอคำนวณใหม่ตามจำนวนคิว เปลี่ยนนโยบายเฉพาะการเพิ่ม H ใน allowlist SIT พร้อมเวลาแก้ไขอัตโนมัติ global safety=false, geofencingEnabled=false, พิกัดWH3ว่างเหมือนเดิม</p><p>ปิด API grant แล้ว (HTTP200) และปิดตัวเลือกยูสทดสอบในเบราว์เซอร์หลังเก็บภาพ ไม่แก้ role รหัสผ่าน หรือเบอร์โทรของคนขับจริง ชื่อและเบอร์0000000000เป็นผู้ติดต่อสินค้าจำลอง ไม่ใช่เบอร์ยูสคนขับ</p>
<h3>ข้อผิดพลาดระหว่างเตรียมเครื่องมือ ซึ่งแก้แล้วและไม่ใช่ผลผ่านของ workflow</h3><p>เริ่มเตรียม allowlist ก่อนสร้าง H ระบบตอบ422 เพราะกำหนดให้เพิ่มได้เฉพาะ House SIT ที่มีอยู่ จึงสร้างชุดใหม่ก่อนแล้วเพิ่ม allowlist สำเร็จ เก็บ422ในผลทดสอบเดิม ไม่ลบประวัติ นอกจากนี้ assertion ตรวจสอบรอบแรกเทียบ updatedAt และจำนวนงานรวมแบบคงที่จึงหยุด แก้เฉพาะสคริปต์ตรวจให้รองรับ metadata และงาน SIT เพิ่ม1 แล้วตรวจซ้ำผ่าน ไม่ได้แก้ข้อมูลระบบเพื่อทำให้ผลผ่าน</p></section>
<section><h2>หลักฐานที่เก็บจริงบน production</h2><p>ภาพต้นฉบับทั้งหมดเป็น PNG จำลองติดป้าย SIT ONLY ไม่ใช่ภาพสินค้าหรือลายเซ็นคนจริง เปิด HTTP200 ทั้ง6ไฟล์ และได้ภาพหน้าจอการเปิดทุกไฟล์ ดูภาพ22–27</p>{table(['ประเภท','File ID','ผลเปิด','SHA256'],evidenceRows)}</section>
<section id="gallery"><h2>ภาพหน้าจอจริงครบ {len(shots)} ภาพ</h2><p>คลิกแต่ละภาพเพื่อเปิดขนาดเต็ม ภาพฟอร์มก่อนบันทึก ภาพผลอ่านกลับ และภาพหลักฐานจำลองมีคำอธิบายแยกกัน ไม่มีภาพ mockup แทนหน้าระบบจริง</p>{gallery}</section>
<section id="sources"><h2>ไฟล์สำหรับตรวจสอบและทำซ้ำ</h2><p><a href="SCD-CS-Transport-Driver-E2E-2026-10-25.zip">ดาวน์โหลดเอกสาร ภาพทั้งหมด และ JSON ใน ZIP เดียว</a> · ไฟล์สคริปต์ใน repository: scripts/run-cs-driver-e2e.py และ scripts/build-cs-driver-e2e-report.py · ไม่มี token/password ในชุดส่งมอบ</p>{sourceLinks}<details><summary>HTTP request ledger (รวมประวัติเตรียมงานและการตรวจซ้ำ)</summary>{table(['รายการ','คาดหวัง','ได้จริง','ผล','ข้อความ'],requestRows)}</details></section><footer><p>จัดทำจากการทดสอบจริงวันที่25ต.ค.2026 · ข้อมูล SIT บันทึกจริง / หลักฐานและการเคลื่อนย้ายเป็นการจำลอง · Geofencing ปิด</p></footer></main></html>'''
out=D/('SCD-CS-Transport-Driver-E2E-'+DATE+'.html');out.write_text(body,encoding='utf8')
class Links(HTMLParser):
 def __init__(self):super().__init__();self.paths=[]
 def handle_starttag(self,tag,attrs):
  for k,v in attrs:
   if k in ['href','src'] and v and not v.startswith(('https://','#')):self.paths.append(v)
parser=Links();parser.feed(body)
archive=D/('SCD-CS-Transport-Driver-E2E-'+DATE+'.zip')
public=[out,*shots,*links]
for p in public:
 if p.suffix in ['.json','.html']:
  t=p.read_text(encoding='utf8');assert not re.search(r'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+',t),p.name
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
 for p in public:z.write(p,p.name)
assert all((D/p).exists() for p in parser.paths)
# Internal QA contact sheets, never substituted for an original screenshot.
font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',16)
for offset in range(0,len(shots),10):
 group=shots[offset:offset+10];sheet=Image.new('RGB',(1200,250*((len(group)+2)//3)),'white');draw=ImageDraw.Draw(sheet)
 for idx,p in enumerate(group):
  im=Image.open(p);im.thumbnail((390,220));x=(idx%3)*400;y=(idx//3)*250;sheet.paste(im,(x,y+25));draw.text((x+5,y+3),p.name.split('-')[3]+' '+p.name.split('-')[4],font=font,fill='black')
 sheet.save(P/('qa-contact-'+str(offset)+'.png'))
print(json.dumps({'report':str(out),'screenshots':len(shots),'jsonFiles':len(links),'archiveBytes':archive.stat().st_size,'localLinksVerified':len(parser.paths)},ensure_ascii=False))
