import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const source=readFileSync(new URL('../public/legacy/app.js',import.meta.url),'utf8');
test('CS bulk prompt and final confirmation preserve mixed CTN and PLT totals rather than legacy pieceCount',async()=>{
    const jobs=[{houseNumber:'SIT1',customerName:'A',pieceCount:26,packageCounts:{PLT:26,CTN:32}},{houseNumber:'SIT2',customerName:'B',pieceCount:12,packageCounts:{CTN:12}},{houseNumber:'SIT3',customerName:'A',pieceCount:11,packageCounts:{PLT:11,CTN:40}},{houseNumber:'SIT4',customerName:'C',pieceCount:1,packageCounts:{PLT:1,CTN:3}}];
    const prompts:string[]=[],confirmations:string[]=[];
    const ctx=vm.createContext({_csQueueTab:'pending',_csQueueData:jobs,_csJobDate:()=>'',_csApplyFilters:(j:unknown)=>j,scdPrompt:async(p:{note:string})=>{prompts.push(p.note);return 'SIT-REF';},window:{confirm:(s:string)=>{confirmations.push(s);return false;}}});
    for(const pattern of [/^function csPackingSummary\([\s\S]*?^}/m,/^async function csBulkConfirmFiltered\([\s\S]*?^}/m])vm.runInContext(source.match(pattern)![0],ctx);
    await vm.runInContext('csBulkConfirmFiltered()',ctx);
    assert.equal(prompts.length,1);assert.equal(confirmations.length,1);
    for(const text of [...prompts,...confirmations]){assert.match(text,/87 CTN \/ 38 PLT/);assert.doesNotMatch(text,/50 ชิ้น/);assert.match(text,/3 ราย/);}
});
