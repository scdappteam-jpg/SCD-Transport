import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("mobile entry page is a single employee portal for attendance and field operations", () => {
  const html = readFileSync(new URL("../public/legacy/mobile.html", import.meta.url), "utf8");
  const auth = readFileSync(new URL("../src/app/attendance-auth/page.tsx", import.meta.url), "utf8");
  assert.match(html, /ศูนย์รวมพนักงาน \/ Employee Portal/);
  assert.match(html, /href="\/attendance-auth"/);
  assert.match(html, /ลงเวลาและเปิด GPS/);
  assert.match(html, /href="#mobileFieldLogin"/);
  assert.match(html, /Pickup · WH3 · Terminal · Billing/);
  assert.match(auth, /กลับศูนย์รวมพนักงาน/);
});
