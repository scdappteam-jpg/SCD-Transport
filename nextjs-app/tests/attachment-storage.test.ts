import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import service from '../src/server/attachment-storage.cjs';
const { createStorage, objectPath } = service;
const file = {fileId:'FILE-test',houseNumber:'SIT-test',url:'/storage/SIT-test/FILE-test.png',createdAt:'2026-10-24T08:53:00Z',mimeType:'image/png'};
const bytes = Buffer.from([137,80,78,71,13,10,26,10,1,2,3]);
const sha256 = createHash('sha256').update(bytes).digest('hex');
const payload = {houseNumber:'SIT-test',files:[{fileId:file.fileId,base64:bytes.toString('base64'),sha256}]};
const database = () => ({jobs:[{houseNumber:'SIT-test',status:'AwaitingReleaseDocument'}],attachments:[{...file}]});
const missing = () => Response.json({statusCode:'404'}, {status:400});

test('durable storage uploads once per new file independently of relational mirroring', async () => {
  const calls: RequestInit[] = [];
  const storage = createStorage({url:'https://example.test',key:'test',fetcher:async (_url, options = {})=>{calls.push(options);return new Response('{}');}});
  storage.queue(file,bytes);
  await storage.flush(); await storage.flush();
  assert.equal(calls.length,1);
  assert.equal(calls[0].method,'PUT');
  assert.deepEqual(calls[0].body,bytes);
  assert.equal(objectPath(file),'SIT-test/2026/10/FILE-test.png');
});

test('failed durable upload rejects acknowledgment and remains retryable', async () => {
  let count = 0;
  const storage = createStorage({url:'https://example.test',key:'test',fetcher:async()=>new Response('{}',{status:++count===1?503:200})});
  storage.queue(file,bytes);
  await assert.rejects(storage.flush(),/durable storage/);
  await storage.flush(); await storage.flush(); assert.equal(count,2);
});

test('SIT recovery preserves file IDs and all database state while restoring missing bytes', async () => {
  const db = database(), before = structuredClone(db), methods: string[] = [];
  const storage = createStorage({url:'https://example.test',key:'test',fetcher:async (_url, options = {})=>{methods.push(options.method || 'GET');return options.method==='PUT'?new Response('{}'):missing();}});
  const result = await storage.restore(db,{role:'Admin'},payload);
  assert.deepEqual(methods,['GET','PUT']); assert.deepEqual(db,before);
  assert.equal(result.files[0].fileId,file.fileId);
});

test('SIT recovery denies non-Admin real Houses unknown IDs and bad checksums before network writes', async () => {
  let calls = 0;
  const storage = createStorage({url:'https://example.test',key:'test',fetcher:async()=>{calls++;return missing();}});
  for (const [role, input] of [
    ['Driver',payload], ['Admin',{...payload,houseNumber:'4840807196'}],
    ['Admin',{...payload,files:[{...payload.files[0],fileId:'unknown'}]}],
    ['Admin',{...payload,files:[{...payload.files[0],sha256:'wrong'}]}],
    ['Admin',{...payload,files:[payload.files[0],payload.files[0]]}],
  ] as const) await assert.rejects(storage.restore(database(),{role},input));
  assert.equal(calls,0);
});

test('SIT recovery is idempotent and refuses to overwrite different stored evidence', async () => {
  let writes = 0, same = true;
  const storage = createStorage({url:'https://example.test',key:'test',fetcher:async (_url, options = {})=>{
    if (options.method==='PUT') writes++;
    return new Response(same?bytes:Buffer.from('different'));
  }});
  assert.equal((await storage.restore(database(),{role:'Admin'},payload)).files[0].alreadyPresent,true);
  same = false; await assert.rejects(storage.restore(database(),{role:'Admin'},payload),/overwrite refused/);
  assert.equal(writes,0);
});

test('SIT recovery refuses storage authorization errors instead of treating them as missing', async () => {
  const storage = createStorage({url:'https://example.test',key:'test',fetcher:async()=>Response.json({error:'denied'},{status:403})});
  await assert.rejects(storage.restore(database(),{role:'Admin'},payload),/Unable to verify/);
});

