import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { importRoster } = require("../src/server/hr-bulk-import.cjs");

function db() {
  return {
    users: [
      { id: "u_admin_01", code: "EMP001", name: "Admin", role: "Admin", status: "Active" },
      { id: "u_old", code: "EMP002", name: "Old", role: "Driver", status: "Active" },
    ],
    hr: { employeeProfiles: {}, payrollProfiles: {}, auditLogs: [] },
  } as any;
}

const records = [{
  employeeCode: "EMP025", name: "พนักงาน ปัจจุบัน", position: "พนักงานขับรถ",
  department: "ขนส่ง", systemRole: "Driver", baseSalary: 12000,
  temporaryPassword: "Scd!Abcd2345",
}];

test("previews without changing state", () => {
    const state = db();
    const before = JSON.stringify(state);
    const result = importRoster(state, { actor: state.users[0], records, preview: true });
    assert.equal(result.deactivateCount, 1);
    assert.equal(result.createCount, 1);
    assert.equal(result.activeAfterImport, 2);
    assert.equal(JSON.stringify(state), before);
});

test("keeps admin, deactivates old staff, and creates complete HR records", () => {
    const state = db();
    const result = importRoster(state, { actor: state.users[0], records, preview: false, now: "2026-11-17T00:00:00.000Z" });
    assert.equal(result.preview, false);
    assert.equal(state.users.find((user: any) => user.id === "u_admin_01")?.status, "Active");
    assert.equal(state.users.find((user: any) => user.id === "u_old")?.status, "Inactive");
    const employee: any = state.users.find((user: any) => user.code === "EMP025");
    assert.equal(employee.name, "พนักงาน ปัจจุบัน");
    assert.equal(employee.role, "Driver");
    assert.equal(employee.status, "Active");
    assert.match(employee.passwordHash, /^scrypt\$/);
    assert.equal(state.hr.employeeProfiles[employee.id].position, "พนักงานขับรถ");
    assert.equal(state.hr.payrollProfiles[employee.id].baseSalary, 12000);
    assert.equal(state.hr.importBackups.length, 1);
});

test("rejects duplicate names", () => {
    const state = db();
    assert.throws(() => importRoster(state, { actor: state.users[0], records: [...records, { ...records[0], employeeCode: "EMP026" }], preview: true }), /ชื่อพนักงานซ้ำ/);
});


