import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {createPerson,provisionAdditional,directory,reviewPerson,updatePerson}=require('../src/server/people-viewer.cjs');
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

test('photo-only recovered records keep real code and image without invented identity or review status',()=>{
  const db={users:[{id:'SCD255',code:'SCD255',name:'',role:'Employee',directoryOnly:true,recoveryPendingDetails:true}],hr:{employeeProfiles:{SCD255:{profilePhotoUrl:'/storage/profile/real.jpg'}},auditLogs:[]}};
  const actor={id:'editor',role:'People_Viewer'};
  const item=directory(db)[0];
  assert.equal(item.employeeCode,'SCD255');assert.equal(item.firstName,'');assert.equal(item.position,'');assert.equal(item.department,'');assert.equal(item.photoUrl,'/storage/profile/real.jpg');assert.equal(item.isReviewed,false);
  assert.throws(()=>reviewPerson(db,{actor,employeeId:'SCD255'}),/เติมชื่อ/);
  const edited=updatePerson(db,{actor,employeeId:'SCD255',changes:{firstName:'SIT',lastName:'verified',position:'Driver',department:'Transport'}});
  assert.equal(edited.recoveryPendingDetails,false);assert.equal(edited.photoUrl,item.photoUrl);
  assert.equal(reviewPerson(db,{actor,employeeId:'SCD255'}).isReviewed,true);
});
