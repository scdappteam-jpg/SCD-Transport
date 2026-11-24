import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const client=readFileSync(new URL('../public/legacy/people-directory.js',import.meta.url),'utf8');
const load=client.slice(client.indexOf('  async function loadDirectory()'),client.indexOf('  async function signIn()'));
test('directory keeps its session and displayed people on transient HTTP or network failure',async()=>{
 for(const status of [503,502,429,403,'network',401]) {
  let removed=0;const elements:Record<string,{textContent:string;classList:{add:()=>void;remove:()=>void;contains:()=>boolean}}>={};
  const known=[{id:'original-person'}];
  const ctx=vm.createContext({TOKEN_KEY:'token',items:known,sessionStorage:{getItem:()=> 'session',removeItem:()=>removed++},fetch:async()=>{if(status==='network')throw Error('offline');return {ok:false,status};},$:(id:string)=>elements[id]??=( {textContent:'',classList:{add:()=>{},remove:()=>{},contains:()=>false}} )});
  vm.runInContext(load,ctx);assert.equal(await vm.runInContext('loadDirectory()',ctx),false);
  assert.equal(removed,status===401?1:0);assert.equal(ctx.items,known);
  assert.ok(elements[status===401?'message':'directoryMessage'].textContent.length>0);
 }
});

const api=readFileSync(new URL('../src/server/legacy-api.cjs',import.meta.url),'utf8');
const login=api.slice(api.indexOf('    if (req.method === "POST" && pathname === "/api/auth/login")'),api.indexOf('    if (req.method === "POST" && pathname === "/api/auth/device/login")'));
test('login cannot return a token before its shared session is saved',async()=>{
 let finish:()=>void=()=>{};let entered:()=>void=()=>{};
 const started=new Promise<void>(r=>entered=r),saved=new Promise<void>(r=>finish=r);const responses:{status:number;body:Record<string,unknown>}[]=[];
 const ctx=vm.createContext({req:{method:'POST'},res:{},pathname:'/api/auth/login',db:{users:[{id:'person',code:'SCD233',role:'People_Viewer'}]},parseBody:async()=>({code:'SCD233',password:'authorized-test-pin'}),authenticateWithSupabaseAuth:async()=>({managed:false}),passwordHashForUser:()=> 'hash',serverPasswordMatches:()=>true,crypto:{randomBytes:()=>({toString:()=> 'test-token'}),createHash:()=>({update:()=>({digest:()=> 'token-hash'})})},nowIso:()=>new Date().toISOString(),supabaseEnabled:()=>true,scheduleAuthSessionPersist:async()=>{entered();await saved;},sendJson:(_:unknown,status:number,body:Record<string,unknown>)=>responses.push({status,body})});
 vm.runInContext(`async function run(){${login}}`,ctx);const pending=vm.runInContext('run()',ctx);
 await started;assert.equal(responses.length,0);finish();await pending;
 assert.equal(responses[0].status,200);
 ctx.scheduleAuthSessionPersist=async()=>{throw Error('database unavailable');};
 await vm.runInContext('run()',ctx);assert.equal(responses[1].status,503);assert.equal(responses[1].body.token,undefined);
});
