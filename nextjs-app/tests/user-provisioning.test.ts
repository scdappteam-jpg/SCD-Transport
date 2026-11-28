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

test('re-issuing SIT codes resets password, PIN, devices, lockouts and sessions for test accounts only', () => {
  const provisioning = service;
  type Row = Record<string, unknown>;
  const db: { users: Row[]; attendanceDeviceBindings?: Row[]; deviceLoginAttempts?: Row[]; authSessions?: Row[] } = { users: [{ id: 'u_admin', role: 'Admin', status: 'Active' }, { id: 'u_real', role: 'WH_Staff', status: 'Active', passwordHash: 'keep', pinHash: 'keep' }] };
  const admin = db.users[0];
  provisioning.provisionSuite(db, admin, '2026-11-28T00:00:00Z');
  const sit = db.users.find((u: Row) => u.id === 'sit-role-wh_staff')!;
  db.attendanceDeviceBindings = [{ userId: sit.id, status: 'Active', deviceHash: 'x' }, { userId: 'u_real', status: 'Active', deviceHash: 'y' }];
  db.deviceLoginAttempts = [{ userId: sit.id, result: 'Failed', at: '2026-11-28T00:00:00Z' }];
  db.authSessions = [{ userId: sit.id }, { userId: 'u_real' }];
  assert.throws(() => provisioning.reissueSuite(db, db.users[1], '2026-11-28T01:00:00Z'), /Admin/);
  const accounts = provisioning.reissueSuite(db, admin, '2026-11-28T01:00:00Z');
  assert.equal(accounts.length, provisioning.ROLES.length);
  const row = accounts.find((a: Row) => a.id === sit.id)!;
  assert.ok(auth.pinMatches(row.initialPin, sit.pinHash));
  assert.ok(auth.pinMatches(row.initialPin, sit.passwordHash));
  assert.equal(sit.mustChangePassword, true);
  assert.equal(db.attendanceDeviceBindings![0].status, 'Reset');
  assert.equal(db.attendanceDeviceBindings![1].status, 'Active');
  assert.deepEqual(db.deviceLoginAttempts, []);
  assert.deepEqual(db.authSessions!.map((s: Row) => s.userId), ['u_real']);
  assert.equal(db.users[1].passwordHash, 'keep');
});

test('an older 15-role suite gets the missing role on the next free SIT code, and a hand-added SIT account joins re-issue', () => {
  type Row = Record<string, unknown>;
  const admin = { id: 'u_admin', role: 'Admin' };
  const oldRoles = service.ROLES.filter((r: string) => r !== 'Console_Office');
  const oldSuite = (): { users: Row[] } => ({ users: oldRoles.map((role: string, i: number) => ({ id: `sit-role-${role.toLowerCase()}`, code: `SIT${String(i + 1).padStart(3, '0')}`, name: `SIT ทดสอบ ${role}`, role, status: 'Active', isTestAccount: true })) });
  // Missing role: created with the next free code instead of failing on SIT011.
  const a = oldSuite();
  const rows = service.provisionSuite(a, admin, 'now');
  const consoleRow = rows.find((r: Row) => r.role === 'Console_Office');
  assert.equal(consoleRow.created, true);
  assert.equal(consoleRow.code, 'SIT016');
  assert.equal(rows.filter((r: Row) => r.created).length, 1);
  // Hand-added account with a SIT code and SIT name is adopted, not duplicated.
  const b = oldSuite();
  b.users.push({ id: 'u_console_office_1', code: 'SIT016', name: 'SIT ทดสอบ Console_Office', role: 'Console_Office', status: 'Active' });
  assert.equal(service.provisionSuite(b, admin, 'now').filter((r: Row) => r.created).length, 0);
  const reissued = service.reissueSuite(b, admin, 'later');
  assert.equal(reissued.length, 16);
  assert.ok(reissued.some((r: Row) => r.id === 'u_console_office_1'));
  // Other test accounts (VIEW999 keeps its fixed PIN) are never re-issued.
  const v = oldSuite();
  v.users.push({ id: 'u_view999', code: 'VIEW999', name: 'ทดสอบ', role: 'People_Viewer', status: 'Active', isTestAccount: true, pinHash: 'fixed' });
  assert.ok(!service.reissueSuite(v, admin, 'later').some((r: Row) => r.id === 'u_view999'));
  assert.equal(v.users.find((u: Row) => u.id === 'u_view999')!.pinHash, 'fixed');
  // A real employee who happens to hold a SIT code is never touched.
  const c = oldSuite();
  c.users.push({ id: 'real', code: 'SIT020', name: 'สมชาย', role: 'WH_Staff', status: 'Active', passwordHash: 'keep' });
  service.reissueSuite(c, admin, 'later');
  assert.equal(c.users.find((u: Row) => u.id === 'real')!.passwordHash, 'keep');
});
