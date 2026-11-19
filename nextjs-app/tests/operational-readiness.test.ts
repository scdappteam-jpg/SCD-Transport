import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const readiness=require('../src/server/operational-readiness.cjs');
const at='2026-11-19T03:00:00.000Z';
const admin={id:'ADMIN-1',role:'Admin'};

function db(){
 return {
  users:[{id:'EMP-TH',code:'EMP001',name:'Thai Staff',role:'WH_Staff',status:'Active',nationality:'ไทย'},{id:'EMP-MM',code:'EMP002',name:'Foreign Staff',role:'Driver',status:'Active',nationality:'Myanmar'}],
  jobs:[{houseNumber:'H1',roundId:'R1',status:'WaitingForDock',updatedAt:'2026-11-19T00:00:00.000Z'},{houseNumber:'H2',roundId:'R1',status:'Stored',locationId:'A-01',qaVerified:true,updatedAt:at}],
  hr:{settings:{attendance:{defaultRadiusMeters:200,enforceAssignedLocations:true}},checkInLocations:[{id:'WH3',active:true,latitude:13.1,longitude:100.1}],auditLogs:[]},
  warehouseMap:{zones:Array.from({length:11},(_,i)=>({id:`Z${i+1}`,active:true,maxPallets:10}))},
  dock:{queue:[{id:'Q1',houseNumber:'H1'},{id:'Q2',houseNumber:'H2'}]}
 } as any;
}

test('readiness stays safely disabled until Admin supplies real policy data',()=>{
 const state=db(),cfg=readiness.config(state),report=readiness.readiness(state);
 assert.equal(cfg.attendance.radiusMeters,200);
 assert.equal(cfg.attendance.enabled,false);
 assert.equal(report.checks.find((x:any)=>x.id==='attendance-evidence').ok,false);
 assert.equal(report.checks.find((x:any)=>x.id==='warehouse-capacity').ok,true);
});

test('Admin config requires PDPA and a face provider before enabling biometric attendance',()=>{
 const state=db();
 assert.throws(()=>readiness.saveConfig(state,admin,{attendance:{enabled:true}},at),/PDPA/);
 const old=[process.env.AWS_ACCESS_KEY_ID,process.env.AWS_SECRET_ACCESS_KEY,process.env.NEXT_PUBLIC_AWS_COGNITO_IDENTITY_POOL_ID];
 try{
  process.env.AWS_ACCESS_KEY_ID='test';process.env.AWS_SECRET_ACCESS_KEY='test';process.env.NEXT_PUBLIC_AWS_COGNITO_IDENTITY_POOL_ID='ap-southeast-7:test';
  const result=readiness.saveConfig(state,admin,{attendance:{enabled:true},pdpa:{consentVersion:'PDPA-2026-01',gpsWorkHoursOnly:true}},at);
  assert.equal(result.config.attendance.enabled,true);assert.equal(result.config.attendance.faceMode,'liveness_1to1');assert.equal(state.hr.settings.attendance.defaultRadiusMeters,200);
 }finally{
  const keys=['AWS_ACCESS_KEY_ID','AWS_SECRET_ACCESS_KEY','NEXT_PUBLIC_AWS_COGNITO_IDENTITY_POOL_ID'];keys.forEach((key,index)=>old[index]===undefined?delete process.env[key]:process.env[key]=old[index]);
 }
});

test('PDPA and foreign worker documents are audited and counted',()=>{
 const state=db();
 readiness.saveConfig(state,admin,{pdpa:{consentVersion:'PDPA-2026-01'}},at);
 for(const employeeId of ['EMP-TH','EMP-MM']) readiness.recordConsent(state,admin,{employeeId,version:'PDPA-2026-01',status:'Granted',evidenceRef:`signed/${employeeId}.pdf`},at);
 for(const type of ['Passport','WorkPermit']) readiness.saveEmployeeDocument(state,admin,{employeeId:'EMP-MM',type,documentNumber:`DOC-${type}`,expiryDate:'2027-12-31',evidenceRef:`docs/${type}.pdf`,status:'Verified'},at);
 const report=readiness.readiness(state);
 assert.equal(report.checks.find((x:any)=>x.id==='pdpa-consent').ok,true);
 assert.equal(report.checks.find((x:any)=>x.id==='foreign-docs').ok,true);
 assert.ok(state.hr.auditLogs.length>=5);
});

test('PX evaluation deduplicates alerts and supports acknowledgement',()=>{
 const state=db();
 readiness.saveConfig(state,admin,{pxAlert:{enabled:true,staleMinutes:60,escalationMinutes:15}},at);
 readiness.evaluatePx(state,at);readiness.evaluatePx(state,at);
 const open=state.pxAlerts.filter((x:any)=>x.key==='H1:DockQueueWithoutArrival');
 assert.equal(open.length,1);
 readiness.updatePx(state,{id:'LEAD',role:'WH3_TeamLeader'},{alertId:open[0].id,status:'Acknowledged',note:'กำลังตรวจ'},at);
 assert.equal(open[0].status,'Acknowledged');
});

test('next-trip notice updates every House in the same vehicle round',()=>{
 const state=db(),result=readiness.setNextTrip(state,{id:'TRANS',role:'Team_Transport'},{roundId:'R1',nextDestination:'Customer B',expectedAt:'2026-11-19T12:00'},at);
 assert.deepEqual(result.houses,['H1','H2']);
 assert.ok(state.jobs.every((job:any)=>job.nextTripNotice.nextDestination==='Customer B'));
});

test('Emergency Slot is Admin-only and keeps an audit trail',()=>{
 const state=db();
 assert.throws(()=>readiness.emergencySlot(state,{id:'LEAD',role:'WH3_TeamLeader'},{houseNumber:'H2',reason:'Flight urgent'},at),/Admin/);
 readiness.emergencySlot(state,admin,{houseNumber:'H2',reason:'Flight urgent'},at);
 assert.equal(state.dock.queue[0].houseNumber,'H2');
 assert.equal(state.dock.log[0].action,'EmergencySlotInserted');
});

test('incentive remains preview-only and disabled by default',()=>{
 const rows=readiness.incentivePreview(db(),'2026-11');
 assert.ok(rows.length>0);
 assert.ok(rows.every((row:any)=>row.amount===0&&!row.eligible));
});
