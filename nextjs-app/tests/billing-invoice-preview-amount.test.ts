import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const app=readFileSync(new URL('../public/legacy/app.js',import.meta.url),'utf8');
const fn=app.match(/function billingPreviewRows\(invoice, jobs\) \{[\s\S]*?\n\}/);
assert.ok(fn);
const ctx=vm.createContext({money:(n:number)=>Number(n).toLocaleString('en-US'),escapeCell:(s:unknown)=>String(s)});
vm.runInContext(fn[0],ctx);
test('one trip with two Houses shows the confirmed invoice charge once instead of duplicating House rates',()=>{
    const html=vm.runInContext(`billingPreviewRows({amount:1000},[{houseNumber:'SIT-A',amount:1000},{houseNumber:'SIT-B',amount:1000}])`,ctx);
    assert.equal((html.match(/1,000/g)||[]).length,1);
    assert.match(html,/rowspan="2"/);
    assert.match(html,/SIT-A/);assert.match(html,/SIT-B/);
});
test('a confirmed zero invoice stays zero even when the job rate later changes',()=>{
    const html=vm.runInContext(`billingPreviewRows({amount:0},[{houseNumber:'SIT-A',amount:1000}])`,ctx);
    assert.match(html,/>0<\/td>/);assert.doesNotMatch(html,/1,000/);
});
