import json,hashlib,re,ast
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
from pypdf import PdfReader
R=Path(__file__).resolve().parents[1];D=R/'docs';P=R/'tmp/pdfs/n1-billed-20261025'
read=lambda n:json.loads((D/n).read_text(encoding='utf8'))
m=read('n1-billed-pdf-manifest-2026-10-25.json');pdf=Path(m['pdf']);reader=PdfReader(pdf);assert len(reader.pages)==m['pages']==14 and hashlib.sha256(pdf.read_bytes()).hexdigest()==m['sha256']
text='\n'.join(p.extract_text() for p in reader.pages)
for t in ['INV-2026-0002','SIT-CS-DRIVER-20261025-N1','N1-BILLED-01','Billed']:assert t in text
a=read('n1-billed-isolation-audit-2026-10-25.json');assert a['nonTargetJobsVerified']==3806 and a['nonTargetJobsChanged']==0 and a['beforeNonTargetSha256']==a['afterNonTargetSha256'] and a['invoiceDocumentUnchanged'] and not a['geofencingEnabled'] and a['noEmailEndpointCalled'] and a['noEmailSentOrQueuedMetadata'] and a['fallbackApiClosePosts']==0
f=read('n1-billed-final-2026-10-25.json');assert f['bill']['status']=='Billed' and f['bill']['amount']==1000 and f['job']['status']=='Billed' and not f['job']['readyForBilling']
u=read('n1-billed-ui-2026-10-25.json');assert 'Billed' in u['preview'] and u['invoiceDocuments']==1 and u['attachmentCount']==22 and not u['readyListContainsN1']
s=read('n1-billed-isolated-results-2026-10-25.json');assert s['passed']==2 and s['failed']==1 and not s['productionMutation'] and s['networkCalls']==0
for p in D.glob('n1-billed-*.json'):assert not re.search(r'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+',p.read_text(encoding='utf8')),p.name
for shot in m['images']:assert hashlib.sha256((D/shot['file']).read_bytes()).hexdigest()==shot['sha256']
for name in ['run-n1-billed.py','build-n1-billed-pdf.py']:ast.parse((R/'scripts'/name).read_text(encoding='utf8'))
pages=sorted(P.glob('page-*.png'));assert len(pages)==len(reader.pages)
font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',15)
for start in range(0,len(pages),8):
 group=pages[start:start+8];sheet=Image.new('RGB',(1400,440*((len(group)+1)//2)),'#dce6ed');draw=ImageDraw.Draw(sheet)
 for i,path in enumerate(group):
  im=Image.open(path);im.thumbnail((690,400));x=i%2*700;y=i//2*440;sheet.paste(im,(x,y+26));draw.text((x+5,y+3),path.stem,font=font,fill='black')
 sheet.save(P/('contact-'+str(start)+'.png'))
print('PASS PDF14 pages/7 real screenshots; Billed1000; non-target3806 unchanged; no email; GeoOFF; isolated2PASS1FAIL preserved')
