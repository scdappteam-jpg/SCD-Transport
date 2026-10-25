"""Authorized L2-only invoice SIT. No email, no mark-billed, no real customer edits."""
import json,urllib.request,urllib.error,hashlib,time,sys,importlib.util
from pathlib import Path
from datetime import datetime,timezone
R=Path(__file__).resolve().parents[1];P=R/'.sit-meeting/invoice-20261025-L2';D=R/'docs';P.mkdir(parents=True,exist_ok=True)
BASE='https://scd-transport.onrender.com';H='SIT-MEETING-20261025-L2';CUSTOMER='SIT ONLY L2 INVOICE - NOT FOR PAYMENT';RESULT=D/'sit-l2-invoice-results-2026-10-25.json'
T=json.loads((P/'session.json').read_text(encoding='utf8')) if (P/'session.json').exists() else {'admin':json.loads((R/'.sit-meeting/outbound-20261025-L2/session.json').read_text(encoding='utf8'))['admin']}
C=json.loads(RESULT.read_text(encoding='utf8'))['cases'] if RESULT.exists() else []
spec=importlib.util.spec_from_file_location('prior',R/'scripts/run-sit-l2-outbound.py');prior=importlib.util.module_from_spec(spec);spec.loader.exec_module(prior)
def write(p,v):p.write_text(json.dumps(v,ensure_ascii=False,indent=2),encoding='utf8')
def save():write(RESULT,{'environment':BASE,'house':H,'checkedAt':datetime.now(timezone.utc).isoformat(),'syntheticBillingOnly':True,'emailSent':False,'markedBilled':False,'cases':C,'passed':sum(v['result']=='PASS' for v in C)})
def call(name,path,p=None,role='admin',status=200):
 assert path not in ['/api/billing/send-email','/api/billing/mark-billed'],'No real delivery or collection'
 if p:
  for k in ['houseNumber','houseNumbers','houses']:
   if k in p:assert p[k]==H if isinstance(p[k],str) else p[k]==[H],'Refuse non-L2 mutation'
  if path=='/api/customers/upsert':assert p.get('name')==CUSTOMER and p.get('houseNumber')==H and not p.get('id') and not p.get('billingEmail') and not p.get('taxId')
 start=time.perf_counter();headers={'Content-Type':'application/json','X-SCD-Mobile-Compact':'1','Authorization':'Bearer '+T[role]}
 try:
  with urllib.request.urlopen(urllib.request.Request(BASE+path,data=None if p is None else json.dumps(p).encode(),headers=headers),timeout=90) as response:code=response.status;data=json.load(response)
 except urllib.error.HTTPError as e:code=e.code;data=json.loads(e.read())
 except TimeoutError:
  C.append({'name':name,'expected':status,'httpStatus':None,'result':'TIMEOUT','message':'No automatic retry; read back before continuing'});save();raise
 C.append({'name':name,'expected':status,'httpStatus':code,'durationMs':round((time.perf_counter()-start)*1000),'result':'PASS' if code==status else 'FAIL','message':data.get('error','')});save();assert code==status,(name,code,data.get('error'));print(name,code,flush=True);return data
def timeline(name):
 r=call(name,'/api/jobs/timeline?houseNumber='+H);write(D/('sit-l2-invoice-'+name+'-2026-10-25.json'),r);return r
def business(jobs):
 base=prior.business(jobs)
 for j in jobs:
  for k in ['amount','transportCost','fuelCost','priceConfirmedAt','costConfirmedAt','priceConfirmedBy','billingStatus','billingReviewStatus','billingReviewNote','billingTripId','billingDocuments']:base[j['houseNumber']][k]=j.get(k)
 return base
def prepare():
 assert not(P/'baseline.json').exists(),'Preserve baseline'
 b=call('baseline','/api/bootstrap');write(P/'baseline.json',business(b['dashboard']['jobs']));write(P/'customers-before.json',b['customers'])
 assert not any(c['name']==CUSTOMER for c in b['customers']),'Dedicated customer already exists; stop before changing it'
 write(P/'invoices-before.json',call('invoice-register-before','/api/operations/control')['invoices'])
 for n,path in [('policy','/api/meeting/settings'),('users','/api/auth/users'),('dock','/api/dock/board'),('map','/api/warehouse/map')]:write(P/(n+'-before.json'),call(n+'-before',path))
 j=timeline('before')['job'];assert j['status']=='ReadyForBilling' and j['readyForBilling'] and j.get('cargoTransferReturnedAt') and not j.get('invoiceId') and j['inboundReceipt']['counts']=={'CTN':2}
 policy=json.loads((P/'policy-before.json').read_text(encoding='utf8'));assert not policy['policy']['geofencingEnabled'] and not policy['policy']['enabled']
 T['grant']=call('temporary-api-session','/api/auth/test-mode',{'action':'start'})['token']
 for role,user in [('billing','sit_ui_billing'),('driver','sit_ui_driver'),('transport','sit_ui_transport')]:T[role]=call('existing-sit-'+role,'/api/auth/test-mode',{'action':'switch','userId':user},'grant')['token']
 write(P/'session.json',T)
def setup():
 call('driver-cannot-review-billing','/api/billing/review',{'houseNumber':H,'status':'Reviewed'},'driver',403)
 call('invoice-before-review-blocked','/api/billing/generate',{'houseNumber':H},'billing',409)
 call('force-draft-cannot-bypass-review','/api/billing/generate',{'houseNumber':H,'forceDraft':True},'billing',409)
 customer=call('dedicated-synthetic-customer','/api/customers/upsert',{'name':CUSTOMER,'houseNumber':H,'billingEmail':'','taxId':'','phone':'','address':'SIT SYNTHETIC ADDRESS - NOT FOR DELIVERY OR PAYMENT','creditTerm':0},'billing')['customer'];write(D/'sit-l2-invoice-synthetic-customer-2026-10-25.json',customer)
 call('transport-cannot-set-price','/api/operations/control',{'action':'price','houseNumbers':[H],'amount':1000,'cost':700},'transport',403)
 call('negative-price-blocked','/api/operations/control',{'action':'price','houseNumbers':[H],'amount':-1,'cost':700},'billing',422)
 call('confirm-synthetic-price-and-cost','/api/operations/control',{'action':'price','houseNumbers':[H],'amount':1000,'cost':700,'fuelCost':200,'note':'SIT ONLY - 1000 THB synthetic revenue / 700 THB total synthetic cost, includes 200 fuel; NOT FOR PAYMENT','channel':'App'},'billing')
 timeline('priced')
def review():
 r=call('review-all-sit-documents','/api/billing/review',{'houseNumber':H,'status':'Reviewed','note':'SIT ONLY - synthetic documents, 1000 THB test invoice, NOT FOR PAYMENT. No email or collection.'},'billing');assert r['docs']['ready'] and not r['docs']['blockers'];write(D/'sit-l2-invoice-reviewed-documents-2026-10-25.json',r['docs']);timeline('reviewed')
def generate():
 j=timeline('before-generate')['job'];assert not j.get('invoiceId') and j.get('billingReviewStatus')=='Reviewed'
 call('driver-cannot-generate-invoice','/api/billing/generate',{'houseNumber':H},'driver',403)
 r=call('generate-sit-invoice-draft','/api/billing/generate',{'houseNumber':H},'billing');bill=r['bill'];assert bill['houseNumber']==H and bill['amount']==1000 and bill['status']=='Draft' and bill['customerName']==CUSTOMER and not bill['billingEmail'];write(D/'sit-l2-invoice-draft-2026-10-25.json',bill)
 call('duplicate-invoice-blocked','/api/billing/generate',{'houseNumber':H},'billing',409)
 call('price-change-after-invoice-blocked','/api/operations/control',{'action':'price','houseNumbers':[H],'amount':2000,'cost':700},'billing',409)
 j=timeline('final')['job'];assert j['invoiceId']==bill['id'] and j['status']=='InvoiceDrafted' and j['billingStatus']=='InvoiceDrafted' and j['inboundReceipt']['counts']=={'CTN':2} and j['driverRouteStatus']=='Available'
 with urllib.request.urlopen(BASE+bill['pdfUrl'],timeout=90) as response:raw=response.read();assert response.status==200 and 'text/html' in response.headers.get('Content-Type','')
 text=raw.decode('utf8');assert H in text and CUSTOMER in text and '1,000 THB' in text and 'NOT FOR PAYMENT' in text
 (D/'SCD-SIT-L2-Invoice-Document-2026-10-25.html').write_bytes(raw);write(D/'sit-l2-invoice-document-readback-2026-10-25.json',{'url':bill['pdfUrl'],'httpStatus':200,'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest(),'format':'HTML (pdfUrl field; not a PDF)','house':H,'invoiceId':bill['id'],'amount':1000,'syntheticOnly':True})
 C.append({'name':'open-generated-invoice-document','expected':200,'httpStatus':200,'result':'PASS'})
 address='SIT SYNTHETIC ADDRESS - NOT FOR DELIVERY OR PAYMENT'
 C.append({'name':'invoice-address-matches-preview','expected':'Customer address shown, as in Preview','actual':address if address in text else 'Address not rendered','httpStatus':200,'result':'PASS' if address in text else 'FAIL','message':'Compare the saved customer address in Preview with generated Invoice HTML.'});save()
def verify():
 b=json.loads((P/'baseline.json').read_text(encoding='utf8'));fresh=call('post-test-baseline','/api/bootstrap');a=business(fresh['dashboard']['jobs']);changed=[h for h in b if h!=H and b[h]!=a.get(h)];assert not changed and set(a)==set(b),changed
 beforeCustomers=json.loads((P/'customers-before.json').read_text(encoding='utf8'));old={c['id']:c for c in beforeCustomers};now={c['id']:c for c in fresh['customers']};assert all(now.get(k)==v for k,v in old.items());new=[v for k,v in now.items() if k not in old];assert len(new)==1 and new[0]['name']==CUSTOMER and a[H]['customerId']==new[0]['id']
 oldBills=json.loads((P/'invoices-before.json').read_text(encoding='utf8'));summary=call('invoice-register-after','/api/operations/control');oldIds={v['id'] for v in oldBills};assert {v['id']:v for v in summary['invoices'] if v['id'] in oldIds}=={v['id']:v for v in oldBills};added=[v for v in summary['invoices'] if v['id'] not in oldIds];bill=json.loads((D/'sit-l2-invoice-draft-2026-10-25.json').read_text(encoding='utf8'));assert len(added)==1 and added[0]['id']==bill['id']
 for n,path in [('policy','/api/meeting/settings'),('users','/api/auth/users'),('map','/api/warehouse/map')]:assert call(n+'-after',path)==json.loads((P/(n+'-before.json')).read_text(encoding='utf8')),n
 dock=call('verify-real-dock-and-other-queues','/api/dock/board');oldDock=json.loads((P/'dock-before.json').read_text(encoding='utf8'));assert dock['bays']==oldDock['bays'];assert [v for v in dock['queue'] if v['houseNumber']!=H]==[v for v in oldDock['queue'] if v['houseNumber']!=H];oldTarget=next(v for v in oldDock['queue'] if v['houseNumber']==H);newTarget=next(v for v in dock['queue'] if v['houseNumber']==H);assert {k:v for k,v in oldTarget.items() if k!='customerName'}=={k:v for k,v in newTarget.items() if k!='customerName'} and newTarget['customerName']==CUSTOMER
 for k in ['mawbNumber','flightNo','flightTime','inboundReceipt','qaApproval','tagInspection','aotBookedAt','aotApprovedAt','terminalClosedAt','cargoTransferReturnedAt','driverRouteStatus']:assert b[H].get(k)==a[H].get(k),k
 filtered=call('sit-finance-summary','/api/operations/control?query='+H);filtered['drivers']=[v for v in filtered['drivers'] if v['id']=='sit_ui_driver'];filtered['customers']=new;assert filtered['billing']['invoiceCount']==1 and filtered['billing']['invoiceAmount']==1000 and filtered['billing']['invoiceMargin']==300;write(D/'sit-l2-invoice-finance-summary-2026-10-25.json',filtered)
 rest={h:v for h,v in b.items() if h!=H};write(D/'sit-l2-invoice-isolation-audit-2026-10-25.json',{'target':H,'existingJobs':len(b),'nonTargetJobsVerified':len(rest),'nonTargetJobsChanged':changed,'noJobsAddedOrRemoved':True,'beforeNonTargetSha256':prior.digest(rest),'afterNonTargetSha256':prior.digest({h:a[h] for h in rest}),'existingCustomersUnchanged':True,'newSyntheticCustomerOnly':new[0]['id'],'existingInvoiceRegisterUnchanged':True,'newInvoices':1,'newInvoiceId':bill['id'],'newInvoiceStatus':'Draft','l2ReceiptQaAndOutboundTimesUnchanged':True,'geofencingEnabled':False,'policyUsersAndMapUnchanged':True,'realDockBaysAndNonTargetQueuesUnchanged':True,'sitQueueOnlyCustomerNameChanged':True,'emailSent':False,'markedBilled':False,'syntheticRevenue':1000,'syntheticTotalCost':700,'syntheticMargin':300});print('Isolation, pricing and invoice register verified',flush=True)
def stop():call('revoke-temporary-api-sessions','/api/auth/test-mode',{'action':'stop'},'grant')
if __name__=='__main__':{'prepare':prepare,'setup':setup,'review':review,'generate':generate,'verify':verify,'stop':stop}[sys.argv[1]]()
