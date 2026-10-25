"""Authorized existing N1-only WH3 SIT; private baseline/tokens, public target-only readbacks."""
import json,base64,sys,urllib.request,urllib.error,hashlib,math
from pathlib import Path
from datetime import datetime,timezone
R=Path(__file__).resolve().parents[1];D=R/'docs';P=R/'.sit-meeting/n1-wh3-20261025';P.mkdir(parents=True,exist_ok=True)
H='SIT-CS-DRIVER-20261025-N1';LOC='SITN1WH3-01';BASE='https://scd-transport.onrender.com';LEDGER=D/'n1-wh3-cases-2026-10-25.json'
T=json.loads((P/'session.json').read_text(encoding='utf8')) if (P/'session.json').exists() else {'admin':json.loads((R/'.sit-meeting/cs-driver-e2e-20261025-N1/session.json').read_text(encoding='utf8'))['admin']}
C=json.loads(LEDGER.read_text(encoding='utf8')) if LEDGER.exists() else []
def write(p,v):p.write_text(json.dumps(v,ensure_ascii=False,indent=2),encoding='utf8')
def call(name,path,p=None,role='admin',expected=200):
 if p:
  for key in ['houseNumber','houseNumbers']:
   if key in p:assert p[key]==(H if key=='houseNumber' else [H]),'Only named N1 may mutate'
  if path=='/api/warehouse/zone/create':assert p['prefix']=='SITN1WH3' and p['maxPallets']==0 and p['maxBoxes']==3
 try:
  with urllib.request.urlopen(urllib.request.Request(BASE+path,data=None if p is None else json.dumps(p).encode(),headers={'Authorization':'Bearer '+T[role],'Content-Type':'application/json','X-SCD-Mobile-Compact':'1'}),timeout=100) as r:code=r.status;data=json.load(r)
 except urllib.error.HTTPError as e:code=e.code;data=json.loads(e.read())
 C.append({'name':name,'status':code,'expected':expected,'result':'PASS' if code==expected else 'FAIL','error':data.get('error',''),'role':role,'at':datetime.now(timezone.utc).isoformat()});write(LEDGER,C);print(name,code,flush=True);assert code==expected,(name,code,data.get('error'));return data
def timeline(stage):
 t=call('Read '+stage,'/api/jobs/timeline?houseNumber='+H);write(D/('n1-wh3-'+stage+'-2026-10-25.json'),t);return t['job']
def proof(n):return {'mimeType':'image/png','base64':base64.b64encode((P/(n+'.png')).read_bytes()).decode()}
def prepare():
 assert not (P/'baseline.json').exists(),'Preserve baseline'
 baseline=call('Before','/api/bootstrap');write(P/'baseline.json',baseline)
 for n,url in [('policy','/api/meeting/settings'),('map','/api/warehouse/map'),('dock','/api/dock/board')]:write(P/(n+'-before.json'),call(n+' before',url))
 policy=json.loads((P/'policy-before.json').read_text(encoding='utf8'));assert not policy['policy']['enabled'] and not policy['policy']['geofencingEnabled'] and H in policy['policy']['sitHouseNumbers']
 i=call('Notifications preflight','/api/integrations/status');assert not i['line']['configured'] and not i['email']['configured']
 j=timeline('before');assert j['status']=='WaitingForDock' and j['pieceCount']=='3' and not j.get('inboundReceipt') and not j.get('tagInspection') and not j.get('qaApproval') and not j.get('locationId')
 T['grant']=call('Open temporary API roles','/api/auth/test-mode',{'action':'start'})['token']
 for key,user in [('wh','sit_ui_wh'),('qa','sit_ui_checkhouse')]:T[key]=call('Existing SIT '+key,'/api/auth/test-mode',{'action':'switch','userId':user},'grant')['token']
 write(P/'session.json',T)
 from PIL import Image,ImageDraw,ImageFont
 from reportlab.graphics.barcode.code128 import Code128
 font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',23)
 for name,value,label in [('tag',H,'TAGGING - SYNTHETIC CAPTURE A'),('qa',H,'QA - INDEPENDENT SYNTHETIC CAPTURE B'),('wrong','SIT-N1-NOT-TARGET','WRONG HOUSE NEGATIVE TEST ONLY')]:
  b=Code128(value,barWidth=3,barHeight=160,humanReadable=False);width=math.ceil(b.width)+40
  im=Image.new('RGB',(max(width,1120),340),'white');draw=ImageDraw.Draw(im)
  b.rect=lambda x,y,w,h:draw.rectangle((20+x,20,20+x+w-1,179),fill='black');b.draw()
  for y,s in [(205,'SIT ONLY - '+label),(250,value),(290,'No physical tag / no real cargo / no camera capture')]:draw.text((20,y),s,font=font,fill='#900000')
  im.save(P/(name+'.png'))
 for name,label in [('document','SYNTHETIC WH3 INBOUND DOCUMENT CHECK'),('close','SYNTHETIC WH3 RECEIPT AND PUTAWAY EVIDENCE')]:
  im=Image.new('RGB',(1200,320),'#fff2d0');draw=ImageDraw.Draw(im)
  for y,s in [(20,'SIT ONLY - NOT A REAL WAREHOUSE RECEIPT'),(80,H),(140,label),(200,'3 CTN / INVOICE SIT-CS-INV-20261025-N1'),(260,'Virtual SIT location only. No physical movement.')]:draw.text((20,y),s,font=font,fill='#900000')
  im.save(P/(name+'.png'))
def inbound(stage):
 p={'houseNumber':H,'simulation':True,'note':'SIT ONLY - synthetic WH3 receipt; no physical cargo or warehouse movement'}
 if stage=='documents':
  call('Cannot open before document check','/api/inbound/open',p,'wh',409)
  call('Check synthetic inbound document','/api/inbound/document-check',{**p,'documentStatus':'Found','documentFiles':[proof('document')]},'wh')
 elif stage=='open':call('Open inbound','/api/inbound/open',p,'wh')
 elif stage=='identify':call('Identify Single House unchanged Flight','/api/inbound/scan-house',{**p,'trackType':'Single','flightChanged':False},'wh')
 elif stage in ['partial','full']:
  j=timeline('before-'+stage);count=2 if stage=='partial' else 3
  call('Receive simulated '+str(count)+'/3 CTN','/api/inbound/receive-counts',{**p,'counts':{'CTN':count},'expectedRevision':(j.get('inboundReceipt') or {}).get('revision',0),'requestId':'SIT-N1-WH3-20261025-'+stage,'reason':'SIT ONLY simulated cumulative receipt'},'wh')
  if stage=='partial':call('Partial receipt blocks inbound close','/api/inbound/close',{**p,'requestId':'SIT-N1-WH3-block-partial','evidenceFiles':[proof('close')]},'wh',409)
 elif stage=='partial-check':
  j=timeline('partial');assert j['inboundReceipt']['counts']=={'CTN':2}
  call('Partial receipt blocks inbound close','/api/inbound/close',{**p,'requestId':'SIT-N1-WH3-block-partial','evidenceFiles':[proof('close')]},'wh',409)
 elif stage=='slot':
  m=call('Check isolated slot prefix','/api/warehouse/map');assert not any(z['prefix']=='SITN1WH3' for z in m['map']['zones'])
  call('Create virtual SIT-only slot','/api/warehouse/zone/create',{'name':'SIT ONLY N1 WH3 - VIRTUAL SPACE NO PHYSICAL CARGO','prefix':'SITN1WH3','rows':1,'cols':1,'defaultLevels':1,'maxPallets':0,'maxBoxes':3,'color':'#fff2d0'})
  call('QA lock before tagging','/api/inbound/twin-scan',{**p,'locationId':LOC,'trackType':'Single','boxes':3,'pallets':0},'wh',409)
 elif stage=='tag-check':
  j=timeline('tag-ui');assert j['tagInspection']['taggedBy']=='sit_ui_wh' and j['tagInspection']['revision']==1 and not j['qaVerified']
  call('QA lock after tagging','/api/inbound/twin-scan',{**p,'locationId':LOC,'trackType':'Single','boxes':3,'pallets':0},'wh',409)
  call('Tagger role cannot approve','/api/warehouse/quality/scan',{**p,'expectedRevision':1,'scanImages':[proof('qa')]},'wh',403)
  call('No manual QA flag','/api/warehouse/quality/scan',{**p,'approved':True,'barcode':H},'qa',422)
  call('Wrong House barcode refused','/api/warehouse/quality/scan',{**p,'expectedRevision':1,'scanImages':[proof('wrong')]},'qa',422)
  call('Tagging capture reuse refused','/api/warehouse/quality/scan',{**p,'expectedRevision':1,'scanImages':[proof('tag')]},'qa',409)
 elif stage=='qa-check':
  j=timeline('qa-ui');assert j['qaVerified'] and j['qaApproval']['approvedBy']=='sit_ui_checkhouse' and j['qaApproval']['approvedBy']!=j['tagInspection']['taggedBy']
 elif stage=='putaway':
  call('Putaway simulated 3 CTN in virtual SIT slot','/api/inbound/twin-scan',{**p,'locationId':LOC,'scanMode':'single','trackType':'Single','boxes':3,'pallets':0,'pieces':[H+'-CTN-'+str(i) for i in range(1,4)],'dimensionText':'SIT ONLY virtual putaway; dimensions not physically measured'},'wh')
 elif stage=='close-check':
  call('Missing close evidence blocked','/api/inbound/close',{**p,'requestId':'SIT-N1-close-no-proof','evidenceFiles':[]},'wh',422)
 elif stage=='close':
  call('Missing close evidence blocked','/api/inbound/close',{**p,'requestId':'SIT-N1-close-no-proof','evidenceFiles':[]},'wh',422)
  call('Close SIT inbound with synthetic proof','/api/inbound/close',{**p,'requestId':'SIT-N1-WH3-close-20261025','evidenceFiles':[proof('close')]},'wh')
 else:raise ValueError(stage)
 timeline(stage)
def verify():
 old=json.loads((P/'baseline.json').read_text(encoding='utf8'));new=call('After','/api/bootstrap')
 exclude={'inboundReceiptSummary','qaVerified','terminalProfile','wh3Documents','processTracking','flightTimeLabel','hoursToFlight','redFlag','canUploadLoadingDetail','flightRiskStatus','flightRiskLevel','effectiveAirportDueAt','flightRiskReasons','minutesToAirportDue','mustNotMissFlight','flightRisk','flightRiskMinutes','flightSla'}
 def business(d):return {j['houseNumber']:{k:v for k,v in j.items() if k not in exclude} for j in d['dashboard']['jobs'] if j['houseNumber']!=H}
 a,b=business(old),business(new);assert a==b,'Existing non-target jobs changed'
 assert old['users']==new['users'] and old['customers']==new['customers'] and old['dashboard']['billing']==new['dashboard']['billing']
 policy=call('Policy after','/api/meeting/settings');assert policy==json.loads((P/'policy-before.json').read_text(encoding='utf8'))
 m=call('Map after','/api/warehouse/map')['map'];prior=json.loads((P/'map-before.json').read_text(encoding='utf8'))['map']
 assert all(next(z for z in m['zones'] if z['id']==v['id'])==v for v in prior['zones']) and all(next(l for l in m['locations'] if l['id']==v['id'])==v for v in prior['locations'])
 added=[l for l in m['locations'] if l['id'] not in {v['id'] for v in prior['locations']}];assert len(added)==1 and added[0]['code']==LOC and [v['houseNumber'] for v in added[0]['occupiedBy']]==[H]
 dock=call('Dock after','/api/dock/board');oldDock=json.loads((P/'dock-before.json').read_text(encoding='utf8'));assert dock['bays']==oldDock['bays'] and [e for e in dock['queue'] if e['houseNumber']!=H]==[e for e in oldDock['queue'] if e['houseNumber']!=H]
 j=timeline('final');assert j['status']=='Stored' and j['locationId']==LOC and j['qaVerified'] and j['inboundClosedAt'] and j['inboundReceipt']['counts']=={'CTN':3} and j['inboundReceipt']['revision']==2 and j['warehouseBoxes']==3 and not j.get('warehousePallets')
 targetBefore=next(v for v in old['dashboard']['jobs'] if v['houseNumber']==H)
 preserved=['csInvoiceNo','csContactName','csContactPhone','driverId','vehiclePlate','routeStartedAt','checkInAt','loadedAt','completedAt','arrivedWh3At','releaseDocumentReceivedAt','flightNo','flightTime','mawbNumber','onhandNumber']
 assert all(j.get(k)==targetBefore.get(k) for k in preserved)
 t=json.loads((D/'n1-wh3-final-2026-10-25.json').read_text(encoding='utf8'));oldFiles=json.loads((D/'n1-wh3-before-2026-10-25.json').read_text(encoding='utf8'))['files'];assert len(t['files'])==10 and {f['fileId'] for f in oldFiles}<={f['fileId'] for f in t['files']}
 registered=call('Read registered file URLs','/api/operations/control?query='+H)['evidence'];urls={f['fileId']:f['url'] for f in registered};write(D/'n1-wh3-evidence-urls-2026-10-25.json',registered)
 opened=[]
 for f in t['files']:
  url=urls[f['fileId']];assert url.startswith('/storage/'+H+'/')
  with urllib.request.urlopen(BASE+url,timeout=60) as r:raw=r.read();assert r.status==200 and (raw.startswith(b'\x89PNG') or raw.startswith(b'\xff\xd8\xff'))
  fixture={'InboundDocument':'document','TaggingBarcodeEvidence':'tag','QABarcodeEvidence':'qa','InboundEvidence':'close'}.get(f['fileType'])
  if fixture and fixture!='close':assert hashlib.sha256(raw).hexdigest()==hashlib.sha256((P/(fixture+'.png')).read_bytes()).hexdigest()
  if fixture=='close':
   from PIL import Image,ImageChops,ImageStat
   from io import BytesIO
   source=Image.open(P/'close.png').convert('RGB');saved=Image.open(BytesIO(raw)).convert('RGB');assert source.size==saved.size;assert max(ImageStat.Stat(ImageChops.difference(source,saved)).mean)<5,'Saved JPEG must match the synthetic source'
  opened.append({**f,'url':url,'httpStatus':200,'sha256':hashlib.sha256(raw).hexdigest(),'syntheticSourceVerified':bool(fixture),'convertedToJPEGByUI':fixture=='close'})
 digest=lambda v:hashlib.sha256(json.dumps(v,sort_keys=True,ensure_ascii=False).encode()).hexdigest()
 write(D/'n1-wh3-audit-2026-10-25.json',{'house':H,'otherJobsVerified':len(a),'otherJobsChanged':0,'beforeHash':digest(a),'afterHash':digest(b),'usersCustomersInvoicesUnchanged':True,'existingZonesLocationsUnchanged':True,'realDockBaysUnchanged':True,'policyUnchanged':True,'geofencingEnabled':False,'status':j['status'],'virtualLocation':LOC,'syntheticReceiptCTN':3,'physicalReceiptVerified':False,'tagger':j['tagInspection']['taggedBy'],'qa':j['qaApproval']['approvedBy'],'qaVerified':True,'files':opened,'oldFilesPreserved':True,'driverAndCSAndFlightFieldsPreserved':True})
 print('PASS: Stored, QA independent, simulated 3 CTN, 10 files, non-target jobs unchanged',len(a))
def stop():call('Close API test roles','/api/auth/test-mode',{'action':'stop'},'grant')
def scanner():
 try:
  with urllib.request.urlopen(urllib.request.Request(BASE+'/api/scan-barcode',data=(P/'tag.png').read_bytes(),headers={'Content-Type':'image/png','Authorization':'Bearer '+T['wh']}),timeout=100) as r:result=json.load(r);assert r.status==200
 except urllib.error.HTTPError as e:
  result={'httpStatus':e.code,**json.loads(e.read())};write(D/'n1-wh3-barcode-preflight-error-2026-10-25.json',result);print(result);raise
 write(D/'n1-wh3-barcode-preflight-2026-10-25.json',result);assert H in result.get('barcodes',[]),result.get('barcodes');print('Scanner decoded synthetic Code128',H)
if __name__=='__main__':
 s=sys.argv[1]
 if s.startswith('observe-'):
  name=s.removeprefix('observe-');j=timeline(name)
  expected={'open':'InboundOpened','identify':'HouseIdentified','partial':'HouseIdentified','full':'HouseIdentified'}
  if name in expected:assert j['status']==expected[name],j['status']
  if name in ['partial','full']:assert j['inboundReceipt']['counts']=={'CTN':2 if name=='partial' else 3}
  if name in ['putaway','close']:assert j['status']=='Stored' and j['locationId']==LOC and j['warehouseBoxes']==3
  if name=='close':assert j['inboundClosedAt']
 elif s in ['prepare','verify','stop','scanner']:{'prepare':prepare,'verify':verify,'stop':stop,'scanner':scanner}[s]()
 else:inbound(s)
