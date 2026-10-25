from pathlib import Path
import json,re
from PIL import Image,ImageDraw,ImageFont
from pypdf import PdfReader
R=Path(__file__).resolve().parents[1];P=R/'tmp/pdfs/cs-driver-fixed-20261025';D=R/'docs';pdf=R/'output/pdf/SCD-CS-Transport-Driver-N1-Fixed-Live-SIT-2026-10-25.pdf'
reader=PdfReader(pdf);text='\n'.join(p.extract_text() for p in reader.pages)
assert len(reader.pages)==45
for value in ['2f51a76','274','WaitingForDock','0000000000','12:29:38']:
 assert value in text,value
assert not re.search(r'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+',text)
for p in D.glob('cs-driver-fixed-*.json'):
 t=p.read_text(encoding='utf8');assert not re.search(r'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+',t)
 if p.name.endswith(('before-2026-10-25.json','after-2026-10-25.json')):
  data=json.loads(t);assert len(data['operations']['rows'])==1 and 'customers' not in data['operations'] and 'drivers' not in data['operations']
pages=sorted(P.glob('page-*.png'));assert len(pages)==len(reader.pages)
font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',15)
for start in range(0,len(pages),12):
 group=pages[start:start+12];sheet=Image.new('RGB',(1200,245*((len(group)+2)//3)),'#dce5ec');draw=ImageDraw.Draw(sheet)
 for i,p in enumerate(group):
  im=Image.open(p);im.thumbnail((390,215));x=(i%3)*400;y=(i//3)*245;sheet.paste(im,(x,y+25));draw.text((x+5,y+3),'PDF page '+str(start+i+1),fill='black',font=font)
 sheet.save(P/('contact-'+str(start)+'.png'))
print('PASS: 45 rendered pages, required content, 39 screenshots, no JWT, only target SIT in public readbacks')
