import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {render,refreshPlan,register,savedHtml}=createRequire(import.meta.url)('../src/server/invoice-document.cjs');
const escapeHtml=(v:unknown)=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const bill={id:'INV-2026-0001',status:'Draft',houseNumber:'SIT-L2',customerId:'SIT-C',amount:1000,draftedAt:'2026-10-25T04:42:50Z',dueDate:'2026-10-25T04:42:50Z',pdfUrl:'/storage/invoices/INV-2026-0001.html'};
const job={houseNumber:'SIT-L2',invoiceId:bill.id,customerId:'SIT-C',flightNo:'SIT100',flightTime:'2026-10-26T12:00:00Z'};
const customer={id:'SIT-C',name:'SIT ONLY',address:'123 <Building A> & B\nชั้น 2 "ห้องทดสอบ"'};
const db=()=>structuredClone({billing:[bill],jobs:[job,{...job,houseNumber:'REAL-UNRELATED'}],customers:[customer]});
test('Invoice prints the exact customer address safely, preserving Thai and line breaks',()=>{const html=render(bill,job,customer,{escapeHtml,formatBangkok:(v:string)=>v});assert.ok(html.includes('123 &lt;Building A&gt; &amp; B\nชั้น 2 &quot;ห้องทดสอบ&quot;'));assert.ok(html.includes('white-space: pre-wrap'));assert.ok(html.includes('Total: 1,000 THB'));assert.ok(!html.includes('<Building A>'));});
test('Draft refresh selects only the requested invoice and never changes accounting or job metadata',()=>{const d=db(),before=JSON.stringify(d);const p=refreshPlan(d,{role:'Billing'},{invoiceId:bill.id,houseNumber:job.houseNumber});assert.equal(p.bill.id,bill.id);assert.equal(JSON.stringify(d),before);});
test('Draft refresh denies unrelated House, roles, issued documents and mismatched ownership',()=>{assert.throws(()=>refreshPlan(db(),{role:'Driver'},{invoiceId:bill.id,houseNumber:job.houseNumber}),/สิทธิ์/);assert.throws(()=>refreshPlan(db(),{role:'Billing'},{invoiceId:bill.id,houseNumber:'REAL-UNRELATED'}),/House/);const d=db();d.billing[0].status='Sent';assert.throws(()=>refreshPlan(d,{role:'Billing'},{invoiceId:bill.id,houseNumber:job.houseNumber}),/Draft/);const other=db();other.jobs[0].customerId='OTHER';assert.throws(()=>refreshPlan(other,{role:'Admin'},{invoiceId:bill.id,houseNumber:job.houseNumber}),/ที่อยู่/);});

test('Generated HTML survives missing local files through shared state without evidence MIME uploads',()=>{const d={...db(),attachments:[]};const first=register(d,bill,job,'<html>Address A</html>');register(d,bill,job,'<html>Address B</html>');assert.equal(d.attachments.length,1);assert.equal(savedHtml(d,bill.pdfUrl),'<html>Address B</html>');assert.equal(first.fileId,'INVOICE-DOC-'+bill.id);assert.equal(savedHtml(d,'/storage/invoices/OTHER.html'),null);assert.equal(savedHtml({...d,billing:[]},bill.pdfUrl),null);});
