/* eslint-disable @typescript-eslint/no-explicit-any */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const require=createRequire(import.meta.url),bio=require('../src/server/biometric-auth.cjs');

test('six digit PIN is hashed and common or employee-derived PINs are rejected',()=>{
 const user={id:'EMP-1',code:'EMP123456'};
 assert.throws(()=>bio.validatePin('123456',user),/เดาง่าย/);
 assert.throws(()=>bio.validatePin('12345',user),/6 หลัก/);
 assert.throws(()=>bio.validatePin('654321',user),/เดาง่าย/);
 const encoded=bio.pinHash('482905');assert.equal(bio.pinMatches('482905',encoded),true);assert.equal(bio.pinMatches('482906',encoded),false);assert.equal(encoded.includes('482905'),false);
});

test('set PIN stores no plaintext and writes an audit record',()=>{
 const db:any={hr:{auditLogs:[]}},user:any={id:'EMP-1',code:'EMP001',name:'Employee'};
 bio.setPin(db,user,'482905','2026-11-19T04:00:00.000Z');
 assert.equal(user.pinHash.includes('482905'),false);assert.equal(user.pinFailedAttempts,0);assert.equal(db.hr.auditLogs[0].action,'PinConfigured');
});

test('five failed attempts in 15 minutes lock biometric login',()=>{
 const now=Date.parse('2026-11-19T04:10:00.000Z'),db:any={biometricLoginAttempts:Array.from({length:5},(_,i)=>({userId:'EMP-1',result:'Failed',at:new Date(now-i*1000).toISOString()}))};
 assert.equal(bio.rateState(db,'EMP-1',now).locked,true);assert.equal(bio.rateState(db,'OTHER',now).locked,false);
 assert.equal(bio.rateState(db,'EMP-1',now+29*60*1000).locked,true);assert.equal(bio.rateState(db,'EMP-1',now+31*60*1000).locked,false);
});

test('reference image is confined to the approved profile storage folder',()=>{
 const root=mkdtempSync(join(tmpdir(),'scd-face-')),profile=join(root,'profile');mkdirSync(profile);writeFileSync(join(profile,'employee.jpg'),'x');
 assert.equal(bio.referencePath(root,{profilePhotoUrl:'/storage/profile/employee.jpg'}),join(profile,'employee.jpg'));
 assert.equal(bio.referencePath(root,{profilePhotoUrl:'/storage/profile/../secret.jpg'}),'');
 assert.equal(bio.referencePath(root,{profilePhotoUrl:'https://example.com/photo.jpg'}),'');
});

test('public user lookup accepts employee code or id but excludes inactive users',()=>{
 const db={users:[{id:'U1',code:'EMP001',status:'Active'},{id:'U2',code:'EMP002',status:'Inactive'}]};
 assert.equal(bio.findUser(db,'emp001').id,'U1');assert.equal(bio.findUser(db,'U1').id,'U1');assert.equal(bio.findUser(db,'EMP002'),undefined);
});
