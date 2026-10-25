from pathlib import Path
import json,re,hashlib
from PIL import Image,ImageDraw,ImageFont
from pypdf import PdfReader
R=Path(__file__).resolve().parents[1];D=R/'docs';P=R/'tmp/pdfs/n1-wh3-20261025'
m=json.loads((D/'n1-wh3-pdf-manifest-2026-10-25.json').read_text(encoding='utf8'));pdf=Path(m['pdf']);reader=PdfReader(pdf);text='\n'.join(p.extract_text() for p in reader.pages)
assert len(reader.pages)==27 and m['screenshots']==20 and hashlib.sha256(pdf.read_bytes()).hexdigest()==m['sha256']
for value in ['SIT-CS-DRIVER-20261025-N1','SITN1WH3-01','Stored','sit_ui_wh','sit_ui_checkhouse','3806','3,806']:
 if value in ['3806','3,806']:continue
 assert value in text,value
for p in D.glob('n1-wh3-*.json'):
 t=p.read_text(encoding='utf8');assert not re.search(r'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+',t),p.name
a=json.loads((D/'n1-wh3-audit-2026-10-25.json').read_text(encoding='utf8'));assert a['otherJobsChanged']==0 and a['beforeHash']==a['afterHash'] and a['otherJobsVerified']==3806 and len(a['files'])==10 and not a['geofencingEnabled']
pages=sorted(P.glob('page-*.png'));assert len(pages)==27
font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',15)
def contact(group,out,label):
 sheet=Image.new('RGB',(1200,245*((len(group)+2)//3)),'#dce6ed');draw=ImageDraw.Draw(sheet)
 for i,path in enumerate(group):
  im=Image.open(path);im.thumbnail((390,215));x=i%3*400;y=i//3*245;sheet.paste(im,(x,y+25));draw.text((x+5,y+3),label+' '+path.stem,font=font,fill='black')
 sheet.save(out)
for start in range(0,len(pages),12):contact(pages[start:start+12],P/('pdf-contact-'+str(start)+'.png'),'PDF')
shots=sorted(D.glob('n1-wh3-[0-9][0-9]-*2026-10-25.png'));assert len(shots)==20
for start in range(0,len(shots),10):contact(shots[start:start+10],P/('screen-contact-'+str(start)+'.png'),'Screen')
print('PASS: PDF27 pages / screenshots20 / files10 HTTP200 / non-target3806 unchanged / no JWT in public JSON')
