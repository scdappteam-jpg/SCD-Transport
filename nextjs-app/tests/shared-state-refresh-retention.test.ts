import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const src=readFileSync(new URL('../src/server/legacy-api.cjs',import.meta.url),'utf8');
const fn=src.slice(src.indexOf('async function loadDbFromSupabase()'),src.indexOf('// Render may serve consecutive requests'));
test('failed refresh cannot replace personnel and active sessions with a seed or half-loaded snapshot',async()=>{
 for(const failure of ['main','chunks','sessions']){
  const known={users:[{code:'SCD233'}],authSessions:[{userId:'old-session'}]};
  const context=vm.createContext({dbCache:known,dbCacheUpdatedAt:'old',supabaseEnabled:()=>true,SUPABASE_STATE_ID:'state',SUPABASE_STATE_TABLE:'state',supabaseRequest:async()=>{if(failure==='main')throw Error('timeout');return [{data:{users:[]},updated_at:'new'}];},loadChunkedState:async(d:unknown)=>{if(failure==='chunks')throw Error('timeout');return d;},loadAuthSessions:async()=>{throw Error('session unavailable');},ensureCoreUsers:()=>({}),ensureDbShape:()=>{},console:{error:()=>{},log:()=>{}}});
  vm.runInContext(fn,context);await vm.runInContext('loadDbFromSupabase()',context);
  assert.equal(context.dbCache,known);assert.equal(context.dbCacheUpdatedAt,'old');
 }
});
