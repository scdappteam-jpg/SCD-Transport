"""Read-only before/after deploy checks for the existing N1 SIT. Never reset workflow."""
import json,sys,urllib.request,hashlib
from pathlib import Path
R=Path(__file__).resolve().parents[1];D=R/'docs';P=R/'.sit-meeting/cs-driver-fixed-20261025-N1';P.mkdir(parents=True,exist_ok=True)
H='SIT-CS-DRIVER-20261025-N1';BASE='https://scd-transport.onrender.com'
TOKEN=json.loads((R/'.sit-meeting/cs-driver-e2e-20261025-N1/session.json').read_text(encoding='utf8'))['admin']
def get(path):
 with urllib.request.urlopen(urllib.request.Request(BASE+path,headers={'Authorization':'Bearer '+TOKEN,'X-SCD-Mobile-Compact':'1'}),timeout=90) as r:return json.load(r)
def save(p,v):p.write_text(json.dumps(v,ensure_ascii=False,indent=2),encoding='utf8')
def persisted(j):return {k:v for k,v in j.items() if k not in ['inboundReceiptSummary','qaVerified','terminalProfile','wh3Documents','processTracking','flightTimeLabel','hoursToFlight','redFlag','canUploadLoadingDetail','flightRiskStatus','flightRiskLevel','effectiveAirportDueAt','flightRiskReasons','minutesToAirportDue','mustNotMissFlight','flightRisk','flightRiskMinutes','flightSla']}
def digest(v):return hashlib.sha256(json.dumps(v,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest()
stage=sys.argv[1]
bootstrap=get('/api/bootstrap');policy=get('/api/meeting/settings');timeline=get('/api/jobs/timeline?houseNumber='+H);ops=get('/api/operations/control?dateBasis=pickup&query='+H)
save(D/('cs-driver-fixed-'+stage+'-2026-10-25.json'),{'job':timeline['job'],'activities':timeline['activities'],'files':timeline['files'],'operations':{k:v for k,v in ops.items() if k not in ['customers','drivers','invoices']},'policy':policy})
if stage=='before':
 assert not (P/'baseline.json').exists(),'Preserve baseline'
 save(P/'baseline.json',bootstrap);save(P/'policy.json',policy);save(P/'timeline.json',timeline)
 assert timeline['job']['status']=='WaitingForDock' and len(timeline['files'])==6
 print('Before: target WaitingForDock, six files, planned',ops['plans'][0]['planned'],'rounds',ops['vehicles'][0]['rounds'],'events',len(ops['rows'][0]['events']))
elif stage=='after':
 old=json.loads((P/'baseline.json').read_text(encoding='utf8'));a={j['houseNumber']:persisted(j) for j in old['dashboard']['jobs']};b={j['houseNumber']:persisted(j) for j in bootstrap['dashboard']['jobs']}
 if a!=b:
  differences=[{'house':h,'keys':[k for k in set(a[h])|set(b.get(h,{})) if a[h].get(k)!=b.get(h,{}).get(k)]} for h in a if a[h]!=b.get(h)]
  save(P/'differences.json',differences);raise AssertionError('Readback differences: inspect private differences.json')
 assert old['users']==bootstrap['users'] and old['customers']==bootstrap['customers'] and old['dashboard']['billing']==bootstrap['dashboard']['billing']
 assert policy==json.loads((P/'policy.json').read_text(encoding='utf8')) and not policy['policy']['geofencingEnabled']
 oldTimeline=json.loads((P/'timeline.json').read_text(encoding='utf8'));assert timeline['activities']==oldTimeline['activities'] and timeline['files']==oldTimeline['files']
 row=ops['rows'][0];assert len(ops['rows'])==1 and row['houseNumber']==H
 assert ops['plans'][0]['planned']==1 and ops['plans'][0]['pending']==0 and ops['vehicles'][0]['rounds']==ops['vehicles'][0]['plannedRounds']==1 and ops['vehicles'][0]['unlinked']==0 and row['roundSource']=='driver-start'
 assert len(row['events'])==6 and all(e['actorId']=='sit_ui_driver' and e['synthetic'] and e['source']=='Driver Log' for e in row['events'])
 milestones={'RouteStarted':'routeStartedAt','CheckIn':'checkInAt','Loading':'loadedAt','PickupComplete':'completedAt','ArrivedWH3':'arrivedWh3At','ReleaseDocumentReceived':'releaseDocumentReceivedAt'}
 assert all(e['at']==timeline['job'][milestones[e['activityType']]] for e in row['events']),'Every history milestone must match its original job timestamp'
 j=timeline['job'];assert j['qaVerified'] is False and not j['inboundReceiptSummary']['confirmed'] and row['receivedCounts'] is None and j['status']=='WaitingForDock'
 assert j['csInvoiceNo']=='SIT-CS-INV-20261025-N1' and j['csContactName']=='SIT CONTACT N1' and j['csContactPhone']=='0000000000'
 opened=[]
 for f in timeline['files']:
  with urllib.request.urlopen(BASE+'/storage/'+H+'/'+f['fileId']+'.png',timeout=60) as r:raw=r.read();assert r.status==200 and raw.startswith(b'\x89PNG')
  opened.append({'fileId':f['fileId'],'fileType':f['fileType'],'status':200,'sha256':hashlib.sha256(raw).hexdigest()})
 save(D/'cs-driver-fixed-live-audit-2026-10-25.json',{'house':H,'readOnlyRetest':True,'jobCount':len(a),'persistedJobFieldsChanged':0,'persistedJobsBeforeHash':digest(a),'persistedJobsAfterHash':digest(b),'activitiesUnchanged':True,'filesUnchanged':True,'usersCustomersInvoicesUnchanged':True,'policyUnchanged':True,'geofencingEnabled':False,'planAssigned':1,'planPending':0,'rounds':1,'plannedRounds':1,'unlinked':0,'driverEvents':6,'qaVerified':False,'warehouseReceiptConfirmed':False,'status':j['status'],'openedFiles':opened})
 print('After PASS: assigned1 pending0 rounds1 unlinked0 events6 QA pending receipt unconfirmed; persisted data unchanged',len(a),'jobs')
else:raise ValueError(stage)
