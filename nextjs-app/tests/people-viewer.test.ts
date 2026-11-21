import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { provision, provisionTest, provisionAdditional, directory, assignScdCodes, changePassword, createPerson, updatePerson } = require("../src/server/people-viewer.cjs");

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
  assert.match(client, /populateEditorSelect\("position", \[\.\.\.items\.map\(person => person\.position\), \.\.\.FIXED_POSITIONS\]/);
  assert.match(client, /populateEditorSelect\("editDepartment", items\.map\(person => person\.department\)/);
  assert.match(client, /\$\("employeeId"\)\.value = item\.id \|\| item\.employeeId \|\| id/);
  assert.match(client, /\$\("employeeCodeDisplay"\)\.value = item\.employeeCode \|\| item\.code \|\| item\.id/);
  assert.match(html, /รหัสพนักงาน<input id="employeeCodeDisplay" readonly/);
  assert.match(html, /ไม่เกิน 8 MB/);
  assert.match(html, /people-directory\.js\?v=20261121-directory-progress-kpi/);
  assert.match(client, /MAX_PROFILE_PHOTO_BYTES = 8 \* 1024 \* 1024/);
  assert.match(client, /ไม่เกิน 8 MB/);
  assert.match(html, /id="addPerson"[^>]*>\+ เพิ่มพนักงานใหม่/);
  assert.match(client, /"\/api\/people-directory\/create"/);
  assert.match(client, /FIXED_POSITIONS = \["พนักงานวัดขนาดสินค้า \(Dimension\)"\]/);
  assert.match(client, /\[\.\.\.items\.map\(person => person\.position\), \.\.\.FIXED_POSITIONS\]/);
  assert.match(html, /id="kpiGrid"/);
  assert.match(client, /\["untouched", "ยังไม่เคยแก้ไข"\]/);
  assert.match(client, /\["no-photo", "ยังไม่มีรูป"\]/);
  assert.match(client, /foldThaiSearch/);
  assert.match(client, /item\.nickname/);
  assert.match(client, /replace\(\/\[\\u0e47-\\u0e4c\]\//);
});

test("people directory API accepts profile photos up to eight megabytes", () => {
  const api = readFileSync(new URL("../src/server/legacy-api.cjs", import.meta.url), "utf8");
  assert.match(api, /content\.length > 8 \* 1024 \* 1024/);
  assert.match(api, /รูปถ่ายต้องมีขนาดไม่เกิน 8 MB/);
});

test("people directory stores profile photos durably and falls back cleanly when an old file is unavailable", () => {
  const api = readFileSync(new URL("../src/server/legacy-api.cjs", import.meta.url), "utf8");
  const html = readFileSync(new URL("../public/legacy/people-directory.html", import.meta.url), "utf8");
  const client = readFileSync(new URL("../public/legacy/people-directory.js", import.meta.url), "utf8");
  assert.match(api, /people-directory\/profile\/\$\{filename\}/);
  assert.match(api, /streamSupabasePeopleDirectoryPhoto/);
  assert.match(api, /await savePeopleDirectoryPhoto\(payload\.photoBase64/);
  assert.match(client, /photo-fallback hidden/);
  assert.match(client, /image\.naturalWidth === 0/);
  assert.match(client, /response\.blob\(\)/);
  assert.match(client, /URL\.createObjectURL\(blob\)/);
  assert.match(client, /photoFilename\(item, blob\.type\)/);
  assert.match(client, /data-export-id/);
  assert.match(html, /id="exportAll"[^>]*>ส่งออกชุดงาน ZIP/);
  assert.match(client, /"\/api\/people-directory\/export"/);
  assert.match(client, /response\.headers\.get\("content-disposition"\)/);
});

test("people viewers can enter the personnel registry from the main login", () => {
  const app = readFileSync(new URL("../public/legacy/app.js", import.meta.url), "utf8");
  const index = readFileSync(new URL("../public/legacy/index.html", import.meta.url), "utf8");
  assert.match(app, /selectedUser\?\.role === "People_Viewer"/);
  assert.match(app, /sessionStorage\.setItem\("scdPeopleViewerSession", token\)/);
  assert.match(app, /window\.location\.href = "\/legacy\/people-directory\.html"/);
  assert.match(index, /app\.js\?v=20261121-live-person-search/);
});

test("people directory batch export is protected and contains the expected package files", () => {
  const api = readFileSync(new URL("../src/server/legacy-api.cjs", import.meta.url), "utf8");
  assert.match(api, /pathname === "\/api\/people-directory\/export"/);
  assert.match(api, /actor\.role !== peopleViewer\.VIEWER_ROLE/);
  assert.match(api, /name: "personnel\.csv"/);
  assert.match(api, /name: "missing-photos\.csv"/);
  assert.match(api, /name: "generation-brief\.txt"/);
  assert.match(api, /archive\.append\(photo\.bytes/);
  assert.match(api, /new ZipArchive\(\{ zlib: \{ level: 6 \} \}\)/);
  assert.match(api, /archive\.on\("data", chunk => chunks\.push\(Buffer\.from\(chunk\)\)\)/);
  assert.match(api, /"Content-Length": body\.length/);
  assert.doesNotMatch(api, /archive\.pipe\(res\)/);
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

test("directory read and update force a shared-state refresh before resolving employees", () => {
  const api = readFileSync(new URL("../src/server/legacy-api.cjs", import.meta.url), "utf8");
  const getRoute = api.slice(api.indexOf('if (req.method === "GET" && pathname === "/api/people-directory")'), api.indexOf('if (req.method === "POST" && pathname === "/api/people-directory/update")'));
  const updateRoute = api.slice(api.indexOf('if (req.method === "POST" && pathname === "/api/people-directory/update")'), api.indexOf('if (req.method === "POST" && pathname === "/api/people-viewers/provision")'));
  assert.match(getRoute, /await refreshDbIfSharedStateChanged\(true\);\s*db = readDb\(\);/);
  assert.match(getRoute, /pathname === "\/api\/people-directory\/create"[\s\S]*await refreshDbIfSharedStateChanged\(true\);\s*const currentDb = readDb\(\);/);
  assert.match(updateRoute, /await refreshDbIfSharedStateChanged\(true\);\s*const currentDb = readDb\(\);/);
  assert.match(api, /peopleViewerPaths = new Set\(\[[\s\S]*"\/api\/people-directory"[\s\S]*"\/api\/mobile\/bootstrap"[\s\S]*"\/api\/attendance\/checkin"[\s\S]*"\/api\/attendance\/checkout"/);
  assert.match(api, /viewer\.role === peopleViewer\.VIEWER_ROLE \? publicUsers\(db\)\.filter\(user => user\.id === viewer\.id\) : publicUsers\(db\)/);
});

test("main staff page loads the shared personnel directory instead of login users", () => {
  const app = readFileSync(new URL("../public/legacy/app.js", import.meta.url), "utf8");
  const html = readFileSync(new URL("../public/legacy/index.html", import.meta.url), "utf8");
  assert.match(app, /if \(view === "staff"\) loadPersonnelDirectoryForStaff\(\)/);
  assert.match(app, /api\("\/api\/people-directory", null, "GET"\)/);
  assert.match(app, /state\.personnelDirectory = \(data\.items \|\| \[\]\)\.map/);
  assert.match(app, /users\.filter\(user => user\.department === department\.role\)/);
  assert.match(html, /ทะเบียนบุคลากร \/ Personnel Directory/);
  assert.match(html, /20261121-live-person-search/);
});

test("SCD employee codes start with management and preserve old login aliases", () => {
  const db = {
    users: [
      { id: "u_admin", code: "ADMIN", name: "Admin", role: "Admin", status: "Active" },
      { id: "u_driver", code: "EMP100", name: "นาย คนขับ หนึ่ง", role: "Driver", status: "Active" },
      { id: "u_exec", code: "EMP900", name: "นาง ผู้บริหาร หนึ่ง", role: "Executive", status: "Active" },
      { id: "u_office", code: "EMP050", name: "นาง ธุรการ หนึ่ง", role: "Employee", status: "Active" },
    ],
    hr: { employeeProfiles: {
      u_driver: { department: "ขนส่ง", position: "พนักงานขับรถ" },
      u_exec: { department: "บริหาร", position: "ผู้บริหาร" },
      u_office: { department: "ธุรการ", position: "เจ้าหน้าที่ธุรการ" },
    }, auditLogs: [] },
  } as any;
  const actor = db.users[0];
  const preview = assignScdCodes(db, { actor, preview: true });
  assert.equal(preview.first[0].newCode, "SCD001");
  assert.equal(preview.first[0].name, "นาง ผู้บริหาร หนึ่ง");
  assert.equal(db.users[2].code, "EMP900");
  const applied = assignScdCodes(db, { actor, preview: false, now: "2026-11-21T00:00:00.000Z" });
  assert.equal(db.users[2].code, "SCD001");
  assert.equal(db.users[3].code, "SCD002");
  assert.equal(db.users[1].code, "SCD003");
  assert.deepEqual(db.users[2].loginAliases, ["EMP900"]);
  assert.equal(applied.items.find((item: any) => item.id === "u_exec").employeeCode, "SCD001");
  assert.equal(db.hr.auditLogs.at(-1).action, "EmployeeCodesStandardized");
});

test("viewer creates a directory-only employee with an automatic code and no login credential", () => {
  const db = state();
  const actor = { id: "u_view", role: "People_Viewer" };
  const before = db.users.length;
  const preview = createPerson(db, { actor, changes: { firstName: "นางสาว ใหม่", lastName: "ทดสอบ", phone: "089-123-4567", nickname: "ใหม่", position: "ธุรการ", department: "บริหาร" }, preview: true });
  assert.equal(db.users.length, before);
  assert.match(preview.id, /^SCD\d{3}$/);
  const item = createPerson(db, { actor, changes: { firstName: "นางสาว ใหม่", lastName: "ทดสอบ", phone: "089-123-4567", nickname: "ใหม่", position: "ธุรการ", department: "บริหาร" }, photoUrl: "/storage/profile/new-person.jpg", now: "2026-11-20T00:00:00.000Z" });
  const user = db.users.find((entry: any) => entry.id === item.id);
  assert.equal(user.code, item.id);
  assert.equal(user.role, "Employee");
  assert.equal(user.directoryOnly, true);
  assert.equal(user.passwordHash, undefined);
  assert.equal(item.photoUrl, "/storage/profile/new-person.jpg");
  assert.equal(db.hr.employeeProfiles[item.id].department, "บริหาร");
  assert.equal(db.hr.auditLogs.at(-1).action, "PeopleDirectoryProfileCreated");
});

test("new employee creation requires a viewer and rejects matching active people", () => {
  const db = state();
  const changes = { firstName: "นาย สมชาย", lastName: "ใจดี", phone: "081-111-1111", nickname: "ชาย", position: "Driver", department: "Transport" };
  assert.throws(() => createPerson(db, { actor: db.users[0], changes }), /เฉพาะผู้ดูแลทะเบียนบุคลากร/);
  assert.throws(() => createPerson(db, { actor: { id: "u_view", role: "People_Viewer" }, changes }), /รายชื่อพนักงานซ้ำ/);
  assert.throws(() => createPerson(db, { actor: { id: "u_view", role: "People_Viewer" }, changes: { firstName: "คนใหม่" } }), /ตำแหน่งและแผนก/);
});

test("all legacy personnel identifiers remain editable by id employeeId or code", () => {
  const db = state();
  db.users.push(
    { code: "LEG001", name: "คน ไม่มีไอดี", role: "Driver", status: "Active" },
    { employeeId: "EMP-LEG-002", code: "LEG002", name: "คน ไอดีเก่า", role: "WH_Staff", status: "Active" },
  );
  const actor = { id: "u_view", role: "People_Viewer" };
  const listed = directory(db);
  assert.ok(listed.some((item: any) => item.id === "LEG001"));
  assert.ok(listed.some((item: any) => item.id === "EMP-LEG-002"));
  const byCode = updatePerson(db, { actor, employeeId: "LEG001", changes: { firstName: "คน", lastName: "แก้แล้ว", position: "Driver", department: "Transport" } });
  const byEmployeeId = updatePerson(db, { actor, employeeId: "EMP-LEG-002", changes: { firstName: "คน", lastName: "แก้แล้วสอง", position: "WH Staff", department: "คลังสินค้า WH3" } });
  assert.equal(byCode.lastName, "แก้แล้ว");
  assert.equal(byEmployeeId.lastName, "แก้แล้วสอง");
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
  assert.deepEqual(Object.keys(items[0]).sort(), ["department", "employeeCode", "firstName", "hasBeenEdited", "id", "lastEditedAt", "lastName", "nickname", "phone", "photoUrl", "position"]);
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
  assert.equal(item.hasBeenEdited, true); assert.equal(item.lastEditedAt, "2026-11-19T00:00:00.000Z");
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
  const listedTarget = directory(db).find((person: any) => person.nickname === "หวาย");
  assert.equal(listedTarget.id, "VIEW002");
  const item = updatePerson(db, { actor, employeeId: listedTarget.id, changes: { firstName: "คุณ", lastName: "หวาย", phone: "0812345678", nickname: "หวาย", position: "ผู้ดูแลข้อมูล", department: "Administration" }, photoUrl: "/storage/profile/view002.jpg" });
  assert.equal(item.nickname, "หวาย"); assert.equal(item.department, "Administration");
  assert.equal(target.role, "People_Viewer"); assert.equal(target.code, "VIEW002"); assert.equal(target.passwordHash, passwordHash);
});
