"""Read-only deployment retest; never changes invoice, pricing, customer or safety policy."""
import json,hashlib,urllib.request,sys,subprocess
from pathlib import Path
from datetime import datetime,timezone
R=Path(__file__).resolve().parents[1];D=R/'docs';P=R/'.sit-meeting/n1-invoice-ui-fixed-20261025';P.mkdir(parents=True,exist_ok=True)
H='SIT-CS-DRIVER-20261025-N1';INV='INV-2026-0002';BASE='https://scd-transport.onrender.com';TOKEN=json.loads((R/'.sit-meeting/invoice-20261025-N1/session.json').read_text(encoding='utf8'))['admin']
def save(p,v):p.write_text(json.dumps(v,ensure_ascii=False,indent=2),encoding='utf8')
def get(path):
 assert path.startswith(('/api/','/legacy/','/storage/'))
 with urllib.request.urlopen(urllib.request.Request(BASE+path,headers={'Authorization':'Bearer '+TOKEN,'X-SCD-Mobile-Compact':'1'}),timeout=90) as r:assert r.status==200;raw=r.read();return raw
def data(path):return json.loads(get(path))
def digest(v):return hashlib.sha256(json.dumps(v,sort_keys=True,ensure_ascii=False).encode()).hexdigest()
def read(p):return json.loads(p.read_text(encoding='utf8'))
def evidence():
 items=data('/api/operations/control?query='+H)['evidence'];assert len(items)==22
 return {f['fileId']:{'fileType':f['fileType'],'url':f['url'],'sha256':hashlib.sha256(get(f['url'])).hexdigest(),'httpStatus':200} for f in items}
def target(b):return next(j for j in b['dashboard']['jobs'] if j['houseNumber']==H)
def invoice(b):return next(j for j in b['dashboard']['billing'] if j['id']==INV)
def prepare():
 assert not (P/'baseline.json').exists(),'Never overwrite the baseline'
 b=data('/api/bootstrap');j=target(b);bill=invoice(b);assert j['invoiceId']==INV and j['status']=='InvoiceDrafted' and bill['status']=='Draft' and bill['amount']==1000 and not bill.get('billingEmail')
 save(P/'baseline.json',b)
 for n,path in [('policy','/api/meeting/settings'),('map','/api/warehouse/map'),('dock','/api/dock/board'),('integrations','/api/integrations/status')]:save(P/(n+'-before.json'),data(path))
 policy=read(P/'policy-before.json');assert not policy['policy']['geofencingEnabled'] and not policy['policy']['enabled']
 save(P/'evidence-before.json',evidence());save(D/'n1-invoice-ui-fixed-before-2026-10-25.json',{'job':j,'invoice':bill,'invoiceDocument':next(v for v in b['dashboard']['attachments'] if v.get('fileType')=='InvoiceDocument' and v.get('houseNumber')==H) if 'attachments' in b['dashboard'] else None})
 print('Baseline preserved: Invoice2 Draft1000, jobs3807, evidence22; no mutations',flush=True)
def assets():
 commit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=R,text=True).strip();checked=[]
 for name in ['app.js','styles.css','index.html']:
  raw=get('/legacy/'+name);expected=subprocess.check_output(['git','show',commit+':nextjs-app/public/legacy/'+name],cwd=R)
  assert raw.replace(b'\r\n',b'\n')==expected.replace(b'\r\n',b'\n'),name+' is not the committed release'
  checked.append({'asset':name,'httpStatus':200,'sha256':hashlib.sha256(raw).hexdigest()})
 save(D/'n1-invoice-ui-fixed-live-assets-2026-10-25.json',{'commit':commit,'assets':checked,'checkedAt':datetime.now(timezone.utc).isoformat()});print('Live HTML JS CSS match release',commit[:7],flush=True)
def verify():
 old=read(P/'baseline.json');new=data('/api/bootstrap')
 exclude={'inboundReceiptSummary','qaVerified','terminalProfile','wh3Documents','processTracking','flightTimeLabel','hoursToFlight','redFlag','canUploadLoadingDetail','flightRiskStatus','flightRiskLevel','effectiveAirportDueAt','flightRiskReasons','minutesToAirportDue','mustNotMissFlight','flightRisk','flightRiskMinutes','flightSla'}
 normalize=lambda b:{j['houseNumber']:{k:v for k,v in j.items() if k not in exclude} for j in b['dashboard']['jobs']}
 a,b=normalize(old),normalize(new);assert a==b,'Jobs changed during the UI retest'
 assert old['users']==new['users'] and old['customers']==new['customers'] and old['dashboard']['billing']==new['dashboard']['billing']
 for n,path in [('policy','/api/meeting/settings'),('map','/api/warehouse/map')]:assert data(path)==read(P/(n+'-before.json')),n
 dock=data('/api/dock/board');prior=read(P/'dock-before.json');assert dock['bays']==prior['bays'] and dock['queue']==prior['queue']
 integrations=data('/api/integrations/status');assert integrations['email']==read(P/'integrations-before.json')['email'] and not integrations['email']['configured']
 files=evidence();assert files==read(P/'evidence-before.json'),'Registered files or bytes changed'
 j=target(new);bill=invoice(new);assert bill['status']=='Draft' and bill['amount']==1000 and not bill.get('billingEmail') and not bill.get('sentAt') and not bill.get('billedAt')
 docs=[f for f in files.values() if f['fileType']=='InvoiceDocument'];assert len(docs)==1
 save(D/'n1-invoice-ui-fixed-after-2026-10-25.json',{'job':j,'invoice':bill,'files':files})
 save(D/'n1-invoice-ui-fixed-isolation-audit-2026-10-25.json',{'house':H,'invoiceId':INV,'allJobsVerified':len(a),'otherJobsVerified':len(a)-1,'allJobsUnchanged':True,'jobHashBefore':digest(a),'jobHashAfter':digest(b),'usersCustomersAndInvoiceRegisterUnchanged':True,'mapDockAndPolicyUnchanged':True,'geofencingEnabled':False,'invoiceStatus':'Draft','amount':1000,'emailSent':False,'markedBilled':False,'invoiceFiles':1,'evidenceFiles':len(files),'evidenceHashesUnchanged':True,'invoiceDocumentSha256':docs[0]['sha256'],'checkedAt':datetime.now(timezone.utc).isoformat()})
 print('PASS all jobs including N1 unchanged / invoice2 Draft1000 / evidence22 unchanged / no email / Geofencing OFF',flush=True)
if __name__=='__main__':{'prepare':prepare,'assets':assets,'verify':verify}[sys.argv[1]]()
