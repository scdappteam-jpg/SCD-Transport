"""Production SIT closure report; isolated repeat-close result is explicitly separate."""
import json,html,hashlib,sys
from pathlib import Path
from datetime import datetime,timezone,timedelta
R=Path(__file__).resolve().parents[1];D=R/'docs';O=R/'output/pdf';O.mkdir(parents=True,exist_ok=True)
sys.path.insert(0,str(R/'.sit-meeting/pdf-libs'))
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4,landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import SimpleDocTemplate,Paragraph,Spacer,Table,TableStyle,PageBreak,Image
from pypdf import PdfReader
pdfmetrics.registerFont(TTFont('Thai','C:/Windows/Fonts/tahoma.ttf'));pdfmetrics.registerFont(TTFont('ThaiBold','C:/Windows/Fonts/tahomabd.ttf'));pdfmetrics.registerFontFamily('Thai',normal='Thai',bold='ThaiBold',italic='Thai',boldItalic='ThaiBold')
W,HT=landscape(A4);U=W-72;story=[]
styles={n:ParagraphStyle(n,fontName='ThaiBold' if n in ['title','h1'] else 'Thai',fontSize=size,leading=lead,spaceAfter=8,shaping=True,textColor=colors.HexColor('#183650')) for n,size,lead in [('title',24,34),('h1',17,25),('body',11,18),('small',9.5,15)]}
def p(s,style='body'):return Paragraph(s,styles[style])
def add(s,style='body'):story.append(p(s,style))
def page():story.append(PageBreak())
def table(headers,rows,widths):
 t=Table([[p(html.escape(str(c)),'small') for c in row] for row in [headers,*rows]],colWidths=widths,repeatRows=1)
 t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#dcecf5')),('GRID',(0,0),(-1,-1),.4,colors.HexColor('#bacddc')),('VALIGN',(0,0),(-1,-1),'TOP'),('TOPPADDING',(0,0),(-1,-1),8),('BOTTOMPADDING',(0,0),(-1,-1),8),('LEFTPADDING',(0,0),(-1,-1),8),('RIGHTPADDING',(0,0),(-1,-1),8)]));story.extend([t,Spacer(1,12)])
read=lambda n:json.loads((D/n).read_text(encoding='utf8'))
f=read('n1-billed-final-2026-10-25.json');a=read('n1-billed-isolation-audit-2026-10-25.json');s=read('n1-billed-isolated-results-2026-10-25.json');u=read('n1-billed-ui-2026-10-25.json');b=f['bill'];j=f['job'];H=j['houseNumber'];INV=b['id']
assert INV=='INV-2026-0002' and b['status']=='Billed' and b['amount']==1000 and a['nonTargetJobsChanged']==0 and not a['geofencingEnabled'] and not u['readyListContainsN1']
when=datetime.fromisoformat(b['billedDate'].replace('Z','+00:00')).astimezone(timezone(timedelta(hours=7))).strftime('%d/%m/%Y %H:%M:%S')
add('S.C.D. TRANSPORT / PRODUCTION SIT','h1');add('Invoice Draft ถึง Billed\nผลทดสอบ SIT N1','title');add(INV+' / '+H,'h1')
table(['หัวข้อ','ผลยืนยัน'],[
 ('สถานะจริง','Draft → Billed เวลา '+when+' (เวลาไทย) ตาม billedDate จากเซิร์ฟเวอร์'),
 ('ยอดข้อมูลจำลอง','1,000 บาท ต้นทุน 700 ส่วนต่าง 300 บาท ไม่แก้ยอด ไม่สร้าง Invoice ใหม่'),
 ('งาน N1','status และ billingStatus เป็น Billed; readyForBilling=false; รถ Available; รับจริงในชุด SIT 3 CTN เดิม'),
 ('ความครบถ้วน','งานอื่น 3,806 งานไม่เปลี่ยน Invoice อื่น ลูกค้า ยูส คลัง Dock และนโยบายเดิมคงเดิม'),
 ('อีเมล / พิกัด','ไม่กดส่งอีเมล ไม่เรียก API ส่งอีเมล ไม่มี Sent/Queued metadata; Geofencing OFF'),
 ('ข้อจำกัด','ปิดบิลครั้งแรกสำเร็จ แต่กรณีกดปิดซ้ำยังไม่ผ่านในผลจำลองแยก ห้ามสรุปว่าทุกกรณีผ่าน')],[145,U-145])
add('25 ตุลาคม 2026 | ข้อมูลและหลักฐาน SIT เท่านั้น | Billed ไม่ใช่ Paid และไม่ใช่การรับชำระเงินจริง','small')
page();add('1. ขอบเขตและสถานะก่อนเริ่ม','h1')
add('ใช้ Invoice เดิมของ House '+H+' ลูกค้า SIT ONLY N1 INVOICE - NOT FOR PAYMENT ที่อยู่ SIT N1 SYNTHETIC ADDRESS - NOT FOR DELIVERY OR PAYMENT อีเมลบิลว่าง สถานะเริ่มต้น Draft / งาน InvoiceDrafted ยอด 1,000 บาท ไม่แก้ชื่อลูกค้า ที่อยู่ เครดิต หรือวันครบกำหนด')
add('ก่อนดำเนินการเก็บ baseline จาก API ตรวจ integrations พบ email และ LINE ไม่ configured และบันทึกนโยบาย คลัง Dock ตลอดจนไฟล์เอกสารเดิมไว้เปรียบเทียบ ไม่สร้าง grant เลือกยูสใหม่ ใช้ Admin เดิมเข้าสู่ระบบตามสิทธิ์ที่มี')
add('รุ่นแอปที่ทดสอบ b78b6fd ซึ่งแก้ Preview และ InvoiceDocument แล้ว รอบนี้เป็นการทดสอบ ไม่มีการแก้แอปหรือ deploy เพิ่ม ข้อผิดพลาดใหม่บันทึกแยกไว้ด้านท้าย')
table(['ขั้นกระบวนการ','แนวทางรอบนี้'],[('ตรวจ Draft','เปิด Billing เลือก House และกรอก Invoice ID เดิม ตรวจ Preview และยอดก่อนปิด'),('ส่งอีเมล','ข้ามตามคำสั่ง ไม่จำลองว่า Sent หรือสร้าง EmailQueued'),('ปิด Billed','กดปิดเพียงครั้งเดียว แล้วอ่านสถานะจากเซิร์ฟเวอร์หลังหน้าต่างเว็บค้าง'),('ตรวจย้อนหลัง','ทะเบียน Invoice, Preview, รายการงาน และเอกสาร storage เดิม')],[150,U-150])
page();add('2. วิธีที่ดำเนินการจริงและเหตุการณ์ timeout','h1')
table(['ลำดับ','สิ่งที่ทำจริง','ผลที่สังเกต'],[
 ('1','อ่าน baseline และเปิด Preview','Draft / InvoiceDrafted / 1,000 บาท'),
 ('2','กดปุ่ม ปิดเป็น Billed บนเว็บหนึ่งครั้ง','เครื่องมือเบราว์เซอร์ timeout; ไม่สามารถเก็บภาพหรือผลยืนยันจากหน้าต่าง confirm ได้'),
 ('3','อ่าน API โดยไม่กดซ้ำ','การอ่านครั้งแรกยังพบ Draft จึงปิดแท็บค้างเพื่อป้องกันการกดซ้ำ'),
 ('4','เตรียมทางสำรอง API พร้อม guard อ่านสถานะก่อน POST','guard พบ Billed แล้ว จึงหยุดก่อน POST; สคริปต์สำรองไม่ได้ส่งคำสั่งปิดเพิ่ม'),
 ('5','อ่านข้อมูลและเปิดแท็บใหม่ตรวจผล','พบ Billed ในเซิร์ฟเวอร์ ทะเบียน และ Preview; billedDate '+when),
 ('6','ตรวจ isolation และเอกสาร','ผ่าน งานอื่นไม่เปลี่ยน ไม่มี Invoice ใหม่หรืออีเมล')],[55,335,U-390])
add('ข้อสรุปที่พิสูจน์ได้: มีการกดปุ่มเว็บหนึ่งครั้งและพบผล Billed ภายหลัง โดยไม่มี POST ปิดจากสคริปต์สำรอง ไม่ยืนยันว่าเส้นทางกล่อง confirm ตอบสนองปกติ เพราะไม่ได้รับผลตอบกลับหรือภาพของกล่องนั้น ไม่มีการสร้างภาพ confirm จำลองมาทดแทน')
page();add('3. คู่มือทำจริง: Draft ถึงปิด Billed','h1')
table(['ขั้น','การปฏิบัติ','ผลที่ควรได้ / ข้อควรระวัง'],[
 ('1','เข้าสู่ระบบด้วย Billing หรือ Admin > งานภาคสนาม Field Ops > Billing','ต้องมีสิทธิ์วางบิล ไม่เปลี่ยนบทบาทของคนขับเพื่อข้ามสิทธิ์'),
 ('2','ช่อง House ใส่ '+H+' และ Invoice ID ใส่ '+INV,'ตรวจลูกค้า SIT ที่อยู่ ยอด 1,000 และ Draft เป็น Invoice ใบเดิม'),
 ('3','เปิด Preview และลิงก์ Invoice เดิม','อ่านเอกสารได้ เก็บหลักฐาน 22 รายการ InvoiceDocument แสดง 1 รายการ'),
 ('4','งดปุ่มส่งอีเมล ไม่ต้องสร้าง Draft ซ้ำ','รอบนี้ข้าม Sent ได้ตามพฤติกรรมระบบ ไม่สร้างสถานะส่งจำลอง'),
 ('5','กด ปิดเป็น Billed ตรวจเลขในกล่องยืนยันและยืนยันครั้งเดียว','ปกติควรได้ผล Billed; หากค้างห้ามกดซ้ำ ให้อ่านทะเบียนหรือเซิร์ฟเวอร์ก่อน'),
 ('6','เปิด Transport · Terminal · วางบิล > ค้น House > วางบิล','Invoice เดิมเป็น Billed ยอด 1,000 มีเพียง 1 ใบของ N1 คิวรอวางบิล N1 เป็น 0'),
 ('7','ดูงาน Transport และเปิดเอกสารย้อนหลัง','งาน Billed รถ Available แผนและ receipt 3 CTN เดิม ไม่เปลี่ยนของจริงหรือสถานะ Paid'),
 ('8','จบการตรวจและออกจากระบบ','ไม่เปิด Geofencing ไม่ส่งอีเมล ไม่แก้ยอดหรือปิดซ้ำ')],[45,355,U-400])
page();add('4. ผลบนระบบจริงและ isolation audit','h1')
table(['กรณี','คาดหวัง','ผลจริง'],[
 ('Invoice / งาน','Billed / Billed / ready=false','ผ่าน'),('ยอดและจำนวนใบ','1,000 บาทและจำนวน Invoice เท่าเดิม','ผ่าน'),('คิวพร้อมวางบิล','N1 ไม่อยู่ใน Ready Jobs; ตัวกรอง N1 รอวางบิล 0','ผ่าน'),('ค่าใช้จ่าย','ต้นทุน 700 ส่วนต่าง 300 เดิม','ผ่าน'),('เอกสาร','HTML storage เดิมเปิดได้ เนื้อหาและ SHA256 เดิม','ผ่าน'),('หลักฐาน','UI 22 รายการ InvoiceDocument 1 รายการ','ผ่าน'),('ข้อมูลนอกชุด','3,806 งานและ Invoice อื่นไม่เปลี่ยน','ผ่าน'),('นโยบาย/คลัง','ยูส ลูกค้า WH map Dock bay/queue และ policy เดิม','ผ่าน'),('อีเมล','ไม่เรียกส่ง ไม่มี sentAt/emailDeliveryStatus/emailAttachments','ผ่าน'),('Geofencing','false และพิกัดเดิม','ผ่าน'),('หน้าต่างยืนยันเว็บ','ควรคืนผลสำเร็จให้ผู้ใช้','ติด timeout ในเครื่องมือ ไม่ยืนยันว่า UI ขั้นนี้ผ่าน')],[180,380,U-560])
add('Hash งานนอก N1 ก่อน: '+a['beforeNonTargetSha256'],'small');add('Hash งานนอก N1 หลัง: '+a['afterNonTargetSha256'],'small');add('Hash Invoice HTML: '+a['invoiceDocumentSha256'],'small')
page();add('5. ผลจำลองแยก: สิทธิ์และการกดซ้ำ','h1')
add('รัน handler mark-billed จริงจาก source ใน VM แยก ข้อมูล fixture และเวลาข้างล่างเป็นค่าจำลอง ไม่ส่ง HTTP และไม่เขียนฐานข้อมูล production การกดปิดซ้ำไม่ถูกทดสอบบน Invoice จริง')
table(['กรณี','คาดหวัง','ผลจำลอง','ผล'],[(c['name'],str(c['expected']),json.dumps(c['actual'],ensure_ascii=False),c['result']) for c in s['cases']],[205,190,300,U-695])
add('N1-BILLED-01: การปิดซ้ำยังคืน 200 และเขียน billedDate ใหม่ แทนการปฏิเสธหรือคืนผลเดิม โดยหน้า Preview หลัง Billed ยังมีปุ่มปิดที่เปิดใช้งานอยู่ ข้อพบนี้ยังไม่แก้หรือ deploy รอบนี้')
add('แนวทางแก้: ทำ API ให้ idempotent หรือคืน 409 โดยคง billedDate ครั้งแรก และปิด/ซ่อนปุ่มเมื่อบิล Billed แล้ว หลังแก้ให้ทดสอบซ้ำใน fixture ก่อน ไม่ใช้เวลาจำลองทับ billedDate จริงของ N1')
add('ผลรวมจำลอง 2 ผ่าน / 1 ไม่ผ่าน แยกจากผลปิดจริงที่สำเร็จ ไม่รายงานผลจำลองว่าเป็นการส่งอีเมลหรือเรียกเก็บเงินจริง')
page();add('6. แยกข้อมูลจำลองจากการทำงานจริง','h1')
add('เกิดจริงบน production: เปิดหน้าเว็บ อ่าน API เลือก Invoice กดปุ่มปิดหนึ่งครั้ง ตรวจผล Billed และ billedDate เปิดทะเบียนและเอกสาร รวมถึงเก็บภาพหน้าจอทั้งหมดในภาคผนวก')
add('เป็นข้อมูลจำลอง SIT: ลูกค้า ที่อยู่ ยอด 1,000 บาท ต้นทุน 700 บาท ส่วนต่าง 300 บาท หลักฐานสินค้าและ Terminal รวมถึงการรับ 3 CTN จากรอบก่อน ไม่ใช่การขนส่งหรือรับเงินจริงในรอบนี้')
add('ผลจำลองแบบแยก: fixture ของ handler สำหรับสิทธิ์และการกดซ้ำ เวลาประมาณ 06:00 UTC ในตารางจำลองไม่ใช่ billedDate จริง '+when+' เวลาไทย')
add('งดทั้งหมดตามขอบเขต: ไม่ส่งอีเมลจริง ไม่จำลอง Sent ไม่เปิด Geofencing ไม่เปลี่ยนพิกัด WH3 ไม่สร้าง Invoice ใหม่ ไม่แก้งานลูกค้าจริง และไม่ยืนยัน Paid')
shots=[
 ('n1-billed-01-geofencing-before-2026-10-25.png','ก่อนทดสอบ: Geofencing ปิด','Admin เปิดอ่านนโยบายเดิม พิกัด 0 จุด ไม่กดบันทึก'),
 ('n1-billed-02-draft-preview-2026-10-25.png','ก่อนปิด: Draft ใบเดิม','Preview ของ INV-2026-0002 เป็น Draft ยอดจำลอง 1,000 บาท'),
 ('n1-billed-03-register-2026-10-25.png','หลังปิด: ทะเบียน Billed','ตัวกรอง N1 แสดง Invoice เดิม Billed ยอด 1,000 ต้นทุน 700 ส่วนต่าง 300'),
 ('n1-billed-04-billed-preview-2026-10-25.png','หลังปิด: Preview Billed','Invoice และงานเป็น Billed ใน Preview จริง ไม่สร้าง Invoice ใหม่'),
 ('n1-billed-05-job-2026-10-25.png','หลังปิด: รายการงาน Transport','งาน N1 Billed / Available และแผนกับ receipt จำลองเดิม 3 CTN'),
 ('n1-billed-06-document-2026-10-25.png','เอกสารเดิมยังเปิดได้','HTML Invoice เดิม ไม่เพิ่มข้อความ Billed ลงไฟล์ storage; ดูสถานะ Billed จากทะเบียนและ Preview'),
 ('n1-billed-07-geofencing-after-2026-10-25.png','หลังทดสอบ: Geofencing ปิด','ตรวจหลังปิด Invoice โดยไม่แก้การตั้งค่า')]
manifest=[]
for i,(name,title,desc) in enumerate(shots,1):
 path=D/name;assert path.exists();page();add(str(i).zfill(2)+'. '+title,'h1');add(desc+' | ภาพหน้าจอจริงบน production ข้อมูล SIT เท่านั้น','small');im=Image(str(path));scale=min(U/im.imageWidth,385/im.imageHeight);im.drawWidth=im.imageWidth*scale;im.drawHeight=im.imageHeight*scale;story.append(im);add(name,'small');manifest.append({'file':name,'title':title,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
def footer(c,doc):
 c.setFont('Thai',8);c.setFillColor(colors.HexColor('#51677b'));c.drawString(36,20,'SCD / N1 Draft to Billed / SIT ONLY / No email / Geofencing OFF');c.drawRightString(W-36,20,str(doc.page))
out=O/'SCD-N1-Invoice-Draft-to-Billed-SIT-2026-10-25.pdf';SimpleDocTemplate(str(out),pagesize=(W,HT),leftMargin=36,rightMargin=36,topMargin=32,bottomMargin=42,title='SCD N1 Invoice Draft to Billed SIT',author='SCD System Test').build(story,onFirstPage=footer,onLaterPages=footer)
reader=PdfReader(out);text='\n'.join(p.extract_text() for p in reader.pages);assert all(p.extract_text().strip() for p in reader.pages) and INV in text and H in text and 'N1-BILLED-01' in text
(D/'n1-billed-pdf-manifest-2026-10-25.json').write_text(json.dumps({'pdf':str(out),'pages':len(reader.pages),'images':manifest,'sha256':hashlib.sha256(out.read_bytes()).hexdigest()},ensure_ascii=False,indent=2),encoding='utf8')
print('PDF',len(reader.pages),'pages',len(shots),'screenshots',out.stat().st_size,'bytes')
