"""Thai WH3 SIT manual and actual production screenshots. No private baseline or credentials."""
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
H='SIT-CS-DRIVER-20261025-N1';DATE='2026-10-25';LOC='SITN1WH3-01'
def read(n):return json.loads((D/n).read_text(encoding='utf8'))
audit=read('n1-wh3-audit-'+DATE+'.json');final=read('n1-wh3-final-'+DATE+'.json');j=final['job'];partial=read('n1-wh3-partial-'+DATE+'.json')['job'];cases=read('n1-wh3-cases-'+DATE+'.json')
assert j['status']=='Stored' and audit['qaVerified'] and audit['otherJobsChanged']==0 and len(audit['files'])==10 and all(c['result']=='PASS' for c in cases)
W,HEIGHT=landscape(A4);U=W-72;story=[]
styles={n:ParagraphStyle(n,fontName='ThaiBold' if n in ['title','h1','h2'] else 'Thai',fontSize=size,leading=lead,spaceAfter=space,shaping=True,textColor=colors.HexColor('#183650'),splitLongWords=True) for n,size,lead,space in [('title',25,35,17),('h1',18,26,13),('h2',13,20,10),('body',10.5,17,8),('small',9.3,14.3,6)]}
def p(t,s='body'):return Paragraph(t,styles[s])
def add(t,s='body'):story.append(p(t,s))
def page():story.append(PageBreak())
def table(headers,rows,widths):
 t=Table([[p(html.escape(str(x)),'small') for x in row] for row in [headers,*rows]],colWidths=widths,repeatRows=1,hAlign='LEFT');t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#dcecf5')),('GRID',(0,0),(-1,-1),.4,colors.HexColor('#c0d2de')),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),8),('RIGHTPADDING',(0,0),(-1,-1),8),('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),7),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white,colors.HexColor('#f4f8fa')]) ]));story.extend([t,Spacer(1,10)])
def thai(t):return datetime.fromisoformat(t.replace('Z','+00:00')).astimezone(timezone(timedelta(hours=7))).strftime('%d/%m/%Y %H:%M:%S') if t else 'ยังไม่ยืนยัน'
add('S.C.D. TRANSPORT / PRODUCTION SIT','h2');add('รับเข้า WH3 - ติดแท็ก - สแกน QA<br/>จัดเก็บและปิดรับเข้า','title');add(H,'h1');add('25 ตุลาคม 2026 | Asia/Bangkok | ภาพหน้าจอจริงและคู่มือทำตามได้')
table(['ผลที่ตรวจ','ผลจริงในระบบ'],[
('สถานะปลายทาง','Stored และมี inboundClosedAt หลังปิดรับเข้า'),('ยอดรับในชุด SIT','แผน3 CTN / รับสะสมจำลอง3 CTN / ค้าง0; ผ่านกรณีบางส่วน2/3ก่อนรับครบ'),('พื้นที่จัดเก็บ',LOC+' - ช่องเสมือน SIT แยกจากพื้นที่เดิม จำนวน3กล่อง / 0พาเลท'),('ผู้ติดแท็ก / ผู้ตรวจ','sit_ui_wh / sit_ui_checkhouse เป็นคนละยูส ใช้ภาพ Code128 คนละใบ'),('QA','ผ่าน revision1 จากตัวอ่านบาร์โค้ดบนเซิร์ฟเวอร์ ไม่มีการอนุมัติด้วยมือ'),('การคงข้อมูลเดิม','งานอื่น3,806งานไม่เปลี่ยน โซน/ช่องเดิม ผู้ใช้ ลูกค้า บิล และนโยบายเดิมไม่เปลี่ยน'),('Geofencing','ยังปิด และไม่ตั้งพิกัด WH3')],[160,U-160])
add('<b>ข้อมูลรับและจัดเก็บทั้งหมดในรายงานนี้เป็นการจำลองของชุด SIT บนระบบจริง</b> ไม่มีการขนย้ายสินค้าหรือรับของจริง ไม่ใช่ผลทดสอบกล้อง/เครื่องยิงที่หน้างาน')
page();add('1. ขอบเขตและข้อมูลที่ใช้','h1')
table(['หัวข้อ','รายละเอียด'],[
('เริ่มจาก','WaitingForDock หลัง Driver กลับWH3และรับใบตรวจปล่อยจากรอบก่อน ไม่มี receipt/แท็ก/QA/Location ตอนเริ่ม'),('CS / Invoice / ผู้ติดต่อ','SIT-CS-INV-20261025-N1 / SIT CONTACT N1 / 0000000000 คงเดิม เป็น Invoice อ้างอิงสินค้า ไม่ใช่ Invoice การเงิน'),('Flight','SIT200 ออก26ต.ค.2026 19:00ไทย คงเดิม ไม่เปลี่ยน Master/F หรือยืมเลขงานจริง'),('สิ่งที่กดผ่าน UI จริง','เปิดงานรับเข้า, Scan House/Single, ยืนยันรับสะสม2และ3CTN, แนบภาพติดแท็กและสแกนQA, ระบุช่อง/จำนวนแล้ว Lock Location, แนบหลักฐานและ Close Inbound'),('สิ่งที่เรียกผ่าน API','ตรวจเอกสารและแนบหลักฐานจำลอง, สร้างช่องเสมือน SIT, ตรวจกรณีบล็อกและสิทธิ์, อ่านกลับและเปรียบเทียบข้อมูล'),('หลักฐานจำลอง','เอกสารรับเข้าPNG, Code128ติดแท็กภาพA, Code128QAภาพB, หลักฐานปิดรับเข้าPNGที่UIแปลงเป็นJPG รวมเพิ่ม4รายการจากเดิม6'),('สแกน QA แบบใด','อัปโหลดรูป Code128 ผ่านหน้าจอจริง เซิร์ฟเวอร์ใช้ strict_barcode=true ตรวจเลขและ hash ภาพ ไม่ส่งสตริงเลขแทนภาพหรือ approved=true เพื่อผ่าน'),('ยังไม่ทดสอบ','เครื่องยิง/กล้อง/แสงหน้างาน, การติดป้ายจริง, การเคลื่อนของจริง และ Geofencing ไม่สั่งพิมพ์ป้ายใหม่')],[170,U-170])
add('บัญชี API ชั่วคราวและโหมดเลือกยูสของเบราว์เซอร์ใช้เฉพาะการทดสอบแล้วปิดเมื่อจบ ไม่มีการเปลี่ยนรหัสผ่าน บทบาท หรือเบอร์โทรยูสจริง')
page();add('2. ขั้นตอนรับเข้า WH3 และผลที่ควรได้','h1')
table(['ขั้น','ทำอย่างไร','ผลที่ควรได้ / ผลที่ตรวจ'],[
('1 เอกสาร','SIT WH ตรวจเอกสารจำลอง Found แนบภาพเอกสารที่มีชื่อN1/Invoiceตรงกัน','ก่อนตรวจเอกสาร API Open ต้อง409 จากนั้น DocumentChecked; เพิ่ม InboundDocument 1ไฟล์'),('2 เปิดรับเข้า','มือถือ SIT WH > สแกน > พิมพ์H > ตรวจสอบและเปิดงานรับเข้า > Open','InboundOpened และมี inboundOpenedAt; การเปิดหน้าฟอร์มอย่างเดียวไม่ถือว่าเปิดรับเข้าบนเซิร์ฟเวอร์'),('3 ระบุ House','Track Single เก็บเข้าWH3, Flight changed=No แล้วกด Scan House','HouseIdentified / Single และ Flightเดิม ไม่ใช่งานCross-Dock'),('4 รับบางส่วน','รับสะสม CTN=2 เหตุผลระบุ SIT ONLY simulated cumulative receipt 2/3; กดยืนยันยอดรับจริงเฉพาะHนี้','ตามแผน3 รับ2 ค้าง1; receipt revision1; ปิดรับเข้าไม่ได้409'),('5 รับครบ','แก้ยอดสะสมเป็น3 ไม่ใช่กรอกเฉพาะยอดเพิ่ม1 ระบุเหตุผลSITแล้วบันทึก','ตามแผน3 รับ3 ค้าง0; receipt revision2; ยอดนี้ยังไม่อนุญาตให้ย้ายก่อนQA'),('6 พื้นที่ SIT','Adminสร้างโซนเสมือน prefix SITN1WH3 ขนาด1x1 รับ3กล่อง/0พาเลท','ได้ '+LOC+' ไม่ใช้ช่องเดิม ไม่ยึดพื้นที่จริง; ลองจัดเก็บก่อนแท็กต้อง409')],[65,350,U-415])
add('<b>เมื่ออ่านย้อนหลัง:</b> ชุดนี้ดำเนินการครบแล้ว อย่ากดรับยอดเดิมซ้ำหรือเปิดงานใหม่เพื่อเริ่มทดสอบรอบเดิม ใช้เอกสารนี้ตรวจย้อนหลัง หรือสร้าง SIT ใหม่สำหรับรอบต่อไป')
page();add('3. ติดแท็ก - สแกน QA - จัดเก็บ','h1')
table(['ขั้น','วิธีปฏิบัติจริง','เกณฑ์ผ่าน'],[
('7 ติดแท็ก','เว็บ WH - สแกนแท็กและQA ด้วย sit_ui_wh ค้นหาH เลือกSingle/สีว่าง แนบ tag.png แล้วกดบันทึกติดแท็กจากรูปสแกน','ตัวอ่านCode128ถอดเลขตรงN1 แท็กrevision1 taggedBy=sit_ui_wh; ยังคงรอQAและห้ามจัดเก็บ'),('8 ตรวจอิสระ','สลับยูส sit_ui_checkhouse ค้นหาH เลือก qa.png ซึ่งเป็นภาพจำลองอีกใบ กดสแกนตรวจQAจากรูป','QAผ่าน revision1 approvedByคนละคน; hashภาพQAต่างจากผู้ติดแท็ก; ไม่มีปุ่มกดยืนยันมือ'),('9 จัดเก็บ','กลับมือถือSIT WH เลือกH ใส่ '+LOC+' พาเลท0 กล่อง3 และDimensionข้อความSIT ONLY virtual... แล้ว Lock Location','Stored, warehouseBoxes=3, warehousePallets=0 และ Locationตรงช่องเสมือน;ไม่ใช้ A-01 ค่าเริ่มต้น'),('10 ปิดรับเข้า','แนบ close.png ใน Evidence photos แล้ว Close Inbound หนึ่งครั้ง','มี inboundClosedAt / inboundClosedRevision=2 สถานะStoredคงเดิม; ถ้าไม่มีไฟล์ต้อง422'),('11 อ่านกลับ','รีเฟรชหน้าคลัง เปิดHอีกครั้ง ตรวจยอดครบ0ค้าง/Location/QA และเปิดไฟล์จาก URLทะเบียน','ไฟล์เดิม6+ใหม่4 เปิด200ครบ10 การอ่านสถานะStoredอย่างเดียวไม่เพียงพอ ต้องดูreceiptและQAด้วย')],[65,395,U-460])
add('ภาพ A/B สร้างให้เป็นบาร์โค้ดที่อ่านได้จริงและติดข้อความ SIT ONLY ชัดเจน เป็นหลักฐานจำลองคนละไฟล์ ไม่อ้างว่าเป็นการถ่ายป้ายจริงคนละคน ส่วนการบันทึก/สแกนและการตรวจสิทธิ์เกิดจริงบนproduction')
page();add('4. กรณีที่ต้องถูกบล็อก และเวลาที่บันทึก','h1')
negative=[c for c in cases if c['expected']!=200]
negativeThai={'Cannot open before document check':'เปิดรับเข้าก่อนตรวจเอกสาร','Partial receipt blocks inbound close':'ปิดรับเข้าขณะรับเพียง2/3CTN','QA lock before tagging':'จัดเก็บก่อนติดแท็กและQA','QA lock after tagging':'จัดเก็บหลังติดแท็กแต่ยังไม่ผ่านQA','Tagger role cannot approve':'ยูสผู้ติดแท็กเรียกอนุมัติQA','No manual QA flag':'ส่งapproved=trueโดยไม่มีภาพสแกน','Wrong House barcode refused':'ภาพบาร์โค้ดคนละHouse','Tagging capture reuse refused':'ใช้ภาพติดแท็กเดิมแทนภาพตรวจQA','Missing close evidence blocked':'ปิดรับเข้าโดยไม่แนบหลักฐาน'}
table(['กรณีทดสอบ','HTTP ที่คาด','ผล'],[(negativeThai.get(c['name'],c['name']),c['expected'],str(c['status'])+' / '+c['result']) for c in negative],[450,100,U-550])
add('กรณีบล็อกทั้งหมดข้างต้นทดสอบเฉพาะHนี้ ไม่มีการแก้บทบาทให้ยูสเดียวกันเป็นทั้งผู้ติดแท็กและQA ผู้ติดแท็กเรียกอนุมัติถูก403ตามสิทธิ์ และในทางผ่านใช้อีกยูสตรวจจริง','small')
page();add('5. เวลา - การแยกงานจริง - ข้อจำกัดการทดสอบ','h1')
eventTime=lambda kind:next(a['createdAt'] for a in final['activities'] if a['activityType']==kind)
times=[('ตรวจเอกสาร',eventTime('InboundDocumentCheck')),('เปิดรับเข้า',j['inboundOpenedAt']),('รับสะสม2/3',partial['inboundReceipt']['confirmedAt']),('รับสะสม3/3',j['inboundReceipt']['confirmedAt']),('ติดแท็ก',j['tagInspection']['taggedAt']),('QAอนุมัติ',j['qaApproval']['approvedAt']),('จัดเก็บ',eventTime('TwinScan')),('ปิดรับเข้า',j['inboundClosedAt'])]
table(['เหตุการณ์','เวลาไทย / 2026'],[(label,thai(t)) for label,t in times],[300,U-300])
add('ตรวจข้อมูลบันทึกของงานอื่น '+str(audit['otherJobsVerified'])+' งานตรงกันก่อนและหลัง แฮช: '+audit['beforeHash'],'small')
add('CS Invoice ผู้ติดต่อ เบอร์ Driver รถ เวลารับของ/กลับWH3/ใบตรวจปล่อย และFlightของN1คงเดิม ไม่สร้างInvoiceการเงิน ไม่ส่งอีเมล ไม่เปลี่ยนนโยบาย globalSafety=false / geofencingEnabled=false ช่องเดิมและDockจริงไม่เปลี่ยน เพิ่มเฉพาะช่องเสมือนที่มีชื่อSITชัดเจน')
add('<b>เหตุขัดข้องชั่วคราวที่พบ:</b> ตอนเริ่มRenderพักบริการและ scannerตอบ503 โดยต้นทางระบุ Too Many Requests หลังบริการตื่นจึงสแกนผ่านจริง ไม่อนุมัติมือเพื่อข้าม เมื่อเปิดหลักฐานต้องใช้URLทะเบียนจริง: Close Inbound แปลงPNGเป็นJPG การเดานามสกุลPNGเคยได้404 แต่ URL .jpg ที่ระบบลงทะเบียนเปิด200 เอกสารนี้ใช้ URL ที่ตรวจแล้ว')
add('HTTP ledger มี '+str(len(cases))+' รายการผ่านตามผลที่คาด (รวมGETและกรณีบล็อก); อาการ503ช่วงเริ่มต้นเก็บแยกในไฟล์วินิจฉัย ไม่รวมเป็นผลผ่านของสแกน เอกสารฉบับนี้เป็นการทดสอบระบบ ไม่มีการแก้หรือdeployโค้ดแอปเพิ่ม')
page();add('6. ทะเบียนหลักฐานและวิธีตรวจย้อนหลัง','h1')
table(['ชนิดไฟล์','File ID / รูปแบบ','เปิด'],[(f['fileType'],f['fileId']+Path(f['url']).suffix,'HTTP '+str(f['httpStatus'])) for f in audit['files']],[175,480,U-655])
add('ไฟล์ใหม่4รายการตรวจตรงกับต้นฉบับจำลอง ภาพTagging/QA/เอกสารรับเข้าเทียบSHA256ตรงกัน ส่วนหลักฐานปิดรับเข้าUIแปลงJPG จึงเทียบขนาดภาพและความต่างพิกเซล รวมทั้งตรวจอ่านภาพจริง ไม่อ้างว่าไบต์PNGและJPGเหมือนกัน')
add('ไฟล์ตรวจสอบ: docs/n1-wh3-cases-2026-10-25.json, n1-wh3-final-2026-10-25.json, n1-wh3-audit-2026-10-25.json และ n1-wh3-evidence-urls-2026-10-25.json ไม่มี token/session/baseline ทั้งระบบในชุดส่งมอบ','small')
captions=[('ก่อนเริ่ม - รอQA','Revision0 ไม่มีผู้ติดแท็ก ใช้SIT WHและค้นหาN1เท่านั้น'),('ตรวจเอกสารแล้ว','DocumentChecked ยังไม่ยืนยันยอดรับ แผน3CTN'),('หลัง Open - หน้าโมดูล','ภาพส่วนบนระหว่างเปลี่ยนขั้น รายละเอียดงานอยู่ถัดลงไป ผล InboundOpened ยืนยันจาก API และเวลาในตาราง'),('หลัง Scan House - หน้าโมดูล','ภาพส่วนบนระหว่างเปลี่ยนขั้น ผล Single และ Flight เดิมยืนยันจากข้อมูลอ่านกลับ ไม่ได้แก้เที่ยวบิน'),('รับบางส่วน2/3','ตามแผน3 รับจำลอง2 ค้าง1 และปิดรับเข้าไม่ได้'),('รับครบ3/3','รับจำลอง3 ค้าง0 แต่ยังต้องผ่านQAก่อนจัดเก็บ'),('ภาพแท็กAก่อนสแกน','เลือกCode128จำลอง tag.png ด้วยSIT WH'),('แท็กRevision1','ติดแท็กโดย sit_ui_wh ยังรอQA'),('ภาพQAอิสระB','แนบqa.png ภายใต้ยูส sit_ui_checkhouse คนละยูสกับผู้ติดแท็ก'),('QAผ่าน','QAผ่านrevision1 โดยอ่านบาร์โค้ดจากภาพจริงบนเซิร์ฟเวอร์'),('ระบุช่องเสมือน','SITN1WH3-01 / 3กล่อง / 0พาเลท / ไม่มีการวัดDimensionจริง'),('จัดเก็บสำเร็จ','Stored ยอดรับจำลองครบและLocationตรงช่องSIT'),('แนบหลักฐานปิดรับเข้า','เลือกclose.png ก่อนClose Inbound ผ่านUI'),('หลังปิดรับเข้า','Stored/รับครบ/ช่องเดิม อ่านเวลาinboundClosedAtในตารางประกอบ'),('เปิดเอกสารรับเข้า','ไฟล์PNGที่เก็บจริง เป็นเอกสารจำลองSIT ONLY'),('เปิดภาพแท็ก','Code128ภาพA ที่ระบบอ่านและบันทึกจริง'),('เปิดภาพQA','Code128ภาพBแยกจากผู้ติดแท็ก มีข้อความQAจำลอง'),('เปิดหลักฐานปิดรับเข้า','URLจริงเป็นJPGที่UIแปลงจากPNG เปิดได้200'),('Geofencingปิด','อ่านค่าปัจจุบัน ไม่กดบันทึกค่าใหม่ พิกัดWH3ยังว่าง'),('ปิดโหมดทดสอบ','กลับLoginหลังจบ ไม่แก้รหัสผ่านหรือสิทธิ์ยูส')]
shots=sorted(D.glob('n1-wh3-[0-9][0-9]-*2026-10-25.png'));assert len(shots)==20,len(shots);manifest=[]
for i,(path,(title,detail)) in enumerate(zip(shots,captions),1):
 assert int(path.name.split('-')[2])==i
 page();add(str(i).zfill(2)+'. '+title,'h1');add(detail,'small');im=Image(str(path));scale=min(U/im.imageWidth,380/im.imageHeight);im.drawWidth=im.imageWidth*scale;im.drawHeight=im.imageHeight*scale;story.append(im);add(path.name,'small');manifest.append({'file':path.name,'title':title,'description':detail,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
def footer(c,doc):
 c.setStrokeColor(colors.HexColor('#c0d0dd'));c.line(36,34,W-36,34);c.setFont('Thai',8);c.setFillColor(colors.HexColor('#51677b'));c.drawString(36,21,'SCD / N1 WH3 SIT / 25 Oct 2026 / Geofencing OFF');c.drawRightString(W-36,21,str(doc.page))
out=O/'SCD-N1-WH3-Inbound-Tag-QA-Stored-SIT-2026-10-25.pdf';SimpleDocTemplate(str(out),pagesize=(W,HEIGHT),leftMargin=36,rightMargin=36,topMargin=32,bottomMargin=44,title='SCD N1 WH3 Inbound Tag QA Stored SIT',author='SCD System Test').build(story,onFirstPage=footer,onLaterPages=footer)
reader=PdfReader(out);text='\n'.join(p.extract_text() for p in reader.pages);assert all(p.extract_text().strip() for p in reader.pages)
for value in [H,LOC,'Stored','sit_ui_wh','sit_ui_checkhouse']:assert value in text,value
(D/'n1-wh3-pdf-manifest-2026-10-25.json').write_text(json.dumps({'pdf':str(out),'pages':len(reader.pages),'screenshots':len(shots),'images':manifest,'sha256':hashlib.sha256(out.read_bytes()).hexdigest()},ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({'pdf':str(out),'pages':len(reader.pages),'screenshots':len(shots),'bytes':out.stat().st_size},ensure_ascii=False))
