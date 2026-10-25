"""Retest initial AOT booking on existing L2 only; private tokens never exported."""
import json,base64,hashlib,urllib.request,urllib.error,time,sys,importlib.util
from pathlib import Path
from datetime import datetime,timezone
ROOT=Path(__file__).resolve().parents[1];BASE='https://scd-transport.onrender.com';H='SIT-MEETING-20261025-L2'
P=ROOT/'.sit-meeting/booking-timeout-20261025-L2';P.mkdir(parents=True,exist_ok=True);D=ROOT/'docs';RESULT=D/'booking-timeout-fixed-live-2026-10-25.json'
T=json.loads((P/'session.json').read_text(encoding='utf8')) if (P/'session.json').exists() else {'admin':json.loads((ROOT/'.sit-meeting/live-20261025/session.json').read_text(encoding='utf8'))['admin']}
C=json.loads(RESULT.read_text(encoding='utf8'))['cases'] if RESULT.exists() else []
spec=importlib.util.spec_from_file_location('prior',ROOT/'scripts/run-sit-l1-outbound.py');prior=importlib.util.module_from_spec(spec);spec.loader.exec_module(prior)
def write(p,v):p.write_text(json.dumps(v,ensure_ascii=False,indent=2),encoding='utf8')
def save():write(RESULT,{'environment':BASE,'commit':'44fa954','house':H,'checkedAt':datetime.now(timezone.utc).isoformat(),'syntheticEvidenceOnly':True,'physicalMovementVerified':False,'cases':C,'passed':sum(c['result']=='PASS' for c in C)})
def call(name,path,p=None,role='admin',expected=200,booking=False):
 if p:
  for k in ['houseNumber','houseNumbers','houses']:
   if k in p:assert p[k]==H if isinstance(p[k],str) else p[k]==[H],'Refuse non-L2 mutation'
 started=time.perf_counter();headers={'Content-Type':'application/json','X-SCD-Mobile-Compact':'1','Authorization':'Bearer '+T[role]}
 try:
  with urllib.request.urlopen(urllib.request.Request(BASE+path,headers=headers,data=None if p is None else json.dumps(p).encode()),timeout=45 if booking else 90) as r:code=r.status;raw=r.read()
 except urllib.error.HTTPError as e:code=e.code;raw=e.read()
 except TimeoutError:
  C.append({'name':name,'httpStatus':None,'result':'TIMEOUT','durationMs':round((time.perf_counter()-started)*1000)});save();raise
 r=json.loads(raw);item={'name':name,'httpStatus':code,'expected':expected,'durationMs':round((time.perf_counter()-started)*1000),'responseBytes':len(raw),'idempotent':bool(r.get('idempotent')),'result':'PASS' if code==expected else 'FAIL'}
 if booking:item['containsDashboard']='dashboard' in r
 C.append(item);save();assert code==expected,(name,code,r.get('error'))
 if booking and code==200:assert 'dashboard' not in r and len(raw)<20000
 print(name,code,item['durationMs'],'ms',len(raw),'bytes',flush=True);return r
def timeline(name):
 r=call(name,'/api/jobs/timeline?houseNumber='+H);write(D/('booking-timeout-'+name+'-2026-10-25.json'),r);return r
def proof(name):return {'base64':base64.b64encode((P/(name+'.png')).read_bytes()).decode(),'mimeType':'image/png'}
def prepare():
 assert not (P/'baseline.json').exists(),'Preserve initial baseline'
 write(P/'baseline.json',prior.business(call('baseline','/api/bootstrap')['dashboard']['jobs']))
 for name,path in [('policy','/api/meeting/settings'),('users','/api/auth/users'),('dock','/api/dock/board'),('map','/api/warehouse/map')]:write(P/(name+'-before.json'),call(name+'-before',path))
 j=timeline('before')['job'];assert not j.get('aotBookedAt') and not j.get('loadedAt') and j['csConfirmed'] and j.get('qaApproval')
 policy=json.loads((P/'policy-before.json').read_text(encoding='utf8'));assert not policy['policy']['geofencingEnabled'] and not policy['policy']['enabled'] and H in policy['policy']['sitHouseNumbers']
 T['grant']=call('open-temporary-api-session','/api/auth/test-mode',{'action':'start'})['token']
 for role,user in [('driver','sit_ui_driver'),('wh','sit_ui_wh'),('ei','sit_ui_ei'),('transport','sit_ui_transport')]:T[role]=call('existing-sit-'+role,'/api/auth/test-mode',{'action':'switch','userId':user},'grant')['token']
 write(P/'session.json',T)
 from PIL import Image,ImageDraw,ImageFont
 font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',22)
 for name in ['product','cargo','door','inspector','receiver','release','dispatch','ei']:
  im=Image.new('RGB',(1100,270),'#fff3d1');draw=ImageDraw.Draw(im)
  for y,s in [(20,'SIT ONLY - SYNTHETIC EVIDENCE - NOT REAL CARGO'),(75,H),(130,name.upper()+' - BOOKING TIMEOUT RETEST'),(195,'No physical movement / real signature / WH3 coordinates')]:draw.text((20,y),s,fill='#900000',font=font)
  im.save(P/(name+'.png'))
def inbound():
 p={'houseNumber':H,'houseNumbers':[H],'gpsLat':13.1,'gpsLong':100.1,'simulation':True}
 call('synthetic-route-start','/api/pickup/route-start',p,'driver');call('synthetic-pickup-checkin','/api/pickup/checkin',p,'driver')
 loaded={**p,'checklist':['date','customer','place','driver','house','package','inspector','receiver','route-log','destination'],'pickupItems':[{'houseNumber':H,'carton':'2','pickupDestination':'WH3'}],'pieceCount':2,'packageType':'Carton','pickupCase':'GeneralManual','inspectorName':'SIT SYNTHETIC INSPECTOR','receiverName':'SIT SYNTHETIC RECEIVER','productImages':[proof('product')],'cargoImages':[proof('cargo')],'doorClosedImages':[proof('door')],'signatureBase64':proof('inspector')['base64'],'receiverSignatureBase64':proof('receiver')['base64']}
 call('synthetic-load','/api/pickup/load',loaded,'driver');call('synthetic-pickup-complete','/api/pickup/complete',loaded,'driver');call('synthetic-arrive-wh3','/api/pickup/arrive-wh3',p,'driver');call('synthetic-release-document','/api/pickup/release-document',{**p,'releaseDocumentFiles':[proof('release')]},'driver')
 for name,path,payload in [('document-check','document-check',{'documentStatus':'Found','documentFiles':[proof('release')]}),('open','open',{}),('identify-existing-pair','scan-house',{'trackType':'Pair','flightChanged':False}),('receive-2-synthetic-ctn','receive-counts',{'counts':{'CTN':2},'expectedRevision':0,'requestId':'SIT-BOOK-L2-20261025'}),('close-inbound','close',{'evidenceFiles':[proof('release')],'requestId':'SIT-BOOK-L2-CLOSE'})]:call(name,'/api/inbound/'+path,{'houseNumber':H,**payload},'wh')
 timeline('after-inbound')
def outbound():
 call('pick-l2-with-existing-qa','/api/outbound/picking',{'houseNumber':H,'documentFiles':[proof('dispatch')],'note':'SIT ONLY synthetic booking regression'},'wh')
 call('synthetic-ei-approve','/api/outbound/ei-approve',{'houseNumber':H,'imageBase64':proof('ei')['base64'],'mimeType':'image/png'},'ei')
 j=timeline('before-booking')['job'];call('complete-wh3-document-checklist','/api/outbound/wh3-dispatch-check',{'houseNumber':H,'terminalDestination':'TG','checklist':j['wh3Documents']['required'],'evidenceFiles':[proof('dispatch')],'note':'SIT ONLY synthetic documents'},'wh')
def book():
 booking={'houseNumber':H,'terminalDestination':'TG','vehiclePlate':'SIT-BOOK-L2','driverName':'SIT UI / Driver','vehicleType':'4W-SIT','vehicleModel':'SIT ONLY virtual vehicle'}
 before=timeline('unbooked')['job'];assert not before.get('aotBookedAt'),'Initial-booking test must be genuine'
 first=call('initial-booking','/api/outbound/aot-booking',booking,'transport',booking=True);assert first['job']['aotBookedAt'] and not first.get('idempotent')
 stamp=first['job']['aotBookedAt'];initial=timeline('initial-booking-saved');events=len(initial['activities'])
 for i in range(3):
  r=call('repeat-booking-'+str(i+1),'/api/outbound/aot-booking',booking,'transport',booking=True);assert r.get('idempotent') and r['job']['aotBookedAt']==stamp
 repeated=timeline('repeated-booking-saved');assert len(repeated['activities'])==events
 call('transport-cannot-approve','/api/outbound/aot-booking',{**booking,'approved':True},'transport',403,True)
 approved=call('initial-admin-approval','/api/outbound/aot-booking',{**booking,'approved':True},booking=True);approvedAt=approved['job']['aotApprovedAt'];assert approvedAt
 for i in range(2):
  r=call('repeat-approval-'+str(i+1),'/api/outbound/aot-booking',{**booking,'approved':True},booking=True);assert r.get('idempotent') and r['job']['aotApprovedAt']==approvedAt
 timeline('final');write(D/'booking-timeout-booking-integrity-2026-10-25.json',{'house':H,'aotBookedAt':stamp,'aotApprovedAt':approvedAt,'vehiclePlate':'SIT-BOOK-L2','repeatBookingCount':3,'repeatApprovalCount':2,'bookingReplayAddedActivities':0,'syntheticEvidenceOnly':True})
def verify():
 final=call('verify-booking-after-ui','/api/jobs/timeline?houseNumber='+H);saved=json.loads((D/'booking-timeout-final-2026-10-25.json').read_text(encoding='utf8'))
 for key in ['aotBookedAt','aotApprovedAt','aotVehiclePlate','aotDriverName','status']:assert final['job'].get(key)==saved['job'].get(key),key
 assert len(final['activities'])==len(saved['activities']),'UI replay must not add another booking event'
 before=json.loads((P/'baseline.json').read_text(encoding='utf8'));after=prior.business(call('post-test-baseline','/api/bootstrap')['dashboard']['jobs']);changed=[h for h in before if h!=H and before[h]!=after.get(h)];assert not changed and set(before)==set(after),changed
 policy=call('policy-after','/api/meeting/settings');assert policy==json.loads((P/'policy-before.json').read_text(encoding='utf8'))
 assert call('users-after','/api/auth/users')==json.loads((P/'users-before.json').read_text(encoding='utf8'))
 dock=call('dock-after','/api/dock/board');old=json.loads((P/'dock-before.json').read_text(encoding='utf8'));assert dock['bays']==old['bays'] and [v for v in dock['queue'] if v['houseNumber']!=H]==[v for v in old['queue'] if v['houseNumber']!=H]
 assert call('warehouse-map-after','/api/warehouse/map')==json.loads((P/'map-before.json').read_text(encoding='utf8'))
 selected={h:v for h,v in before.items() if h!=H};write(D/'booking-timeout-isolation-audit-2026-10-25.json',{'target':H,'existingJobs':len(before),'nonTargetJobsVerified':len(selected),'nonTargetJobsChanged':changed,'noJobsAddedOrRemoved':True,'beforeNonTargetSha256':prior.digest(selected),'afterNonTargetSha256':prior.digest({h:after[h] for h in selected}),'closedL1Unchanged':True,'policyUnchanged':True,'geofencingEnabled':False,'globalSafetyEnabled':False,'usersUnchanged':True,'realDockBaysAndNonTargetQueuesUnchanged':True,'warehouseMapUnchanged':True,'noPhysicalAotReservation':True})
 print('Isolation verified; L1 closed unchanged; Geofencing OFF',flush=True)
def stop():call('revoke-temporary-api-sessions','/api/auth/test-mode',{'action':'stop'},'grant')
if __name__=='__main__':{'prepare':prepare,'inbound':inbound,'outbound':outbound,'book':book,'verify':verify,'stop':stop}[sys.argv[1]]()
