import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

const sandbox = { module: { exports: {} } };
vm.runInNewContext(readFileSync(new URL("../public/legacy/shipment-references.js", import.meta.url), "utf8"), sandbox);
const refs = sandbox.module.exports as {
    createIndex: (jobs: object[]) => unknown;
    identifiers: (job: object, index: unknown) => string[];
    label: (job: object, index: unknown) => string;
    grouped: (job: object, index?: unknown) => { onhand: string[]; master: string[]; house: string[]; pendingHouse: boolean };
    matches: (job: object, query: string, index: unknown) => boolean;
    pickupReferences: (onhand: string, hawb: unknown) => { onhandNumber: string; hawbNumber: string };
};

test("three references resolve through F/House links without linking shipments by shared Master", () => {
    const pickup = { houseNumber: "F842000001", hawbNumber: "4840000001" };
    const consol = { houseNumber: "4840000001", mawbNumber: "131-81373224" };
    const other = { houseNumber: "4840000002", mawbNumber: "131-81373224" };
    const index = refs.createIndex([pickup, consol, other]);
    assert.deepEqual([...refs.grouped(pickup, index).master], ["131-81373224"]);
    assert.deepEqual([...refs.grouped(consol, index).onhand], ["F842000001"]);
    assert.equal(refs.grouped(other, index).onhand.length, 0);
    for (const query of ["F842000001", "4840000001", "131-81373224", "13181373224", "131 81373224"]) {
        assert.equal(refs.matches(pickup, query, index), true);
        assert.equal(refs.matches(consol, query, index), true);
    }
    assert.equal(refs.matches(other, "F842000001", index), false);
});

test("AIR and missing references stay explicit instead of becoming real House numbers", () => {
    const job = { houseNumber: "F842000001", hawbNumber: "AIR" };
    const group = refs.grouped(job, refs.createIndex([job]));
    assert.equal(group.pendingHouse, true);
    assert.equal(group.house.length, 0);
    assert.equal(group.master.length, 0);
    assert.equal(refs.matches(job, "13181373224", undefined), false);
});

test("both references find and label existing records without merging their workflows", () => {
    const pickup = { houseNumber: "F842092988", ...refs.pickupReferences("F842092988", 4840805761) };
    const air = { houseNumber: "4840805761", status: "Stored" };
    const jobs = [pickup, air];
    const index = refs.createIndex(jobs);
    for (const job of jobs) {
        assert.deepEqual([...refs.identifiers(job, index)], ["4840805761", "F842092988"]);
        assert.equal(refs.label(job, index), "4840805761 · F842092988");
    }
    assert.equal(air.status, "Stored");
    assert.equal(jobs.length, 2);
});

test("AIR is displayed while pending and never links unrelated shipments", () => {
    const one = { houseNumber: "F842000001", hawbNumber: "AIR" };
    const two = { houseNumber: "F842000002", hawbNumber: "AIR" };
    const index = refs.createIndex([one, two]);
    assert.equal(refs.label(one, index), "F842000001 · AIR");
    assert.deepEqual([...refs.identifiers(two, index)], ["F842000002", "AIR"]);
});

test("multiple onhands for a HAWB are preserved and blanks do not invent references", () => {
    const jobs = [
        { houseNumber: "F842000001", hawbNumber: "4840000001" },
        { houseNumber: "F842000002", hawbNumber: "4840000001" }
    ];
    const index = refs.createIndex(jobs);
    assert.equal(refs.identifiers({ houseNumber: "4840000001" }, index).length, 3);
    assert.equal(refs.label({ houseNumber: "F842000003" }, index), "F842000003");
    assert.deepEqual({ ...refs.pickupReferences(" F842000003 ", "4840000003.0") }, {
        onhandNumber: "F842000003", hawbNumber: "4840000003"
    });
});

test("Pickup reimport saves the HAWB column and keeps the existing job identity and status", () => {
    const source = readFileSync(new URL("../src/server/legacy-api.cjs", import.meta.url), "utf8");
    const start = source.indexOf("function importPickupXlsxRows(");
    const end = source.indexOf("function isGlobalConsolFormat(", start);
    const job = { id: "existing-job", houseNumber: "F842092988", status: "Stored" };
    const context = {
        findJob: () => job,
        xlsxNumStr: (v: unknown) => v == null ? "" : String(v).trim(),
        xlsxUtcIso: () => "",
        upsertJob: (_db: unknown, values: object) => Object.assign(job, values),
        importPickupXlsxRows: undefined as unknown as (db: object, rows: unknown[][]) => { changedJobs: number }
    };
    vm.runInNewContext(source.slice(start, end), context);
    const rows = [["ONHAND", "HAWB", "PICKUP", "QTY"], [job.houseNumber, 4840805761, "Customer", 6]];
    const result = context.importPickupXlsxRows({}, rows);
    assert.equal(result.changedJobs, 1);
    assert.equal(job.id, "existing-job");
    assert.equal(job.status, "Stored");
    assert.equal(refs.label(job, refs.createIndex([job])), "4840805761 · F842092988");
    rows[1][1] = "AIR";
    context.importPickupXlsxRows({}, rows);
    assert.equal(refs.label(job, refs.createIndex([job])), "F842092988 · AIR");
});
