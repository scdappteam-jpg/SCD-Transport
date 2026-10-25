import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../public/legacy/app.js',import.meta.url),'utf8');
const helper=source.slice(source.indexOf('function billingAttachmentFiles('),source.indexOf('function renderBillingContext('));
const context=vm.createContext({URL,window:{location:{href:'https://scd-transport.onrender.com/legacy/index.html'}},Date});
vm.runInContext(helper,context);
type File={fileType:string;fileId?:string;url?:string;createdAt?:string};
const invoice={id:'INV-2026-0002',pdfUrl:'/storage/invoices/INV-2026-0002.html',draftedAt:'2026-10-25T07:37:22Z'};
const saved:File={fileId:'INVOICE-DOC-'+invoice.id,fileType:'InvoiceDocument',url:invoice.pdfUrl,createdAt:invoice.draftedAt};
function files(bill:unknown,rows:File[]):File[]{return JSON.parse(JSON.stringify(context.billingAttachmentFiles(bill,rows)));}

test('persisted InvoiceDocument wins over its generated fallback without changing data',()=>{
 const rows=[saved,{fileId:'PHOTO',fileType:'ProductImage',url:'/storage/SIT/photo.png'}];const before=JSON.stringify(rows);
 assert.deepEqual(files(invoice,rows),rows);assert.equal(JSON.stringify(rows),before);
});
test('relative and absolute links to the same invoice render only once',()=>{
 assert.equal(files(invoice,[{...saved,fileId:'OTHER-REFERENCE',url:'https://scd-transport.onrender.com'+invoice.pdfUrl}]).length,1);
});
test('repeated registered invoice IDs collapse even when an old URL differs',()=>{
 assert.deepEqual(files(null,[saved,{...saved,url:'/storage/invoices/old.html'}]),[saved]);
});
test('distinct invoice history and separate evidence captures remain visible',()=>{
 const other={...saved,fileId:'INVOICE-DOC-OLDER',url:'/storage/invoices/OLDER.html'};
 const photos=[{fileId:'A',fileType:'ProductImage',url:'/storage/SIT/photo.png'},{fileId:'B',fileType:'ProductImage',url:'/storage/SIT/photo.png'}];
 assert.deepEqual(files(invoice,[other,saved,...photos]),[other,saved,...photos]);
});
test('legacy invoices with no registered document retain a usable fallback',()=>{
 assert.deepEqual(files(invoice,[]),[saved]);
});
test('unkeyed invoice rows are not silently removed',()=>{
 assert.equal(files(null,[{fileType:'InvoiceDocument'},{fileType:'InvoiceDocument'}]).length,2);
});
