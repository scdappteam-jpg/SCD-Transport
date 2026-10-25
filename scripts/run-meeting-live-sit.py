"""Authorized production SIT: only named synthetic Houses may be mutated.
Sessions and private baseline stay in ignored .sit-meeting; public report has no tokens.
"""
import json,base64,hashlib,urllib.request,urllib.error,sys,time
from pathlib import Path
from datetime import datetime,timezone
ROOT=Path(__file__).resolve().parents[1];PRIVATE=ROOT/'.sit-meeting/live-20261025';OUT=ROOT/'docs';BASE='https://scd-transport.onrender.com'
H='SIT-MEETING-20261025-L1';PAIR='SIT-MEETING-20261025-L2';DIRECT='SIT-MEETING-20261025-L3';HOUSES=[H,PAIR,DIRECT]
SESSION=PRIVATE/'session.json';RESULT=OUT/'meeting-live-sit-results-2026-10-25.json'
T=json.loads(SESSION.read_text(encoding='utf8'));CASES=json.loads(RESULT.read_text(encoding='utf8'))['cases'] if RESULT.exists() else []
def write(path,value):path.write_text(json.dumps(value,ensure_ascii=False,indent=2),encoding='utf8')
def snapshot():write(RESULT,{'environment':BASE,'checkedAt':datetime.now(timezone.utc).isoformat(),'houses':HOUSES,'syntheticEvidenceOnly':True,'physicalMovementVerified':False,'cases':CASES,'passed':sum(c['result']=='PASS' for c in CASES)})
def req(path,p=None,token=None):
 if p and ('houseNumber' in p or 'houseNumbers' in p):
  target=p.get('houseNumbers',[p.get('houseNumber')]);assert all(h in HOUSES for h in target),'Refuse mutation outside named SIT Houses'
 headers={'Content-Type':'application/json','X-SCD-Mobile-Compact':'1'}
 if token:headers['Authorization']='Bearer '+token
 try:
  with urllib.request.urlopen(urllib.request.Request(BASE+path,headers=headers,data=None if p is None else json.dumps(p).encode()),timeout=90) as r:return r.status,json.load(r)
 except urllib.error.HTTPError as e:return e.code,json.loads(e.read())
def call(name,path,p=None,token=None,status=200):
 c,r=req(path,p,token or T['admin']);CASES.append({'name':name,'httpStatus':c,'expected':status,'result':'PASS' if c==status else 'FAIL'});snapshot();assert c==status,(name,c,r);return r
def timeline(h):return call('Read SIT timeline '+h,'/api/jobs/timeline?houseNumber='+h)
def image(name):return {'base64':base64.b64encode((PRIVATE/(name+'.png')).read_bytes()).decode(),'mimeType':'image/png'}
def business(jobs):
 fields=['id','houseNumber','hawbNumber','onhandNumber','mawbNumber','customerName','pieceCount','plannedPieceCount','packageType','invoiceNo','csInvoiceNo','csContactName','csContactPhone','csConfirmed','csRejected','status','driverId','vehiclePlate','driverRouteStatus','flightNo','flightTime','locationId','inboundReceipt','warehouseBoxes','warehousePallets','loadedAt','completedAt','arrivedWh3At','releaseDocumentReceivedAt','tagInspection','qaApproval','qaRequired','readyForBilling','invoiceId']
 return {j['houseNumber']:{k:j.get(k) for k in fields} for j in jobs}
def digest(v):return hashlib.sha256(json.dumps(v,ensure_ascii=False,sort_keys=True).encode()).hexdigest()

def prepare():
 assert not (PRIVATE/'baseline.json').exists(),'Never overwrite an existing live SIT baseline; use a separately named new run'
 source=urllib.request.urlopen(BASE+'/legacy/meeting-workflows-ui.js',timeout=90).read().decode();assert 'meetingSitHouses' in source,'Wait for isolated SIT rollout deploy'
 grant=call('Open temporary Admin test-role session','/api/auth/test-mode',{'action':'start'})['token'];T['grant']=grant
 for key,user in [('driver','sit_ui_driver'),('wh','sit_ui_wh'),('qa','sit_ui_checkhouse')]:T[key]=call('Use existing SIT role '+key,'/api/auth/test-mode',{'action':'switch','userId':user},grant)['token']
 write(SESSION,T)
 before=call('Capture pre-test production snapshot','/api/bootstrap');write(PRIVATE/'baseline.json',business(before['dashboard']['jobs']))
 policy=call('Read production safety settings','/api/meeting/settings');assert not policy['policy']['enabled'] and not policy['policy']['geofencingEnabled'];write(PRIVATE/'policy-before.json',policy)
 write(PRIVATE/'users-before.json',call('Capture existing user roles','/api/auth/users'))
 dock=call('Capture pre-test dock state','/api/dock/board');write(PRIVATE/'dock-before.json',dock)
 for h in HOUSES:
  code,_=req('/api/jobs/timeline?houseNumber='+h,token=T['admin']);assert code==404,'SIT already exists: resume explicitly, never overwrite'
 for h,n in [(H,5),(PAIR,2)]:
  call('Create synthetic job '+h,'/api/admin/job',{'houseNumber':h,'customerName':'SIT ONLY MEETING SAFETY','source':'SIT ONLY - synthetic cargo; no physical movement','pickupLocation':'SIT ONLY synthetic factory','pickupDate':'2026-10-25','pieceCount':n,'packageType':'Carton','destination':'WH3','routeType':'WH3','driverId':'sit_ui_driver','vehiclePlate':'SIT-ONLY','flightNo':'SIT100','flightTime':'2026-10-26T12:00:00Z','planSource':'SIT','evidenceChannel':'SIT simulation','evidenceNote':'SIT ONLY - no real shipment, photos, signatures, GPS or driving. Do not merge with real Houses.'})
  call('CS confirms synthetic job '+h,'/api/jobs/cs-confirm',{'houseNumbers':[h],'invoiceNo':'SIT-INV-'+h,'contactName':'SIT SYNTHETIC CONTACT','contactPhone':'0000000000','evidenceChannel':'SIT simulation'})
  call('Issue synthetic Cargo '+h,'/api/admin/issue-cargo',{'houseNumber':h})
 call('Customer Direct synthetic front-desk intake','/api/warehouse/external-intake',{'houseNumber':DIRECT,'invoiceNo':'SIT-DIRECT-INV','shipmentSource':'CustomerDirect','receivedAtFrontDesk':True,'customerName':'SIT ONLY DIRECT - NO REAL CARGO','pieceCount':3,'packageType':'CTN'},T['wh'])
 call('Enable only named SIT Houses; global safety and Geofencing remain off','/api/meeting/settings',{'enabled':False,'geofencingEnabled':False,'queueMinutes':15,'sitHouseNumbers':HOUSES})
 print('Prepared three named SIT jobs; existing production jobs unchanged by setup; Geofencing OFF')

def fixtures():
 from PIL import Image,ImageDraw,ImageFont
 import zxingcpp,numpy as np
 font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',22)
 for name,label in [('product','SYNTHETIC CARGO'),('cargo','SYNTHETIC SIGNED CARGO'),('door','SYNTHETIC CLOSED DOOR'),('inspector','SYNTHETIC INSPECTOR SIGNATURE'),('receiver','SYNTHETIC RECEIVER SIGNATURE'),('release','SYNTHETIC RELEASE DOCUMENT')]:
  im=Image.new('RGB',(1100,270),'#fff3d1');d=ImageDraw.Draw(im)
  for y,text in [(20,'LIVE SYSTEM SIT - SYNTHETIC EVIDENCE ONLY'),(75,H),(130,label),(195,'No real cargo / person signature / driving / WH3 coordinates')]:d.text((20,y),text,fill='#900000',font=font)
  im.save(PRIVATE/(name+'.png'))
 for h,prefix in [(H,'single'),(PAIR,'pair')]:
  for i in range(4):
   raw=np.asarray(zxingcpp.write_barcode(zxingcpp.BarcodeFormat.Code128,h,width=1000,height=180));im=Image.new('RGB',(1150,320),'white');im.paste(Image.fromarray(raw).convert('RGB'),(50,10));d=ImageDraw.Draw(im);d.text((20,220),'SIT ONLY - '+('TAGGER' if i<2 else 'QA INDEPENDENT')+' CAPTURE '+str(i),fill='black',font=font);d.text((20,270),h,fill='black',font=font);im.save(PRIVATE/(prefix+str(i)+'.png'))
 print('Generated labeled synthetic evidence for named SIT jobs only')

def run():
 driver,wh,qa=T['driver'],T['wh'],T['qa'];p={'houseNumber':H,'houseNumbers':[H],'gpsLat':13.1,'gpsLong':100.1,'simulation':True}
 call('Driver cannot start without an attendance record when simulation omitted','/api/pickup/route-start',{**p,'simulation':False},driver,409)
 call('Synthetic SIT route starts without a real attendance/GPS record','/api/pickup/route-start',p,driver)
 call('Synthetic arrival at pickup','/api/pickup/checkin',p,driver)
 call('Missing photos and signatures blocks Load on production','/api/pickup/load',p,driver,422)
 loaded={**p,'checklist':['date','customer','place','driver','house','package','inspector','receiver','route-log','destination'],'pickupItems':[{'houseNumber':H,'carton':'5','pickupDestination':'WH3'}],'pieceCount':5,'packageType':'Carton','pickupCase':'GeneralManual','inspectorName':'SIT SYNTHETIC INSPECTOR','receiverName':'SIT SYNTHETIC RECEIVER','productImages':[image('product')],'cargoImages':[image('cargo')],'doorClosedImages':[image('door')],'signatureBase64':image('inspector')['base64'],'receiverSignatureBase64':image('receiver')['base64']}
 call('Missing Receiver signature blocks Load','/api/pickup/load',{**loaded,'receiverSignatureBase64':''},driver,422)
 call('Complete synthetic checklist and five evidence images permits Load','/api/pickup/load',loaded,driver)
 saved=timeline(H);assert len(saved['files'])==5
 call('Changed evidence after Load is refused','/api/pickup/complete',{**loaded,'receiverName':'CHANGED'},driver,409)
 call('Complete pickup with exact recorded synthetic evidence','/api/pickup/complete',loaded,driver)
 assert len(timeline(H)['files'])==5
 call('Synthetic arrival WH3','/api/pickup/arrive-wh3',p,driver)
 call('Missing release-document blocks confirmation','/api/pickup/release-document',p,driver,422)
 call('Synthetic release-document and server timestamp saved','/api/pickup/release-document',{**p,'releaseDocumentFiles':[image('release')]},driver)
 call('Document check','/api/inbound/document-check',{'houseNumber':H,'documentStatus':'Found','documentFiles':[image('release')]},wh)
 call('Open inbound','/api/inbound/open',{'houseNumber':H},wh)
 call('Identify Single House','/api/inbound/scan-house',{'houseNumber':H,'trackType':'Single','flightChanged':False},wh)
 call('Receive synthetic 5 CTN','/api/inbound/receive-counts',{'houseNumber':H,'counts':{'CTN':5},'expectedRevision':0,'requestId':'SIT-MEETING-L1-20261025'},wh)
 zones=call('Read warehouse map for isolated SIT location','/api/warehouse/map')
 # This is a virtual SIT location, never a real occupied warehouse slot.
 call('Create isolated virtual SIT storage location','/api/warehouse/zone/create',{'name':'SIT ONLY MEETING 20261025 - NOT REAL SPACE','prefix':'SITMEET25','rows':1,'cols':1})
 putaway={'houseNumber':H,'locationId':'SITMEET25-01','trackType':'Single','boxes':5,'pallets':0}
 call('QA hard-lock blocks putaway before any scan','/api/inbound/twin-scan',putaway,wh,409)
 call('Manual approved flag cannot bypass QA','/api/warehouse/quality/scan',{'houseNumber':H,'approved':True,'barcode':H},qa,422)
 tag={'houseNumber':H,'tagMode':'Single','expectedRevision':0,'scanImages':[image('single0')]}
 call('Production scanner registers actual Code128 decoding for synthetic tag','/api/warehouse/quality/tag',tag,wh)
 call('Tagging role cannot approve QA','/api/warehouse/quality/scan',{**tag,'expectedRevision':1},wh,403)
 call('Wrong House barcode refused','/api/warehouse/quality/scan',{'houseNumber':H,'expectedRevision':1,'scanImages':[image('pair2')]},qa,422)
 call('QA must not reuse tagger capture','/api/warehouse/quality/scan',{**tag,'expectedRevision':1},qa,409)
 call('Independent synthetic barcode image passes QA','/api/warehouse/quality/scan',{'houseNumber':H,'expectedRevision':1,'scanImages':[image('single2')]},qa)
 call('QA permits putaway into virtual SIT slot','/api/inbound/twin-scan',putaway,wh)
 call('Retag synthetic job invalidates its old QA','/api/warehouse/quality/tag',{**tag,'expectedRevision':1},wh)
 call('Relocation blocked again after retag','/api/inbound/move-location',{'houseNumber':H,'newLocationId':'SITMEET25-01'},wh,409)
 call('Current revision independent QA scan','/api/warehouse/quality/scan',{'houseNumber':H,'expectedRevision':2,'scanImages':[image('single3')]},qa)
 call('Current QA permits virtual relocation','/api/inbound/move-location',{'houseNumber':H,'newLocationId':'SITMEET25-01'},wh)
 pair={'houseNumber':PAIR,'tagMode':'Pair','expectedRevision':0}
 call('Pair refuses one image','/api/warehouse/quality/tag',{**pair,'scanImages':[image('pair0')]},wh,422)
 call('Pair refuses duplicate image','/api/warehouse/quality/tag',{**pair,'scanImages':[image('pair0'),image('pair0')]},wh,422)
 call('Pair registers two synthetic images decoded in production','/api/warehouse/quality/tag',{**pair,'scanImages':[image('pair0'),image('pair1')]},wh)
 call('Pair QA refuses one image','/api/warehouse/quality/scan',{**pair,'expectedRevision':1,'scanImages':[image('pair2')]},qa,422)
 call('Pair QA approves two independent images','/api/warehouse/quality/scan',{**pair,'expectedRevision':1,'scanImages':[image('pair2'),image('pair3')]},qa)
 d=call('Read Customer Direct matching data','/api/warehouse/quality?query='+DIRECT)['jobs'][0]
 call('Conflicting Invoice cannot overwrite synthetic Customer Direct','/api/warehouse/external-intake',{'houseNumber':DIRECT,'invoiceNo':'SIT-CONFLICT','expectedUpdatedAt':d['updatedAt']},wh,409)
 call('Queue only synthetic Customer Direct','/api/dock/queue',{'houseNumber':DIRECT,'arrived':True,'note':'SIT ONLY no truck physically present'},wh)
 board=call('Read dock suggestions without occupying real Dock','/api/dock/board');write(OUT/'meeting-live-dock-2026-10-25.json',{'queue':[e for e in board['queue'] if e['houseNumber'] in HOUSES],'note':'Suggestions only; no physical dock assigned'})
 for h,allowed in [(H,['D8','D9','D10','D11']),(DIRECT,['D7'])]:
  entry=next(e for e in board['queue'] if e['houseNumber']==h);assert not entry['suggestedBayId'] or entry['suggestedBayId'] in allowed,(h,entry)
 log=call('Driver Log shows recorded SIT times only','/api/driver/time-log?includeSIT=true&query='+H,token=driver);assert log['rows'][0]['times']['loadedAt'] and log['rows'][0]['times']['releaseDocumentReceivedAt'];write(OUT/'meeting-live-driver-log-2026-10-25.json',log)
 call('SIT Driver cannot read another driver log','/api/driver/time-log?driverId=u_driver_01',token=driver,status=403)
 report=call('Render Driver Log HTML from real production timestamps','/api/driver/time-log?includeSIT=true&format=html&query='+H);(OUT/'SCD-Driver-Time-Log-Live-SIT-2026-10-25.html').write_text(report['html'],encoding='utf8')
 final=timeline(H);assert final['job']['status']=='Stored' and final['job']['inboundReceipt']['counts']=={'CTN':5};write(OUT/'meeting-live-final-sit-2026-10-25.json',final)
 for f in final['files']:
  url=BASE+'/storage/'+H+'/'+f['fileId']+'.png'
  try:
   with urllib.request.urlopen(urllib.request.Request(url,headers={'Authorization':'Bearer '+T['admin']}),timeout=60) as r:data=r.read();assert r.status==200 and data.startswith(b'\x89PNG')
   CASES.append({'name':'Open saved SIT evidence '+f['fileType'],'httpStatus':200,'expected':200,'result':'PASS'});snapshot()
  except Exception:raise
 print('Live SIT workflow and barcode tests passed; '+str(len(CASES))+' checks recorded')

def verify():
 before=json.loads((PRIVATE/'baseline.json').read_text(encoding='utf8'));current=business(call('Read post-test production snapshot','/api/bootstrap')['dashboard']['jobs']);changed=[h for h,j in before.items() if current.get(h)!=j];new=sorted(set(current)-set(before));assert not changed,changed;assert set(new)==set(HOUSES),new
 policy=call('Verify global and Geofencing remain off','/api/meeting/settings');old=json.loads((PRIVATE/'policy-before.json').read_text(encoding='utf8'));assert not policy['policy']['enabled'] and not policy['policy']['geofencingEnabled'];assert digest(policy['geofenceLocations'])==digest(old['geofenceLocations'])
 users=call('Verify public user roster and roles unchanged','/api/auth/users');assert users==json.loads((PRIVATE/'users-before.json').read_text(encoding='utf8'))
 beforeDock=json.loads((PRIVATE/'dock-before.json').read_text(encoding='utf8'));afterDock=call('Verify no real dock occupied by SIT','/api/dock/board');assert beforeDock['bays']==afterDock['bays'];assert [e for e in afterDock['queue'] if e['houseNumber'] not in HOUSES]==beforeDock['queue']
 audit={'environment':BASE,'checkedAt':datetime.now(timezone.utc).isoformat(),'baselineExistingJobs':len(before),'existingJobsChanged':changed,'newSyntheticJobsOnly':new,'beforeBusinessSha256':digest(before),'afterExistingBusinessSha256':digest({h:current[h] for h in before}),'geofenceLocationsUnchanged':True,'geofencingEnabled':False,'globalSafetyEnabled':False,'realDockBaysUnchanged':True,'preexistingQueueUnchanged':True,'usersUnchanged':True,'scope':policy['policy']['sitHouseNumbers']}
 write(OUT/'meeting-live-isolation-audit-2026-10-25.json',audit);print(json.dumps(audit,ensure_ascii=False))

def stop():
 call('Revoke temporary API test-role sessions','/api/auth/test-mode',{'action':'stop'},T['grant']);print('Temporary API role sessions revoked; Admin normal session unchanged')
if __name__=='__main__':{'prepare':prepare,'fixtures':fixtures,'run':run,'verify':verify,'stop':stop}[sys.argv[1]]()
