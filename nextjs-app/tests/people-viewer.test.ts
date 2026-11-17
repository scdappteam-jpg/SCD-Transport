import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { provision, directory } = require("../src/server/people-viewer.cjs");

function state() {
  return {
    users: [
      { id: "u_admin", code: "ADMIN", name: "Admin", role: "Admin", status: "Active" },
      { id: "u_emp1", code: "EMP001", name: "นาย สมชาย ใจดี", role: "Driver", status: "Active" },
      { id: "u_emp2", code: "EMP002", name: "นางสาว สมหญิง รักงาน", role: "WH_Staff", status: "Active" },
      { id: "u_old", code: "EMP003", name: "คน เก่า", role: "Driver", status: "Inactive" },
    ],
    hr: { employeeProfiles: { u_emp1: { profilePhotoUrl: "/storage/profile/u_emp1.jpg" } }, auditLogs: [] },
  } as any;
}

const records = [
  { code: "VIEW001", name: "ผู้ดูแลข้อมูล 1", temporaryPassword: "Scd!Viewer001#" },
  { code: "VIEW002", name: "ผู้ดูแลข้อมูล 2", temporaryPassword: "Scd!Viewer002#" },
];

test("provisions exactly two read-only viewer accounts", () => {
  const db = state();
  const result = provision(db, { actor: db.users[0], records, preview: false, now: "2026-11-17T00:00:00.000Z" });
  assert.equal(result.activeViewerCount, 2);
  const viewers = db.users.filter((user: any) => user.role === "People_Viewer" && user.status === "Active");
  assert.equal(viewers.length, 2);
  assert.ok(viewers.every((user: any) => /^scrypt\$/.test(user.passwordHash)));
  assert.ok(viewers.every((user: any) => !user.phone && !user.vehiclePlate));
});

test("directory exposes only first name, last name, and photo", () => {
  const items = directory(state());
  assert.equal(items.length, 2);
  assert.deepEqual(Object.keys(items[0]).sort(), ["firstName", "lastName", "photoUrl"]);
  const somchai = items.find((item: any) => item.lastName === "ใจดี");
  assert.equal(somchai.firstName, "นาย สมชาย");
  assert.equal(somchai.photoUrl, "/storage/profile/u_emp1.jpg");
});

test("rejects a batch that is not exactly two accounts", () => {
  const db = state();
  assert.throws(() => provision(db, { actor: db.users[0], records: records.slice(0, 1) }), /2 บัญชี/);
});

test("rejects non-admin provisioning", () => {
  const db = state();
  assert.throws(() => provision(db, { actor: db.users[1], records }), /เฉพาะ Admin/);
});
