"""Validate final PDF, audit, target-only evidence and every actual screenshot."""
import json,hashlib,re,ast
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
from pypdf import PdfReader
R=Path(__file__).resolve().parents[1];D=R/'docs';P=R/'tmp/pdfs/n1-invoice-20261025'
m=json.loads((D/'n1-invoice-pdf-manifest-2026-10-25.json').read_text(encoding='utf8'));pdf=Path(m['pdf']);reader=PdfReader(pdf)
assert len(reader.pages)==m['pages'] and m['screenshots']==12 and hashlib.sha256(pdf.read_bytes()).hexdigest()==m['sha256']
text='\n'.join(p.extract_text() for p in reader.pages)
for value in ['SIT-CS-DRIVER-20261025-N1','SIT-MASTER-20261025-N1','InvoiceDrafted','INV-2026-0002','NOT FOR PAYMENT']:assert value in text,value
for p in D.glob('n1-invoice-*.json'):
 t=p.read_text(encoding='utf8');assert not re.search(r'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+',t),p.name
a=json.loads((D/'n1-invoice-isolation-audit-2026-10-25.json').read_text(encoding='utf8'));assert not a['nonTargetJobsChanged'] and a['nonTargetJobsVerified']==3806 and a['beforeNonTargetSha256']==a['afterNonTargetSha256'] and not a['geofencingEnabled'] and a['allPersistedNonTargetFieldsUnchanged']
e=json.loads((D/'n1-invoice-evidence-notification-audit-2026-10-25.json').read_text(encoding='utf8'));assert e['totalFiles']==22 and e['oldEvidence']==21 and e['newInvoiceDocumentFiles']==1 and e['oldEvidenceHashesUnchanged'] and e['noEmailOrBilledEvents'] and all(f['httpStatus']==200 for f in e['files'])
u=json.loads((D/'n1-invoice-ui-observations-2026-10-25.json').read_text(encoding='utf8'));assert len(u['findings'])==2 and all(v['result']=='FAIL' for v in u['findings']) and len(u['layout']['invoiceDocumentLinks'])==2
c=json.loads((D/'n1-invoice-results-2026-10-25.json').read_text(encoding='utf8'))['cases'];assert all(v['result']=='PASS' for v in c) and sum(isinstance(v['expected'],int) and v['expected']!=200 for v in c)==8
for s in ['run-n1-invoice-sit.py','verify-n1-invoice-evidence.py','build-n1-invoice-pdf.py']:ast.parse((R/'scripts'/s).read_text(encoding='utf8'))
for shot in m['images']:
 p=D/shot['file'];assert p.is_file() and hashlib.sha256(p.read_bytes()).hexdigest()==shot['sha256']
pages=sorted(P.glob('page-*.png'));assert len(pages)==len(reader.pages)
font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',15)
for start in range(0,len(pages),12):
 sheet=Image.new('RGB',(1200,245*((len(pages[start:start+12])+2)//3)),'#dce6ed');draw=ImageDraw.Draw(sheet)
 for i,path in enumerate(pages[start:start+12]):
  im=Image.open(path);im.thumbnail((390,215));x=i%3*400;y=i//3*245;sheet.paste(im,(x,y+25));draw.text((x+5,y+3),'PDF '+path.stem,font=font,fill='black')
 sheet.save(P/('pdf-contact-'+str(start)+'.png'))
print('PASS PDF',len(reader.pages),'pages / screenshots12 / blocked8 / HTTP checks',len(c),'/ files22 / UI findings2 preserved / non-target3806 unchanged / no JWT')
print('Text chars by page:',[len(p.extract_text()) for p in reader.pages])
