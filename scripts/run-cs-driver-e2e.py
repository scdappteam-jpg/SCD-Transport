"""New isolated CS -> Transport -> Driver -> WH3 SIT, with UI captures between phases."""
import json,base64,urllib.request,urllib.error,hashlib,sys,importlib.util
from pathlib import Path
from datetime import datetime,timezone
R=Path(__file__).resolve().parents[1];D=R/'docs';P=R/'.sit-meeting/cs-driver-e2e-20261025-N1';P.mkdir(parents=True,exist_ok=True)
H='SIT-CS-DRIVER-20261025-N1';INVOICE='SIT-CS-INV-20261025-N1';CONTACT='SIT CONTACT N1';PHONE='0000000000';PLATE='SIT-ONLY';BASE='https://scd-transport.onrender.com';RESULT=D/'cs-driver-e2e-results-2026-10-25.json'
T=json.loads((P/'session.json').read_text(encoding='utf8')) if (P/'session.json').exists() else {'admin':json.loads((R/'.sit-meeting/billed-20261025-L2/session.json').read_text(encoding='utf8'))['admin']};C=json.loads(RESULT.read_text(encoding='utf8'))['cases'] if RESULT.exists() else []
sp=importlib.util.spec_from_file_location('prior',R/'scripts/run-sit-l2-invoice.py');prior=importlib.util.module_from_spec(sp);sp.loader.exec_module(prior)
def write(p,v):p.write_text(json.dumps(v,ensure_ascii=False,indent=2),encoding='utf8')
def save():write(RESULT,{'house':H,'environment':BASE,'syntheticOnly':True,'physicalMovementVerified':False,'checkedAt':datetime.now(timezone.utc).isoformat(),'cases':C,'passed':sum(v['result']=='PASS' for v in C)})
def call(name,path,p=None,role='admin',status=200):
 if p:
  for k in ['houseNumber','houseNumbers','houses']:
   if k in p:assert p[k]==H if isinstance(p[k],str) else p[k]==[H],'Only new SIT target may change'
 headers={'Content-Type':'application/json','X-SCD-Mobile-Compact':'1','Authorization':'Bearer '+T[role]}
 try:
  with urllib.request.urlopen(urllib.request.Request(BASE+path,data=None if p is None else json.dumps(p).encode(),headers=headers),timeout=90) as r:code=r.status;data=json.load(r)
 except urllib.error.HTTPError as ex:code=ex.code;data=json.loads(ex.read())
 C.append({'name':name,'expected':status,'httpStatus':code,'message':data.get('error',''),'result':'PASS' if code==status else 'FAIL'});save();assert code==status,(name,code,data.get('error'));print(name,code,flush=True);return data
def timeline(name):
 r=call(name,'/api/jobs/timeline?houseNumber='+H);write(D/('cs-driver-e2e-'+name+'-2026-10-25.json'),r);return r
def prepare():
 if not(P/'baseline.json').exists():
  i=call('integrations-before','/api/integrations/status');assert not i['line']['configured'] and not i['email']['configured'],'Do not notify real people'
  b=call('baseline','/api/bootstrap');write(P/'baseline.json',b)
  for n,path in [('policy','/api/meeting/settings'),('dock','/api/dock/board'),('map','/api/warehouse/map')]:write(P/(n+'-before.json'),call(n+'-before',path))
 call('new-sit-does-not-exist','/api/jobs/timeline?houseNumber='+H,status=404)
 policy=json.loads((P/'policy-before.json').read_text(encoding='utf8'))['policy'];assert not policy['enabled'] and not policy['geofencingEnabled']
 call('create-unconfirmed-unassigned-sit','/api/admin/job',{'houseNumber':H,'customerName':'SIT ONLY CS DRIVER E2E 20261025 N1','pickupDate':'2026-10-25','pickupLocation':'SIT ONLY SYNTHETIC FACTORY - NO REAL MOVEMENT','pieceCount':3,'packageType':'Carton','destination':'WH3','routeType':'WH3','flightNo':'SIT200','flightTime':'2026-10-26T12:00:00Z','planSource':'SIT','evidenceChannel':'SIT simulation','evidenceNote':'SIT ONLY - test CS Invoice/contact/phone, assign existing SIT Driver, synthetic pickup and return WH3. No real customer contact or driving.'})
 call('scope-new-driver-safety-to-sit-only','/api/meeting/settings',{'enabled':False,'geofencingEnabled':False,'queueMinutes':policy['queueMinutes'],'sitHouseNumbers':[*policy['sitHouseNumbers'],H]})
 j=timeline('created')['job'];assert not j['csConfirmed'] and not j.get('driverId') and not j.get('cargoIssuedAt')
 T['grant']=call('temporary-api-grant','/api/auth/test-mode',{'action':'start'})['token']
 for role,user in [('driver','sit_ui_driver'),('cs','sit_ui_cs'),('transport','sit_ui_transport')]:T[role]=call('existing-sit-'+role,'/api/auth/test-mode',{'action':'switch','userId':user},'grant')['token']
 write(P/'session.json',T)
 from PIL import Image,ImageDraw,ImageFont
 font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',22)
 for name in ['product','cargo','door','inspector','receiver','release']:
  im=Image.new('RGB',(1150,290),'#fff1cf');draw=ImageDraw.Draw(im)
  for y,t in [(20,'SIT ONLY - SYNTHETIC EVIDENCE - NOT REAL CARGO'),(75,H),(130,name.upper()+' / CS TO DRIVER END-TO-END'),(190,'No real signature / GPS / pickup / delivery'),(245,'CS INVOICE: '+INVOICE)]:draw.text((20,y),t,fill='#900000',font=font)
  im.save(P/(name+'.png'))
def cs():
 j=timeline('cs-confirmed')['job'];assert j['csConfirmed'] and j['csInvoiceNo']==j['invoiceNo']==INVOICE;assert j['csContactName']==j['contactPerson']==CONTACT and j['csContactPhone']==j['pickupPhone']==PHONE;assert not j.get('driverId') and not j.get('cargoIssuedAt')
def dispatch():
 j=timeline('dispatched')['job'];assert j['driverId']=='sit_ui_driver' and j['vehiclePlate']==PLATE and j.get('cargoIssuedAt');assert j['csInvoiceNo']==INVOICE and j['csContactName']==CONTACT and j['csContactPhone']==PHONE and not j.get('routeStartedAt')
 r=call('driver-scope-assignment','/api/mobile/bootstrap',role='driver');jobs=r['dashboard']['jobs'];assert any(v['houseNumber']==H for v in jobs) and all(v['driverId']=='sit_ui_driver' for v in jobs);write(D/'cs-driver-e2e-driver-assignment-2026-10-25.json',{'job':next(v for v in jobs if v['houseNumber']==H),'viewer':'sit_ui_driver'})
def proof(n):return {'base64':base64.b64encode((P/(n+'.png')).read_bytes()).decode(),'mimeType':'image/png'}
def loaded():return {'houseNumber':H,'houseNumbers':[H],'gpsLat':13.1,'gpsLong':100.1,'simulation':True,'checklist':['date','customer','place','driver','house','package','inspector','receiver','route-log','destination'],'pickupItems':[{'houseNumber':H,'carton':'3','pickupDestination':'WH3'}],'pieceCount':3,'packageType':'Carton','pickupCase':'GeneralManual','inspectorName':'SIT SYNTHETIC INSPECTOR','receiverName':'SIT SYNTHETIC RECEIVER','productImages':[proof('product')],'cargoImages':[proof('cargo')],'doorClosedImages':[proof('door')],'signatureBase64':proof('inspector')['base64'],'receiverSignatureBase64':proof('receiver')['base64']}
def driver(stage):
 p={'houseNumber':H,'houseNumbers':[H],'gpsLat':13.1,'gpsLong':100.1,'simulation':True}
 route={'start':'route-start','checkin':'checkin','load':'load','complete':'complete','arrive':'arrive-wh3','release':'release-document'}[stage]
 if stage in ['load','complete']:p=loaded()
 if stage=='release':p['releaseDocumentFiles']=[proof('release')]
 call('driver-'+stage,'/api/pickup/'+route,p,'driver');timeline('driver-'+stage)
def verify():
 old=json.loads((P/'baseline.json').read_text(encoding='utf8'));new=call('after','/api/bootstrap');before=prior.business(old['dashboard']['jobs']);after=prior.business(new['dashboard']['jobs']);assert set(after)-set(before)=={H} and all(after[h]==v for h,v in before.items()),'Existing jobs must not change';j=next(v for v in new['dashboard']['jobs'] if v['houseNumber']==H);assert j['csInvoiceNo']==INVOICE and j['csContactName']==CONTACT and j['csContactPhone']==PHONE and j['driverId']=='sit_ui_driver' and j['vehiclePlate']==PLATE and j.get('arrivedWh3At') and j.get('releaseDocumentReceivedAt');assert not (j.get('inboundReceipt') or {}).get('confirmedAt') and not j.get('invoiceId'),'No WH receipt or financial Invoice created'
 assert old['users']==new['users'] and old['dashboard']['billing']==new['dashboard']['billing'];oldCustomers={v['id']:v for v in old['customers']};newCustomers={v['id']:v for v in new['customers']};assert all(newCustomers[k]==v for k,v in oldCustomers.items());assert len(set(newCustomers)-set(oldCustomers))==1
 policy=call('policy-after','/api/meeting/settings');oldPolicy=json.loads((P/'policy-before.json').read_text(encoding='utf8'));assert policy['geofenceLocations']==oldPolicy['geofenceLocations'] and {k:v for k,v in policy['policy'].items() if k not in ['updatedAt','updatedBy']}=={**{k:v for k,v in oldPolicy['policy'].items() if k not in ['updatedAt','updatedBy']},'sitHouseNumbers':[*oldPolicy['policy']['sitHouseNumbers'],H]}
 currentMap=call('warehouse-map-after','/api/warehouse/map');oldMap=json.loads((P/'map-before.json').read_text(encoding='utf8'));expectedMap=json.loads(json.dumps(oldMap));expectedMap['jobStats']['total']+=1;assert currentMap==expectedMap,'Only total job count may increase for the new SIT';dock=call('dock-after','/api/dock/board');oldDock=json.loads((P/'dock-before.json').read_text(encoding='utf8'));assert dock['bays']==oldDock['bays'] and [v for v in dock['queue'] if v['houseNumber']!=H]==oldDock['queue']
 final=timeline('final');opened=[]
 for f in final['files']:
  with urllib.request.urlopen(BASE+'/storage/'+H+'/'+f['fileId']+'.png',timeout=60) as r:raw=r.read();assert r.status==200 and raw.startswith(b'\x89PNG')
  opened.append({'fileId':f['fileId'],'fileType':f['fileType'],'httpStatus':200,'sha256':hashlib.sha256(raw).hexdigest()})
 write(D/'cs-driver-e2e-evidence-readback-2026-10-25.json',opened);write(D/'cs-driver-e2e-isolation-audit-2026-10-25.json',{'newHouse':H,'existingJobsVerified':len(before),'existingJobsChanged':0,'newJobs':1,'newSyntheticCustomerOnly':True,'beforeSha256':prior.prior.digest(before),'afterExistingSha256':prior.prior.digest({h:after[h] for h in before}),'existingInvoicesUnchanged':True,'usersUnchanged':True,'existingCustomerRecordsUnchanged':True,'geofencingEnabled':False,'globalSafetyEnabled':False,'onlyPolicyChange':'append named new SIT House to enforcement allowlist','warehouseMapAndRealDocksUnchanged':True,'physicalMovementVerified':False,'warehouseReceiptConfirmed':False,'noFinancialInvoiceCreated':True,'invoiceContactPhonePreserved':True,'newEvidenceFilesOpened':len(opened)})
def stop():call('revoke-api-grant','/api/auth/test-mode',{'action':'stop'},'grant')

def closed():call('stopped-driver-session-denied','/api/mobile/bootstrap',role='driver',status=401)
if __name__=='__main__':
 stage=sys.argv[1]
 if stage in ['start','checkin','load','complete','arrive','release']:driver(stage)
 else:{'prepare':prepare,'cs':cs,'dispatch':dispatch,'verify':verify,'stop':stop,'closed':closed}[stage]()
