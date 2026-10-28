import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import vm from 'node:vm';
const require=createRequire(import.meta.url);
const core=require('../public/legacy/driver-dock-core.js');
const H='SIT-WH3-DOCK-20261028-A1';
const dock={bays:[{id:'D9',name:'ท่า 9',houseNumber:H,status:'Occupied',queueNumber:5,vehiclePlate:'SIT-ONLY'}],queue:[]};
const jobs=[{houseNumber:'SIT-OLD',status:'ReadyForBilling'},{houseNumber:H,status:'WaitingForDock'}].map(j=>core.project(j,dock));
test('default driver home selects called active House before stale billing House, without changing source',()=>{
 const before=structuredClone(jobs);assert.equal(core.select(jobs)?.houseNumber,H);assert.deepEqual(jobs,before);
});
test('explicit current or remembered active House wins, invalid foreign/completed selections are ignored',()=>{
 const other={houseNumber:'OWN-SECOND',status:'Assigned'};
 assert.equal(core.select([...jobs,other],'OWN-SECOND')?.houseNumber,'OWN-SECOND');
 assert.equal(core.select([...jobs,other],'','OWN-SECOND')?.houseNumber,'OWN-SECOND');
 assert.equal(core.select(jobs,'FOREIGN','SIT-OLD')?.houseNumber,H);
 assert.equal(core.select([{houseNumber:'done',status:'Billed'}]),null);
});
test('House lookup never falls back to another House sharing the plate; Driver scope restricts plate-only lookup',()=>{
 assert.equal(core.lookup(dock,'SIT-OLD','SIT-ONLY').bay,null);
 assert.equal(core.lookup(dock,H,'SIT-ONLY',new Set(['SIT-OLD'])).bay,null);
 assert.equal(core.lookup(dock,'','SIT-ONLY',new Set(['SIT-OLD'])).bay,null);
 assert.equal(core.lookup(dock,H,'',new Set([H])).bay.id,'D9');
});
test('projection uses current assigned bay instead of stale job or warehouse storage location and remains read-only',()=>{
 const job={houseNumber:H,status:'WaitingForDock',dockBayId:'D8',locationId:'STORAGE-01'};const before=structuredClone(job);
 assert.deepEqual(core.project(job,dock).driverDock,{phase:'Called',bayId:'D9',bayName:'ท่า 9',queueNumber:5});
 assert.deepEqual(core.project(job,{bays:[],queue:[]}).driverDock,{phase:'None',bayId:null,queueNumber:null});
 assert.deepEqual(job,before);
});
test('waiting ticket is stable and does not present suggested Dock as called',()=>{
 const projected=core.project({houseNumber:H,status:'WaitingForDock'},{bays:[],queue:[{houseNumber:H,queueNumber:5,suggestedBayId:'D8'}]});
 assert.equal(core.ticket(projected.driverDock.queueNumber),'005');assert.equal(projected.driverDock.bayId,null);
 assert.equal(core.ticket(null),'—');
});
const source=fs.readFileSync(new URL('../public/legacy/mobile.js',import.meta.url),'utf8');
test('actual Driver job renderer separates ticket, called Dock and storage location',()=>{
 const context=vm.createContext({DriverDock:core,foJobStatusMeta:()=>({th:'รอ Dock',en:'Waiting',tone:'amber'}),InboundReceipts:{house:()=>({})},currentUser:()=>({}),escapeHtmlMobile:(v:unknown)=>String(v),formatBangkokMobile:(v:unknown)=>String(v)});
 vm.runInContext(source.slice(source.indexOf('function foDriverJobCard('),source.indexOf('function foFocusDriverJob(')),context);
 const render=vm.runInContext('foDriverJobCard',context);
 const result=render({...jobs[1],locationId:'STORAGE-01',vehiclePlate:'SIT-ONLY'});
 assert.match(result,/เลขคิวหน้าคลัง<\/dt><dd>005/);assert.match(result,/Dock ที่เรียกเข้า<\/dt><dd>D9/);assert.match(result,/ช่องจัดเก็บสินค้า<\/dt><dd>STORAGE-01/);
 const waiting=render({...jobs[1],driverDock:{phase:'Waiting',queueNumber:5,bayId:null}});
 assert.match(waiting,/Dock ที่เรียกเข้า<\/dt><dd>รอเรียก/);
});
test('home and Dock refresh share selection and stale async responses cannot replace newer selection',()=>{
 assert.ok(source.includes('const next = driverDockSelection(jobs)'));
 assert.ok(source.includes('const house = driverDockSelection()?.houseNumber'));
 assert.ok(source.includes('if(request!==mobileDockRequest||house!=='));
});
