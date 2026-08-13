import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { legacyViewRoutes } from "../src/server/legacy-route-manifest.ts";

const root = new URL("../", import.meta.url);

test("all legacy desktop views have an App Router compatibility route", async () => {
  const html = await readFile(new URL("public/legacy/index.html", root), "utf8");
  const app = await readFile(new URL("public/legacy/app.js", root), "utf8");
  const views = new Set(Array.from(html.matchAll(/data-page="([^"]+)"/g), match => match[1]));
  const routedViews = new Set(Object.values(legacyViewRoutes));

  assert.deepEqual([...routedViews].sort(), [...views].sort());
  assert.match(app, /function applyRequestedWebView/);
  assert.match(app, /URLSearchParams\(window\.location\.search\)\.get\("view"\)/);
});

test("the App Router catch-all preserves the legacy API namespace", async () => {
  const legacyApi = await readFile(new URL("src/server/legacy-api.cjs", root), "utf8");
  const route = await readFile(new URL("src/app/api/[...path]/route.ts", root), "utf8");
  const paths = new Set(Array.from(legacyApi.matchAll(/pathname\s*(?:===|\.startsWith\()\s*["`]([^"`]+)["`]/g), match => match[1]));

  assert.ok(paths.size >= 60);
  assert.ok(paths.has("/api/bootstrap"));
  assert.ok(paths.has("/api/scan-barcode"));
  assert.ok(paths.has("/api/jobs/timeline"));
  assert.match(route, /handleLegacyApiRequest/);
  assert.match(route, /export const GET/);
  assert.match(route, /export const POST/);
  assert.match(route, /export const DELETE/);
});
