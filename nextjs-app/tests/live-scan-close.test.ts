import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../public/legacy/live-scan.js", import.meta.url), "utf8");

test("scanner session is invalidated before camera cleanup", () => {
  assert.match(source, /var scanSession = 0/);
  assert.match(source, /function closeLiveScan\(\) \{\s+scanSession \+= 1/);
  assert.match(source, /if \(!overlay \|\| session !== scanSession\) return/);
  assert.match(source, /if \(session !== scanSession\) \{ stopScanner\(current\); return; \}/);
});
