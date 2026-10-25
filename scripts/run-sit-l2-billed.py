"""Draft -> Billed for one authorized SIT invoice; email endpoints prohibited."""
import json,urllib.request,urllib.error,hashlib,sys,importlib.util
from pathlib import Path
from datetime import datetime,timezone
R=Path(__file__).resolve().parents[1];P=R/'.sit-meeting/billed-20261025-L2';D=R/'docs';P.mkdir(parents=True,exist_ok=True)
BASE='https://scd-transport.onrender.com';H='SIT-MEETING-20261025-L2';INV='INV-2026-0001';RESULT=D/'sit-l2-billed-live-results-2026-10-25.json'
T=json.loads((P/'session.json').read_text(encoding='utf8')) if (P/'session.json').exists() else {'admin':json.loads((R/'.sit-meeting/invoice-address-20261025-L2/session.json').read_text(encoding='utf8'))['admin']};C=json.loads(RESULT.read_text(encoding='utf8'))['cases'] if RESULT.exists() else []
sp=importlib.util.spec_from_file_location('prior',R/'scripts/run-sit-l2-invoice.py');prior=importlib.util.module_from_spec(sp);sp.loader.exec_module(prior)
def write(p,v):p.write_text(json.dumps(v,ensure_ascii=False,indent=2),encoding='utf8')
def save():write(RESULT,{'environment':BASE,'house':H,'invoiceId':INV,'syntheticOnly':True,'checkedAt':datetime.now(timezone.utc).isoformat(),'emailEndpointCalled':False,'cases':C,'passed':sum(c['result']=='PASS' for c in C)})
def call(name,path,p=None,role='admin',status=200):
 assert path!='/api/billing/send-email','Never send/queue email'
 if p:
  if 'invoiceId' in p:assert p['invoiceId']==INV
  if 'houseNumber' in p:assert p['houseNumber']==H
 headers={'Content-Type':'application/json','X-SCD-Mobile-Compact':'1','Authorization':'Bearer '+T[role]}
 try:
  with urllib.request.urlopen(urllib.request.Request(BASE+path,data=None if p is None else json.dumps(p).encode(),headers=headers),timeout=90) as r:code=r.status;data=json.load(r)
 except urllib.error.HTTPError as e:code=e.code;data=json.loads(e.read())
 except TimeoutError:C.append({'name':name,'expected':status,'httpStatus':None,'result':'TIMEOUT','message':'Do not retry closing: read Invoice first'});save();raise
 C.append({'name':name,'expected':status,'httpStatus':code,'result':'PASS' if code==status else 'FAIL','message':data.get('error','')});save();assert code==status,(name,code,data.get('error'));print(name,code,flush=True);return data
def business(jobs):
 out=prior.business(jobs)
 for j in jobs:out[j['houseNumber']]['dueDate']=j.get('dueDate')
 return out
def prepare():
 assert not(P/'baseline.json').exists(),'Never replace baseline'
 integration=call('check-no-outbound-notifications','/api/integrations/status');assert not integration['line']['configured'] and not integration['email']['configured'],'Stop before any notification';write(D/'sit-l2-billed-notification-check-2026-10-25.json',{'lineConfigured':False,'emailConfigured':False,'sendEmailEndpointCalled':False})
 b=call('baseline','/api/bootstrap');write(P/'baseline.json',b);bill=next(i for i in b['dashboard']['billing'] if i['id']==INV);job=next(j for j in b['dashboard']['jobs'] if j['houseNumber']==H);assert bill['status']=='Draft' and bill['houseNumber']==H and bill['amount']==1000 and job['invoiceId']==INV and job['status']=='InvoiceDrafted' and job['inboundReceipt']['counts']=={'CTN':2};write(D/'sit-l2-billed-before-2026-10-25.json',{'bill':bill,'job':job})
 for n,path in [('policy','/api/meeting/settings'),('dock','/api/dock/board'),('map','/api/warehouse/map')]:write(P/(n+'-before.json'),call(n+'-before',path))
 with urllib.request.urlopen(BASE+bill['pdfUrl'],timeout=60) as r:raw=r.read();assert r.status==200
 (P/'document-before.html').write_bytes(raw)
 T['grant']=call('temporary-api-session','/api/auth/test-mode',{'action':'start'})['token']
 for role,user in [('driver','sit_ui_driver'),('transport','sit_ui_transport')]:T[role]=call('existing-'+role,'/api/auth/test-mode',{'action':'switch','userId':user},'grant')['token']
 write(P/'session.json',T)
 call('driver-cannot-mark-billed','/api/billing/mark-billed',{'invoiceId':INV},'driver',403);call('transport-cannot-mark-billed','/api/billing/mark-billed',{'invoiceId':INV},'transport',403)
def mark():
 # Use only if the actual web UI has not already closed this invoice.
 b=call('guard-before-single-close','/api/bootstrap');bill=next(v for v in b['dashboard']['billing'] if v['id']==INV);assert bill['status']=='Draft','Never repeat production close'
 r=call('close-sit-invoice-once','/api/billing/mark-billed',{'invoiceId':INV});write(D/'sit-l2-billed-close-2026-10-25.json',r['bill'])
def verify():
 # Read-only after closure: no POSTs, no attempted price/document changes.
 old=json.loads((P/'baseline.json').read_text(encoding='utf8'));new=call('after','/api/bootstrap');oldBill=next(v for v in old['dashboard']['billing'] if v['id']==INV);bill=next(v for v in new['dashboard']['billing'] if v['id']==INV);job=next(v for v in new['dashboard']['jobs'] if v['houseNumber']==H)
 assert bill['status']=='Billed' and bill.get('billedDate') and job['status']=='Billed' and job['billingStatus']=='Billed' and not job['readyForBilling'];assert job['dueDate']==bill['dueDate']
 assert {k:v for k,v in bill.items() if k not in ['status','billedDate']}=={k:v for k,v in oldBill.items() if k not in ['status','billedDate']},'Only status and billedDate may change'
 assert {v['id']:v for v in old['dashboard']['billing'] if v['id']!=INV}=={v['id']:v for v in new['dashboard']['billing'] if v['id']!=INV};assert len(old['dashboard']['billing'])==len(new['dashboard']['billing'])
 before=business(old['dashboard']['jobs']);after=business(new['dashboard']['jobs']);others={h:v for h,v in before.items() if h!=H};assert set(before)==set(after) and all(after[h]==v for h,v in others.items());assert {k:v for k,v in before[H].items() if k not in ['status','billingStatus','readyForBilling','dueDate']}=={k:v for k,v in after[H].items() if k not in ['status','billingStatus','readyForBilling','dueDate']}
 assert old['customers']==new['customers'] and old['users']==new['users']
 for n,path in [('policy','/api/meeting/settings'),('map','/api/warehouse/map')]:assert call(n+'-after',path)==json.loads((P/(n+'-before.json')).read_text(encoding='utf8'))
 oldDock=json.loads((P/'dock-before.json').read_text(encoding='utf8'));dock=call('dock-after','/api/dock/board');assert dock['bays']==oldDock['bays'] and dock['queue']==oldDock['queue'],'No dock movement expected'
 summary=call('filtered-billing-summary','/api/operations/control?query='+H);assert summary['billing']['count']==0 and summary['billing']['invoiceCount']==1 and summary['billing']['invoiceAmount']==1000;summary['customers']=[v for v in summary['customers'] if v['id']==bill['customerId']];summary['drivers']=[v for v in summary['drivers'] if v['id']=='sit_ui_driver'];write(D/'sit-l2-billed-summary-2026-10-25.json',summary)
 with urllib.request.urlopen(BASE+bill['pdfUrl'],timeout=60) as r:raw=r.read();assert r.status==200
 assert raw==(P/'document-before.html').read_bytes(),'Closing must not rewrite Invoice content'
 assert not bill.get('sentAt') and not bill.get('emailDeliveryStatus') and not bill.get('emailAttachments'),'No sent/queued mail metadata'
 write(D/'sit-l2-billed-final-2026-10-25.json',{'bill':bill,'job':job});write(D/'sit-l2-billed-isolation-audit-2026-10-25.json',{'target':H,'invoiceId':INV,'status':'Billed','amount':1000,'billedDate':bill['billedDate'],'nonTargetJobsVerified':len(others),'nonTargetJobsChanged':0,'beforeNonTargetSha256':prior.prior.digest(others),'afterNonTargetSha256':prior.prior.digest({h:after[h] for h in others}),'noInvoicesAddedOrRemoved':True,'otherInvoicesUnchanged':True,'targetInvoiceOnlyStatusAndBilledDateChanged':True,'customerUsersPolicyWarehouseUnchanged':True,'dockBaysAndQueuesUnchanged':True,'invoiceDocumentSha256':hashlib.sha256(raw).hexdigest(),'invoiceDocumentUnchanged':True,'noEmailEndpointCalled':True,'noEmailSentOrQueuedMetadata':True,'geofencingEnabled':False,'physicalPaymentVerified':False})
 print('Billed once; accounting, document and non-target audit passed',flush=True)
def stop():call('revoke-temporary-api-sessions','/api/auth/test-mode',{'action':'stop'},'grant')
if __name__=='__main__':{'prepare':prepare,'mark':mark,'verify':verify,'stop':stop}[sys.argv[1]]()
