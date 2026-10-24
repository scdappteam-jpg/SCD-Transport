import test from "node:test";
import assert from "node:assert/strict";
import { Readable, Writable } from "node:stream";
import { storageResponse } from "../src/server/storage-response.ts";
type Sink = Writable & { writeHead: (status: number, headers?: Record<string, string | number>) => void };

test("storage waits for asynchronous piped evidence and preserves bytes and MIME", async () => {
  const bytes = Buffer.from([137, 80, 78, 71, 0, 255]);
  const response = await storageResponse(new Request("http://localhost/storage/SIT/file.png"), "/storage/SIT/file.png", async (_req, output) => {
    const res = output as Sink;
    setImmediate(() => { res.writeHead(200, { "Content-Type": "image/png", "Content-Length": bytes.length }); Readable.from([bytes]).pipe(res); });
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/png");
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
});

test("storage preserves cloud fallback responses and missing-file status", async () => {
  for (const status of [200, 404]) {
    const response = await storageResponse(new Request("http://localhost/storage/SIT/file.png"), "/storage/SIT/file.png", async (_req, output) => {
    const res = output as Sink;
      res.writeHead(status, { "Content-Type": "application/json" }); res.end('{"result":"test"}');
    });
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), { result: "test" });
  }
});

test("storage HEAD retains metadata without a response body", async () => {
  const response = await storageResponse(new Request("http://localhost/storage/a", { method: "HEAD" }), "/storage/a", async (_req, output) => {
    const res = output as Sink;
    res.writeHead(200, { "Content-Length": 4 }); res.end("test");
  });
  assert.equal(await response.text(), "");
  assert.equal(response.headers.get("content-length"), "4");
});

test("storage refuses traversal, backslashes and invalid encodings before file access", async () => {
  for (const path of ["/storage/../secret", "/storage/%2e%2e/secret", "/storage/a%5c..%5csecret", "/storage/%00", "/storage/%ZZ", "/api/secret"]) {
    const response = await storageResponse(new Request("http://localhost/"), path, async () => { assert.fail("must not access files"); });
    assert.ok([400, 403].includes(response.status));
  }
});

