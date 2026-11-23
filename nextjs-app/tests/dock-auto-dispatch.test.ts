import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),auto=require('../src/server/dock-auto-dispatch.cjs');
const at='2026-11-23T09:00:00Z';
function fixture(){
 const jobs=['A','B','C'].map((houseNumber,i)=>({houseNumber,driverId:'DR'+i,transportRoundId:'R'+i,vehiclePlate:'SIT-'+i,driverName:'SIT',status:'WaitingForDock',csConfirmed:true,cargoIssuedAt:at,arrivedWh3At:at,releaseDocumentReceivedAt:at,flightTime:`2026-11-23T${12+i}:00:00Z`}));
 return {jobs,dock:{autoDispatch:{enabled:true},bays:[{id:'D8',name:'ท่า 8',status:'Available',houseNumber:'',assignedAt:''},{id:'D9',name:'ท่า 9',status:'Closed',houseNumber:'',assignedAt:''}],queue:jobs.map((j,i)=>({id:'Q'+i,houseNumber:j.houseNumber,houseNumbers:[j.houseNumber],queueNumber:i+1,arrivedAt:at,autoDispatchPaused:false}))}};
}
test('auto calls the earliest ready flight once, without inventing physical arrival or unloading',()=>{
 const db=fixture();db.dock.queue.reverse();
 assert.deepEqual(auto.dispatch(db,at),[{bayId:'D8',houseNumbers:['A']}]);
 assert.equal(db.dock.bays[0].houseNumber,'A');assert.equal(db.dock.bays[1].houseNumber,'');
 assert.equal(db.dock.queue.length,2);assert.equal(db.jobs[0].status,'WaitingForDock');
 assert.equal('dockArrivedAt' in db.jobs[0],false);assert.equal('wh3UnloadCompletedAt' in db.jobs[0],false);
 assert.deepEqual(auto.dispatch(db,at),[]);
 // A completed unloading event alone does not free a bay. Staff must release it.
 Object.assign(db.jobs[0],{wh3UnloadCompletedAt:at});assert.deepEqual(auto.dispatch(db,at),[]);
 Object.assign(db.dock.bays[0],{status:'Available',houseNumber:'',houseNumbers:[]});
 assert.deepEqual(auto.dispatch(db,at),[{bayId:'D8',houseNumbers:['B']}]);
});
test('global stop and individual pause retain the queue; resuming calls eligible work',()=>{
 const db=fixture();db.dock.autoDispatch.enabled=false;assert.deepEqual(auto.dispatch(db,at),[]);
 db.dock.autoDispatch.enabled=true;db.dock.queue[0].autoDispatchPaused=true;
 assert.deepEqual(auto.dispatch(db,at),[{bayId:'D8',houseNumbers:['B']}]);
 assert.ok(db.dock.queue.some(e=>e.houseNumber==='A'));
});
test('all Houses in the vehicle round must have release documents before one grouped call',()=>{
 const db=fixture();Object.assign(db.jobs[1],{driverId:'DR0',vehiclePlate:'SIT-0',transportRoundId:'R0',releaseDocumentReceivedAt:''});
 db.jobs[2].releaseDocumentReceivedAt='';
 assert.deepEqual(auto.dispatch(db,at),[]);
 db.jobs[1].releaseDocumentReceivedAt=at;
 assert.deepEqual(auto.dispatch(db,at),[{bayId:'D8',houseNumbers:['A','B']}]);
 assert.equal(Reflect.get(db.jobs[0],'dockBayId'),'D8');assert.equal(Reflect.get(db.jobs[1],'dockBayId'),'D8');
});
test('missing arrival, rejected work, absent driver or plate cannot auto dispatch',()=>{
 for(const change of [{arrivedWh3At:''},{csConfirmed:false},{csRejected:true},{driverId:''},{vehiclePlate:''},{status:'Billed'},{releaseDocumentReceivedAt:'invalid'}]){
  const db=fixture();for(const j of db.jobs)Object.assign(j,change);assert.deepEqual(auto.dispatch(db,at),[]);
 }
});
test('one plate cannot get a second bay across distinct round identities',()=>{
 const db=fixture();db.dock.bays[1].status='Available';db.jobs[1].vehiclePlate='sit 0';
 assert.deepEqual(auto.dispatch(db,at),[{bayId:'D8',houseNumbers:['A']},{bayId:'D9',houseNumbers:['C']}]);
 assert.ok(db.dock.queue.some(e=>e.houseNumber==='B'));
});
