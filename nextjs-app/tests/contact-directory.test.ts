import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const contacts = require("../src/server/contact-directory.cjs");
const admin = { id: "u_admin", role: "Admin" };

const fixture = () => ({ contacts: [{
    id: "ct_old", category: "Airline", organization: "THAI AIRWAYS", name: "Cargo",
    role: "Acceptance", phone: "02-1374200", email: "cargo@example.com", status: "Active"
}] });

test("contact import preview reports create, update, unchanged, and input duplicates", () => {
    const db = fixture();
    const result = contacts.importContacts(db, { actor: admin, preview: true, records: [
        { category: "Airline", organization: "THAI AIRWAYS", name: "Cargo", role: "Acceptance", phone: "02-1374200", email: "cargo@example.com" },
        { category: "Airline", organization: "THAI AIRWAYS", name: "Cargo", role: "Acceptance", phone: "02-1374200", email: "cargo@example.com" },
        { category: "Agent", organization: "YUSEN", name: "Warehouse", phone: "02-1347755" }
    ] });
    assert.equal(result.receivedCount, 3);
    assert.equal(result.validCount, 2);
    assert.equal(result.duplicateCount, 1);
    assert.equal(result.unchangedCount, 1);
    assert.equal(result.createCount, 1);
    assert.equal(db.contacts.length, 1);
});

test("contact import applies stable upserts without creating duplicates", () => {
    const db = fixture();
    const records = [{ category: "Agent", organization: "YUSEN", name: "Warehouse", phone: "02-1347755" }];
    const first = contacts.importContacts(db, { actor: admin, preview: false, records, now: "2026-11-17T00:00:00.000Z" });
    const second = contacts.importContacts(db, { actor: admin, preview: false, records, now: "2026-11-17T00:01:00.000Z" });
    assert.equal(first.createCount, 1);
    assert.equal(second.unchangedCount, 1);
    assert.equal(db.contacts.length, 2);
});

test("contact import rejects non-admin users and missing contact methods", () => {
    assert.throws(() => contacts.importContacts({ contacts: [] }, { actor: { id: "u_cs", role: "CS" }, records: [{ organization: "A", phone: "1" }] }), /Admin/);
    assert.throws(() => contacts.validateRecords([{ organization: "A" }]), /เบอร์โทรหรืออีเมล/);
});

test("visible contacts exclude inactive records and internal audit fields", () => {
    const db = { contacts: [
        { id: "1", category: "Agent", organization: "A", phone: "1", status: "Active", createdBy: "secret" },
        { id: "2", category: "Agent", organization: "B", phone: "2", status: "Inactive" }
    ] };
    const rows = contacts.visibleContacts(db);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].organization, "A");
    assert.equal("createdBy" in rows[0], false);
});

test("contact import updates a workbook row when its category is corrected", () => {
    const db:any={contacts:[{id:"old",category:"Airline service",organization:"SCD",name:"Driver",role:"",phone:"0811111111",email:"",airlineCode:"",terminal:"",note:"",sourceSheet:"SCD",sourceRow:2,status:"Active"}]};
    const records=[{category:"SCD Fleet",organization:"SCD",name:"Driver",role:"",phone:"0811111111",email:"",sourceSheet:"SCD",sourceRow:2,status:"Active"}];
    const preview=contacts.importContacts(db,{actor:admin,records,preview:true});
    assert.equal(preview.updateCount,1); assert.equal(preview.createCount,0);
    contacts.importContacts(db,{actor:admin,records,preview:false});
    assert.equal(db.contacts.length,1); assert.equal(db.contacts[0].category,"SCD Fleet");
});
