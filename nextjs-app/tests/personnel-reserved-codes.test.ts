import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {createPerson,provisionAdditional}=require('../src/server/people-viewer.cjs');
test('new personnel and editor accounts cannot reuse codes awaiting original-data recovery',()=>{
  const reserved=Array.from({length:6},(_,i)=>`SCD${255+i}`);
  const db={users:[{id:'SCD254',code:'SCD254',name:'Existing',status:'Active'}],hr:{settings:{reservedEmployeeCodes:reserved}}};
  const record={name:'SIT reservation test',firstName:'SIT reservation test',position:'Driver',department:'Transport',temporaryPassword:'123456'};
  const person=createPerson(db,{actor:{id:'editor',role:'People_Viewer'},changes:record,preview:true});
  assert.equal(person.id,'SCD261');
  const account=provisionAdditional(db,{actor:{id:'admin',role:'Admin'},record:{...record,code:'AUTO'},preview:true});
  assert.equal(account.code,'SCD261');
  for(const code of reserved)assert.throws(()=>provisionAdditional(db,{actor:{id:'admin',role:'Admin'},record:{...record,code}}),/สำรองไว้/);
  assert.equal(db.users.length,1);
});
