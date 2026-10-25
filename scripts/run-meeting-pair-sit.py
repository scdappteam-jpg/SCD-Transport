"""Actual image scans against the isolated localhost SIT only; no production endpoint."""
import importlib.util,json,base64,os
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
import zxingcpp,numpy as np
os.environ['SCD_SIT_RUN']='20261025-A3'
spec=importlib.util.spec_from_file_location('sit',Path(__file__).with_name('run-meeting-sit.py'));sit=importlib.util.module_from_spec(spec);spec.loader.exec_module(sit)
house='SIT-PAIR-20261025';cases=[]
def call(name,path,p=None,t=None,status=200):
 code,result=sit.request(path,p,t);assert code==status,(name,code,result);cases.append({'name':name,'httpStatus':code,'result':'PASS'});return result
tokens={u:call('Login '+u,'/api/auth/login',{'userId':u,'password':sit.PASSWORD})['token'] for u in ['sit-wh','sit-qa']};wh=tokens['sit-wh'];qa=tokens['sit-qa']
call('Create separate synthetic Pair job','/api/warehouse/external-intake',{'houseNumber':house,'invoiceNo':'SIT-PAIR-INV','shipmentSource':'CustomerDirect','receivedAtFrontDesk':True,'customerName':'SIT ONLY PAIR','pieceCount':2,'packageType':'CTN'},wh)
images=[]
for label in ['TAG LEFT','TAG RIGHT','QA LEFT','QA RIGHT']:
 raw=np.asarray(zxingcpp.write_barcode(zxingcpp.BarcodeFormat.Code128,house,width=1000,height=180));im=Image.new('RGB',(1100,300),'white');im.paste(Image.fromarray(raw).convert('RGB'),(50,20));ImageDraw.Draw(im).text((25,240),'SIT ONLY '+label,fill='black',font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',22));file=sit.RUN/('pair-'+label.replace(' ','-')+'.png');im.save(file);images.append({'base64':base64.b64encode(file.read_bytes()).decode(),'mimeType':'image/png'})
p={'houseNumber':house,'tagMode':'Pair','expectedRevision':0,'stickerColor':'Red'}
call('Pair refuses only one tag photo','/api/warehouse/quality/tag',{**p,'scanImages':images[:1]},wh,422)
call('Pair refuses reused identical photo','/api/warehouse/quality/tag',{**p,'scanImages':[images[0],images[0]]},wh,422)
call('Pair registers two actual Code128 captures','/api/warehouse/quality/tag',{**p,'scanImages':images[:2]},wh)
p['expectedRevision']=1
call('Pair QA refuses only one capture','/api/warehouse/quality/scan',{**p,'scanImages':images[2:3]},qa,422)
call('Pair QA refuses tagger original captures','/api/warehouse/quality/scan',{**p,'scanImages':images[:2]},qa,409)
call('Pair QA approves two independent captures','/api/warehouse/quality/scan',{**p,'scanImages':images[2:]},qa)
result=call('Pair current QA and color verified','/api/warehouse/quality?query='+house,t=qa);job=result['jobs'][0];assert job['qaApproved'] and job['trackType']=='Pair' and job['stickerColor']=='Red'
sit.save('meeting-pair-sit-results-2026-10-25.json',{'environment':'Isolated localhost A3','syntheticEvidenceOnly':True,'productionModified':False,'cases':cases,'passed':len(cases),'job':job});print(json.dumps({'passed':len(cases),'productionModified':False}))
