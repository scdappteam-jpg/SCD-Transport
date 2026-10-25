"""Read-only target evidence and no-email audit; never sends or closes an invoice."""
import json,urllib.request,hashlib
from pathlib import Path
R=Path(__file__).resolve().parents[1];D=R/'docs';P=R/'.sit-meeting/invoice-20261025-N1';BASE='https://scd-transport.onrender.com';H='SIT-CS-DRIVER-20261025-N1'
read=lambda p:json.loads(p.read_text(encoding='utf8'))
token=read(P/'session.json')['admin']
def get(path):
 with urllib.request.urlopen(urllib.request.Request(BASE+path,headers={'Authorization':'Bearer '+token,'X-SCD-Mobile-Compact':'1'}),timeout=90) as r:assert r.status==200;return json.load(r)
before=read(D/'n1-invoice-before-2026-10-25.json');final=get('/api/jobs/timeline?houseNumber='+H);j=final['job'];bill=read(D/'n1-invoice-draft-2026-10-25.json')
assert bill['status']=='Draft' and not bill.get('billingEmail') and not bill.get('sentAt') and not bill.get('billedAt') and j['status']=='InvoiceDrafted'
events=[a['activityType'] for a in final['activities']];forbidden=[x for x in events if 'email' in x.lower() or 'sent' in x.lower() or x.lower() in ['billed','invoicebilled','billingclosed']];assert not forbidden,forbidden
oldPolicy=read(P/'integrations-before.json');integrations=get('/api/integrations/status');assert integrations['email']==oldPolicy['email'] and not integrations['email']['configured']
for key in ['csInvoiceNo','csContactName','csContactPhone','inboundReceipt','inboundClosedAt','inboundClosedRevision','qaApproval','tagInspection','mawbNumber','flightNo','flightTime','terminalClosedAt','cargoTransferReturnedAt','driverRouteStatus']:
 assert before['job'].get(key)==j.get(key),key
old=read(D/'n1-outbound-all-evidence-audit-2026-10-25.json')['files'];expected={f['fileId']:f for f in old};assert len(expected)==21
files=get('/api/operations/control?query='+H)['evidence'];assert len(files)==22
new=[f for f in files if f['fileId'] not in expected];assert len(new)==1 and new[0]['fileType']=='InvoiceDocument' and new[0]['fileId']=='INVOICE-DOC-'+bill['id']
opened=[]
for f in files:
 assert f['url'].startswith('/storage/'+H+'/') or f['url']==bill['pdfUrl']
 with urllib.request.urlopen(BASE+f['url'],timeout=60) as response:raw=response.read();assert response.status==200
 digest=hashlib.sha256(raw).hexdigest()
 if f['fileId'] in expected:assert digest==expected[f['fileId']]['sha256']
 else:assert digest==read(D/'n1-invoice-document-readback-2026-10-25.json')['sha256']
 opened.append({'fileId':f['fileId'],'fileType':f['fileType'],'url':f['url'],'sha256':digest,'httpStatus':200})
reviewEvents=[{'type':a['activityType'],'createdAt':a['createdAt']} for a in final['activities'] if 'bill' in a['activityType'].lower() or 'invoice' in a['activityType'].lower()]
out={'house':H,'invoiceId':bill['id'],'oldEvidence':21,'newInvoiceDocumentFiles':1,'totalFiles':22,'oldEvidenceHashesUnchanged':True,'allFilesHTTP200':True,'noEmailOrBilledEvents':True,'emailConfigured':False,'emailConfigurationUnchanged':True,'invoiceEmailBlank':True,'invoiceStatus':'Draft','protectedCsInboundOutboundFieldsUnchanged':True,'activityTypes':events,'billingEvents':reviewEvents,'files':opened}
(D/'n1-invoice-evidence-notification-audit-2026-10-25.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf8')
print('PASS old21 hashes / new InvoiceDocument1 / files22 HTTP200 / no email or Billed events / protected CS-WH-Terminal unchanged')
print('Billing events:',reviewEvents)
