import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const release=require('../src/server/release-documents.cjs');
const evidence=require('../src/server/operations-control.cjs').evidence;
const proof={base64:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL7WQAAAABJRU5ErkJggg==',mimeType:'image/png'};
const jobs=[{houseNumber:'HOUSE-001'},{houseNumber:'HOUSE-002'},{houseNumber:'HOUSE-003'}];

test('vehicle round requires one valid release-document entry for every House',()=>{
 const rows=release.validate(jobs,{releaseDocuments:jobs.map((job,index)=>({houseNumber:job.houseNumber,documentNumber:`DOC-${index+1}`,files:[proof]}))},evidence);
 assert.deepEqual(rows.map((row:{houseNumber:string})=>row.houseNumber),jobs.map(job=>job.houseNumber));
 assert.equal(rows[1].documentNumber,'DOC-2');
});

test('missing House evidence rejects the whole vehicle round',()=>{
 assert.throws(()=>release.validate(jobs,{releaseDocuments:[
  {houseNumber:'HOUSE-001',files:[proof]},
  {houseNumber:'HOUSE-002',files:[proof]}
 ]},evidence),/HOUSE-003/);
});

test('one shared legacy upload cannot release a multi-House vehicle round',()=>{
 assert.throws(()=>release.validate(jobs,{releaseDocumentFiles:[proof]},evidence),/แยกราย House/);
});

test('single-House legacy clients remain compatible',()=>{
 const rows=release.validate([jobs[0]],{releaseDocumentFiles:[proof],releaseDocumentNumber:'LEGACY-1'},evidence);
 assert.equal(rows[0].houseNumber,'HOUSE-001');
 assert.equal(rows[0].documentNumber,'LEGACY-1');
});

test('duplicate, foreign and invalid House evidence are rejected before mutation',()=>{
 assert.throws(()=>release.validate(jobs,{releaseDocuments:[
  {houseNumber:'HOUSE-001',files:[proof]},
  {houseNumber:'HOUSE-001',files:[proof]},
  {houseNumber:'HOUSE-003',files:[proof]}
 ]},evidence),/ซ้ำ/);
 assert.throws(()=>release.validate(jobs,{releaseDocuments:[
  {houseNumber:'HOUSE-001',files:[proof]},
  {houseNumber:'HOUSE-002',files:[proof]},
  {houseNumber:'FOREIGN',files:[proof]}
 ]},evidence),/ไม่ได้อยู่ในรอบรถ/);
 assert.throws(()=>release.validate(jobs,{releaseDocuments:jobs.map(job=>({houseNumber:job.houseNumber,files:[{base64:'bad',mimeType:'image/png'}]}))},evidence),/ไฟล์หลักฐานไม่ถูกต้อง/);
});
