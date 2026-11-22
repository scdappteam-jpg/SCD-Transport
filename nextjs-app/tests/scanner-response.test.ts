import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {readScannerResponse}=createRequire(import.meta.url)('../src/server/scanner-response.cjs');
test('scanner rate limits with plain text are reported as temporary upstream failures, never JSON parse errors',async()=>{
 await assert.rejects(readScannerResponse(new Response('Too Many Requests\n',{status:429})),(e:{statusCode:number;upstreamStatus:number;message:string})=>e.statusCode===503&&e.upstreamStatus===429&&/จำกัดจำนวน/.test(e.message));
 await assert.rejects(readScannerResponse(new Response('<html>bad gateway</html>',{status:502})),(e:{statusCode:number})=>e.statusCode===502);
});
test('scanner malformed success fails closed, while real decoded results remain intact',async()=>{
 await assert.rejects(readScannerResponse(new Response('not-json',{status:200})),/ข้อมูลไม่ถูกต้อง/);
 const result={strictBarcode:true,barcodes:['4840812447']};assert.deepEqual(await readScannerResponse(Response.json(result)),result);
});
