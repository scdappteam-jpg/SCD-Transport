"""Check final report, exact deployed assets, three live breakpoints and read-only audit."""
import json,hashlib,re,ast
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
from pypdf import PdfReader
R=Path(__file__).resolve().parents[1];D=R/'docs';P=R/'tmp/pdfs/n1-invoice-ui-fixed-20261025'
read=lambda n:json.loads((D/n).read_text(encoding='utf8'))
m=read('n1-invoice-ui-fixed-pdf-manifest-2026-10-25.json');pdf=Path(m['pdf']);reader=PdfReader(pdf);assert len(reader.pages)==m['pages'] and hashlib.sha256(pdf.read_bytes()).hexdigest()==m['sha256']
text='\n'.join(p.extract_text() for p in reader.pages)
release=read('n1-invoice-ui-fixed-release-2026-10-25.json');assets=read('n1-invoice-ui-fixed-live-assets-2026-10-25.json');assert release['status']=='Live' and release['commit']==assets['commit'] and release['commit'].startswith('b78b6fd')
for value in ['SIT-CS-DRIVER-20261025-N1','INV-2026-0002',release['commit'][:7],'Draft']:assert value in text,value
ui=read('n1-invoice-ui-fixed-live-ui-2026-10-25.json');assert len(ui['measurements'])==3 and {c['requestedWidth'] for c in ui['measurements']}=={375,903,1280} and all(c['result']=='PASS' for c in ui['measurements']) and ui['repeatedRender']['result']=='PASS'
for c in ui['measurements']:assert c['invoiceDocumentLinks']==1 and c['attachmentItems']==22 and not c['overflowElements'] and not c['overlaps']
a=read('n1-invoice-ui-fixed-isolation-audit-2026-10-25.json');assert a['allJobsVerified']==3807 and a['allJobsUnchanged'] and a['jobHashBefore']==a['jobHashAfter'] and a['evidenceFiles']==22 and a['invoiceFiles']==1 and a['evidenceHashesUnchanged'] and not a['geofencingEnabled'] and not a['emailSent']
v=read('n1-invoice-ui-fixed-validation-2026-10-25.json');assert v['finalTests']['passed']==280 and v['fullLint']['result']=='FAIL_PREEXISTING'
history=read('n1-invoice-ui-fixed-intermediate-mobile-2026-10-25.json');assert any(c['result']=='FAIL' and c['requestedWidth']==375 for c in history['measurements'])
for p in D.glob('n1-invoice-ui-fixed-*.json'):assert not re.search(r'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+',p.read_text(encoding='utf8')),p.name
for name in ['verify-n1-invoice-ui-fixed.py','build-n1-invoice-ui-fixed-pdf.py']:ast.parse((R/'scripts'/name).read_text(encoding='utf8'))
for shot in m['images']:assert hashlib.sha256((D/shot['file']).read_bytes()).hexdigest()==shot['sha256']
pages=sorted(P.glob('page-*.png'));assert len(pages)==len(reader.pages)
font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',15)
for start in range(0,len(pages),12):
 group=pages[start:start+12];sheet=Image.new('RGB',(1200,245*((len(group)+2)//3)),'#dce6ed');draw=ImageDraw.Draw(sheet)
 for i,path in enumerate(group):
  im=Image.open(path);im.thumbnail((390,215));x=i%3*400;y=i//3*245;sheet.paste(im,(x,y+25));draw.text((x+5,y+3),'PDF '+path.stem,font=font,fill='black')
 sheet.save(P/('pdf-contact-'+str(start)+'.png'))
print('PASS report',len(reader.pages),'pages /',m['screenshots'],'images / live375-903-1280 / invoice links1 / data3807 unchanged / evidence22 unchanged / no email / GeoOFF; historical FAIL retained')
