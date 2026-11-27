import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const service=require('../src/server/user-provisioning.cjs');
const auth=require('../src/server/attendance-device-auth.cjs');
const fixture=()=>({users:[] as {id:string,code:string,role:string,isTestAccount?:boolean,passwordHash?:string,pinHash?:string,mustChangePin?:boolean,mustChangePassword?:boolean}[]});
test('suite creates all roles with matching hashed credentials, first-use change, and no credential reset on replay',()=>{
 const db=fixture(); const result=service.provisionSuite(db,{id:'admin',role:'Admin'},'2026-11-22T00:00:00Z');
 assert.equal(result.length,16);
 for(const row of result){const user=db.users.find(u=>u.code===row.code)!;assert.ok(auth.pinMatches(row.initialPin,user.passwordHash));assert.ok(auth.pinMatches(row.initialPin,user.pinHash));assert.ok(user.mustChangePin&&user.mustChangePassword);}
 const before=JSON.stringify(db);const replay=service.provisionSuite(db,{id:'admin',role:'Admin'},'later');assert.ok(replay.every((r:{initialPin:string|null})=>r.initialPin===null));assert.equal(JSON.stringify(db),before);
});
test('non admin and any code or id collision reject the entire suite without mutation',()=>{
 for(const role of ['Driver','CS','Executive']){const db=fixture();assert.throws(()=>service.provisionSuite(db,{role},'now'));assert.equal(db.users.length,0);}
 for(const user of [{id:'real',code:'SIT015',role:'People_Viewer'},{id:'sit-role-billing',code:'SCD999',role:'Billing'}]){const db={users:[user]};const before=JSON.stringify(db);assert.throws(()=>service.provisionSuite(db,{role:'Admin'},'now'));assert.equal(JSON.stringify(db),before);}
});
