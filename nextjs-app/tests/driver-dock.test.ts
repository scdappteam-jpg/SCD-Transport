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
test('returning WH3 replaces a stale selected or remembered Stored House on Driver home',()=>{
 const stored={houseNumber:'SIT-WH3-INBOUND-20261028-B1',status:'Stored',driverRouteStatus:'ReleasedForDock'};
 const returning={houseNumber:'SIT-WH3-INBOUND-20261031-B1',status:'ReturningWH3',driverRouteStatus:'ReturningWH3'};
 assert.equal(core.select([stored,returning],stored.houseNumber,stored.houseNumber)?.houseNumber,returning.houseNumber);
});
test('returning WH3 replaces an old called Dock whose unloading is already complete',()=>{
 const unloaded={houseNumber:'SIT-WH3-DOCK-20261028-A1',status:'HouseIdentified',driverDock:{phase:'Called',work:{unloadCompletedAt:'2026-10-28T09:45:58.000Z'}}};
 const returning={houseNumber:'SIT-WH3-INBOUND-20261031-B1',status:'ReturningWH3',driverRouteStatus:'ReturningWH3'};
 assert.equal(core.select([unloaded,returning],unloaded.houseNumber,unloaded.houseNumber)?.houseNumber,returning.houseNumber);
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
test('every House on one vehicle round projects the same shared Dock',()=>{
 const grouped={bays:[{...dock.bays[0],houseNumbers:[H,'SIT-WH3-DOCK-20261028-A2']}],queue:[]};
 assert.equal(core.project({houseNumber:'SIT-WH3-DOCK-20261028-A2',status:'WaitingForDock'},grouped).driverDock.bayId,'D9');
 assert.equal(core.lookup(grouped,'SIT-WH3-DOCK-20261028-A2','',new Set(['SIT-WH3-DOCK-20261028-A2'])).bay.id,'D9');
});
test('waiting ticket is stable and does not present suggested Dock as called',()=>{
 const projected=core.project({houseNumber:H,status:'WaitingForDock'},{bays:[],queue:[{houseNumber:H,queueNumber:5,suggestedBayId:'D8'}]});
 assert.equal(core.ticket(projected.driverDock.queueNumber),'005');assert.equal(projected.driverDock.bayId,null);
 assert.equal(core.ticket(null),'—');
});
test('home Dock action enforces arrival, release document and queue order',()=>{
 assert.equal(core.nextQueueAction({status:'ReturningWH3',driverRouteStatus:'ReturningWH3'}),'arrive-wh3');
 assert.equal(core.nextQueueAction({status:'AwaitingReleaseDocument',driverRouteStatus:'ArrivedWH3'}),'await-release');
 assert.equal(core.nextQueueAction({status:'WaitingForDock',driverRouteStatus:'ReleasedForDock'}),'join-queue');
 assert.equal(core.nextQueueAction({status:'Stored',driverRouteStatus:'ReleasedForDock'}),'join-queue');
 assert.equal(core.nextQueueAction({status:'Assigned',driverRouteStatus:'Assigned'}),'not-ready');
});
test('Driver work is complete only after unload or Terminal close makes the vehicle available',()=>{
 assert.equal(core.completedForDriver({status:'WaitingForDock',driverRouteStatus:'ReleasedForDock'}),false);
 assert.equal(core.completedForDriver({status:'Cancelled'}),false);
 assert.equal(core.completedForDriver({status:'Rejected'}),false);
 assert.equal(core.completedForDriver({status:'TerminalArrived'}),false);
 assert.equal(core.completedForDriver({status:'WaitingForDock',driverRouteStatus:'Available'}),false);
 assert.equal(core.completedForDriver({status:'WaitingForDock',driverRouteStatus:'Available',wh3UnloadCompletedAt:'2026-10-31T09:00:00Z'}),true);
 assert.equal(core.completedForDriver({status:'Billed'}),true);
});
const source=fs.readFileSync(new URL('../public/legacy/mobile.js',import.meta.url),'utf8');
const mobileCss=fs.readFileSync(new URL('../public/legacy/mobile.css',import.meta.url),'utf8');
const mobileHtml=fs.readFileSync(new URL('../public/legacy/mobile.html',import.meta.url),'utf8');
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
test('mobile queue counts use physical Driver completion rather than release document status',()=>{
 assert.ok(source.includes('allDriverJobs.filter(j => !DriverDock.completedForDriver(j))'));
 assert.ok(source.includes('allDriverJobs.filter(j => DriverDock.completedForDriver(j))'));
});
test('home arrival button uses pickup arrival before Dock queue',()=>{
 assert.ok(source.includes('DriverDock.nextQueueAction(selectedJob)'));
 const arrival=source.slice(source.indexOf('async function mobileArriveWh3FromDock('),source.indexOf('async function mobileJoinDockQueue('));
 assert.match(arrival,/\/api\/pickup\/arrive-wh3/);
 assert.doesNotMatch(arrival,/\/api\/dock\/queue/);
});
test('release-document action has dedicated clearance above the fixed mobile navigation',()=>{
 assert.match(mobileCss,/#driverReturnActions:not\(\[hidden\]\)\s*\{[^}]*padding-bottom:calc\(var\(--ms-nav\) \+ env\(safe-area-inset-bottom\) \+ 72px\)/s);
 assert.match(mobileCss,/#releaseDocumentBtn\s*\{[^}]*scroll-margin-block-end:calc\(var\(--ms-nav\) \+ env\(safe-area-inset-bottom\) \+ 96px\)/s);
 assert.match(mobileCss,/main\s*\{[^}]*scroll-padding-block-end:calc\(var\(--ms-nav\) \+ env\(safe-area-inset-bottom\) \+ 96px\)/s);
 assert.match(mobileHtml,/mobile\.css\?v=20261031-modal-layer/);
});
test('confirmation and result popups render above the fixed mobile navigation',()=>{
 assert.match(mobileCss,/\.confirm-sheet,\.mobile-modal-backdrop\s*\{[^}]*z-index:2100!important/s);
 assert.match(mobileCss,/body:not\(\.mobile-locked\) \.fo-bottomnav\s*\{[^}]*z-index:1000!important/s);
 assert.match(mobileCss,/\.confirm-sheet-panel,\.mobile-action-modal\s*\{[^}]*max-height:calc\(100dvh[^}]*overflow-y:auto/s);
});
