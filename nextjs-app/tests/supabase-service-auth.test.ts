import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import auth from '../src/server/supabase-service-auth.cjs';
import storageService from '../src/server/attachment-storage.cjs';

test('configured modern server secret takes priority over the legacy service-role JWT', () => {
  assert.equal(auth.serviceKey({SUPABASE_SECRET_KEY:'sb_secret_fixture', SUPABASE_SERVICE_ROLE_KEY:'legacy.fixture.jwt'}),'sb_secret_fixture');
  assert.equal(auth.serviceKey({SUPABASE_SERVICE_ROLE_KEY:'legacy.fixture.jwt'}),'legacy.fixture.jwt');
  assert.equal(auth.serviceKey({SUPABASE_ANON_KEY:'anon.fixture.jwt'}),'anon.fixture.jwt');
  assert.equal(auth.serviceKey({}),'');
});

test('opaque keys are sent as apikey, never as a Bearer JWT', () => {
  for (const key of ['sb_secret_fixture','sb_publishable_fixture']) {
    assert.deepEqual(auth.serviceHeaders(key),{apikey:key});
  }
  assert.deepEqual(auth.serviceHeaders('legacy.fixture.jwt'),{apikey:'legacy.fixture.jwt',Authorization:'Bearer legacy.fixture.jwt'});
});

test('durable evidence uses modern credentials correctly on upload and read after a process restart', async () => {
  const object = {fileId:'SIT-file',houseNumber:'SIT-key-compat',url:'/storage/SIT-key-compat/file.png',createdAt:'2026-10-28T04:00:00Z',mimeType:'image/png'};
  const calls: RequestInit[]=[];
  const storage = storageService.createStorage({url:'https://example.test',key:'sb_secret_fixture',fetcher:async (_url, options = {})=>{calls.push(options);return new Response('{}');}});
  const bytes = Buffer.from([137,80,78,71,13,10,26,10,1,2,3]);
  storage.queue(object,bytes);
  await storage.flush();
  assert.equal(calls.length,1);
  assert.equal(calls[0].method,'PUT');
  assert.equal((calls[0].headers as Record<string,string>).apikey,'sb_secret_fixture');
  assert.equal((calls[0].headers as Record<string,string>).Authorization,undefined);
  const reopened = storageService.createStorage({url:'https://example.test',key:'sb_secret_fixture',fetcher:async (_url, options = {})=>{calls.push(options);return new Response(bytes);}});
  const result = await reopened.restore({jobs:[{houseNumber:object.houseNumber}],attachments:[object]},{role:'Admin'},{houseNumber:object.houseNumber,files:[{fileId:object.fileId,base64:bytes.toString('base64'),sha256:createHash('sha256').update(bytes).digest('hex')}]});
  assert.equal(result.files[0].alreadyPresent,true);
  assert.equal(calls.length,2);
  assert.equal(calls[1].method,undefined);
  assert.equal((calls[1].headers as Record<string,string>).apikey,'sb_secret_fixture');
  assert.equal((calls[1].headers as Record<string,string>).Authorization,undefined);
});

test('sync errors distinguish expired/future JWT, generic auth and network failures', () => {
  assert.match(auth.syncErrorHint('HTTP 401 JWT issued at future'),/อนาคต/);
  assert.match(auth.syncErrorHint('HTTP 401 JWT expired'),/หมดอายุ/);
  assert.doesNotMatch(auth.syncErrorHint('PGRST303'),/อนาคต|นาฬิกา|หมดอายุ/);
  assert.match(auth.syncErrorHint('Shared database request deadline exceeded'),/หมดเวลา/);
  assert.match(auth.syncErrorHint('ECONNRESET'),/ขัดข้อง/);
  assert.doesNotMatch(auth.syncErrorHint('HTTP 403'),/นาฬิกา/);
});
