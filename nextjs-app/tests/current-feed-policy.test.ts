import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const policy = require("../src/server/current-feed-policy.cjs");

test("an old operational job is not kept merely because it was updated today", () => {
    const job = {
        pickupDate: "2026-10-24",
        flightTime: "2026-10-24T12:00:00+07:00",
        createdAt: "2026-10-24T07:00:00+07:00",
        updatedAt: "2026-11-03T09:00:00+07:00"
    };
    assert.deepEqual(policy.jobBusinessDates(job), ["2026-10-24"]);
    assert.equal(policy.jobBelongsToDate(job, "2026-11-03"), false);
});

test("a manual job without an operational date falls back to its creation date", () => {
    assert.equal(policy.jobBelongsToDate({ createdAt: "2026-11-02T17:30:00Z" }, "2026-11-03"), true);
});

test("the import watermark blocks dated old rows but allows current and undated linkage rows", () => {
    const db = { integrations: { minimumImportDate: "2026-11-03" } };
    assert.equal(policy.allowsImportDate(db, "2026-10-24"), false);
    assert.equal(policy.allowsImportDate(db, "2026-11-03T01:00:00+07:00"), true);
    assert.equal(policy.allowsImportDate(db, ""), true);
});
