"""Standalone Thai PDF, with current production screenshots and labeled prior SIT appendix."""
import sys,json,html,hashlib
from datetime import datetime,timezone,timedelta
from pathlib import Path
R=Path(__file__).resolve().parents[1];D=R/'docs';O=R/'output/pdf';O.mkdir(parents=True,exist_ok=True)
sys.path.insert(0,str(R/'.sit-meeting/pdf-libs'))
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4,landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import SimpleDocTemplate,Paragraph,Spacer,Table,TableStyle,PageBreak,Image,KeepTogether
from pypdf import PdfReader
pdfmetrics.registerFont(TTFont('Thai','C:/Windows/Fonts/tahoma.ttf'))
pdfmetrics.registerFont(TTFont('ThaiBold','C:/Windows/Fonts/tahomabd.ttf'))
pdfmetrics.registerFontFamily('Thai',normal='Thai',bold='ThaiBold',italic='Thai',boldItalic='ThaiBold')
assert pdfmetrics.getFont('Thai').shapable,'Thai shaping must be enabled'
H='SIT-CS-DRIVER-20261025-N1';DATE='2026-10-25'
def read(name):return json.loads((D/name).read_text(encoding='utf8'))
audit=read('cs-driver-fixed-live-audit-'+DATE+'.json');deployment=read('cs-driver-fixed-deployment-'+DATE+'.json');after=read('cs-driver-fixed-after-'+DATE+'.json');before=read('cs-driver-fixed-before-'+DATE+'.json')
assert audit['persistedJobFieldsChanged']==0 and deployment['status']=='Live'
W,HEIGHT=landscape(A4);usable=W-72
styles={n:ParagraphStyle(n,fontName='ThaiBold' if n in ['title','h1','h2'] else 'Thai',fontSize=size,leading=leading,textColor=colors.HexColor('#17324d'),spaceAfter=after,shaping=True,splitLongWords=True) for n,size,leading,after in [('title',26,37,18),('h1',19,27,14),('h2',14,21,10),('body',10.5,17,8),('small',9.5,14.5,6)]}
story=[]
def p(t,style='body'):return Paragraph(t,styles[style])
def add(t,style='body'):story.append(p(t,style))
def table(headers,rows,widths=None):
 data=[[p(html.escape(str(x)),'small') for x in row] for row in [headers,*rows]]
 t=Table(data,colWidths=widths or [usable/len(headers)]*len(headers),repeatRows=1,hAlign='LEFT')
 t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#dceaf5')),('GRID',(0,0),(-1,-1),.4,colors.HexColor('#bed0df')),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),8),('RIGHTPADDING',(0,0),(-1,-1),8),('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),7),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white,colors.HexColor('#f4f8fb')])]))
 story.append(t);story.append(Spacer(1,12))
def page():story.append(PageBreak())
add('S.C.D. TRANSPORT / LIVE SIT','h2');add('แก้ไข 3 จุด และทดสอบซ้ำ<br/>CS - Transport - Driver - WH3','title')
add(H,'h1');add('รายงานวันที่ 25 ตุลาคม 2026 | เขตเวลา Asia/Bangkok | เอกสาร PDF พร้อมภาพหน้าจอจริง')
add('<b>ผล: แก้ครบ 3 จุด และตรวจบน production หลัง deploy แล้ว</b> ชุด SIT เดิมยังเป็น WaitingForDock ไม่รีเซ็ตขั้นตอน ไม่สร้างงานซ้ำ ไม่ยืนยันรับเข้าคลังแทนหน้างาน')
table(['หัวข้อ','ก่อนแก้','หลังแก้ / ผลที่ควรได้'],[
('1 สรุปจัดรถและรอบ','จัดรถแล้ว 0 / ยังไม่จัด 1 / รอบ 0 / ยังไม่ผูกรอบ 1','จัดรถแล้ว 1 / ยังไม่จัด 0 / รอบ 1 / มีแผน 1 / ยังไม่ผูกรอบ 0'),
('2 ประวัติ Transport','ตารางว่าง แม้ Driver มี 6 กิจกรรม','แสดง Driver Log 6 เหตุการณ์ พร้อมเวลา ผู้บันทึก และป้าย SIT'),
('3 การ์ดคนขับ','ขาออก + ตรวจสอบแล้ว/ได้รับแล้ว เป็นข้อความคงที่','ขาเข้า WH3 + QA ยังไม่อนุมัติ + ยังไม่ยืนยันรับคลัง; เวลา updatedAt ใช้ชื่อ อัปเดตล่าสุด')],[145,210,usable-355])
add('Deploy สุดท้าย: '+deployment['commit'][:7]+' | Render: Live | Geofencing: ปิด','h2')
page();add('1. ข้อมูลจริงที่บันทึก กับผลจำลอง','h1')
table(['ส่วน','ข้อเท็จจริง / ขอบเขต'],[
('ข้อมูลที่เก็บจริง','House '+H+' อยู่บน production; CS Invoice SIT-CS-INV-20261025-N1; ผู้ติดต่อ SIT CONTACT N1; โทร 0000000000; คนขับ sit_ui_driver / SIT UI / Driver; ทะเบียน SIT-ONLY'),
('จำนวน','แผน 3 CTN และรับสินค้าจำลอง 3 CTN ในขั้น Driver; ยอดรับเข้าคลังยังไม่ยืนยัน ไม่ใช้แผนแทน receipt'),
('หลักฐาน','PNG จำลอง 6 ไฟล์: สินค้า Cargo ประตู ลายเซ็นผู้ตรวจ ลายเซ็นผู้รับ ใบตรวจปล่อย ติดป้าย SIT ONLY ทุกไฟล์'),
('รอบทดสอบก่อนแก้','CS และออกใบจัดรถทำผ่าน UI จริง; Driver transition ผ่าน API simulation แล้วอ่านผลผ่าน UI จริงจนกลับ WH3'),
('รอบทดสอบหลังแก้','อ่านชุด SIT เดิมก่อนและหลัง deploy ผ่าน API และ UI ไม่กดเริ่มรอบ/รับสินค้า/กลับWH3ซ้ำ ไม่แก้เวลาหรือหลักฐานเดิม'),
('ทดสอบจำลองแยกเครื่อง','Regression tests 12 รายการ และชุดทดสอบทั้งหมด 274 รายการ ใช้ข้อมูลในหน่วยความจำ ไม่บันทึกเพิ่มลง production'),
('สิ่งที่ยังไม่ได้รับรอง','GPS กล้อง อัปโหลดจากโทรศัพท์ ลายเซ็นสัมผัส การเคลื่อนรถ/สินค้าจริง และ Geofencing ยังไม่ทดสอบรอบนี้'),
('งานจริง / การเงิน','ข้อมูลธุรกิจที่บันทึกของ '+str(audit['jobCount'])+' งานเท่าเดิม ผู้ใช้ ลูกค้า ทะเบียนบิลเดิมไม่เปลี่ยน ไม่สร้าง Invoice การเงิน ไม่ส่งอีเมลหรือโทรหาคนจริง')],[165,usable-165])
add('เลข Invoice ใน CS เป็นเลขอ้างอิงสินค้า ไม่ใช่ใบแจ้งหนี้การเงิน INV-2026-0001 เดิม รายการ SIT นี้ตั้งใจไม่มี F/Master ใหม่ จึงไม่ยืมเลขของงานจริงมาใช้')
page();add('2. รายละเอียดการแก้ไขและเกณฑ์ผ่าน','h1')
table(['จุดแก้','พฤติกรรมใหม่','การตรวจยืนยัน'],[
('จัดรถ / รอบ','นับมอบหมายเมื่อมีคนขับและทะเบียน โดยแสดงประเภทรถที่ยังไม่ระบุให้ตรงจริง ใช้รหัสรอบเดิมก่อน หากไม่มีจึงใช้คนขับ+ทะเบียน+เวลาเริ่มรอบ Driver ที่ตรงกันเป็นกลุ่มอ่านย้อนหลัง','House หลายใบในรอบเดียวไม่นับหลายรอบ; เวลาเริ่มต่างกันนับคนละรอบ; ไม่มีเวลาเริ่มไม่แต่งรอบขึ้นเอง; ชุด N1 = 1 รอบ'),
('ประวัติ Driver','นำเฉพาะ RouteStarted CheckIn Loading PickupComplete ArrivedWH3 ReleaseDocumentReceived มารวมกับ operationsEvents อ่าน actor จาก log เดิม เรียงเวลา ไม่เขียนย้อนลงฐานข้อมูล','N1 มี 6 แถว พร้อม sit_ui_driver / SIT UI / Driver และ SIT - ข้อมูลจำลอง; ไม่ดึง log งานอื่น; ไม่เผยโน้ตราคาให้บทบาท Transport'),
('ความจริงบนการ์ด','เส้นทาง WH3 แสดงขาเข้า WH3; QA ใช้ผลตรวจที่ server ยืนยัน revision/identity และผู้ตรวจแยกคน; รับคลังใช้ receipt ยืนยันจริง; ไม่อ่าน Stored เป็นรับครบ','N1 แสดง QA ยังไม่อนุมัติ และยังไม่ยืนยันรับคลัง; test receipt 2/3 แสดงยังไม่ครบ; 3/3 แสดงครบ โดยไม่สร้างยอดจริง'),
('ป้ายเวลา','เปลี่ยนชื่อ Pass CP ที่ใช้เวลา updatedAt เป็น อัปเดตล่าสุด','ไม่อ้างเวลาอัปเดตเป็นเหตุการณ์ผ่านจุดตรวจที่ไม่มีหลักฐาน')],[110,360,usable-470])
add('การคำนวณรอบย้อนหลังนี้ใช้เฉพาะรายงาน ไม่บันทึกรหัสรอบใหม่ และไม่เปลี่ยนจำนวนรอบใน Invoice เดิม การรวม House ต้องอาศัยหลักฐานรอบที่ตรงกัน ไม่ใช้จำนวน House เป็นจำนวนรถ')
page();add('3. วิธีตรวจซ้ำในหน้าระบบ โดยไม่เปลี่ยนงานเดิม','h1')
table(['ขั้น','ทำตามได้จริง','ผลที่ต้องเห็น'],[
('1 Transport','เข้าสู่ระบบด้วยสิทธิ์ Transport เปิด Transport - Terminal - วางบิล ตั้งฐานวันที่เป็นวันรับสินค้า ค้นหา '+H+' แล้วรีเฟรช','มี 1 House ลูกค้า SIT ONLY CS DRIVER E2E 20261025 N1 แผน 3 CTN'),
('2 แผนและรอบ','ดูแผนรายวันและตารางรถ คนขับ รอบ','จัดรถแล้ว1 ยังไม่จัด0; SIT-ONLY / SIT UI Driver; รอบเริ่มจริง1 มีแผน1 ยังไม่ผูกรอบ0'),
('3 ประวัติ','ใส่ H ในช่อง House คนละบรรทัด โดยไม่กดปุ่มบันทึกใด ๆ เลื่อนมาหลักฐานและประวัติ','หลักฐาน6ไฟล์และเหตุการณ์6แถว เริ่มรอบ ถึงจุดรับ โหลด รับและกลับWH3 ถึงWH3 รับใบตรวจปล่อย พร้อมเวลาและผู้ทำ'),
('4 สถานะ/จำนวน','ดูรายการงานและ KPI','WaitingForDock / ReleasedForDock; แผน3CTN; รับยังไม่ยืนยัน ไม่แสดงว่าคลังรับครบ'),
('5 ฝั่ง Driver','เข้าสู่ยูส SIT Driver เปิดงานของตน เลือกทั้งหมดและหา H หรือเมนูสแกนค้นหา H','การ์ดขาเข้า WH3 / QA ยังไม่อนุมัติ / ยังไม่ยืนยันรับคลัง; รายละเอียด Invoice ผู้ติดต่อ เบอร์ และรถตรงเดิม'),
('6 Time Log','ในเว็บเปิด Driver Time Log ค้นหา H ติ๊ก รวม SIT แล้วดูรายงาน','เวลาครบ6ขั้น ป้าย SIT - ข้อมูลจำลอง ไม่ใช้เวลาแก้ไขแทนเวลาเหตุการณ์'),
('7 เปิดหลักฐาน','เปิดลิงก์ไฟล์แต่ละชนิดที่ทะเบียนหลักฐาน','เปิดได้ทุกไฟล์ ไม่มี404 ภายในภาพระบุ SIT ONLY'),
('8 จบการตรวจ','ดู Admin กติกาคลังและ Driver เพื่อยืนยัน Geofencing ปิด โดยไม่กดบันทึก; ปิดโหมดเลือกยูสชั่วคราวหลังจบ','พิกัดWH3ยังว่าง นโยบายเดิมคงเดิม และกลับหน้าLogin')],[80,380,usable-460])
add('<b>ห้ามเริ่มรอบเดิมซ้ำ:</b> N1 จบรับและกลับ WH3 แล้ว รอบนี้ตรวจผลที่แก้ด้วยการอ่านย้อนหลัง หากต้องการทดสอบกดทุกปุ่มด้วยโทรศัพท์จริง ควรใช้ SIT ใหม่ ไม่รีเซ็ตเวลา/ลบหลักฐานของชุดนี้')
page();add('4. ผลตรวจ deploy และการคงข้อมูลเดิม','h1')
table(['การตรวจ','ผล'],[
('Render','Live commit '+deployment['commit']+' / '+deployment['deployId']),
('Automated tests','274 ผ่าน / 0 ไม่ผ่าน รวม regression ใหม่12รายการ'),
('TypeScript / targeted lint','ผ่าน การตรวจไฟล์ที่แก้ไม่พบ error'),
('Local build','Webpack production build ผ่าน; Turbopack บน Windows ล้มตอนเรียก CSS child process บันทึกเป็นข้อจำกัดเครื่อง; Render build และ start รุ่นสุดท้ายสำเร็จ'),
('Whole repository lint','ยังมีเดิม4errors/3warnings ใน generate-auth-password-hash.cjs, provision-supabase-auth.cjs และ production-relational-mirror.cjs ซึ่งไม่ได้แก้ในรอบนี้'),
('Persisted jobs',str(audit['jobCount'])+' งาน: ข้อมูลบันทึกก่อนและหลังตรงกัน ไม่เพิ่มงาน ไม่เปลี่ยนจำนวน สถานะ เวลาขั้นตอน Invoice หรือข้อมูลผู้ติดต่อ'),
('กิจกรรม / ไฟล์','กิจกรรมเดิมและ File ID เดิมไม่เปลี่ยน เปิดหลักฐาน6ไฟล์HTTP200 แฮชตรงกับรอบเดิม'),
('ผู้ใช้ / ลูกค้า / บิล / นโยบาย','คงเดิม Geofencing=false และ globalSafety=false เพิ่มเฉพาะการแสดงผลที่คำนวณจากข้อมูลเดิม'),
('Session ทดสอบ','ปิดโหมดเลือกยูสของเบราว์เซอร์หลังจับภาพ ไม่เปลี่ยนรหัสผ่านหรือสิทธิ์ผู้ใช้เดิม')],[160,usable-160])
add('แฮชข้อมูลบันทึกก่อนและหลัง: '+audit['persistedJobsBeforeHash'],'small')
add('หลักฐาน JSON / สคริปต์ตรวจอยู่ใน repository docs/cs-driver-fixed-*.json และ scripts/verify-cs-driver-fixed-live.py ไม่แนบ session/token หรือข้อมูลสำรองทั้งระบบไว้ใน PDF','small')
page();add('5. เวลาเดิมที่ตรวจเทียบหลังแก้ประวัติ','h1')
def localtime(v):return datetime.fromisoformat(v.replace('Z','+00:00')).astimezone(timezone(timedelta(hours=7))).strftime('%d/%m/%Y %H:%M:%S')
milestones=[('CS Confirm','csConfirmedAt'),('Transport ออก Cargo','cargoIssuedAt'),('Driver เริ่มรอบ','routeStartedAt'),('ถึงจุดรับ','checkInAt'),('โหลดสินค้าขึ้นรถ','loadedAt'),('รับสินค้าเสร็จ / ออกจากโรงงาน','completedAt'),('เริ่มกลับ WH3','returningWh3At'),('ถึง WH3','arrivedWh3At'),('รับใบตรวจปล่อย','releaseDocumentReceivedAt')]
table(['ขั้นตอน','เวลาที่บันทึกเดิม - Asia/Bangkok','ผลตรวจ'],[(label,localtime(after['job'][key]),'คงเดิม หลัง deploy ไม่บันทึกซ้ำ') for label,key in milestones],[250,250,usable-500])
add('เวลาในตารางเป็นเวลาการบันทึกสถานะจำลองของชุด SIT บน production ไม่ใช่หลักฐานรถวิ่งจริง แถวรับสินค้าเสร็จใช้ completedAt / endTime 12:29:38 ไม่ใช้เวลาเริ่มรับ 12:28:16 การรับเข้าคลังยังไม่มีเวลายืนยัน receipt','body')
current=sorted(D.glob('cs-driver-fixed-[0-9][0-9]-*2026-10-25.png'))
captions=[('Render Live','commit สุดท้ายและสถานะ Live ของบริการจริง'),('Transport แผนและรอบ','จัดรถแล้ว1 ยังไม่จัด0 รอบ1/1/0 พร้อมยอดแผน3CTN'),('ประวัติ Driver','6 เหตุการณ์จริงที่บันทึกของการจำลอง พร้อมผู้ทำและป้ายSIT'),('สถานะและยอด','WaitingForDock แผน3CTN รับคลังยังไม่ยืนยัน'),('การ์ด Driver','ขาเข้าWH3 QAยังไม่อนุมัติ ยังไม่ยืนยันรับคลัง'),('Invoice และผู้ติดต่อ','SIT-CS-INV-20261025-N1 / SIT CONTACT N1 / 0000000000 / SIT-ONLY'),('Driver Time Log','เวลาเดิมครบทุกขั้น พร้อมป้ายข้อมูลจำลอง'),('Geofencing','คงปิด พิกัดWH3ว่าง ไม่กดบันทึกค่าใหม่'),('ปิดโหมดทดสอบ','กลับหน้าเข้าสู่ระบบหลังจบการตรวจ')]
assert len(current)==len(captions),(len(current),len(captions))
manifest=[]
def screenshot(path,title,detail,old=False):
 page();add(('ภาคผนวกก่อนแก้ - ' if old else 'ภาพหลังแก้ - ')+title,'h1');add(detail,'small')
 im=Image(str(path));scale=min(usable/im.imageWidth,385/im.imageHeight);im.drawWidth=im.imageWidth*scale;im.drawHeight=im.imageHeight*scale;story.append(im)
 add(path.name,'small');manifest.append({'file':path.name,'historicalBeforeFix':old,'title':title,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
for path,(title,detail) in zip(current,captions):screenshot(path,title,detail)
old=read('cs-driver-e2e-screenshot-manifest-'+DATE+'.json')
for m in old:screenshot(D/m['file'],str(m['number']).zfill(2)+'. '+m['title'],'ภาพจากการทดสอบรอบก่อนแก้ 3 จุด ใช้อธิบายเส้นทาง CS ถึงกลับWH3 ไม่ใช่หน้าจอหลัง deploy รุ่นนี้. '+m['description'],True)
out=O/'SCD-CS-Transport-Driver-N1-Fixed-Live-SIT-2026-10-25.pdf'
def footer(canvas,doc):
 canvas.setStrokeColor(colors.HexColor('#c0d1df'));canvas.line(36,34,W-36,34);canvas.setFont('Thai',8);canvas.setFillColor(colors.HexColor('#526980'));canvas.drawString(36,21,'SCD / SIT N1 / 25 Oct 2026 / Geofencing OFF');canvas.drawRightString(W-36,21,str(doc.page))
SimpleDocTemplate(str(out),pagesize=(W,HEIGHT),leftMargin=36,rightMargin=36,topMargin=32,bottomMargin=44,title='SCD N1 - Fixed production SIT and screenshots',author='SCD System Test').build(story,onFirstPage=footer,onLaterPages=footer)
reader=PdfReader(out);assert len(reader.pages)>=40
assert all(page.extract_text().strip() for page in reader.pages)
save=D/'cs-driver-fixed-pdf-manifest-2026-10-25.json';save.write_text(json.dumps({'pdf':str(out),'pages':len(reader.pages),'currentScreenshots':len(current),'priorScreenshots':len(old),'images':manifest,'sha256':hashlib.sha256(out.read_bytes()).hexdigest()},ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({'pdf':str(out),'pages':len(reader.pages),'currentScreenshots':len(current),'priorScreenshots':len(old),'bytes':out.stat().st_size},ensure_ascii=False))
