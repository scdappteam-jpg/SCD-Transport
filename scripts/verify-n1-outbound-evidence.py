"""Read-only verification: every old and new N1 file remains readable and unchanged."""
import importlib.util,json,hashlib,urllib.request
from pathlib import Path
R=Path(__file__).resolve().parents[1];D=R/'docs'
s=importlib.util.spec_from_file_location('n1out',R/'scripts/run-n1-outbound-sit.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
old=json.loads((D/'n1-wh3-audit-2026-10-25.json').read_text(encoding='utf8'))['files']
new=json.loads((D/'n1-outbound-evidence-readback-2026-10-25.json').read_text(encoding='utf8'))
expected={f['fileId']:f for f in old+new};assert len(old)==10 and len(new)==11 and len(expected)==21
code,r=m.req('/api/operations/control?query='+m.H);assert code==200
registered=r['evidence'];assert {e['fileId'] for e in registered}==set(expected)
opened=[]
for f in registered:
 assert f['url'].startswith('/storage/'+m.H+'/')
 with urllib.request.urlopen(m.BASE+f['url'],timeout=60) as response:raw=response.read();assert response.status==200
 digest=hashlib.sha256(raw).hexdigest();assert digest==expected[f['fileId']]['sha256'],f['fileId']
 opened.append({'fileId':f['fileId'],'fileType':f['fileType'],'url':f['url'],'httpStatus':200,'sha256':digest,'oldFile':f['fileId'] in {v['fileId'] for v in old}})
out={'house':m.H,'allFilesReadable':True,'allHashesUnchanged':True,'oldFiles':10,'newFiles':11,'totalFiles':21,'files':opened}
(D/'n1-outbound-all-evidence-audit-2026-10-25.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf8')
print('PASS all21 files HTTP200 / old10 hashes unchanged / new11 synthetic hashes verified')
