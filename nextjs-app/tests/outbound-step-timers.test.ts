import test from'node:test';import assert from'node:assert/strict';import{readFileSync}from'node:fs';import vm from'node:vm';
const source=readFileSync(new URL('../src/server/legacy-api.cjs',import.meta.url),'utf8');
function afterActivity(db:unknown,p:unknown,at:string){const ctx=vm.createContext({db,p,nowIso:()=>at,crypto:{randomBytes:()=>({toString:()=> 'test'})}});vm.runInContext(source.slice(source.indexOf('function logActivity('),source.indexOf('function findOpenActivity('))+';logActivity(db,p);',ctx);}
const fixture=()=>({jobs:[{houseNumber:'H',xrayStatus:'Passed',weighEndedAt:'weighed',stepTracking:{outbound_terminal:{status:'InProgress',startedAt:'2026-11-22T08:00:00Z',userId:'original-terminal',logId:'L'}}}],activityLogs:[{logId:'L',endTime:''}]});
test('confirmed X-Ray ends its running timer and log without reattributing or changing physical work',()=>{
 const db=fixture();afterActivity(db,{houseNumber:'H',activityType:'XRay',userId:'finisher'},'2026-11-22T08:10:00Z');const step=db.jobs[0].stepTracking.outbound_terminal;
 assert.equal(step.status,'Completed');assert.equal(step.userId,'original-terminal');assert.equal(db.activityLogs[0].endTime,'2026-11-22T08:10:00Z');assert.equal(db.jobs[0].xrayStatus,'Passed');const before=JSON.stringify(db.jobs);afterActivity(db,{houseNumber:'H',activityType:'XRay'},'2026-11-22T09:00:00Z');assert.equal(JSON.stringify(db.jobs),before);
});
test('Hold and absent trackers never create completion or elapsed-time data',()=>{
 const db=fixture();db.jobs[0].xrayStatus='Hold';const before=JSON.stringify(db.jobs);afterActivity(db,{houseNumber:'H',activityType:'XRay'},'2026-11-22T08:10:00Z');assert.equal(JSON.stringify(db.jobs),before);afterActivity(db,{houseNumber:'H',activityType:'LoadingDetailClosed'},'2026-11-22T08:10:00Z');assert.equal(JSON.stringify(db.jobs),before);assert.equal(db.activityLogs[0].endTime,'');
});
