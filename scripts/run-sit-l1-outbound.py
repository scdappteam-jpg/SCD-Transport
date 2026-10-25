"""Production outbound SIT continuation: only existing L1 may be mutated."""
import json,base64,hashlib,urllib.request,urllib.error,sys
from pathlib import Path
from datetime import datetime,timezone
ROOT=Path(__file__).resolve().parents[1];PRIVATE=ROOT/'.sit-meeting/outbound-20261025-L1';OUT=ROOT/'docs';BASE='https://scd-transport.onrender.com'
H='SIT-MEETING-20261025-L1';MASTER='SIT-MASTER-20261025-L1';FLIGHT='SIT100';SESSION=PRIVATE/'session.json';RESULT=OUT/'sit-l1-outbound-results-2026-10-25.json';PRIVATE.mkdir(parents=True,exist_ok=True)
T=json.loads(SESSION.read_text(encoding='utf8')) if SESSION.exists() else {'admin':json.loads((ROOT/'.sit-meeting/live-20261025/session.json').read_text(encoding='utf8'))['admin']}
CASES=json.loads(RESULT.read_text(encoding='utf8'))['cases'] if RESULT.exists() else []
def write(p,v):p.write_text(json.dumps(v,ensure_ascii=False,indent=2),encoding='utf8')
def snapshot():write(RESULT,{'environment':BASE,'house':H,'syntheticMaster':MASTER,'flight':FLIGHT,'checkedAt':datetime.now(timezone.utc).isoformat(),'syntheticEvidenceOnly':True,'physicalMovementVerified':False,'cases':CASES,'passed':sum(c['result']=='PASS' for c in CASES)})
def req(path,p=None,t=None):
 if p:
  for key in ['houseNumber','houseNumbers','houses','expectedHouses']:
   if key in p:assert p[key]==H if isinstance(p[key],str) else p[key]==[H],('Refuse mutation outside L1',key)
  if 'master' in p:assert p['master']==MASTER and p.get('expectedHouses')==[H]
 headers={'Content-Type':'application/json','X-SCD-Mobile-Compact':'1'}
 if t or T.get('admin'):headers['Authorization']='Bearer '+(t or T['admin'])
 try:
  with urllib.request.urlopen(urllib.request.Request(BASE+path,data=None if p is None else json.dumps(p).encode(),headers=headers),timeout=90) as r:return r.status,json.load(r)
 except urllib.error.HTTPError as e:return e.code,json.loads(e.read())
def call(name,path,p=None,t=None,status=200):
 try:c,r=req(path,p,t)
 except TimeoutError:
  CASES.append({'name':name,'expected':status,'httpStatus':None,'message':'No response within 90 seconds; not retried. State read back separately.','result':'TIMEOUT'});snapshot()
  if path not in ['/api/outbound/aot-booking','/api/outbound/transfer-form'] or status!=200:raise
  code,current=req('/api/jobs/timeline?houseNumber='+H);j=current.get('job',{});assert code==200
  if path=='/api/outbound/aot-booking':confirmed=bool(j.get('aotApprovedAt' if p.get('approved') else 'aotBookedAt')) and j.get('aotVehiclePlate')==p.get('vehiclePlate')
  else:confirmed=bool(j.get('cargoTransferReturnedAt' if p.get('action')=='return' else 'cargoTransferIssuedAt'))
  assert confirmed,'Timed out mutation not confirmed; stop instead of retrying'
  write(OUT/('sit-l1-outbound-recovered-'+name+'-2026-10-25.json'),current)
  CASES.append({'name':'verified-readback-after-timeout-'+name,'expected':200,'httpStatus':code,'message':'Mutation persisted; original response failed and remains TIMEOUT','result':'PASS'});snapshot();return current
 CASES.append({'name':name,'expected':status,'httpStatus':c,'message':r.get('error',''),'result':'PASS' if c==status else 'FAIL'});snapshot();assert c==status,(name,c,r);return r
def timeline(name):
 r=call(name,'/api/jobs/timeline?houseNumber='+H);write(OUT/('sit-l1-outbound-'+name+'-2026-10-25.json'),r);return r

def business(jobs):
 fields=['id','houseNumber','hawbNumber','onhandNumber','mawbNumber','customerId','customerName','pieceCount','plannedPieceCount','packageType','invoiceNo','csInvoiceNo','csContactName','csContactPhone','csConfirmed','csRejected','status','driverId','vehiclePlate','driverRouteStatus','flightNo','flightTime','locationId','releasedLocationId','inboundReceipt','warehouseBoxes','warehousePallets','loadedAt','completedAt','arrivedWh3At','releaseDocumentReceivedAt','tagInspection','qaApproval','qaRequired','readyForBilling','invoiceId','outboundFoundAt','outboundPickedAt','eiApprovedAt','aotBookedAt','aotApprovedAt','aotVehiclePlate','aotDriverName','cargoTransferIssuedAt','cargoTransferReturnedAt','wh3LoadingStartedAt','releasedWh3At','goodsLoadedAt','queueReceivedAt','cargoReceivedAt','terminalArrivedAt','weighStartedAt','weighEndedAt','terminalMasterWeight','terminalMasterDimension','xrayStatus','xrayStartedAt','xrayCompletedAt','loadStartedAt','loadEndedAt','terminalClosedAt','loadingDetailUploaded']
 return {j['houseNumber']:{k:j.get(k) for k in fields} for j in jobs}
def digest(v):return hashlib.sha256(json.dumps(v,ensure_ascii=False,sort_keys=True).encode()).hexdigest()
def proof(name):return {'base64':base64.b64encode((PRIVATE/(name+'.png')).read_bytes()).decode(),'mimeType':'image/png'}
def terminal(stage,phase,**extra):return {'action':'terminal','master':MASTER,'flightNo':FLIGHT,'expectedHouses':[H],'houseNumbers':[H],'stage':stage,'phase':phase,'channel':'App','note':'SIT ONLY synthetic terminal event, no physical cargo',**extra}
def event(kind,**extra):return {'action':'transport-event','houseNumbers':[H],'event':kind,'channel':'App','reportedBy':'SIT UI Transport','note':'SIT ONLY synthetic outbound vehicle movement; no real truck',**extra}

def prepare():
 assert not (PRIVATE/'baseline.json').exists(),'Never overwrite the baseline for an existing SIT continuation'
 before=call('baseline','/api/bootstrap');write(PRIVATE/'baseline.json',business(before['dashboard']['jobs']))
 policy=call('policy-before','/api/meeting/settings');assert not policy['policy']['geofencingEnabled'] and not policy['policy']['enabled'] and H in policy['policy']['sitHouseNumbers'];write(PRIVATE/'policy-before.json',policy)
 write(PRIVATE/'users-before.json',call('users-before','/api/auth/users'));write(PRIVATE/'map-before.json',call('map-before','/api/warehouse/map'));write(PRIVATE/'dock-before.json',call('dock-before','/api/dock/board'))
 j=timeline('before')['job'];assert j['status']=='Stored' and j['inboundReceipt']['counts']=={'CTN':5} and j.get('qaApproval') and not j.get('readyForBilling')
 assert not any(x.get('mawbNumber')==MASTER for x in before['dashboard']['jobs']),'Synthetic Master already in use'
 T['grant']=call('open-api-test-session','/api/auth/test-mode',{'action':'start'})['token']
 for role,user in [('wh','sit_ui_wh'),('transport','sit_ui_transport'),('ei','sit_ui_ei'),('terminal','sit_ui_terminal'),('driver','sit_ui_driver')]:T[role]=call('use-existing-sit-'+role,'/api/auth/test-mode',{'action':'switch','userId':user},T['grant'])['token']
 write(SESSION,T)
 call('set-isolated-synthetic-master','/api/admin/job',{'houseNumber':H,'customerName':j['customerName'],'customerId':j['customerId'],'mawbNumber':MASTER,'flightNo':FLIGHT,'flightTime':j['flightTime'],'planSource':'SIT','evidenceNote':'SIT ONLY synthetic Master and outbound continuation. No physical shipment or real AOT booking.'})
 q=call('verify-qa-remains-approved','/api/warehouse/quality?query='+H);assert q['jobs'][0]['qaApproved'];print('Prepared isolated Master and roles; only L1 modified; Geofencing OFF')

def fixtures():
 from PIL import Image,ImageDraw,ImageFont
 font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',22)
 for name,label in [('dispatch','WH3 DISPATCH DOCUMENT CHECK'),('ei','SYNTHETIC EI SIGNED RELEASE'),('permit','SYNTHETIC CARGO TRANSFER PERMIT'),('vehicle','SYNTHETIC OUTBOUND VEHICLE / CLOSED DOOR'),('queue','SYNTHETIC TERMINAL QUEUE RECEIPT'),('arrival','SYNTHETIC TERMINAL CARGO RECEIPT'),('weigh','SYNTHETIC MASTER WEIGHT - 25 KG'),('xray','SYNTHETIC X-RAY PASSED'),('load','SYNTHETIC TERMINAL LOADING DETAIL'),('return','SYNTHETIC RETURNED SIGNED CARGO TRANSFER')]:
  im=Image.new('RGB',(1200,300),'#fff1cb');d=ImageDraw.Draw(im)
  for y,text in [(20,'SIT ONLY - SYNTHETIC EVIDENCE, NOT REAL CARGO'),(75,H),(130,label),(190,MASTER+' / SIT100'),(245,'No actual driving, AOT reservation, weight, screening or airline loading')]:d.text((20,y),text,fill='#8c1300',font=font)
  im.save(PRIVATE/(name+'.png'))
 print('Synthetic outbound evidence prepared; no physical events claimed')

def wh():
 w=T['wh'];call('picking-before-location-blocked','/api/outbound/picking',{'houseNumber':H},w,409)
 call('wrong-label-blocked','/api/outbound/confirm-location',{'houseNumber':H,'scannedHouse':'SIT-WRONG-LABEL'},w,409)
 call('confirm-correct-sit-location-label','/api/outbound/confirm-location',{'houseNumber':H,'scannedHouse':H},w)
 call('validate-outbound-documents','/api/outbound/validate',{'houseNumber':H,'terminalDocChecklist':['house_match','master_match','invoice_match']},w)
 call('pick-only-l1-free-virtual-sit-slot','/api/outbound/picking',{'houseNumber':H,'documentFiles':[proof('dispatch')],'note':'SIT ONLY release from virtual SITMEET25-01; 5 simulated CTN'},w)
 call('ei-without-evidence-blocked','/api/outbound/ei-approve',{'houseNumber':H},T['ei'],422)
 call('ei-release-with-synthetic-signature','/api/outbound/ei-approve',{'houseNumber':H,'imageBase64':proof('ei')['base64'],'mimeType':'image/png'},T['ei'])
 call('wh3-missing-document-checklist-blocked','/api/outbound/wh3-dispatch-check',{'houseNumber':H,'terminalDestination':'TG','checklist':[]},w,422)
 j=timeline('after-picking')['job'];checked=j['wh3Documents']['required']
 call('complete-wh3-document-checklist','/api/outbound/wh3-dispatch-check',{'houseNumber':H,'terminalDestination':'TG','checklist':checked,'evidenceFiles':[proof('dispatch')],'note':'SIT ONLY simulated original documents, not real airline documents'},w)
 timeline('after-wh-release');print('WH picking, EI and dispatch documents passed')

def dispatch():
 booking={'houseNumber':H,'terminalDestination':'TG','vehiclePlate':'SIT-OUT-L1','driverName':'SIT UI / Driver','vehicleType':'4W-SIT','vehicleModel':'SIT ONLY virtual outbound vehicle'}
 code,current=req('/api/jobs/timeline?houseNumber='+H);assert code==200
 if not current['job'].get('aotBookedAt'):
  call('aot-approval-before-booking-blocked','/api/outbound/aot-booking',{**booking,'approved':True},status=409)
  call('assign-synthetic-outbound-vehicle-and-book-internal-queue','/api/outbound/aot-booking',booking,T['transport'])
 else:assert current['job'].get('aotVehiclePlate')=='SIT-OUT-L1' and not current['job'].get('aotApprovedAt'),'Resume only the confirmed booked step'
 call('transport-cannot-approve-aot','/api/outbound/aot-booking',{**booking,'approved':True},T['transport'],403)
 call('admin-approves-only-sit-internal-aot','/api/outbound/aot-booking',{**booking,'approved':True})
 call('cargo-transfer-missing-permit-blocked','/api/outbound/transfer-form',{'action':'issue','houses':[H]},T['transport'],422)
 call('issue-synthetic-cargo-transfer','/api/outbound/transfer-form',{'action':'issue','houses':[H],'permitFiles':[proof('permit')],'transferDate':'2026-10-25','transferTime':'12:00','transferFrom':'WH3','transferTo':'TG','driverName':'SIT UI / Driver','vehiclePlate':'SIT-OUT-L1','vehicleType':'4W-SIT','releaseBy':'SIT WH Staff','eiBarcodeReference':H},T['transport'])
 call('start-synthetic-wh3-outbound-loading','/api/operations/control',event('wh3-load-start'),T['transport'])
 call('depart-wh3-without-photo-blocked','/api/operations/control',event('wh3-depart'),T['transport'],422)
 call('depart-wh3-with-synthetic-vehicle-photo','/api/operations/control',event('wh3-depart',proof=proof('vehicle')),T['transport'])
 timeline('after-departure');print('Outbound vehicle, internal AOT, Cargo Transfer and departure recorded only for SIT')

def terminal_flow():
 t=T['terminal'];call('weigh-before-terminal-arrival-blocked','/api/operations/control',terminal('weigh','start'),t,409)
 call('receive-synthetic-terminal-queue','/api/operations/control',terminal('queue','complete',proof=proof('queue')),t)
 call('receive-synthetic-cargo-at-terminal','/api/operations/control',terminal('arrival','complete',proof=proof('arrival')),t)
 call('load-before-xray-blocked','/api/operations/control',terminal('load','start'),t,409)
 call('start-master-weighing','/api/operations/control',terminal('weigh','start'),t)
 call('zero-weight-blocked','/api/operations/control',terminal('weigh','complete',weight=0,dimension='SIT',proof=proof('weigh')),t,422)
 call('complete-synthetic-master-weight-25kg','/api/operations/control',terminal('weigh','complete',weight=25,dimension='60 x 40 x 40 cm x 5 CTN - SIT ONLY',proof=proof('weigh')),t)
 r=call('generate-reference-master-weigh-slip','/api/operations/control?document=weigh-slip&master='+MASTER+'&flightNo='+FLIGHT,t=t);(OUT/'SCD-SIT-L1-Outbound-Weigh-Slip-2026-10-25.html').write_text(r['html'],encoding='utf8')
 call('start-synthetic-xray','/api/operations/control',terminal('xray','start'),t)
 call('xray-without-evidence-blocked','/api/operations/control',terminal('xray','complete',result='Passed'),t,422)
 call('complete-synthetic-xray-passed','/api/operations/control',terminal('xray','complete',result='Passed',proof=proof('xray')),t)
 timeline('after-xray');print('Terminal arrival, synthetic weight and X-Ray passed')

def close():
 t=T['terminal'];call('start-terminal-load','/api/operations/control',terminal('load','start'),t)
 call('close-without-loading-evidence-blocked','/api/operations/control',terminal('load','complete'),t,422)
 call('close-terminal-with-synthetic-loading-detail','/api/operations/control',terminal('load','complete',proof=proof('load')),t)
 call('return-synthetic-signed-cargo-transfer','/api/outbound/transfer-form',{'action':'return','houses':[H],'imageBase64':proof('return')['base64'],'mimeType':'image/png'},T['transport'])
 call('release-synthetic-vehicle-after-terminal-close','/api/operations/control',event('available'),T['transport'])
 call('repeated-terminal-close-blocked','/api/operations/control',terminal('load','complete',proof=proof('load')),t,409)
 r=timeline('final');j=r['job'];assert j['status']=='ReadyForBilling' and j['readyForBilling'] and j['terminalClosedAt'] and j['cargoTransferReturnedAt'] and not j.get('invoiceId');assert j['inboundReceipt']['counts']=={'CTN':5} and j['terminalMasterWeight']==25 and not j.get('terminalWeight') and j['driverRouteStatus']=='Available'
 summary=call('final-terminal-summary','/api/operations/control?query='+H);summary['drivers']=[v for v in summary.get('drivers',[]) if v['id']=='sit_ui_driver'];summary['customers']=[v for v in summary.get('customers',[]) if v['id']==j['customerId']];write(OUT/'sit-l1-outbound-summary-2026-10-25.json',summary)
 old=json.loads((OUT/'sit-l1-outbound-before-2026-10-25.json').read_text(encoding='utf8'));prior={f['fileId'] for f in old['files']};opened=[]
 for f in r['files']:
  if f['fileId'] in prior:continue
  with urllib.request.urlopen(urllib.request.Request(BASE+(f.get('url') or '/storage/'+H+'/'+f['fileId']+'.png'),headers={'Authorization':'Bearer '+T['admin']}),timeout=90) as response:data=response.read();assert response.status==200 and data.startswith(b'\x89PNG')
  fixture={'OutboundDocument':'dispatch','EISignProof':'ei','WH3PreDispatchEvidence':'dispatch','CargoTransferPermit':'permit','PreLoadPhoto':'vehicle','TerminalQueueEvidence':'queue','TerminalArrivalEvidence':'arrival','MasterWeightSlip':'weigh','MasterXRayEvidence':'xray','LoadingDetail':'load','CargoTransferReturned':'return'}[f['fileType']]
  assert hashlib.sha256(data).digest()==hashlib.sha256((PRIVATE/(fixture+'.png')).read_bytes()).digest(),'Evidence bytes must match the synthetic SIT fixture'
  CASES.append({'name':'open-sit-outbound-evidence-'+f['fileType'],'httpStatus':200,'expected':200,'result':'PASS'});opened.append({'fileType':f['fileType'],'fileId':f['fileId'],'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'httpStatus':200});snapshot()
 write(OUT/'sit-l1-outbound-evidence-readback-2026-10-25.json',opened);print('Terminal closed ReadyForBilling; Cargo Transfer returned; all new SIT evidence opens; no invoice issued')

def verify():
 before=json.loads((PRIVATE/'baseline.json').read_text(encoding='utf8'));after=business(call('post-test-baseline','/api/bootstrap')['dashboard']['jobs']);changed=[h for h in before if h!=H and before[h]!=after.get(h)];assert not changed,changed;assert set(after)==set(before)
 policy=call('verify-geofencing-still-off','/api/meeting/settings');original=json.loads((PRIVATE/'policy-before.json').read_text(encoding='utf8'));assert not policy['policy']['geofencingEnabled'] and not policy['policy']['enabled'] and policy['geofenceLocations']==original['geofenceLocations'] and policy['policy']==original['policy']
 users=call('verify-public-users-unchanged','/api/auth/users');assert users==json.loads((PRIVATE/'users-before.json').read_text(encoding='utf8'))
 dock=call('verify-real-docks-and-queues-unchanged','/api/dock/board');priorDock=json.loads((PRIVATE/'dock-before.json').read_text(encoding='utf8'));assert dock['bays']==priorDock['bays'] and dock['queue']==priorDock['queue']
 wm=call('verify-only-target-sit-slot-released','/api/warehouse/map');write(PRIVATE/'map-after.json',wm)
 priorMap=json.loads((PRIVATE/'map-before.json').read_text(encoding='utf8'))['map'];afterMap=wm['map']
 oldLocations={str(l['id']):l for l in priorMap.get('locations',[])};newLocations={str(l['id']):l for l in afterMap.get('locations',[])}
 assert set(oldLocations)==set(newLocations),'No location added or removed'
 changedLocations=[k for k in oldLocations if oldLocations[k]!=newLocations[k]]
 assert changedLocations and all(oldLocations[k].get('code',oldLocations[k]['id'])=='SITMEET25-01' for k in changedLocations),changedLocations
 for k in changedLocations:assert not any(o.get('houseNumber')==H for o in newLocations[k].get('occupiedBy',[]))
 for key in priorMap:
  if key not in ['locations','log']:assert afterMap.get(key)==priorMap[key],key

 old={h:j for h,j in before.items() if h!=H};new={h:after[h] for h in old}
 audit={'environment':BASE,'target':H,'syntheticMaster':MASTER,'existingJobs':len(before),'nonTargetJobsVerified':len(old),'nonTargetJobsChanged':changed,'noJobsAddedOrRemoved':True,'beforeNonTargetSha256':digest(old),'afterNonTargetSha256':digest(new),'geofencingEnabled':False,'globalSafetyEnabled':False,'geofenceLocationsUnchanged':True,'policyUnchanged':True,'publicUsersUnchanged':True,'realDocksAndQueuesUnchanged':True,'warehouseOnlyVirtualSitSlotChanged':True,'changedVirtualLocationIds':changedLocations,'invoicesIssued':0,'physicalMovementVerified':False}
 write(OUT/'sit-l1-outbound-isolation-audit-2026-10-25.json',audit);print(json.dumps(audit,ensure_ascii=False))

def stop():call('revoke-api-test-sessions','/api/auth/test-mode',{'action':'stop'},T['grant']);print('Temporary API test sessions revoked')
if __name__=='__main__':{'prepare':prepare,'fixtures':fixtures,'wh':wh,'dispatch':dispatch,'terminal':terminal_flow,'close':close,'verify':verify,'stop':stop}[sys.argv[1]]()
