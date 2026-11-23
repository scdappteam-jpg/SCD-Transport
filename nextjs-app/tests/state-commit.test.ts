import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {commitMain,contentChunkId}=require('../src/server/state-commit.cjs');
const {requestJson}=require('../src/server/state-http.cjs');

test('two workers from one version cannot overwrite each other personnel or transport',async()=>{
  let version='2026-11-23T11:00:00.000Z';
  let saved:Record<string,unknown>={users:['original'],jobs:['original']};
  const request=async(method:string,query:string,body:{data:Record<string,unknown>;updated_at:string})=>{
    if(method==='GET')return [{updated_at:version,stateCommitId:saved.stateCommitId}];
    const expected=new URLSearchParams(query.slice(1)).get('updated_at')!.slice(3);
    if(expected!==version)return [];
    version=body.updated_at;saved=body.data;return [{updated_at:version}];
  };
  const original=version;
  await commitMain({request,id:'state',main:{users:['edited'],jobs:['current']},expectedVersion:original,commitId:'worker-a'});
  await assert.rejects(commitMain({request,id:'state',main:{users:[],jobs:[]},expectedVersion:original,commitId:'worker-b'}),{code:'STATE_WRITE_CONFLICT'});
  assert.deepEqual(saved.users,['edited']);assert.deepEqual(saved.jobs,['current']);
});

test('retry after lost response recognizes its own commit without replaying a mutation',async()=>{
  const version='2026-11-23T11:01:00Z';
  const result=await commitMain({id:'state',main:{},expectedVersion:'2026-11-23T11:00:00Z',commitId:'once',request:async(method:string)=>method==='PATCH'?[]:[{updated_at:version,stateCommitId:'once'}]});
  assert.equal(result,version);
});

test('unversioned overwrite is refused and changed chunks never overwrite live chunk keys',async()=>{
  await assert.rejects(commitMain({expectedVersion:'',request:()=>assert.fail('must not write')}),{code:'STATE_WRITE_CONFLICT'});
  const first=contentChunkId('state','jobs',0,[{house:'SIT-A'}]);
  assert.equal(first,contentChunkId('state','jobs',0,[{house:'SIT-A'}]));
  assert.notEqual(first,contentChunkId('state','jobs',0,[{house:'SIT-B'}]));
});

test('HTTP PATCH reads the returned version used for atomic compare-and-swap',async()=>{
  const rows=await requestJson('https://test.invalid',{method:'PATCH',headers:{Prefer:'return=representation'}},{fetcher:async()=>Response.json([{updated_at:'committed'}])});
  assert.deepEqual(rows,[{updated_at:'committed'}]);
});
