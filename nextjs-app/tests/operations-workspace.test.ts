import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const source=readFileSync(new URL('../public/legacy/operations-workspace.js',import.meta.url),'utf8');
type WorkspaceEvent={origin?:string;source?:unknown;data?:{type:string;height:unknown};key?:string};
type WorkspaceApi={open:(userId:string)=>void;clear:()=>void};
function fixture(){
 const attrs:Record<string,string>={},handlers:Record<string,(e:WorkspaceEvent)=>void>={};
 const frame={style:{height:''},contentWindow:{},getAttribute:(n:string)=>attrs[n]||null,removeAttribute:(n:string)=>{delete attrs[n];},set src(value:string){attrs.src=value;}};
 const hint={hidden:false};
 const window={location:{origin:'https://scd.example',search:'?view=operations-control&query=SIT-MASTER-001&from=2026-11-25&token=never-forward'},addEventListener:(n:string,fn:(e:WorkspaceEvent)=>void)=>{handlers[n]=fn;},OperationsWorkspace:null as WorkspaceApi|null};
 vm.runInNewContext(source,{window,document:{getElementById:(id:string)=>id==='operationsWorkspaceFrame'?frame:hint},URL,URLSearchParams,Math,Number});
 return {attrs,frame,hint,handlers,api:window.OperationsWorkspace!};
}
test('workspace loads only when opened with a user, retains filters and never forwards credentials',()=>{
 const f=fixture();assert.equal(f.attrs.src,undefined);f.api.open('sit-role-team_transport');
 assert.equal(f.attrs.src,'/operations-control?embedded=1&query=SIT-MASTER-001&from=2026-11-25');
 f.frame.style.height='1500px';f.api.open('sit-role-team_transport');assert.equal(f.frame.style.height,'1500px');
 f.api.clear();assert.equal(f.attrs.src,undefined);assert.equal(f.hint.hidden,false);
});
test('frame resize rejects other origins, other windows and invalid sizes',()=>{
 const f=fixture();f.api.open('SIT004');const valid={origin:'https://scd.example',source:f.frame.contentWindow,data:{type:'scd-operations-size',height:1900}};
 f.handlers.message({...valid,origin:'https://other.example'});assert.equal(f.frame.style.height,'800px');
 f.handlers.message({...valid,source:{}});assert.equal(f.frame.style.height,'800px');
 for(const height of [NaN,Infinity,-1,'1200',1000001])f.handlers.message({...valid,data:{...valid.data,height}});
 assert.equal(f.frame.style.height,'800px');f.handlers.message(valid);assert.equal(f.frame.style.height,'1900px');assert.equal(f.hint.hidden,true);
});
test('account change resets the workspace and logout in another tab unloads private content',()=>{
 const f=fixture();f.api.open('SIT004');f.frame.style.height='1900px';f.api.open('SIT013');assert.equal(f.frame.style.height,'800px');
 f.handlers.storage({key:'smartLogisticsLang'});assert.ok(f.attrs.src);f.handlers.storage({key:'scdTransportWebSession'});assert.equal(f.attrs.src,undefined);
});
test('unified menu uses exactly the existing operations API roles and adds no personnel access',()=>{
 const app=readFileSync(new URL('../public/legacy/app.js',import.meta.url),'utf8');const fn=app.match(/function allowedWebViews\(role\) \{[\s\S]*?\n\}/);assert.ok(fn);
 const context=vm.createContext({});vm.runInContext(fn[0],context);
 const roles=createRequire(import.meta.url)('../src/server/operations-control.cjs').roles;
 for(const role of [...roles,'Driver','WH_Staff','WH3_TeamLeader','EI_Customer','QA_Inspector','Check_House','Tagging_Staff','Employee','People_Viewer']){
  const views=Array.from(vm.runInContext(`allowedWebViews(${JSON.stringify(role)})`,context));
  assert.equal(views.includes('operations-control'),roles.includes(role));
  if(role!=='Admin')assert.equal(views.includes('staff'),false);
 }
});
