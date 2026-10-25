"""Detailed Thai production SIT report: real saved records, synthetic evidence only."""
import sys,json,html,hashlib
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
pdfmetrics.registerFont(TTFont('Thai','C:/Windows/Fonts/tahoma.ttf'));pdfmetrics.registerFont(TTFont('ThaiBold','C:/Windows/Fonts/tahomabd.ttf'));pdfmetrics.registerFontFamily('Thai',normal='Thai',bold='ThaiBold',italic='Thai',boldItalic='ThaiBold');assert pdfmetrics.getFont('Thai').shapable

# Invoice report data and content are appended below.
W,HEIGHT=landscape(A4);U=W-72;story=[]
styles={n:ParagraphStyle(n,fontName='ThaiBold' if n in ['title','h1','h2'] else 'Thai',fontSize=size,leading=lead,spaceAfter=space,shaping=True,textColor=colors.HexColor('#183650'),splitLongWords=True) for n,size,lead,space in [('title',25,35,17),('h1',18,26,13),('h2',13,20,10),('body',10.5,17,8),('small',9.3,14.3,6)]}
def p(t,s='body'):return Paragraph(t,styles[s])
def add(t,s='body'):story.append(p(t,s))
def page():story.append(PageBreak())
def table(headers,rows,widths):
 t=Table([[p(html.escape(str(x)),'small') for x in row] for row in [headers,*rows]],colWidths=widths,repeatRows=1,hAlign='LEFT');t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#dcecf5')),('GRID',(0,0),(-1,-1),.4,colors.HexColor('#c0d2de')),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),8),('RIGHTPADDING',(0,0),(-1,-1),8),('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),7),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white,colors.HexColor('#f4f8fa')])]));story.extend([t,Spacer(1,10)])
def thai(t):return datetime.fromisoformat(t.replace('Z','+00:00')).astimezone(timezone(timedelta(hours=7))).strftime('%d/%m/%Y %H:%M:%S') if t else 'ยังไม่ยืนยัน'

H='SIT-CS-DRIVER-20261025-N1';INV='INV-2026-0002';DATE='2026-10-25'
read=lambda n:json.loads((D/n).read_text(encoding='utf8'))
release=read('n1-invoice-ui-fixed-release-'+DATE+'.json');assets=read('n1-invoice-ui-fixed-live-assets-'+DATE+'.json');a=read('n1-invoice-ui-fixed-isolation-audit-'+DATE+'.json');after=read('n1-invoice-ui-fixed-after-'+DATE+'.json');ui=read('n1-invoice-ui-fixed-live-ui-'+DATE+'.json');validation=read('n1-invoice-ui-fixed-validation-'+DATE+'.json');bill=after['invoice'];j=after['job']
assert release['status']=='Live' and release['commit']==assets['commit'] and a['allJobsUnchanged'] and a['evidenceHashesUnchanged'] and not a['emailSent'] and not a['geofencingEnabled']
assert all(c['result']=='PASS' for c in ui['measurements']) and ui['repeatedRender']['result']=='PASS' and bill['status']=='Draft' and bill['amount']==1000
add('S.C.D. TRANSPORT / UPDATED PRODUCTION SIT','h2');add('แก้ Preview จอแคบและเอกสารซ้ำ<br/>ผล deploy และทดสอบซ้ำ','title');add(INV+' / '+H,'h1');add('25 ตุลาคม 2026 | Asia/Bangkok | ข้อมูล SIT แยกจากงานจริง')
table(['รายการ','ผลหลังแก้'],[
 ('ระบบจริง','Render Live commit '+release['commit'][:7]+' เวลา '+release['liveAtBangkok']+' (เวลาไทย)'),
 ('Preview','ผ่านการตรวจที่ความกว้างหน้าต่าง375 / 903 / 1280พิกเซล ข้อความอยู่ในพื้นที่Preview ไม่บีบเป็นคอลัมน์จิ๋ว'),
 ('InvoiceDocument','UIเหลือ1รายการ ทะเบียนยัง1ไฟล์เดิม จำนวนหลักฐานทั้งหมด22รายการคงเดิม'),
 ('Invoice / การเงิน',INV+' Draft ยอด1,000 ต้นทุน700 ส่วนต่าง300บาท ข้อมูลจำลองเดิม ไม่มีInvoiceใหม่'),
 ('ไม่กระทบข้อมูล','ตรวจทั้งระบบ'+str(a['allJobsVerified'])+'งานรวมN1ไม่เปลี่ยน ลูกค้า ยูส ทะเบียนบิล คลัง Dock นโยบายและไฟล์เดิมตรงbaseline'),
 ('ขอบเขต','ไม่ส่งอีเมล ไม่ปิดBilled ไม่เปลี่ยนยอด/ราคา/ที่อยู่ ไม่เปิดGeofencing')],[145,U-145])
page();add('1. สองปัญหาเดิมและสิ่งที่แก้','h1')
table(['จุด','ก่อนแก้','หลังแก้'],[
 ('UI-01 Preview','หน้าจอช่วงกลางแบ่งOperationsเป็น2คอลัมน์แม้BillingมีPanelเดียว แล้วBillingแบ่งย่อยอีกครั้ง ทำให้Previewกว้าง148.42pxในจอเดิม','ให้Billingใช้เต็มแถว เลือกจำนวนคอลัมน์ตามพื้นที่Panelจริง ให้Previewกินเต็มแถว ข้อความยาวตัดบรรทัด และซ้อนHeader/ที่อยู่/ยอดบนจอแคบ'),
 ('UI-02 ไฟล์ซ้ำ','แกลเลอรีนำInvoiceDocumentจากทะเบียนมารวมกับลิงก์สำรองInvoice จึงแสดงURLเดียวกัน2ครั้ง','ใช้ไฟล์ในทะเบียนก่อน ตัดเฉพาะInvoiceDocumentที่fileIdหรือURLซ้ำ รองรับURLสัมพัทธ์/เต็ม เก็บลิงก์สำรองเมื่อไม่มีไฟล์ในทะเบียน และคงหลักฐานชนิดอื่น')],[115,315,U-430])
add('ระหว่างตรวจจริงรอบแรก commit74fa4f7 ผ่านจอเดิม903px แต่ยังพบตารางขั้นต่ำ480pxบนจอ375px จึงแก้กริดและความกว้างตารางเพิ่มเติมในcommitb78b6fd ผลในรายงานนี้ใช้การตรวจรุ่นสุดท้าย ไม่ลบข้อพบรอบแรกออกจากประวัติ')
add('เปลี่ยนเฉพาะการแสดงผลในlegacy app.js/styles.css และversionของassets พร้อมเพิ่มทดสอบตัวเลือกไฟล์แนบ ไม่มีการเปลี่ยนAPIวางบิล สร้างInvoiceใหม่ หรือแก้เอกสารHTMLของINV-2026-0002')
page();add('2. วิธีตรวจซ้ำบนระบบจริงโดยไม่สร้างงานซ้ำ','h1')
table(['ขั้น','วิธีทำ','สิ่งที่ต้องได้'],[
 ('1 เปิดผู้ใช้','Adminเข้าเว็บ แล้วเปิดโหมดเลือกยูสชั่วคราว เลือกSIT UI / Billing','ใช้สิทธิ์Billingเดิม ไม่เปลี่ยนรหัสผ่านหรือบทบาท'),
 ('2 เลือกงาน','เมนูงานภาคสนาม Field Ops > Billing > ตรวจสอบรายHouse ใส่ '+H,'ต้องเป็นINV-2026-0002 / Draft / SIT ONLY N1 INVOICE - NOT FOR PAYMENT'),
 ('3 ดูPreview','ตรวจเลขInvoice House ที่อยู่SIT N1 SYNTHETIC ADDRESS - NOT FOR DELIVERY OR PAYMENT ยอด1,000 และอีเมลว่าง','อ่านข้อความได้บนจอ375/903/1280 ไม่ล้นกรอบ ไม่ซ้อนกัน กรอกHouseเป็นการเลือกดู ไม่ใช่สร้างบิลใหม่'),
 ('4 ดูเอกสารแนบ','เลื่อนไปAttachments ตรวจInvoiceDocumentและเปิดลิงก์','แสดงInvoiceDocument1รายการ หลักฐานทั้งหมด22รายการและURLเดิม'),
 ('5 เลือกซ้ำ','ล้างช่องHouseแล้วเลือกN1อีกครั้ง ทำซ้ำ2รอบ','จำนวนInvoiceDocumentยัง1 ไม่มีรายการเพิ่มจากการวาดUIซ้ำ'),
 ('6 เปิดเอกสาร','เปิดInvoiceจากลิงก์เดิมในระบบ แล้วตรวจทะเบียนและยอดสรุป','Draft1ใบเดิม ยอด1,000 ต้นทุน700 ส่วนต่าง300 ไม่สร้างDraft/ไม่Reviewedซ้ำ'),
 ('7 จบรอบ','คืนขนาดหน้าต่างเดิม ตรวจGeofencingปิด แล้วปิดโหมดเลือกยูส','ไม่ส่งอีเมล ไม่กดBilled ไม่กดบันทึกนโยบาย')],[70,355,U-425])
page();add('3. ผลตรวจขนาดจอและการวาดรายการซ้ำ','h1')
table(['หน้าต่างทดสอบ','พื้นที่เอกสาร / Preview px','รายการแนบInvoice / ทั้งหมด','ผล'],[(str(c['requestedWidth'])+' px',str(c['viewportWidth'])+' / '+str(round(c['previewWidth'],2)),str(c['invoiceDocumentLinks'])+' / '+str(c['attachmentItems']),c['result']) for c in ui['measurements']],[130,250,260,U-640])
add('ขนาดพื้นที่เอกสารอาจน้อยกว่าขนาดหน้าต่างเล็กน้อยเพราะแถบเลื่อน วัดจากDOMจริง ตรวจทั้งภาพและตำแหน่งข้อความ ไม่ใช้การแก้CSSชั่วคราวในเบราว์เซอร์เพื่อทำภาพให้ผ่าน')
add('ตรวจข้อความInvoice/House/ชื่อ/ที่อยู่/ยอดอยู่ครบ เทียบตำแหน่งข้อความกับกรอบPreviewและเซลล์ ตรวจไม่ล้นแนวนอน และตรวจว่าลิงก์เอกสารไม่เพิ่มเมื่อเลือกHouseซ้ำ ผลเลือกซ้ำ: '+ui['repeatedRender']['result'])
add('ขอบเขตการทดสอบ: เบราว์เซอร์ที่เชื่อมต่ออยู่และสามขนาดจอที่ระบุ ไม่ยืนยันอุปกรณ์/เบราว์เซอร์ทุกยี่ห้อหรือการทำงานขณะออฟไลน์')
page();add('4. การทดสอบโค้ดและหลักฐาน deploy','h1')
table(['การตรวจ','ผล','รายละเอียด'],[
 ('pnpm test','PASS','280รายการผ่าน รวมกรณีตัวเลือกไฟล์แนบใหม่6รายการ'),
 ('TypeScript / JS syntax','PASS','pnpm typecheck และ node --check app.js ผ่าน'),
 ('ESLint เฉพาะโค้ดทดสอบใหม่','PASS','tests/billing-attachments.test.ts ผ่าน'),
 ('ESLint ทั้งโครงการ','ค้างข้อผิดพลาดเดิม','4errors/3warningsในไฟล์CJSเดิม ไม่ใช่ไฟล์ที่แก้รอบนี้ ไม่รายงานว่าlintทั้งโครงการผ่าน'),
 ('BuildบนWindows','webpack PASS','pnpm build/Turbopackติดปัญหาcompiler child process จึงตรวจเพิ่มด้วยnext build --webpackผ่าน โดยไม่เปลี่ยนคำสั่งdeploy'),
 ('BuildบนRender','PASS','Renderรันpnpm buildด้วยTurbopackจริงสำเร็จและDeploy succeeded | Live'),
 ('ไฟล์บนระบบจริง','PASS','HTML JS CSSเทียบไบต์หลังปรับCRLF/LFตรงกับcommitที่ส่งขึ้นmain ไม่อาศัยหน้าdashboardเพียงอย่างเดียว')],[165,150,U-315])
add('กรณีใหม่6รายการครอบคลุมทะเบียนชนะลิงก์สำรอง URLเต็ม/สัมพัทธ์ซ้ำ IDซ้ำ ประวัติInvoiceคนละใบ หลักฐานรูปคนละรายการ ลิงก์สำรองของบิลเก่า และการไม่ลบแถวที่ไม่มีkey โดยบางรายการทดสอบมากกว่าหนึ่งเงื่อนไข','small')
add('ไฟล์lintเดิม: '+', '.join(validation['fullLint']['files']),'small')
page();add('5. ยืนยันข้อมูลจริงไม่เปลี่ยนและไม่ส่งอีเมล','h1')
table(['ข้อมูล','ผล'],[
 ('งานทั้งระบบ',str(a['allJobsVerified'])+'งานรวมN1ตรงกันก่อนและหลัง ตัดเฉพาะค่าคำนวณตามนาฬิกา ไม่มีHouseเพิ่ม/ลบ'),
 ('ทะเบียนInvoice','Invoiceเดิมทุกใบตรงกัน '+INV+' ยังDraft ยอด1,000 ไม่มีSent/Billed ไม่มีInvoiceใหม่'),
 ('ลูกค้าและทีมงาน','ข้อมูลลูกค้า ผู้ใช้ บทบาท และนโยบายเดิมคงเดิม ไม่มีการแก้ที่อยู่หรืออีเมลรอบนี้'),
 ('คลังและDock','แผนที่คลัง รายการคิว และช่องDockคงเดิม ไม่เบิกหรือย้ายสินค้าเพิ่ม'),
 ('ไฟล์หลักฐาน','ไฟล์22รายการและSHA256ตรงเดิม InvoiceDocumentยัง1ไฟล์เดิม ปรับเฉพาะรายการที่แสดงบนUI'),
 ('อีเมล','ไม่กดส่ง ไม่เรียกAPIส่ง อีเมลบิลยังว่าง statusDraft และการตั้งค่าemailยังไม่configuredเหมือนเดิม'),
 ('Geofencing','false พิกัดWH3และกติกาเฉพาะSITคงเดิม')],[145,U-145])
add('SHA256 งานก่อน: '+a['jobHashBefore'],'small');add('SHA256 งานหลัง: '+a['jobHashAfter'],'small');add('SHA256 เอกสารInvoiceเดิม: '+a['invoiceDocumentSha256'],'small')
page();add('6. แยกผลจริงกับข้อมูลจำลอง','h1')
add('การdeploy การเปิดเว็บ การวัดขนาดจอ การเลือกHouse การเปิดเอกสาร และการอ่านข้อมูลกลับเกิดจริงบนproduction ภาพถัดไปเป็นภาพหน้าจอจริง ไม่ใช่ภาพจำลองสร้างใหม่')
add('ชื่อลูกค้า ที่อยู่ ยอด1,000บาท ต้นทุน700บาท ส่วนต่าง300บาท และหลักฐานสินค้า/TerminalของN1เป็นข้อมูลจำลองจากรอบก่อน ไม่มีการรับเงิน ขนส่ง ชั่ง หรือX-Rayจริงในรอบแก้UIนี้')
add('สองข้อพบก่อนแก้ปิดเป็นผ่านเฉพาะขอบเขตที่ทดสอบแล้ว รายงานก่อนแก้ยังคงไว้เป็นประวัติ ภาพก่อนแก้ในภาคผนวกระบุชัดว่าเป็นก่อนdeploy ไม่ใช้แทนภาพผลล่าสุด')
add('ข้อมูลInvoiceหลังตรวจ: '+bill['id']+' / '+bill['status']+' / '+str(bill['amount'])+' THB / '+j['status'])
captions=read('n1-invoice-ui-fixed-screenshots-'+DATE+'.json');manifest=[]
for i,c in enumerate(captions,1):
 path=D/c['file'];assert path.is_file();page();add(str(i).zfill(2)+'. '+html.escape(c['title']),'h1');add(html.escape(c['description']),'small');im=Image(str(path));scale=min(U/im.imageWidth,380/im.imageHeight);im.drawWidth=im.imageWidth*scale;im.drawHeight=im.imageHeight*scale;story.append(im);add(path.name,'small');manifest.append({**c,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
def footer(c,doc):
 c.setStrokeColor(colors.HexColor('#c0d0dd'));c.line(36,34,W-36,34);c.setFont('Thai',8);c.setFillColor(colors.HexColor('#51677b'));c.drawString(36,21,'SCD / N1 Invoice UI Fixed / 25 Oct 2026 / No Email / Geofencing OFF');c.drawRightString(W-36,21,str(doc.page))
out=O/'SCD-N1-Invoice-UI-Fixed-SIT-2026-10-25.pdf';SimpleDocTemplate(str(out),pagesize=(W,HEIGHT),leftMargin=36,rightMargin=36,topMargin=32,bottomMargin=44,title='SCD N1 Invoice UI Fixed SIT',author='SCD System Test').build(story,onFirstPage=footer,onLaterPages=footer)
reader=PdfReader(out);text='\n'.join(p.extract_text() for p in reader.pages);assert all(p.extract_text().strip() for p in reader.pages)
for value in [H,INV,release['commit'][:7],'Draft']:assert value in text,value
(D/('n1-invoice-ui-fixed-pdf-manifest-'+DATE+'.json')).write_text(json.dumps({'pdf':str(out),'pages':len(reader.pages),'screenshots':len(captions),'images':manifest,'sha256':hashlib.sha256(out.read_bytes()).hexdigest()},ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({'pdf':str(out),'pages':len(reader.pages),'screenshots':len(captions),'bytes':out.stat().st_size},ensure_ascii=False))
