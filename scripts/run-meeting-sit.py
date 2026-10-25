"""Isolated local SIT only. Never imports or writes production jobs."""
import sys,json,base64,hashlib,urllib.request,urllib.error,os
from pathlib import Path
from datetime import datetime,timezone
ROOT=Path(__file__).resolve().parents[1];RUN=ROOT/'.sit-meeting'/os.environ.get('SCD_SIT_RUN','20261025-A1');OUT=ROOT/'docs';BASE='http://127.0.0.1:3100'
HOUSE='SIT-QA-20261025';PASSWORD='SIT-ONLY-20261025';at='2026-10-25T00:00:00Z'
def save(name,data):(OUT/name).write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf8')
def fixture():
 from PIL import Image,ImageDraw,ImageFont
 RUN.mkdir(parents=True,exist_ok=True);(RUN/'data').mkdir(exist_ok=True);(RUN/'storage').mkdir(exist_ok=True)
 dbfile=RUN/'data'/'db.json';assert not dbfile.exists(),'Never overwrite an existing SIT run'
 salt=b'sit-meeting-safety-only';encoded='scrypt$'+base64.b64encode(salt).decode()+'$'+base64.b64encode(hashlib.scrypt(PASSWORD.encode(),salt=salt,n=16384,r=8,p=1,dklen=64)).decode()
 users=[{'id':i,'name':'SIT '+role,'role':role,'status':'Active','passwordHash':encoded} for i,role in [('sit-admin','Admin'),('sit-driver','Driver'),('sit-wh','WH_Staff'),('sit-qa','Check_House')]]
 db={'jobs':[{'id':'SIT-JOB','houseNumber':HOUSE,'onhandNumber':HOUSE,'customerName':'SIT ONLY — meeting safety test','driverId':'sit-driver','driverName':'SIT Driver','vehiclePlate':'SIT-TRUCK','destination':'WH3','routeType':'WH3','status':'Pending','driverRouteStatus':'Assigned','csConfirmed':True,'cargoIssuedAt':at,'pieceCount':5,'packageType':'Carton','plannedPieceCount':5,'pickupDate':'2026-10-25','flightNo':'SIT100','flightTime':'2026-10-26T12:00:00Z','createdAt':at,'updatedAt':at}], 'users':users,'customers':[],'activityLogs':[],'attachments':[],'attendance':[],'authSessions':[], 'hr':{'checkInLocations':[{'id':'SIT-GEO','name':'SIT ONLY synthetic geofence, NOT WH3','latitude':13.1,'longitude':100.1,'radiusMeters':100,'active':True}],'employeeProfiles':{'sit-driver':{'assignedLocationIds':['SIT-GEO']}},'settings':{'attendance':{'enforceAssignedLocations':True,'defaultRadiusMeters':100}}},'warehouseMap':{'zones':[],'locations':[],'overlays':[],'log':[]}}
 dbfile.write_text(json.dumps(db,ensure_ascii=False),encoding='utf8')
 font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',22)
 for name,label in [('product','SYNTHETIC CARGO / LABEL'),('cargo','SYNTHETIC SIGNED CARGO FORM'),('door','SYNTHETIC CLOSED DOOR'),('inspector','SYNTHETIC INSPECTOR SIGNATURE'),('receiver','SYNTHETIC RECEIVER SIGNATURE'),('release','SYNTHETIC RELEASE DOCUMENT')]:
  im=Image.new('RGB',(1000,260),'#fff2d5');d=ImageDraw.Draw(im)
  for y,text in [(20,'SIT ONLY - NOT REAL CARGO, SIGNATURE OR GPS'),(80,HOUSE),(140,label),(200,'Isolated localhost test; no production data changed')]:d.text((20,y),text,fill='#8b1000',font=font)
  im.save(RUN/(name+'.png'))
 import zxingcpp,cv2,numpy as np
 for filename,value,label in [('tag-barcode.png',HOUSE,'TAGGER'),('qa-barcode.png',HOUSE,'QA INDEPENDENT'),('wrong-barcode.png','SIT-WRONG-HOUSE','WRONG')]:
  raw=np.asarray(zxingcpp.write_barcode(zxingcpp.BarcodeFormat.Code128,value,width=1000,height=180))
  im=Image.new('RGB',(1100,300),'white');im.paste(Image.fromarray(raw).convert('RGB'),(50,20));ImageDraw.Draw(im).text((25,240),'SIT ONLY - '+label,fill='black',font=font);im.save(RUN/filename)
 print(json.dumps({'runDir':str(RUN),'dataDir':str(RUN/'data'),'storageDir':str(RUN/'storage')},ensure_ascii=False))
def request(path,payload=None,token=None):
 headers={'Content-Type':'application/json','X-SCD-Mobile-Compact':'1'}
 if token:headers['Authorization']='Bearer '+token
 try:
  with urllib.request.urlopen(urllib.request.Request(BASE+path,headers=headers,data=None if payload is None else json.dumps(payload).encode()),timeout=90) as r:return r.status,json.load(r)
 except urllib.error.HTTPError as e:return e.code,json.loads(e.read())
def run():
 cases=[]
 def call(name,path,payload=None,token=None,status=200):
  code,result=request(path,payload,token);assert code==status,(name,code,result);cases.append({'name':name,'httpStatus':code,'expected':status,'result':'PASS'});return result
 tokens={i:call('Login '+i,'/api/auth/login',{'userId':i,'password':PASSWORD})['token'] for i in ['sit-admin','sit-driver','sit-wh','sit-qa']}
 admin,driver,wh,qa=(tokens[x] for x in ['sit-admin','sit-driver','sit-wh','sit-qa'])
 proof=lambda name:{'base64':base64.b64encode((RUN/(name+'.png')).read_bytes()).decode(),'mimeType':'image/png'}
 policy={'enabled':True,'geofencingEnabled':True,'queueMinutes':15,'acknowledgeExistingJobs':True}
 call('Enable safety for isolated SIT only','/api/meeting/settings',policy,admin)
 gps={'gpsLat':13.1,'gpsLong':100.1};p={'houseNumber':HOUSE,'houseNumbers':[HOUSE],**gps}
 call('Cannot start without attendance','/api/pickup/route-start',p,driver,409)
 call('Outside geofence blocked','/api/attendance/checkin',{'userId':'sit-driver','gpsLat':14,'gpsLon':100.1},driver,403)
 call('Inside synthetic SIT geofence accepted','/api/attendance/checkin',{'userId':'sit-driver','gpsLat':13.1,'gpsLon':100.1},driver)
 call('Route starts after attendance','/api/pickup/route-start',p,driver)
 call('Pickup GPS arrival','/api/pickup/checkin',p,driver)
 call('No photos/signatures blocks load','/api/pickup/load',p,driver,422)
 loaded={**p,'checklist':['date','customer','place','driver','house','package','inspector','receiver','route-log','destination'],'pickupItems':[{'houseNumber':HOUSE,'carton':'5','pickupDestination':'WH3'}],'pieceCount':5,'packageType':'Carton','pickupCase':'GeneralManual','inspectorName':'SIT Inspector','receiverName':'SIT Receiver','productImages':[proof('product')],'cargoImages':[proof('cargo')],'doorClosedImages':[proof('door')],'signatureBase64':proof('inspector')['base64'],'receiverSignatureBase64':proof('receiver')['base64']}
 call('Full evidence permits load','/api/pickup/load',loaded,driver)
 first=call('Read files after load','/api/jobs/timeline?houseNumber='+HOUSE,token=admin)
 assert len(first['files'])==5
 call('Complete preserves recorded evidence','/api/pickup/complete',loaded,driver)
 call('Arrive WH3','/api/pickup/arrive-wh3',p,driver)
 call('No release-document image blocked','/api/pickup/release-document',p,driver,422)
 call('Release document image and timestamp','/api/pickup/release-document',{**p,'releaseDocumentFiles':[proof('release')]},driver)
 call('Inbound document check','/api/inbound/document-check',{'houseNumber':HOUSE,'documentStatus':'Found','documentFiles':[proof('release')]},wh)
 call('Open inbound','/api/inbound/open',{'houseNumber':HOUSE},wh)
 call('Identify House','/api/inbound/scan-house',{'houseNumber':HOUSE,'trackType':'Single','flightChanged':False},wh)
 call('Confirm isolated receipt 5 CTN','/api/inbound/receive-counts',{'houseNumber':HOUSE,'counts':{'CTN':5},'expectedRevision':0,'requestId':'SIT-meeting-20261025'},wh)
 zone=call('Create isolated SIT location','/api/warehouse/zone/create',{'name':'SIT ONLY — meeting local test','prefix':'SITQA','rows':1,'cols':1},admin)
 putaway={'houseNumber':HOUSE,'locationId':'SITQA-01','trackType':'Single','boxes':5,'pallets':0}
 call('Putaway blocked before QA','/api/inbound/twin-scan',putaway,wh,409)
 call('Manual approval cannot bypass scanner','/api/warehouse/quality/scan',{'houseNumber':HOUSE,'approved':True,'barcode':HOUSE},qa,422)
 barcode=lambda name:{'base64':base64.b64encode((RUN/name).read_bytes()).decode(),'mimeType':'image/png'}
 tag={'houseNumber':HOUSE,'tagMode':'Single','expectedRevision':0,'scanImages':[barcode('tag-barcode.png')]}
 call('Actual Code128 image registers tag','/api/warehouse/quality/tag',tag,wh)
 call('Tagging role cannot approve QA','/api/warehouse/quality/scan',{**tag,'expectedRevision':1},wh,403)
 call('Wrong-House actual barcode refused','/api/warehouse/quality/scan',{'houseNumber':HOUSE,'expectedRevision':1,'scanImages':[barcode('wrong-barcode.png')]},qa,422)
 call('Independent actual image scan approves QA','/api/warehouse/quality/scan',{'houseNumber':HOUSE,'expectedRevision':1,'scanImages':[barcode('qa-barcode.png')]},qa)
 call('Putaway permitted only after QA','/api/inbound/twin-scan',putaway,wh)
 call('Retag clears earlier QA','/api/warehouse/quality/tag',{**tag,'expectedRevision':1},wh)
 call('Move blocked after retag','/api/inbound/move-location',{'houseNumber':HOUSE,'newLocationId':'SITQA-01'},wh,409)
 call('New QA scan after retag','/api/warehouse/quality/scan',{'houseNumber':HOUSE,'expectedRevision':2,'scanImages':[barcode('qa-barcode.png')]},qa)
 call('Move after current QA','/api/inbound/move-location',{'houseNumber':HOUSE,'newLocationId':'SITQA-01'},wh)
 call('Customer Direct House Invoice intake','/api/warehouse/external-intake',{'houseNumber':'SIT-EXTERNAL-20261025','invoiceNo':'SIT-INVOICE','shipmentSource':'CustomerDirect','receivedAtFrontDesk':True,'customerName':'SIT DIRECT','pieceCount':3,'packageType':'CTN'},wh)
 board=call('Dock board separates Customer Direct','/api/dock/board',token=admin)
 external=next(e for e in board['queue'] if e['houseNumber']=='SIT-EXTERNAL-20261025');assert external['suggestedBayId']=='D7'
 assert next(e for e in board['queue'] if e['houseNumber']==HOUSE)['suggestedBayId'] in ['D8','D9','D10','D11']
 report=call('Driver Time Log readback','/api/driver/time-log?includeSIT=true',token=driver)
 assert report['rows'][0]['times']['loadedAt'] and report['rows'][0]['times']['releaseDocumentReceivedAt']
 call('Driver cannot read another driver','/api/driver/time-log?driverId=other',token=driver,status=403)
 proxy=urllib.request.Request(BASE+'/api/scan-barcode',data=(RUN/'qa-barcode.png').read_bytes(),headers={'Content-Type':'image/png','Authorization':'Bearer '+wh})
 with urllib.request.urlopen(proxy,timeout=60) as response:assert json.load(response)['barcodes']
 final=call('Final SIT snapshot','/api/jobs/timeline?houseNumber='+HOUSE,token=admin)
 assert final['job']['status']=='Stored' and final['job']['inboundReceipt']['counts']=={'CTN':5}
 # The local geofence exists only in this disposable SIT data directory. Leave
 # the deployment policy draft and geofence off for review after this run.
 call('Leave policy in review mode','/api/meeting/settings',{'enabled':False,'geofencingEnabled':False,'queueMinutes':15},admin)
 result={'checkedAt':datetime.now(timezone.utc).isoformat(),'environment':'Isolated localhost:3100 + Python scanner:5001','productionModified':False,'physicalMovementVerified':False,'syntheticEvidenceOnly':True,'cases':cases,'passed':len(cases),'final':final,'driverLog':report,'dock':board}
 save('meeting-safety-sit-results-2026-10-25.json',result);save('meeting-driver-time-log-2026-10-25.json',report)
 with urllib.request.urlopen(urllib.request.Request(BASE+'/api/driver/time-log?includeSIT=true&format=html',headers={'Authorization':'Bearer '+admin})) as response:html=json.load(response)['html']
 (OUT/'SCD-Driver-Time-Log-SIT-2026-10-25.html').write_text(html,encoding='utf8')
 print(json.dumps({'passed':len(cases),'environment':result['environment'],'productionModified':False,'finalStatus':final['job']['status']},ensure_ascii=False))
if __name__=='__main__':
 if sys.argv[1]=='fixture':fixture()
 elif sys.argv[1]=='run':run()
