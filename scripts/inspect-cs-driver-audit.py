import importlib.util,json
from pathlib import Path
s=importlib.util.spec_from_file_location('e2e',Path(__file__).with_name('run-cs-driver-e2e.py'));m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
def diff(a,b,p=''):
 if type(a)!=type(b): print(p,'type');return
 if isinstance(a,dict):
  for k in set(a)|set(b):
   if k not in a or k not in b:print(p+'/'+k,'added/removed')
   else:diff(a[k],b[k],p+'/'+k)
 elif isinstance(a,list):
  if len(a)!=len(b):print(p,'length',len(a),len(b))
  for i,(x,y) in enumerate(zip(a,b)):diff(x,y,p+'/'+str(i))
 elif a!=b:print(p,'value changed')
for n,path in [('map','/api/warehouse/map'),('dock','/api/dock/board')]:
 current=m.call(n+'-audit-inspect',path);m.write(m.P/(n+'-after.json'),current);diff(json.loads((m.P/(n+'-before.json')).read_text(encoding='utf8')),current,n)
