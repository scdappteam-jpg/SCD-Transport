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
H='SIT-CS-DRIVER-20261025-N1';MASTER='SIT-MASTER-20261025-N1';DATE='2026-10-25'
read=lambda n:json.loads((D/n).read_text(encoding='utf8'))
result=read('n1-outbound-results-'+DATE+'.json');a=read('n1-outbound-isolation-audit-'+DATE+'.json');final=read('n1-outbound-final-'+DATE+'.json');j=final['job'];before=read('n1-outbound-before-'+DATE+'.json')['job'];files=read('n1-outbound-evidence-readback-'+DATE+'.json')
assert j['status']=='ReadyForBilling' and j['readyForBilling'] and j['terminalClosedAt'] and j['cargoTransferReturnedAt'] and not j.get('invoiceId') and not a['nonTargetJobsChanged'] and not a['geofencingEnabled']
evidenceAudit=read('n1-outbound-all-evidence-audit-'+DATE+'.json');assert evidenceAudit['totalFiles']==21 and evidenceAudit['allHashesUnchanged']
assert all(c['result']=='PASS' for c in result['cases']) and sum(c['expected']!=200 for c in result['cases'])==14
W,HEIGHT=landscape(A4);U=W-72;story=[]
styles={n:ParagraphStyle(n,fontName='ThaiBold' if n in ['title','h1','h2'] else 'Thai',fontSize=size,leading=lead,spaceAfter=space,shaping=True,textColor=colors.HexColor('#183650'),splitLongWords=True) for n,size,lead,space in [('title',25,35,17),('h1',18,26,13),('h2',13,20,10),('body',10.5,17,8),('small',9.3,14.3,6)]}
def p(t,s='body'):return Paragraph(t,styles[s])
def add(t,s='body'):story.append(p(t,s))
def page():story.append(PageBreak())
def table(headers,rows,widths):
 t=Table([[p(html.escape(str(x)),'small') for x in row] for row in [headers,*rows]],colWidths=widths,repeatRows=1,hAlign='LEFT');t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#dcecf5')),('GRID',(0,0),(-1,-1),.4,colors.HexColor('#c0d2de')),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),8),('RIGHTPADDING',(0,0),(-1,-1),8),('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),7),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white,colors.HexColor('#f4f8fa')])]));story.extend([t,Spacer(1,10)])
def thai(t):return datetime.fromisoformat(t.replace('Z','+00:00')).astimezone(timezone(timedelta(hours=7))).strftime('%d/%m/%Y %H:%M:%S') if t else 'ยังไม่ยืนยัน'
add('S.C.D. TRANSPORT / PRODUCTION SIT','h2');add('เบิกออก WH3 - จัดรถส่ง Terminal<br/>จนปิดงานขนส่ง','title');add(H,'h1');add('25 ตุลาคม 2026 | เวลา Asia/Bangkok | คู่มือขั้นตอนและหลักฐานหน้าจอจริง')
table(['หัวข้อ','ผลที่บันทึกและอ่านกลับ'],[
 ('ปลายทาง','ReadyForBilling / ปิด Terminal แล้ว รับ Cargo Transfer คืนแล้ว รถจำลอง Available'),
 ('Master / Flight',MASTER+' / SIT200 เที่ยวบินเดิม 26/10/2026 19:00 เวลาไทย'),
 ('ปริมาณ','ยอดรับจำลองเดิม 3 CTN revision2 คงเดิม น้ำหนัก Master จำลอง 15 กก.'),
 ('รถส่ง Terminal','SIT-OUT-N1 / SIT UI / Driver / 4W-SIT ปลายทาง TG'),
 ('คลัง','เบิกจากช่องเสมือน SITN1WH3-01 ปล่อยพื้นที่เฉพาะชุดนี้'),
 ('ผลตรวจ','ผ่านกติกาบล็อก14กรณี / ledger API '+str(len(result['cases']))+' รายการผ่านตามผลที่คาด / ไฟล์เดิม10+ใหม่11เปิดได้ครบ'),
 ('สิ่งที่ยังไม่ทำ','ไม่ออก Invoice การเงิน ไม่ส่งอีเมล ไม่สั่งพิมพ์ป้าย ไม่เปิด Geofencing')],[140,U-140])
page();add('1. ขอบเขตจริงและผลจำลอง','h1')
table(['ประเภท','รายละเอียด'],[
 ('เกิดจริงในระบบ','คำขอ API บน production ได้บันทึกฐานข้อมูล เวลา สถานะ ผู้ทำ และไฟล์ของ House SIT นี้จริง หน้าจอในเอกสารเป็นภาพจากเว็บ production หลังอ่านข้อมูลกลับ'),
 ('จำลองเฉพาะ SIT','Master รถ เอกสารปล่อย ลายเซ็น EI Permit ภาพท้ายรถ ใบคิว ใบรับสินค้า น้ำหนัก X-Ray Loading Detail และใบ Cargo Transfer คืน ทุกภาพติดคำว่า SIT ONLY'),
 ('ไม่ได้ทดสอบหน้างานจริง','ไม่มีรถออกเดินทาง ไม่มีการชั่งหรือ X-Ray จริง ไม่มีสินค้าโหลดเครื่องบิน ไม่มีการจองคิว AOT ภายนอก การจองที่ทดสอบเป็นรายการภายในแอป'),
 ('API กับ UI','การเปลี่ยนสถานะในรอบนี้ทำผ่าน API มาตรฐานด้วยบัญชี SIT ตามบทบาท ส่วน UI ใช้ตรวจอ่านผลและเปิดหลักฐาน ไม่อ้างว่าได้กดทุกปุ่มบนมือถือ'),
 ('Geofencing','คง geofencingEnabled=false และพิกัด WH3 ว่างตามเดิม ไม่ข้าม QA ไม่เปลี่ยนสิทธิ์หรือรหัสผ่านผู้ใช้')],[140,U-140])
add('ก่อนเริ่ม: Stored / รับจำลองครบ 3 CTN / QA revision1 ผ่านโดยคนละยูสกับผู้ติดแท็ก / inboundClosedRevision=2 ไม่มี Master จึงตั้ง Master จำลองใหม่ที่ไม่มี House อื่นใช้ และคง Flight/วันเวลาเดิม')
page();add('2. คู่มือเบิกออก WH3 และตรวจเอกสาร','h1')
table(['ขั้น / ผู้ทำ','วิธีปฏิบัติเมื่อทำงานตาม UI','ผลที่ต้องได้ / ผล API รอบนี้'],[
 ('1 WH','ค้นหา House N1 ตรวจยอดรับ 3/3 QA และช่อง SITN1WH3-01 ให้ตรง ก่อนเลือกเบิกออก','ถ้ายังไม่ยืนยันตำแหน่งต้อง409 ห้ามใช้สถานะ Stored เพียงอย่างเดียว'),
 ('2 WH','ยืนยันตำแหน่งและสแกนฉลาก House ที่หยิบให้ตรง จากนั้นตรวจ House / Master / Invoice','สแกนเลขอื่นถูก409; เลข N1 ถูก200 มี outboundFoundAt'),
 ('3 WH','แนบเอกสารเบิกจำลอง dispatch.png แล้วเบิกสินค้าจากช่องเสมือน','มี outboundPickedAt / releasedLocationId ช่องเดิมถูกปล่อยเฉพาะ N1'),
 ('4 EI','ตรวจชุด SIT เดียว แนบภาพลายเซ็นจำลอง ei.png แล้วอนุมัติ EI','ไม่มีภาพถูก422; มีภาพผ่าน200 และ eiApprovedAt'),
 ('5 WH','เลือกปลายทาง TG ตรวจใบชั่งขาออก Security Airline Permit และ Manifest/ยอด แนบ dispatch.png','Checklist ว่างถูก422; ตรวจครบผ่าน200 มี wh3PreDispatchAt')],[82,365,U-447])
add('รอบนี้ API ส่ง scannedHouse ให้ตรง House เป็นการทดสอบกติกาจับคู่เลข ไม่ได้ใช้กล้องหรือเครื่องอ่านฉลากจริง การสแกน Code128 ของ QA เกิดในรอบขาเข้าก่อนหน้านี้แล้ว')
page();add('3. คู่มือจัดรถ คิวภายใน และออก WH3','h1')
table(['ขั้น / ผู้ทำ','วิธีปฏิบัติ','ผลที่ต้องได้ / ผล API รอบนี้'],[
 ('6 Transport','จัดรถส่ง SIT-OUT-N1 คนขับ SIT UI / Driver ประเภท4W-SIT ปลายทางTG แล้วจองคิวรถภายใน','aotBookedAt มีค่า สถานะ AOTQueueBooked ไม่ใช่การจองระบบสนามบินภายนอก'),
 ('7 Admin','ตรวจการจองก่อนอนุมัติคิว เฉพาะ House N1','อนุมัติก่อนจองถูก409; Transport อนุมัติเองถูก403; Admin ผ่าน200'),
 ('8 Transport','ออก Cargo Transfer เฉพาะ House N1 ต้นทางWH3 ปลายทางTG ใส่ผู้ปล่อย คนขับ รถ วันที่และเวลา พร้อม permit.png','ขาด Permit ถูก422; ครบแล้วมี cargoTransferIssuedAt วันที่/เวลาในเอกสารเป็นค่าจำลอง เวลา log เป็นเวลาที่ระบบบันทึกจริง'),
 ('9 Transport','Operations Control เลือก House เดียว ระบุหมายเหตุ SIT ONLY แล้วเริ่มโหลดที่ WH3','มี wh3LoadingStartedAt ห้ามเลือก House อื่นรวม'),
 ('10 Transport','แนบ vehicle.png ซึ่งเป็นภาพท้ายรถจำลอง แล้วออก WH3 ไป Terminal','ไม่มีภาพถูก422; มีภาพผ่าน200 เป็น GoodsLoaded / EnRouteToTerminal และ releasedWh3At')],[82,365,U-447])
add('หากคำขอจองหรือออกเอกสารไม่ตอบกลับ ให้ตรวจ Timeline และ aotBookedAt/cargoTransferIssuedAt ก่อนกดซ้ำ อย่าตีความ timeout ว่ายังไม่บันทึก โดยผลของรอบนี้แสดงใน ledger ท้ายเอกสาร')
page();add('4. คู่มือรับ Terminal ชั่ง X-Ray และ Load','h1')
table(['ขั้น / ผู้ทำ','วิธีปฏิบัติ','ผลที่ต้องได้ / ผล API รอบนี้'],[
 ('11 Terminal','เลือก '+MASTER+' / SIT200 ตรวจว่ากลุ่มมีเพียง N1 แนบ queue.png แล้วรับคิว จากนั้น arrival.png รับสินค้า','มี queueReceivedAt / cargoReceivedAt / terminalArrivedAt; เริ่มชั่งก่อนรับเข้าถูก409'),
 ('12 Terminal','เริ่มชั่ง แล้วกรอก15กก. Dimension 60x40x40cm x3CTN (จำลอง) แนบ weigh.png','น้ำหนัก0ถูก422; ครบผ่าน มีเริ่ม/จบและ terminalMasterWeight=15 ไม่ลงน้ำหนักเดี่ยวแต่ละHouse'),
 ('13 Terminal','เริ่ม X-Ray เลือก Passed แนบ xray.png แล้วเสร็จพร้อมหลักฐาน','ไม่มีภาพถูก422; ผ่านแล้วมีเวลาเริ่ม/จบ และ xrayStatus=Passed'),
 ('14 Terminal','เริ่ม Load แนบ load.png Loading Detail แล้วเสร็จพร้อมหลักฐาน','Load ก่อน X-Ray ถูก409; ปิดไม่มีภาพถูก422; ครบแล้ว ReadyForBilling / terminalClosedAt'),
 ('15 Transport','แนบ return.png รับ Cargo Transfer คืน แล้วกดยืนยันรถว่าง','มี cargoTransferReturnedAt และ driverRouteStatus=Available; ปิด Terminal ซ้ำถูก409')],[82,365,U-447])
add('ปิดงานในรอบนี้หมายถึงปิด Terminal และพร้อมวางบิล ยังไม่ใช่ Billed ไม่ออก Invoice การเงิน และไม่ส่งเอกสารถึงลูกค้าจริง')
page();add('5. ผลที่ต้องถูกบล็อก','h1')
translations={'picking-before-location-blocked':'เบิกก่อนยืนยันตำแหน่ง','wrong-label-blocked':'ยืนยันฉลากคนละ House','ei-without-evidence-blocked':'EI ไม่แนบหลักฐาน','wh3-missing-document-checklist-blocked':'เอกสารปล่อย WH3 ไม่ครบ','aot-approval-before-booking-blocked':'อนุมัติคิวก่อนจอง','transport-cannot-approve-aot':'Transport อนุมัติคิวเอง','cargo-transfer-missing-permit-blocked':'Cargo Transfer ขาด Permit','depart-wh3-without-photo-blocked':'ออก WH3 ไม่มีภาพประตูปิด','weigh-before-terminal-arrival-blocked':'เริ่มชั่งก่อนรับเข้าที่ Terminal','load-before-xray-blocked':'เริ่ม Load ก่อน X-Ray ผ่าน','zero-weight-blocked':'น้ำหนักเป็นศูนย์','xray-without-evidence-blocked':'จบ X-Ray ไม่แนบหลักฐาน','close-without-loading-evidence-blocked':'ปิด Load ไม่มี Loading Detail','repeated-terminal-close-blocked':'ปิด Terminal ซ้ำ'}
negative=[c for c in result['cases'] if c['expected']!=200]
table(['กรณี','HTTP คาด / ได้','ผล'],[(translations.get(c['name'],c['name']),str(c['expected'])+' / '+str(c['httpStatus']),c['result']) for c in negative],[490,130,U-620])
page();add('6. เวลาในระบบและการตรวจย้อนกลับ','h1')
timefields=[('outboundFoundAt','ยืนยันพบสินค้า'),('outboundPickedAt','เบิกออก WH3'),('eiApprovedAt','EI อนุมัติ'),('wh3PreDispatchAt','เอกสารปล่อย WH3'),('aotBookedAt','จองคิวภายใน'),('aotApprovedAt','อนุมัติคิวภายใน'),('cargoTransferIssuedAt','ออก Cargo Transfer'),('wh3LoadingStartedAt','เริ่มโหลด WH3'),('releasedWh3At','ออก WH3'),('queueReceivedAt','รับคิว Terminal'),('cargoReceivedAt','รับสินค้า Terminal'),('weighStartedAt','เริ่มชั่ง'),('weighEndedAt','จบชั่ง'),('xrayStartedAt','เริ่ม X-Ray'),('xrayCompletedAt','จบ X-Ray'),('loadStartedAt','เริ่ม Load'),('loadEndedAt','จบ Load'),('terminalClosedAt','ปิด Terminal'),('cargoTransferReturnedAt','รับ Cargo Transfer คืน'),('vehicleAvailableAt','รถจำลองว่าง')]
table(['ขั้นตอน','เวลาไทย','ฟิลด์'],[(label,thai(j.get(key)),key) for key,label in timefields],[190,200,U-390])
page();add('7. ตรวจแยกงานจริงและหลักฐาน','h1')
table(['สิ่งที่ตรวจ','ผล'],[
 ('งานอื่น',str(a['nonTargetJobsVerified'])+' งานไม่เปลี่ยน ไม่มี House เพิ่ม/ลบ ทั้งฟิลด์ธุรกิจและฟิลด์บันทึกอื่นที่ไม่ใช่ค่าคำนวณตามนาฬิกาตรง baseline'),
 ('แผนที่คลัง','เปลี่ยนเฉพาะปล่อยผู้ครอบครอง N1 จากช่องเสมือน SITN1WH3-01 ช่องจริง/โซนเดิมไม่เปลี่ยน'),
 ('CS / รับเข้า / QA','Invoice CS ผู้ติดต่อ โทร ยอดรับ revision2 แท็ก QA และเวลาปิดรับเข้าเดิมคงอยู่ Flightและวันเวลาเดิมไม่เปลี่ยน'),
 ('ลูกค้า/ยูส/การเงิน','ไม่แก้ข้อมูลลูกค้า ผู้ใช้ บทบาท หรือรหัสผ่าน ยอด billing คงเดิม ไม่มี Invoice การเงินใหม่'),
 ('Dock / นโยบาย','ช่อง Dock จริงและคิวของงานอื่นคงเดิม policy และพิกัดคงเดิม Geofencing=false'),
 ('หลักฐานใหม่',str(len(files))+' ไฟล์เปิด HTTP200 และเทียบ SHA256 ตรงกับไฟล์จำลองต้นฉบับ'),
 ('ความหมายผล','ผ่านกระบวนการข้อมูลบน production ไม่ยืนยันการเดินรถจริง ชั่งจริง X-Ray จริง หรือโหลดจริง')],[140,U-140])
add('SHA256 งานอื่นก่อน: '+a['beforeNonTargetSha256'],'small');add('SHA256 งานอื่นหลัง: '+a['afterNonTargetSha256'],'small')
add('Location ในรายละเอียดงานอาจยังแสดง SITN1WH3-01 เป็นข้อมูลอ้างอิงเดิมหลังเบิก ให้ตรวจ releasedLocationId / outboundPickedAt และผู้ครอบครองในแผนที่ ไม่ใช้ข้อความ Location เดิมเพียงอย่างเดียวสรุปว่ายังมีสินค้าอยู่ในช่อง','small')
page();add('8. ทะเบียนหลักฐานขาออกจำลอง','h1')
table(['ประเภท','File ID','เปิด'],[(f['fileType'],f['fileId'],'HTTP '+str(f['httpStatus'])) for f in files],[190,450,U-640])
add('เปิดไฟล์จาก URL ที่ระบบลงทะเบียน ไม่เดานามสกุลไฟล์ ไฟล์เดิมขาเข้า 10 รายการคงอยู่และตรวจ hash แยกใน audit เพิ่มเติม ภาพที่เปิดในเว็บแสดงข้อความ SIT ONLY ชัดเจน')
page();add('9. ผลตรวจคำขอทั้งหมด','h1')
table(['#','ชื่อกรณี API','คาด / ได้','ผล'],[(i,c['name'],str(c['expected'])+' / '+str(c['httpStatus']),c['result']) for i,c in enumerate(result['cases'],1)],[35,470,125,U-630])
add('Ledger รวมคำขออ่านข้อมูล กรณีผ่านและกรณีที่คาดว่าจะถูกบล็อก ไม่ใช่จำนวนขั้นตอน UI หรือจำนวนการทดสอบทางกายภาพ หากมี TIMEOUT/FAIL ให้คงบันทึกไว้ตามจริง')
page();add('10. ภาพหน้าจอจริงและข้อจำกัด','h1');add('ภาพทั้งหมดจากระบบ production ผ่านเบราว์เซอร์ ไม่สร้างหน้าจอผลลัพธ์เลียนแบบ การเปลี่ยนสถานะดำเนินด้วย API ตามบทบาท และเปิด UI อ่านกลับ ภาพหลังเบิก/จัดรถเป็นสถานะที่อ่านได้ ณ เวลาถ่าย ไม่ย้อนตั้งสถานะเพื่อถ่ายใหม่')
add('ยังไม่ครอบคลุม Hold/Re-X-Ray การเปลี่ยน Flight กลางทาง เครือข่ายมือถือหลุด การใช้อุปกรณ์กล้อง/เครื่องชั่งจริง และการวางบิล งาน SIT ต้องถูกแยกออกจากรายงานปฏิบัติงานจริงตามขอบเขตการใช้งาน')
captions=read('n1-outbound-screenshots-'+DATE+'.json');manifest=[]
for i,c in enumerate(captions,1):
 path=D/c['file'];assert path.is_file();page();add(str(i).zfill(2)+'. '+html.escape(c['title']),'h1');add(html.escape(c['description']),'small');im=Image(str(path));scale=min(U/im.imageWidth,380/im.imageHeight);im.drawWidth=im.imageWidth*scale;im.drawHeight=im.imageHeight*scale;story.append(im);add(path.name,'small');manifest.append({**c,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
def footer(c,doc):
 c.setStrokeColor(colors.HexColor('#c0d0dd'));c.line(36,34,W-36,34);c.setFont('Thai',8);c.setFillColor(colors.HexColor('#51677b'));c.drawString(36,21,'SCD / N1 Outbound-Terminal SIT / 25 Oct 2026 / Geofencing OFF');c.drawRightString(W-36,21,str(doc.page))
out=O/'SCD-N1-WH3-Outbound-Terminal-SIT-2026-10-25.pdf';SimpleDocTemplate(str(out),pagesize=(W,HEIGHT),leftMargin=36,rightMargin=36,topMargin=32,bottomMargin=44,title='SCD N1 WH3 Outbound Terminal SIT',author='SCD System Test').build(story,onFirstPage=footer,onLaterPages=footer)
reader=PdfReader(out);text='\n'.join(p.extract_text() for p in reader.pages);assert all(p.extract_text().strip() for p in reader.pages)
for value in [H,MASTER,'ReadyForBilling','SIT-OUT-N1']:assert value in text,value
(D/('n1-outbound-pdf-manifest-'+DATE+'.json')).write_text(json.dumps({'pdf':str(out),'pages':len(reader.pages),'screenshots':len(captions),'images':manifest,'sha256':hashlib.sha256(out.read_bytes()).hexdigest()},ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({'pdf':str(out),'pages':len(reader.pages),'screenshots':len(captions),'bytes':out.stat().st_size},ensure_ascii=False))
