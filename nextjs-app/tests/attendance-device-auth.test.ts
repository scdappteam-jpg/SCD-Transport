/* eslint-disable @typescript-eslint/no-explicit-any */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),auth=require('../src/server/attendance-device-auth.cjs');
const at='2026-11-19T04:00:00.000Z',tokenA='A'.repeat(43),tokenB='B'.repeat(43);

function fixture(){const db:any={users:[{id:'EMP-1',code:'EMP001',name:'Employee One',role:'Driver',status:'Active'}],hr:{auditLogs:[]}};auth.setPin(db,db.users[0],'482905',at);return db;}

test('six digit PIN is hashed and common or employee-derived PINs are rejected',()=>{
 const user={id:'EMP-1',code:'EMP123456'};
 assert.throws(()=>auth.validatePin('123456',user),/เดาง่าย/);assert.throws(()=>auth.validatePin('12345',user),/6 หลัก/);
 const encoded=auth.pinHash('482905');assert.equal(auth.pinMatches('482905',encoded),true);assert.equal(encoded.includes('482905'),false);
});

test('first valid PIN login binds one employee to one device without storing the raw token',()=>{
 const db=fixture(),result=auth.authenticate(db,{login:'EMP001',pin:'482905',deviceToken:tokenA,deviceLabel:'Phone A',at});
 assert.equal(result.user.id,'EMP-1');assert.equal(db.attendanceDeviceBindings.length,1);assert.equal(db.attendanceDeviceBindings[0].deviceHash,auth.deviceHash(tokenA));assert.equal(JSON.stringify(db).includes(tokenA),false);
});

test('a new device creates a pending supervisor request and approval replaces the old binding',()=>{
 const db=fixture();auth.authenticate(db,{login:'EMP001',pin:'482905',deviceToken:tokenA,deviceLabel:'Phone A',at});
 assert.throws(()=>auth.authenticate(db,{login:'EMP001',pin:'482905',deviceToken:tokenB,deviceLabel:'Phone B',at}),(error:any)=>error.code==='DEVICE_CHANGE_APPROVAL_REQUIRED');
 const request=db.attendanceDeviceChangeRequests[0];auth.decideRequest(db,{id:'LEAD',role:'WH3_TeamLeader'},request.id,'Approved','verified employee',at);
 const result=auth.authenticate(db,{login:'EMP001',pin:'482905',deviceToken:tokenB,deviceLabel:'Phone B',at});
 assert.equal(result.binding.deviceHash,auth.deviceHash(tokenB));assert.equal(db.attendanceDeviceBindings.filter((x:any)=>x.status==='Active').length,1);
});

test('one physical browser token cannot be active for two employees',()=>{
 const db=fixture();db.users.push({id:'EMP-2',code:'EMP002',name:'Employee Two',role:'Driver',status:'Active'});auth.setPin(db,db.users[1],'735190',at);
 auth.authenticate(db,{login:'EMP001',pin:'482905',deviceToken:tokenA,deviceLabel:'Shared Phone',at});
 assert.throws(()=>auth.authenticate(db,{login:'EMP002',pin:'735190',deviceToken:tokenA,deviceLabel:'Shared Phone',at}),(error:any)=>error.code==='DEVICE_ALREADY_BOUND');
});

test('attendance verification requires the same session, employee and device token',()=>{
 const db=fixture(),result=auth.authenticate(db,{login:'EMP001',pin:'482905',deviceToken:tokenA,deviceLabel:'Phone A',at});
 const session={userId:'EMP-1',authenticationMethod:'PIN+DeviceBinding',deviceBindingId:result.binding.id};
 assert.equal(auth.verifySession(db,session,'EMP-1',tokenA).id,result.binding.id);
 assert.throws(()=>auth.verifySession(db,session,'EMP-1',tokenB),(error:any)=>error.code==='DEVICE_BINDING_MISMATCH');
 assert.throws(()=>auth.verifySession(db,session,'EMP-2',tokenA),(error:any)=>error.code==='DEVICE_REAUTH_REQUIRED');
});

test('five failed PIN attempts in 15 minutes lock device login',()=>{
 const now=Date.parse('2026-11-19T04:10:00.000Z'),db:any={deviceLoginAttempts:Array.from({length:5},(_,i)=>({userId:'EMP-1',result:'Failed',at:new Date(now-i*1000).toISOString()}))};
 assert.equal(auth.rateState(db,'EMP-1',now).locked,true);assert.equal(auth.rateState(db,'EMP-1',now+31*60*1000).locked,false);
});
