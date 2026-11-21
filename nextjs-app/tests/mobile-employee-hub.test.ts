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
  assert.match(html, /<input id="mobileUserSelect" type="text"/);
  assert.doesNotMatch(html, /<select id="mobileUserSelect"/);
  assert.match(html, /mobile\.js\?v=20261121-login-input-safe-area/);
  assert.match(html, /\[hidden\]\{display:none!important\}/);
  assert.match(html, /mobile-auth-pending/);
  assert.match(auth, /กลับศูนย์รวมพนักงาน/);
});

test("production mobile login resolves typed employee codes and does not persist demo shortcuts", () => {
  const js = readFileSync(new URL("../public/legacy/mobile.js", import.meta.url), "utf8");
  const css = readFileSync(new URL("../public/legacy/mobile.css", import.meta.url), "utf8");
  assert.match(js, /const loginKey = login\.toUpperCase\(\)/);
  assert.match(js, /String\(user\.code \|\| ""\)\.toUpperCase\(\) === loginKey/);
  assert.match(js, /var demo = params\.get\("demo"\) === "1"/);
  assert.doesNotMatch(js, /localStorage\.getItem\("scdDemoLogin"\) === "1"/);
  assert.match(css, /env\(safe-area-inset-top\)/);
  assert.match(css, /\.login-card\[hidden\]\{display:none!important\}/);
  assert.match(css, /body\.mobile-locked main>:not\(\.login-card\)\{display:none!important\}/);
  assert.match(css, /@media\(max-width:520px\)\{\.employee-mobile-hub-grid\{grid-template-columns:1fr\}/);
});
