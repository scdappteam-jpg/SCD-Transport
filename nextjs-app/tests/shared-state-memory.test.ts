import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
const require=createRequire(import.meta.url);
const {sanitizedClone,loadStateChunks}=require('../src/server/shared-state-memory.cjs');
test('Snapshot preserves JSON persistence contract and isolates mutable workflow data',()=>{
 const db={jobs:[{house:'4840805485',text:'ไทย\ufffd漢字',missing:undefined,qty:NaN,date:new Date('2026-10-24T00:00:00Z')}],values:[undefined,Infinity],one:{a:1}};
 const copy=sanitizedClone(db);const expected=JSON.parse(JSON.stringify(db,(_k,v)=>typeof v==='string'?v.replace(/[\uFFFD\uFFFE\uFFFF]/g,''):v));assert.deepEqual(copy,expected);copy.jobs[0].house='OTHER';assert.equal(db.jobs[0].house,'4840805485');
});
test('Loading chunks bounds each response and preserves order and hashes',async()=>{
 const requests:string[][]=[];const r=await loadStateChunks({kind:'jobs',count:5,idFor:(_k:string,i:number)=>'chunk-'+i,hash:(items:unknown[])=>JSON.stringify(items),fetchRows:async(ids:string[])=>{requests.push(ids);return [...ids].reverse().map(id=>({id,data:{items:[id]}}));}});
 assert.deepEqual(requests.map(r=>r.length),[2,2,1]);assert.deepEqual(r.items,['chunk-0','chunk-1','chunk-2','chunk-3','chunk-4']);assert.equal(r.hashes.length,5);
});
test('An incomplete shared-state reload fails rather than silently removing jobs',async()=>{await assert.rejects(loadStateChunks({kind:'jobs',count:1,idFor:()=> 'missing',hash:()=>'',fetchRows:async()=>[]}),/Missing shared-state chunk/);});
test('Unicode production-sized snapshots fit a constrained heap without full JSON round trips',()=>{
 const modulePath=require.resolve('../src/server/shared-state-memory.cjs');
 const child=spawnSync(process.execPath,['--max-old-space-size=64','-e',`const {sanitizedClone}=require(${JSON.stringify(modulePath)});const jobs=Array.from({length:3802},(_,i)=>({house:String(i),text:('ไทย漢字'+i).repeat(400)}));for(let i=0;i<3;i++){const snapshot=sanitizedClone({jobs});if(snapshot.jobs.length!==3802)process.exit(2);}console.log('PASS');`],{encoding:'utf8',timeout:30000});
 assert.equal(child.status,0,child.stderr);assert.match(child.stdout,/PASS/);
});
