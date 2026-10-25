import json,urllib.request,urllib.error,os
from pathlib import Path
base='https://scd-transport.onrender.com';out=Path('.sit-meeting/live-20261025');out.mkdir(parents=True,exist_ok=True)
payload={'userId':'u_admin_01','password':os.environ['SCD_TASK_PASSWORD']}
try:
 r=urllib.request.urlopen(urllib.request.Request(base+'/api/auth/login',data=json.dumps(payload).encode(),headers={'Content-Type':'application/json'}),timeout=90);j=json.load(r)
 (out/'session.json').write_text(json.dumps({'admin':j['token']}),encoding='utf8');print('Production Admin sign-in succeeded; session stored in ignored SIT directory')
except urllib.error.HTTPError as e: print('Login status',e.code,e.read().decode()[:200])
