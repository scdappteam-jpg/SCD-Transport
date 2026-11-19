import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { provision, provisionTest, provisionAdditional, directory, changePassword, updatePerson } = require("../src/server/people-viewer.cjs");

function state() {
  return {
    users: [
      { id: "u_admin", code: "ADMIN", name: "Admin", role: "Admin", status: "Active" },
      { id: "u_emp1", code: "EMP001", name: "นาย สมชาย ใจดี", role: "Driver", status: "Active", phone: "0811111111", nickname: "ชาย", vehiclePlate: "70-1234" },
      { id: "u_emp2", code: "EMP002", name: "นางสาว สมหญิง รักงาน", role: "WH_Staff", status: "Active" },
      { id: "u_old", code: "EMP003", name: "คน เก่า", role: "Driver", status: "Inactive" },
    ],
    hr: { employeeProfiles: { u_emp1: { profilePhotoUrl: "/storage/profile/u_emp1.jpg", position: "Driver", department: "Transport", salary: 22000 } }, auditLogs: [] },
  } as any;
}

const records = [
  { code: "VIEW001", name: "คุณก็อต", nickname: "ก็อต", temporaryPassword: "Test2026" },
  { code: "VIEW002", name: "คุณหวาย", nickname: "หวาย", temporaryPassword: "Test2026" },
];

test("person editor uses controlled dropdowns for position and department", () => {
  const html = readFileSync(new URL("../public/legacy/people-directory.html", import.meta.url), "utf8");
  const client = readFileSync(new URL("../public/legacy/people-directory.js", import.meta.url), "utf8");
  assert.match(html, /<select id="position" required><\/select>/);
  assert.match(html, /<select id="editDepartment" required><\/select>/);
  assert.match(client, /populateEditorSelect\("position", items\.map\(person => person\.position\)/);
  assert.match(client, /populateEditorSelect\("editDepartment", items\.map\(person => person\.department\)/);
});

test("admin provisions one additional directory viewer with organization fields", () => {
  const db = state();
  const record = { code: "VIEW003", name: "คุณยุ้ย", nickname: "ยุ้ย", position: "ผู้ดูแลข้อมูล", department: "บริหาร", temporaryPassword: "Test2026" };
  const preview = provisionAdditional(db, { actor: db.users[0], record, preview: true });
  assert.equal(preview.createCount, 1);
  assert.equal(db.users.some((user: any) => user.code === "VIEW003"), false);
  provisionAdditional(db, { actor: db.users[0], record, preview: false, now: "2026-11-19T00:00:00.000Z" });
  const viewer = db.users.find((user: any) => user.code === "VIEW003");
  assert.equal(viewer.role, "People_Viewer");
  assert.equal(viewer.mustChangePassword, true);
  assert.equal(db.hr.employeeProfiles[viewer.id].department, "บริหาร");
  assert.equal(db.hr.employeeProfiles[viewer.id].position, "ผู้ดูแลข้อมูล");
  assert.throws(() => provisionAdditional(db, { actor: db.users[0], record, preview: false }), /มีอยู่แล้ว/);
});

test("provisions exactly two editable directory accounts without deactivating existing users", () => {
  const db = state();
  const result = provision(db, { actor: db.users[0], records, preview: false, now: "2026-11-17T00:00:00.000Z" });
  assert.equal(result.activeViewerCount, 2);
  const viewers = db.users.filter((user: any) => user.role === "People_Viewer" && user.status === "Active");
  assert.equal(viewers.length, 2);
  assert.ok(viewers.every((user: any) => /^scrypt\$/.test(user.passwordHash)));
  assert.ok(viewers.every((user: any) => user.mustChangePassword === true));
  assert.deepEqual(viewers.map((user: any) => user.nickname), ["ก็อต", "หวาย"]);
  assert.ok(viewers.every((user: any) => !user.phone && !user.vehiclePlate));
  assert.equal(db.users.find((user: any) => user.code === "EMP001").status, "Active");
});

test("directory exposes only approved contact and organization fields", () => {
  const items = directory(state());
  assert.equal(items.length, 2);
  assert.deepEqual(Object.keys(items[0]).sort(), ["department", "firstName", "id", "lastName", "nickname", "phone", "photoUrl", "position"]);
  const somchai = items.find((item: any) => item.lastName === "ใจดี");
  assert.equal(somchai.firstName, "นาย สมชาย");
  assert.equal(somchai.photoUrl, "/storage/profile/u_emp1.jpg");
  assert.equal(somchai.phone, "0811111111");
  assert.equal(somchai.nickname, "ชาย");
  assert.equal(somchai.department, "Transport");
  assert.equal((somchai as any).salary, undefined);
});

test("viewer changes the initial password once with a six character minimum", () => {
  const user: any = { id: "u_view", role: "People_Viewer", mustChangePassword: true, passwordHash: "old" };
  assert.throws(() => changePassword(user, "12345"), /6 ตัวอักษร/);
  changePassword(user, "abc123", "2026-11-19T00:00:00.000Z");
  assert.match(user.passwordHash, /^scrypt\$/);
  assert.equal(user.mustChangePassword, false);
});

test("viewer edits only approved fields and preserves payroll role vehicle and code", () => {
  const db = state();
  const actor: any = { id: "u_view", role: "People_Viewer" };
  const item = updatePerson(db, { actor, employeeId: "u_emp1", changes: { firstName: "นาย สมชาย", lastName: "ใจดีมาก", phone: "0899999999", nickname: "ชายใหม่", position: "Senior Driver", department: "Transport" }, photoUrl: "/storage/profile/new.jpg", now: "2026-11-19T00:00:00.000Z" });
  const user: any = db.users.find((entry: any) => entry.id === "u_emp1");
  assert.equal(user.code, "EMP001"); assert.equal(user.role, "Driver"); assert.equal(user.vehiclePlate, "70-1234");
  assert.equal(db.hr.employeeProfiles.u_emp1.salary, 22000);
  assert.equal(item.nickname, "ชายใหม่"); assert.equal(item.position, "Senior Driver"); assert.equal(item.photoUrl, "/storage/profile/new.jpg");
});

test("rejects a batch that is not exactly two accounts", () => {
  const db = state();
  assert.throws(() => provision(db, { actor: db.users[0], records: records.slice(0, 1) }), /2 บัญชี/);
});

test("rejects non-admin provisioning", () => {
  const db = state();
  assert.throws(() => provision(db, { actor: db.users[1], records }), /เฉพาะ Admin/);
});

test("provisions a separate VIEW999 test account without changing the two main viewers", () => {
  const db = state();
  provision(db, { actor: db.users[0], records, preview: false, now: "2026-11-17T00:00:00.000Z" });
  const record = { name: "บัญชีทดสอบรูปภาพ", nickname: "ทดสอบ", temporaryPassword: "Test2026" };
  const preview = provisionTest(db, { actor: db.users[0], record, preview: true });
  assert.equal(preview.code, "VIEW999"); assert.equal(preview.createCount, 1);
  const result = provisionTest(db, { actor: db.users[0], record, preview: false, now: "2026-11-19T00:00:00.000Z" });
  const viewer = db.users.find((user: any) => user.code === "VIEW999");
  assert.equal(result.mustChangePassword, true);
  assert.equal(viewer.role, "People_Viewer"); assert.equal(viewer.isTestAccount, true); assert.equal(viewer.mustChangePassword, true);
  assert.equal(db.users.filter((user: any) => ["VIEW001", "VIEW002"].includes(user.code)).length, 2);
  const people = directory(db);
  assert.equal(people.some((item: any) => item.nickname === "ก็อต"), true);
  assert.equal(people.some((item: any) => item.nickname === "หวาย"), true);
  assert.equal(people.some((item: any) => item.nickname === "ทดสอบ"), false);
});

test("main directory viewers can update approved profile fields but not role or credentials", () => {
  const db = state();
  provision(db, { actor: db.users[0], records, preview: false, now: "2026-11-17T00:00:00.000Z" });
  const actor = db.users.find((user: any) => user.code === "VIEW001");
  const target = db.users.find((user: any) => user.code === "VIEW002");
  const passwordHash = target.passwordHash;
  const item = updatePerson(db, { actor, employeeId: target.id, changes: { firstName: "คุณ", lastName: "หวาย", phone: "0812345678", nickname: "หวาย", position: "ผู้ดูแลข้อมูล", department: "Administration" }, photoUrl: "/storage/profile/view002.jpg" });
  assert.equal(item.nickname, "หวาย"); assert.equal(item.department, "Administration");
  assert.equal(target.role, "People_Viewer"); assert.equal(target.code, "VIEW002"); assert.equal(target.passwordHash, passwordHash);
});
