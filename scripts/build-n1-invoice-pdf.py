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

H='SIT-CS-DRIVER-20261025-N1';DATE='2026-10-25'
read=lambda n:json.loads((D/n).read_text(encoding='utf8'))
result=read('n1-invoice-results-'+DATE+'.json');a=read('n1-invoice-isolation-audit-'+DATE+'.json');final=read('n1-invoice-final-'+DATE+'.json');j=final['job'];bill=read('n1-invoice-draft-'+DATE+'.json');document=read('n1-invoice-document-readback-'+DATE+'.json');observations=read('n1-invoice-ui-observations-'+DATE+'.json');extra=read('n1-invoice-evidence-notification-audit-'+DATE+'.json')
assert bill['status']=='Draft' and j['status']=='InvoiceDrafted' and bill['amount']==1000 and not bill['billingEmail'] and not a['nonTargetJobsChanged'] and not a['geofencingEnabled'] and not a['emailSent']
assert all(c['result']=='PASS' for c in result['cases']) and extra['oldEvidenceHashesUnchanged'] and extra['noEmailOrBilledEvents']
negative=[c for c in result['cases'] if isinstance(c['expected'],int) and c['expected']!=200]
add('S.C.D. TRANSPORT / PRODUCTION SIT','h2');add('พร้อมวางบิล - ตรวจเอกสาร<br/>จนสร้าง Invoice Draft','title');add(H,'h1');add('25 ตุลาคม 2026 | Asia/Bangkok | คู่มือทำตามได้และภาพหน้าจอจริง')
table(['หัวข้อ','ผลที่บันทึกและอ่านกลับ'],[
 ('Invoice',bill['id']+' / Draft / ยอดจำลอง 1,000 บาท'),
 ('สถานะงาน','InvoiceDrafted / Reviewed / รถ Available ยอดรับเดิม3CTNคงเดิม'),
 ('การเงินจำลอง','รายรับ1,000 ต้นทุนรวม700 (รวมเชื้อเพลิง200แล้ว) ส่วนต่าง300บาท'),
 ('ลูกค้า','SIT ONLY N1 INVOICE - NOT FOR PAYMENT ที่อยู่จำลองเฉพาะN1 อีเมลว่าง'),
 ('ผลตรวจ','กระบวนการสร้างDraftผ่าน / กติกาบล็อก'+str(len(negative))+'กรณีผ่าน / พบปัญหาแสดงผลUI2จุด'),
 ('แยกงานจริง',str(a['nonTargetJobsVerified'])+'งานอื่นไม่เปลี่ยน Invoiceเดิมคงเดิม เพิ่มเฉพาะDraftและลูกค้าจำลองN1'),
 ('ขอบเขต','ไม่ส่งอีเมล ไม่กดปิดBilled ไม่มีการรับเงินจริง และยังไม่เปิดGeofencing')],[140,U-140])
page();add('1. แยกข้อมูลจริงในระบบกับข้อมูลจำลอง','h1')
table(['ประเภท','สิ่งที่ทำ'],[
 ('บันทึกจริงบนproduction','ตั้งลูกค้า/ราคา/ต้นทุนผ่านAPIมาตรฐาน กดReviewedและสร้างDraftผ่านUI Billingจริง จากนั้นอ่านฐานข้อมูลและทะเบียนInvoiceกลับเพื่อตรวจ'),
 ('ข้อมูลจำลอง','ลูกค้าชื่อSIT ที่อยู่จำลอง ยอด1,000บาทและต้นทุน700บาท รวมถึงหลักฐานWH3/Terminalเดิม21ไฟล์ของชุดSIT ไม่มีการนำหลักฐานงานจริงมาใช้'),
 ('Invoiceนี้','เป็นDraftทดสอบที่อยู่ในทะเบียนระบบจริง ใช้เลขลำดับInvoiceจริงของระบบ มีคำว่าNOT FOR PAYMENTในชื่อลูกค้า ไม่ใช่ใบเรียกเก็บเงินจริง'),
 ('ไม่ส่งอีเมล','ไม่เรียกsend-email ไม่กดปุ่มส่งอีเมล อีเมลลูกค้าและบิลว่าง สถานะไม่เป็นSent/Billed ตรวจlogและการตั้งค่าการส่งก่อน/หลัง'),
 ('ไฟล์ผลลัพธ์','Invoiceที่ระบบลงทะเบียนในpdfUrlเป็นHTMLที่เปิดผ่านเว็บ รายงานฉบับนี้เป็นPDFจริง ไม่กล่าวว่าไฟล์HTMLเป็นPDF'),
 ('Geofencing','นโยบายและพิกัดWH3คงเดิม geofencingEnabled=false ไม่เปิดกติกาทั่วระบบ')],[140,U-140])
add('ก่อนเริ่ม N1 เป็นReadyForBilling ปิดTerminalแล้ว รับCargo Transferคืน รถAvailable ผ่านQA และรับจำลองครบ3CTN ขั้นตอนนี้ไม่ทดสอบหน้างานหรือส่งเอกสารจริง')
page();add('2. คู่มือตรวจความพร้อมและตั้งราคา','h1')
table(['ขั้น / ผู้ทำ','วิธีปฏิบัติ','ผลที่คาดและผลที่ได้'],[
 ('1 Billing','Operations Control ค้นหาHouse N1 เท่านั้น เปิดส่วนวางบิล ตรวจMasterSIT-MASTER-20261025-N1','คิวเริ่มReadyForBilling 1งาน ยังไม่ยืนยันราคา มีเวลาTerminalปิดและCTFคืนครบ'),
 ('2 Billing','เลือกหรือสร้างลูกค้าSIT ONLY N1 INVOICE - NOT FOR PAYMENT ที่อยู่SIT N1 SYNTHETIC ADDRESS - NOT FOR DELIVERY OR PAYMENT','ผูกเฉพาะN1 อีเมล/TaxID/โทรลูกค้าจำลองว่าง ไม่แก้ลูกค้าเดิมของงานจริง รอบนี้สร้างผ่านAPI'),
 ('3 Billing','ยืนยันราคางาน1,000 ต้นทุนรวม700 เชื้อเพลิงที่อยู่ในต้นทุน200 ระบุSIT ONLYในหมายเหตุ','มีpriceConfirmedAt ยอดสรุป1,000/700 ส่วนต่าง300 ไม่บวกเชื้อเพลิงซ้ำเป็น900'),
 ('4 ตรวจสิทธิ์','ลองDriverตรวจบิล Transportตั้งราคา ราคาติดลบ และออกDraftก่อนReviewed','Driver/Transportไม่มีสิทธิ์403 ราคาติดลบ422 ก่อนReviewed409 แม้forceDraft=trueก็ถูก409')],[90,350,U-440])
add('ยอดเงินทั้งหมดเป็นค่าจำลองที่ตั้งเพื่อทดสอบ ไม่ใช่เรทรถหรือค่าบริการที่อนุมัติให้ใช้กับลูกค้าจริง และไม่ได้คำนวณVATหรือภาษีหักณที่จ่ายเพิ่มเติมในรอบนี้')
page();add('3. คู่มือReviewedและออกDraftผ่านหน้าจอ','h1')
table(['ขั้น / ผู้ทำ','วิธีปฏิบัติบนUI','ผลที่คาดและผลที่ได้'],[
 ('5 Billing','เมนูงานภาคสนาม Field Ops > Billing > ตรวจสอบรายHouse ใส่N1ให้ครบ ตรวจลูกค้า/ที่อยู่/FlightSIT200/ยอด1,000ในPreview','อย่าเลือกBatchหรือHouseอื่น ต้องเห็นNOT FOR PAYMENTและอีเมลว่าง ก่อนสร้างยังไม่มีInvoice ID'),
 ('6 Billing','ใส่หมายเหตุSIT ONLY ตรวจเอกสารเดิมของชุดSIT แล้วกดReviewedหนึ่งครั้ง','หน้าจอยืนยันReviewed อ่านกลับได้billingReviewStatus=Reviewedโดยsit_ui_billing'),
 ('7 ตรวจสิทธิ์','ก่อนสร้างจริง ลองDriverออกInvoiceผ่านAPI','403 ไม่มีDraftเพิ่มจากคำขอที่ถูกบล็อก'),
 ('8 Billing','ตรวจHouseในช่องอีกครั้ง แล้วกดสร้าง Draft Invoiceเพียงครั้งเดียว รอผลก่อนกดซ้ำ','ได้ '+bill['id']+' statusDraft งานเป็นInvoiceDrafted ไม่มีการส่งอีเมลอัตโนมัติ'),
 ('9 Billing','เปิดเอกสารจากลิงก์ที่ระบบสร้าง ตรวจเลขInvoice House ลูกค้า ที่อยู่ ยอด1,000 เทียบPreview','HTTP200 และข้อมูลตรง ที่อยู่ปรากฏในเอกสารจริง ไม่ใช้Previewอย่างเดียวสรุปว่าไฟล์ถูกต้อง'),
 ('10 ตรวจซ้ำ','ลองออกInvoiceซ้ำและแก้ราคาหลังออกแล้วผ่านAPI','ทั้งสองกรณี409 ทะเบียนเพิ่มเพียง1Draft ยอดเดิม1,000คงอยู่')],[90,350,U-440])
add('รอบนี้หยุดที่Draftตามคำสั่ง ไม่กดส่งอีเมลวางบิล ไม่กดปิดเป็นBilled หากรอคำขอนาน ให้ตรวจInvoice ID/ทะเบียนก่อนกดซ้ำ ป้องกันเอกสารซ้ำ')
page();add('4. ปัญหาหน้าจอที่พบและขอบเขตผลผ่าน','h1')
add('<b>พบ2จุดที่ต้องแก้ UI:</b> (1) หน้าจอBillingในมุมมองแคบทำให้การ์ดInvoice Previewแคบมาก ข้อความชื่อลูกค้า ที่อยู่ และหัวเอกสารบีบ/ซ้อน ภาพ04และ06เก็บสภาพจริง (2) InvoiceDocumentปรากฏซ้ำ2รายการในแกลเลอรี ทั้งที่ทะเบียนหลักฐานมี1ไฟล์ ดูภาพ10 ไม่มีการปรับCSSหรือสร้างภาพเลียนแบบเพื่อกลบข้อผิดพลาด')
table(['สิ่งที่ตรวจ','ผล'],[
 ('การสร้างDraftและข้อมูล','ผ่าน:บันทึกReviewedและDraftได้ ข้อมูลในทะเบียนและเอกสารInvoiceตรงกัน'),
 ('ข้อความPreview','ตรวจอ่านจากDOMของหน้าเว็บพบชื่อ/ที่อยู่/House/ยอดถูกต้อง แต่การแสดงผลด้วยสายตาไม่ผ่านบนจอแคบ'),
 ('เอกสารที่เปิดจริง','เปิดHTMLInvoiceที่ระบบเก็บได้ ลูกค้า/ที่อยู่/ยอดปรากฏและอ่านได้ ภาพ07-08ใช้ตรวจประกอบ'),
 ('ไฟล์แนบที่แสดงซ้ำ','UIมี2ลิงก์ชี้URLเดียวกัน ทะเบียนมีInvoiceDocument1ไฟล์และInvoiceใหม่1ใบ จึงเป็นการแสดงซ้ำ ไม่ใช่ออกInvoice2ใบ'),
 ('ข้อเสนอแก้','ปรับBilling workspaceตามความกว้างจอ และรวมรายการInvoiceDocumentตามfileId/URLก่อนแสดง จากนั้นเทสจอแคบและแกลเลอรีซ้ำ'),
 ('สถานะการแก้','รอบนี้เป็นการทดสอบ ไม่มีการแก้โค้ดแอปหรือdeploy และยังไม่ยืนยันว่าUIจอแคบใช้งานผ่านทั้งหมด')],[160,U-160])
layout=observations['layout'];add('ขนาดที่อ่านจากหน้าเว็บ: จอ '+str(layout['viewport']['width'])+' x '+str(layout['viewport']['height'])+' พิกเซล แต่Previewกว้างเพียง '+str(round(layout['preview']['width'],2))+' พิกเซล และสูง '+str(round(layout['preview']['height'],2))+' พิกเซล รายการแนบ2ลิงก์ชี้ /storage/invoices/'+bill['id']+'.html เหมือนกัน','small')
page();add('5. กรณีที่ต้องถูกบล็อก','h1')
names={'driver-cannot-review-billing':'DriverตรวจเอกสารBilling','invoice-before-review-blocked':'ออกInvoiceก่อนReviewed','force-draft-cannot-bypass-review':'forceDraftข้ามการตรวจเอกสาร','transport-cannot-set-price':'Transportตั้งราคาBilling','negative-price-blocked':'ราคาติดลบ','driver-cannot-generate-invoice':'Driverสร้างInvoice','duplicate-invoice-blocked':'ออกInvoiceซ้ำ','price-change-after-invoice-blocked':'แก้ราคาหลังมีInvoice'}
table(['กรณี','HTTP คาด / ได้','ผล'],[(names.get(c['name'],c['name']),str(c['expected'])+' / '+str(c['httpStatus']),c['result']) for c in negative],[470,150,U-620])
add('การกดReviewed/สร้างDraftบนUIตรวจด้วยข้อความยืนยันและข้อมูลอ่านกลับ ส่วนHTTPในตารางมาจากคำขอทดสอบAPI ไม่แต่งHTTPของปุ่มUIที่ไม่ได้ดักเครือข่าย')
page();add('6. Invoiceและเวลาที่บันทึก','h1')
table(['รายการ','ค่า'],[
 ('Invoice ID / สถานะ',bill['id']+' / '+bill['status']),('House / Master',H+' / '+j['mawbNumber']),('Flight',j['flightNo']+' / '+thai(j['flightTime'])),('ลูกค้า',bill['customerName']),('ที่อยู่',read('n1-invoice-synthetic-customer-'+DATE+'.json')['address']),('อีเมลรับบิล',bill.get('billingEmail') or '(ว่าง ไม่ส่ง)'),('ยอดเงิน / ต้นทุน / ส่วนต่าง','1,000 / 700 / 300 บาท (จำลอง)'),('ยืนยันราคา',thai(j.get('priceConfirmedAt'))),('ตรวจเอกสาร','Reviewed - ไม่พบฟิลด์เวลาตรวจเฉพาะในข้อมูลjobที่APIส่งกลับ ไม่ใช้เวลาอ่านแทนเวลาบันทึก'),('สร้างDraft',thai(bill.get('draftedAt') or bill.get('createdAt'))),('Sent / Billed',str(bill.get('sentAt') or 'ยังไม่ส่ง')+' / '+str(bill.get('billedAt') or 'ยังไม่ปิดBilled'))],[150,U-150])
add('URLเอกสารที่เปิดจริง: '+html.escape(document['url']),'small');add('HTTP200 / รูปแบบ '+document['format']+' / SHA256 '+document['sha256'],'small')
page();add('7. ตรวจแยกจากงานจริงและไม่ส่งอีเมล','h1')
table(['สิ่งที่ตรวจ','ผล'],[
 ('งานอื่น',str(a['nonTargetJobsVerified'])+'งานไม่เปลี่ยน ไม่มีHouseเพิ่ม/ลบ เทียบฟิลด์บันทึกและฟิลด์ธุรกิจโดยตัดค่าคำนวณตามนาฬิกา'),
 ('ลูกค้าและInvoiceเดิม','ลูกค้าเดิมทุกคนและทะเบียนInvoiceเดิมคงเดิม สร้างลูกค้าSITใหม่1รายการและDraftN1ใหม่1ใบ'),
 ('ข้อมูลเดิมN1','Master Flight ยอดรับ3CTN แท็ก QA เวลาขาออก Terminal CTFคืนและรถAvailableคงเดิม เปลี่ยนเฉพาะลูกค้า/การเงิน/สถานะบิลที่ต้องทดสอบ'),
 ('คลัง/Dock/ยูส/นโยบาย','แผนที่คลัง ช่องDock คิวงานอื่น ผู้ใช้ บทบาท และpolicyคงเดิม คิวN1เปลี่ยนเฉพาะชื่อลูกค้าจำลอง'),
 ('หลักฐานเดิม','ไฟล์เดิม21ไฟล์ยังเปิดได้และSHA256ตรงเดิม เพิ่มInvoiceDocumentเฉพาะDraftนี้'),
 ('ไม่ส่งอีเมล','อีเมลลูกค้า/บิลว่าง ไม่มีsentAt ไม่พบส่งอีเมลหรือBilledในกิจกรรมที่APIคืน ระบบส่งอีเมลไม่ได้ตั้งค่าและคงเดิม ไม่กดปุ่มส่ง'),
 ('Geofencing','false และพิกัดเดิมไม่เปลี่ยน ปิดเซสชันทดสอบชั่วคราวหลังจบ')],[155,U-155])
add('SHA256 งานอื่นก่อน: '+a['beforeNonTargetSha256'],'small');add('SHA256 งานอื่นหลัง: '+a['afterNonTargetSha256'],'small')
page();add('8. ผลคำขอAPIในรอบนี้','h1')
table(['#','รายการ','คาด / ได้','ผล'],[(i,c['name'],str(c['expected'])+' / '+str(c.get('httpStatus','-')),c['result']) for i,c in enumerate(result['cases'],1)],[30,440,160,U-630])
add('ผลผ่านในตารางนี้หมายถึงคำขอAPIตรงผลที่คาดเท่านั้น ข้อพบUI Previewจอแคบและรายการแนบซ้ำยังคงเป็นข้อไม่ผ่านแยกต่างหาก')
captions=read('n1-invoice-screenshots-'+DATE+'.json');manifest=[]
for i,c in enumerate(captions,1):
 path=D/c['file'];assert path.is_file();page();add(str(i).zfill(2)+'. '+html.escape(c['title']),'h1');add(html.escape(c['description']),'small');im=Image(str(path));scale=min(U/im.imageWidth,380/im.imageHeight);im.drawWidth=im.imageWidth*scale;im.drawHeight=im.imageHeight*scale;story.append(im);add(path.name,'small');manifest.append({**c,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
def footer(c,doc):
 c.setStrokeColor(colors.HexColor('#c0d0dd'));c.line(36,34,W-36,34);c.setFont('Thai',8);c.setFillColor(colors.HexColor('#51677b'));c.drawString(36,21,'SCD / N1 Invoice SIT / 25 Oct 2026 / No Email / Geofencing OFF');c.drawRightString(W-36,21,str(doc.page))
out=O/'SCD-N1-Ready-Billing-to-Invoice-SIT-2026-10-25.pdf';SimpleDocTemplate(str(out),pagesize=(W,HEIGHT),leftMargin=36,rightMargin=36,topMargin=32,bottomMargin=44,title='SCD N1 Ready Billing to Invoice SIT',author='SCD System Test').build(story,onFirstPage=footer,onLaterPages=footer)
reader=PdfReader(out);text='\n'.join(p.extract_text() for p in reader.pages);assert all(p.extract_text().strip() for p in reader.pages)
for value in [H,bill['id'],'InvoiceDrafted','NOT FOR PAYMENT']:assert value in text,value
(D/('n1-invoice-pdf-manifest-'+DATE+'.json')).write_text(json.dumps({'pdf':str(out),'pages':len(reader.pages),'screenshots':len(captions),'images':manifest,'sha256':hashlib.sha256(out.read_bytes()).hexdigest()},ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({'pdf':str(out),'pages':len(reader.pages),'screenshots':len(captions),'bytes':out.stat().st_size},ensure_ascii=False))
