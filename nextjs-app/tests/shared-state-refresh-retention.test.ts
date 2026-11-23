import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const src=readFileSync(new URL('../src/server/legacy-api.cjs',import.meta.url),'utf8');
const fn=src.slice(src.indexOf('async function loadDbFromSupabase()'),src.indexOf('// Render may serve consecutive requests'));
const refresh=src.slice(src.indexOf('async function refreshDbIfSharedStateChanged('),src.indexOf('async function persistDbToSupabase('));

test('pre-write version checks bypass throttling but reload chunks only when another writer changed them',async()=>{
 for(const remote of ['same','new']) {
  let reads=0,reloads=0;
  const context=vm.createContext({Date,lastSharedStateCheckAt:Date.now(),SUPABASE_STATE_CHECK_INTERVAL_MS:15000,dbCacheUpdatedAt:'same',supabaseEnabled:()=>true,SUPABASE_STATE_ID:'state',supabaseRequest:async()=>{reads++;return [{updated_at:remote}];},loadDbFromSupabase:async()=>{reloads++;},console:{warn:()=>{}}});
  vm.runInContext(refresh,context);await vm.runInContext('refreshDbIfSharedStateChanged(true,true)',context);
  assert.equal(reads,1);assert.equal(reloads,remote==='same'?0:1);
 }
});
test('failed refresh cannot replace personnel and active sessions with a seed or half-loaded snapshot',async()=>{
 for(const failure of ['main','chunks','sessions']){
  const known={users:[{code:'SCD233'}],authSessions:[{userId:'old-session'}]};
  const context=vm.createContext({dbCache:known,dbCacheUpdatedAt:'old',supabaseEnabled:()=>true,SUPABASE_STATE_ID:'state',SUPABASE_STATE_TABLE:'state',supabaseRequest:async()=>{if(failure==='main')throw Error('timeout');return [{data:{users:[]},updated_at:'new'}];},loadChunkedState:async(d:unknown)=>{if(failure==='chunks')throw Error('timeout');return d;},loadAuthSessions:async()=>{throw Error('session unavailable');},ensureCoreUsers:()=>({}),ensureDbShape:()=>{},console:{error:()=>{},log:()=>{}}});
  vm.runInContext(fn,context);await vm.runInContext('loadDbFromSupabase()',context);
  assert.equal(context.dbCache,known);assert.equal(context.dbCacheUpdatedAt,'old');
 }
});

test('a missing shared document cannot silently seed production or replace its last verified snapshot',async()=>{
 for(const known of [null,{users:[{code:'SCD233'}]}]) {
  let seedReads=0,writes=0;
  const context=vm.createContext({dbCache:known,dbCacheUpdatedAt:'old',supabaseEnabled:()=>true,SUPABASE_STATE_ID:'state',SUPABASE_STATE_TABLE:'state',process:{env:{}},supabaseRequest:async()=>[],readDbFromFile:()=>{seedReads++;return {users:[]};},persistDbToSupabase:async()=>{writes++;},console:{error:()=>{},log:()=>{}}});
  vm.runInContext(fn,context);await vm.runInContext('loadDbFromSupabase()',context);
  assert.equal(seedReads,0);assert.equal(writes,0);assert.equal(context.dbCache,known);
 }
});

test('an explicitly requested initial seed is only installed after its durable write succeeds',async()=>{
 for(const fail of [false,true]) {
  const seed={users:[{code:'SCD233'}]};let writes=0;
  const context=vm.createContext({dbCache:null,supabaseEnabled:()=>true,SUPABASE_STATE_ID:'state',SUPABASE_STATE_TABLE:'state',process:{env:{SCD_ALLOW_SHARED_STATE_SEED:'true'}},supabaseRequest:async()=>[],readDbFromFile:()=>seed,persistDbToSupabase:async()=>{writes++;if(fail)throw Error('unavailable');},relationalMirror:{schedule:()=>{}},console:{error:()=>{},log:()=>{}}});
  vm.runInContext(fn,context);await vm.runInContext('loadDbFromSupabase()',context);
  assert.equal(writes,1);assert.equal(context.dbCache,fail?null:seed);
 }
});
