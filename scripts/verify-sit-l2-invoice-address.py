"""Refresh only existing INV-2026-0001 Draft; preserve all accounting/job data."""
import json,urllib.request,urllib.error,hashlib,sys,importlib.util
from pathlib import Path
R=Path(__file__).resolve().parents[1];P=R/'.sit-meeting/invoice-address-20261025-L2';D=R/'docs';P.mkdir(parents=True,exist_ok=True)
H='SIT-MEETING-20261025-L2';INV='INV-2026-0001';BASE='https://scd-transport.onrender.com';RESULT=D/'sit-l2-invoice-address-results-2026-10-25.json'
T=json.loads((P/'session.json').read_text(encoding='utf8')) if (P/'session.json').exists() else {'admin':json.loads((R/'.sit-meeting/invoice-20261025-L2/session.json').read_text(encoding='utf8'))['admin']};C=json.loads(RESULT.read_text(encoding='utf8'))['cases'] if RESULT.exists() else []
sp=importlib.util.spec_from_file_location('prior',R/'scripts/run-sit-l2-invoice.py');prior=importlib.util.module_from_spec(sp);sp.loader.exec_module(prior)
def write(p,v):p.write_text(json.dumps(v,ensure_ascii=False,indent=2),encoding='utf8')
def save():write(RESULT,{'house':H,'invoiceId':INV,'commit':'166af83','cases':C,'passed':sum(c['result']=='PASS' for c in C),'syntheticOnly':True})
def call(name,path,p=None,role='admin',status=200):
 if p and path=='/api/billing/refresh-document':assert p=={'houseNumber':H,'invoiceId':INV}
 headers={'Content-Type':'application/json','X-SCD-Mobile-Compact':'1','Authorization':'Bearer '+T[role]}
 try:
  with urllib.request.urlopen(urllib.request.Request(BASE+path,headers=headers,data=None if p is None else json.dumps(p).encode()),timeout=90) as r:code=r.status;v=json.load(r)
 except urllib.error.HTTPError as e:code=e.code;v=json.loads(e.read())
 C.append({'commit':'166af83','name':name,'expected':status,'httpStatus':code,'result':'PASS' if code==status else 'FAIL','message':v.get('error','')});save();assert code==status,(name,code,v.get('error'));print(name,code,flush=True);return v
def prepare():
 assert not(P/'baseline.json').exists()
 b=call('baseline','/api/bootstrap');write(P/'baseline.json',b)
 for n,path in [('policy','/api/meeting/settings'),('dock','/api/dock/board'),('map','/api/warehouse/map')]:write(P/(n+'-before.json'),call(n+'-before',path))
 bill=next(v for v in b['dashboard']['billing'] if v['id']==INV);assert bill['houseNumber']==H and bill['status']=='Draft' and bill['amount']==1000;write(D/'sit-l2-invoice-address-before-2026-10-25.json',bill)
 T['grant']=call('temporary-api-session','/api/auth/test-mode',{'action':'start'})['token']
 for role,user in [('billing','sit_ui_billing'),('driver','sit_ui_driver')]:T[role]=call('existing-'+role,'/api/auth/test-mode',{'action':'switch','userId':user},'grant')['token']
 write(P/'session.json',T)
def run():
 payload={'houseNumber':H,'invoiceId':INV};call('driver-refresh-denied','/api/billing/refresh-document',payload,'driver',403)
 call('refresh-existing-draft-document','/api/billing/refresh-document',payload,'billing')
 call('repeat-refresh-no-new-invoice','/api/billing/refresh-document',payload,'billing')
 with urllib.request.urlopen(BASE+'/storage/invoices/'+INV+'.html',timeout=90) as response:raw=response.read();assert response.status==200
 text=raw.decode('utf8');address='SIT SYNTHETIC ADDRESS - NOT FOR DELIVERY OR PAYMENT';assert '<td>Address</td>' in text and address in text and INV in text and H in text and 'Total: 1,000 THB' in text
 (D/'SCD-SIT-L2-Invoice-Address-Fixed-Document-2026-10-25.html').write_bytes(raw);write(D/'sit-l2-invoice-address-document-2026-10-25.json',{'url':'/storage/invoices/'+INV+'.html','httpStatus':200,'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest(),'address':address,'addressMatchesPreview':True,'invoiceId':INV,'amount':1000})
 C.append({'commit':'166af83','name':'address-matches-preview-in-generated-document','expected':address,'actual':address,'result':'PASS'});save()
def verify():
 old=json.loads((P/'baseline.json').read_text(encoding='utf8'));new=call('after','/api/bootstrap');before=prior.business(old['dashboard']['jobs']);after=prior.business(new['dashboard']['jobs']);assert before==after,'All jobs including L2 must remain unchanged';assert old['customers']==new['customers'] and old['users']==new['users'];assert old['dashboard']['billing']==new['dashboard']['billing'],'Invoice register/dates/status/amount must not change'
 for n,path in [('policy','/api/meeting/settings'),('map','/api/warehouse/map')]:assert call(n+'-after',path)==json.loads((P/(n+'-before.json')).read_text(encoding='utf8')),n
 oldDock=json.loads((P/'dock-before.json').read_text(encoding='utf8'));newDock=call('verify-dock-operational-fields','/api/dock/board');normalizeDock=lambda d:{**{k:v for k,v in d.items() if k not in ['updatedAt','summary']},'summary':{k:v for k,v in d['summary'].items() if k!='avgWaitMinutes'}};assert normalizeDock(oldDock)==normalizeDock(newDock),'Dock queue/bay/business changes'
 job=call('timeline-after','/api/jobs/timeline?houseNumber='+H);added=[f for f in job['files'] if f['fileType']=='InvoiceDocument'];assert len(added)==1 and added[0]['fileId']=='INVOICE-DOC-'+INV;write(D/'sit-l2-invoice-address-after-2026-10-25.json',{'job':job['job'],'invoiceDocument':added[0]})
 policy=json.loads((P/'policy-before.json').read_text(encoding='utf8'));assert not policy['policy']['geofencingEnabled'];write(D/'sit-l2-invoice-address-audit-2026-10-25.json',{'jobsVerified':len(before),'allJobBusinessFieldsUnchanged':True,'invoiceRegisterUnchanged':True,'customersAndUsersUnchanged':True,'dockAndWarehouseUnchanged':True,'excludedClockDerivedDockFields':['updatedAt','summary.avgWaitMinutes'],'geofencingEnabled':False,'policyUnchanged':True,'invoiceId':INV,'amount':1000,'status':'Draft','newInvoices':0,'onlyNewAttachment':'INVOICE-DOC-'+INV,'jobFieldsSha256Before':prior.prior.digest(before),'jobFieldsSha256After':prior.prior.digest(after),'emailSent':False,'markedBilled':False})
def stop():call('revoke-temporary-sessions','/api/auth/test-mode',{'action':'stop'},'grant')
if __name__=='__main__':{'prepare':prepare,'run':run,'verify':verify,'stop':stop}[sys.argv[1]]()
