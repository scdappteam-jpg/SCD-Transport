import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),groups=require('../src/server/dock-vehicle-group.cjs');
const jobs:Record<string,any>[]=['A1','A2','A3'].map(houseNumber=>({houseNumber,driverId:'DRIVER-1',transportRoundId:'ROUND-1'}));
test('three House queue rows from one vehicle round consolidate to one queue ticket',()=>{
 const db:any={jobs,dock:{queue:jobs.map((job,index)=>({id:`Q${index+1}`,houseNumber:job.houseNumber,queueNumber:index+5,createdAt:`2026-10-31T01:0${index}:00Z`}))}};
 groups.normalizeQueue(db);
 assert.equal(db.dock.queue.length,1);assert.deepEqual(db.dock.queue[0].houseNumbers,['A1','A2','A3']);assert.equal(db.dock.queue[0].queueNumber,5);
});
test('duplicate active bays consolidate only before unloading starts',()=>{
 const db:any={jobs:structuredClone(jobs),dock:{bays:[{id:'D8',name:'ท่า 8',status:'Occupied',houseNumber:'A1',assignedAt:'2026-10-31T01:00:00Z'},{id:'D9',name:'ท่า 9',status:'Occupied',houseNumber:'A2',assignedAt:'2026-10-31T01:01:00Z'},{id:'D10',name:'ท่า 10',status:'Occupied',houseNumber:'A3',assignedAt:'2026-10-31T01:02:00Z'}]}};
 assert.deepEqual(groups.normalizeBays(db),{merged:1,blocked:0});assert.deepEqual(db.dock.bays[0].houseNumbers,['A1','A2','A3']);assert.equal(db.dock.bays[1].status,'Available');assert.equal(db.dock.bays[2].status,'Available');
 assert.ok(db.jobs.every((job:Record<string,any>)=>job.dockBayId==='D8'));
});
test('duplicate active bays keep the one bay that owns physical progress',()=>{
 const db:any={jobs:structuredClone(jobs),dock:{bays:[{id:'D8',status:'Occupied',houseNumber:'A1',assignedAt:'2026-10-31T01:00:00Z'},{id:'D9',status:'Occupied',houseNumber:'A2',assignedAt:'2026-10-31T01:01:00Z'}]}};
 db.jobs[1].driverDockHistory=[{bayId:'D9',assignedAt:'2026-10-31T01:01:00Z',event:'arrive'}];
 assert.deepEqual(groups.normalizeBays(db),{merged:1,blocked:0});assert.equal(db.dock.bays[0].status,'Available');assert.equal(db.dock.bays[1].status,'Occupied');
 assert.deepEqual(db.dock.bays[1].houseNumbers,['A1','A2','A3']);assert.ok(db.jobs.every((job:Record<string,any>)=>job.dockBayId==='D9'));
});
test('duplicate active bays remain blocked when physical progress exists in multiple bays',()=>{
 const db:any={jobs:structuredClone(jobs),dock:{bays:[{id:'D8',status:'Occupied',houseNumber:'A1',assignedAt:'2026-10-31T01:00:00Z'},{id:'D9',status:'Occupied',houseNumber:'A2',assignedAt:'2026-10-31T01:01:00Z'}]}};
 db.jobs[0].driverDockHistory=[{bayId:'D8',assignedAt:'2026-10-31T01:00:00Z',event:'arrive'}];
 db.jobs[1].driverDockHistory=[{bayId:'D9',assignedAt:'2026-10-31T01:01:00Z',event:'unload-start'}];
 assert.deepEqual(groups.normalizeBays(db),{merged:0,blocked:1});assert.ok(db.dock.bays.every((bay:Record<string,any>)=>bay.status==='Occupied'));
});
test('legacy duplicate bays for the same House consolidate without a round identity',()=>{
 const job:any={houseNumber:'SIT-B1',driverDockHistory:[{bayId:'D8',assignedAt:'2026-10-31T01:00:00Z',event:'arrive'}]};
 const db:any={jobs:[job],dock:{bays:[{id:'D8',name:'ท่า 8',status:'Occupied',houseNumber:'SIT-B1',assignedAt:'2026-10-31T01:00:00Z'},{id:'D9',name:'ท่า 9',status:'Occupied',houseNumber:'SIT-B1',assignedAt:'2026-10-31T01:01:00Z'},{id:'D10',name:'ท่า 10',status:'Occupied',houseNumber:'SIT-B1',assignedAt:'2026-10-31T01:02:00Z'}]}};
 assert.deepEqual(groups.normalizeBays(db),{merged:1,blocked:0});assert.equal(db.dock.bays[0].status,'Occupied');assert.equal(db.dock.bays[1].status,'Available');assert.equal(db.dock.bays[2].status,'Available');assert.equal(job.dockBayId,'D8');
});
