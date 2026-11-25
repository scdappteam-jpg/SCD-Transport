import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../public/legacy/app.js',import.meta.url),'utf8');
const fn=source.match(/function localizeText\(text\) \{[\s\S]*?\n\}/)?.[0];
assert.ok(fn);
test('Thai and English localization preserves mixed package units references and same-language safety warnings',()=>{
    const ctx=vm.createContext({state:{lang:'th'}});
    vm.runInContext(fn,ctx);
    const values=['32 CTN / 26 PLT','87 CTN / 38 PLT','HAWB / ONHAND','MAWB / FLIGHT','25/11/2026 / 09:24','SIT — ข้อมูลทดสอบ / ห้ามใช้ส่งสินค้าจริง','Permit / Security / Inspected'];
    for(const lang of ['th','en']) {
        vm.runInContext(`state.lang='${lang}'`,ctx);
        for(const value of values) {
            ctx.input=value;
            assert.equal(vm.runInContext('localizeText(input)',ctx),value);
        }
    }
    assert.equal(vm.runInContext("state.lang='th';localizeText('เบิกสินค้า / Pick')",ctx),'เบิกสินค้า');
    assert.equal(vm.runInContext("state.lang='en';localizeText('เบิกสินค้า / Pick')",ctx),'Pick');
});
test('document content bypasses slash-based UI localization even when its text mixes languages',()=>{
    const apply=source.match(/function applyLanguage\(root = document.body\) \{[\s\S]*?\n\}/)?.[0];
    assert.ok(apply);
    const nodes=[{nodeValue:'สินค้า / 26 PLT',parentElement:{tagName:'TD',closest:()=>true}}];
    const ctx=vm.createContext({state:{lang:'th'},i18nOriginalText:new WeakMap(),NodeFilter:{SHOW_TEXT:4,FILTER_REJECT:2,FILTER_ACCEPT:1,FILTER_SKIP:3},
        document:{body:{},documentElement:{lang:''},createTreeWalker:(_r:unknown,_s:unknown,filter:{acceptNode:(n:unknown)=>number})=>{
            assert.equal(filter.acceptNode(nodes[0]),2);return {nextNode:()=>false};
        }},$$:()=>[],$:()=>null});
    vm.runInContext(fn+'\n'+apply,ctx);vm.runInContext('applyLanguage()',ctx);
    assert.equal(nodes[0].nodeValue,'สินค้า / 26 PLT');
});
