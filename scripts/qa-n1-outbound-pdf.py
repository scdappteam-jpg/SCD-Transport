"""Validate final PDF, audit, target-only evidence and every actual screenshot."""
import json,hashlib,re,ast
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
from pypdf import PdfReader
R=Path(__file__).resolve().parents[1];D=R/'docs';P=R/'tmp/pdfs/n1-outbound-20261025'
m=json.loads((D/'n1-outbound-pdf-manifest-2026-10-25.json').read_text(encoding='utf8'));pdf=Path(m['pdf']);reader=PdfReader(pdf)
assert len(reader.pages)==m['pages'] and m['screenshots']==16 and hashlib.sha256(pdf.read_bytes()).hexdigest()==m['sha256']
text='\n'.join(p.extract_text() for p in reader.pages)
for value in ['SIT-CS-DRIVER-20261025-N1','SIT-MASTER-20261025-N1','ReadyForBilling','SIT-OUT-N1','Available']:assert value in text,value
for p in D.glob('n1-outbound-*.json'):
 t=p.read_text(encoding='utf8');assert not re.search(r'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+',t),p.name
a=json.loads((D/'n1-outbound-isolation-audit-2026-10-25.json').read_text(encoding='utf8'));assert not a['nonTargetJobsChanged'] and a['nonTargetJobsVerified']==3806 and a['beforeNonTargetSha256']==a['afterNonTargetSha256'] and not a['geofencingEnabled'] and a['allPersistedNonTargetFieldsUnchanged']
e=json.loads((D/'n1-outbound-all-evidence-audit-2026-10-25.json').read_text(encoding='utf8'));assert e['totalFiles']==21 and e['oldFiles']==10 and e['newFiles']==11 and e['allHashesUnchanged'] and all(f['httpStatus']==200 for f in e['files'])
c=json.loads((D/'n1-outbound-results-2026-10-25.json').read_text(encoding='utf8'))['cases'];assert all(v['result']=='PASS' for v in c) and sum(v['expected']!=200 for v in c)==14
for s in ['run-n1-outbound-sit.py','verify-n1-outbound-evidence.py','build-n1-outbound-pdf.py']:ast.parse((R/'scripts'/s).read_text(encoding='utf8'))
for shot in m['images']:
 p=D/shot['file'];assert p.is_file() and hashlib.sha256(p.read_bytes()).hexdigest()==shot['sha256']
pages=sorted(P.glob('page-*.png'));assert len(pages)==len(reader.pages)
font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',15)
for start in range(0,len(pages),12):
 sheet=Image.new('RGB',(1200,245*((len(pages[start:start+12])+2)//3)),'#dce6ed');draw=ImageDraw.Draw(sheet)
 for i,path in enumerate(pages[start:start+12]):
  im=Image.open(path);im.thumbnail((390,215));x=i%3*400;y=i//3*245;sheet.paste(im,(x,y+25));draw.text((x+5,y+3),'PDF '+path.stem,font=font,fill='black')
 sheet.save(P/('pdf-contact-'+str(start)+'.png'))
print('PASS PDF',len(reader.pages),'pages / screenshots16 / blocked14 / HTTP checks',len(c),'/ files21 / non-target3806 unchanged / no JWT')
print('Text chars by page:',[len(p.extract_text()) for p in reader.pages])
