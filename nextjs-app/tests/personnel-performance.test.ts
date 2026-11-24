import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createApiRequestScheduler} from '../src/server/api-request-scheduler.ts';
const require=createRequire(import.meta.url);
const {createPersonnelReader}=require('../src/server/personnel-read.cjs');
const {directory}=require('../src/server/people-viewer.cjs');

test('reads and exports do not wait behind writes, while writes stay ordered after a failure',async()=>{
 const schedule=createApiRequestScheduler(); let release!:()=>void; const events:string[]=[];
 let started!:()=>void;const writing=new Promise<void>(r=>started=r);
 const first=schedule(false,async()=>{events.push('write1');started();await new Promise<void>(r=>release=r);throw Error('failed');});
 const rejected=assert.rejects(first,/failed/);
 const second=schedule(false,async()=>{events.push('write2');});
 await writing;await schedule(true,async()=>{events.push('read');});
 assert.deepEqual(events,['write1','read']); release(); await rejected;await second;
 assert.deepEqual(events,['write1','read','write2']);
 let finish!:()=>void;const zip=schedule(true,()=>new Promise<void>(r=>finish=r));
 await schedule(false,async()=>events.push('write3'));assert.equal(events.at(-1),'write3');finish();await zip;
});

function fixture(role='People_Viewer', initial=false) {
 const calls:string[]=[];let name='Original';let missing=false;
 const reader=createPersonnelReader({shared:()=>true,stateId:'scd',request:async(method:string,query:string)=>{
  assert.equal(method,'GET');calls.push(query);
  if(missing)return [];
  return query.includes('auth-sessions')?[{data:{sessions:[]}}]:[{users:[{id:'u1',code:'SCD001',name,role:'Employee',passwordHash:'SECRET',salary:999}],profiles:{},auditLogs:[]}];
 },readLocal:()=>{throw Error('no cache fallback');},actorFor:()=>role?{role,initialCredentialRequired:initial}:null,directory,
 loginUsers:()=>[],exportZip:(_res:unknown,items:unknown)=>({status:200,items}),sendJson:(_res:unknown,status:number,body:unknown)=>({status,body})});
 return {reader,calls,rename:()=>name='Latest',fail:()=>missing=true};
}
test('each personnel read uses fresh projected state, excludes payroll and credentials, and fails closed',async()=>{
 const f=fixture();assert.ok(f.reader.handles('GET','/api/people-directory'));assert.equal(f.reader.handles('POST','/api/people-directory/update'),false);
 const first=await f.reader.handle({}, {}, '/api/people-directory');assert.equal(first.status,200);assert.equal(first.body.items[0].firstName,'Original');assert.doesNotMatch(JSON.stringify(first),/SECRET|999/);
 f.rename();const second=await f.reader.handle({}, {}, '/api/people-directory');assert.equal(second.body.items[0].firstName,'Latest');
 assert.equal(f.calls.length,4);assert.ok(f.calls.every(q=>!q.includes('jobs')&&!q.includes('alerts')));
 f.fail();assert.equal((await f.reader.handle({}, {}, '/api/people-directory')).status,503);
});
test('isolated reads preserve role boundaries',async()=>{
 for(const [role,path,status] of [['Driver','/api/people-directory',403],['Admin','/api/people-directory',200],['Admin','/api/people-directory/export',403],['People_Viewer','/api/people-directory/export',200],['','/api/people-directory',401],['People_Viewer','/api/auth/users',403],['','/api/auth/users',200]] as const)
 assert.equal((await fixture(role).reader.handle({}, {},path)).status,status);
});
test('thumbnail sources stay on the same origin and retry originals only once',()=>{
 const window:{SCDPersonnelPhotos?: {previewUrl:(value:string)=>string;retryOriginal:(image:{dataset:{originalSource:string};src:string})=>boolean}}={};vm.runInNewContext(readFileSync(new URL('../public/legacy/personnel-photo-preview.js',import.meta.url),'utf8'),{window,URL,location:{origin:'https://scd.test'}});
 const photos=window.SCDPersonnelPhotos!;assert.ok(photos.previewUrl('/storage/profile/a.jpg').startsWith('/_next/image?'));
 for(const source of ['https://other.test/storage/profile/a.jpg','data:image/png;base64,AA','/storage/evidence/a.jpg'])assert.equal(photos.previewUrl(source),source);
 const image={dataset:{originalSource:'/storage/profile/a.jpg'},src:'thumb'};assert.equal(photos.retryOriginal(image),true);assert.equal(image.src,image.dataset.originalSource);assert.equal(photos.retryOriginal(image),false);
});

test('first-login credential change is still required before reading or exporting personnel',async()=>{
 for(const path of ['/api/people-directory','/api/people-directory/export'])assert.equal((await fixture('People_Viewer',true).reader.handle({}, {},path)).status,428);
});
