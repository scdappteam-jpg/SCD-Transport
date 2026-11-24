import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const source=readFileSync(new URL('../public/legacy/app.js',import.meta.url),'utf8');
test('mobile pickup groups, release documents and cards preserve CTN and PLT independently',()=>{
    const mobile=readFileSync(new URL('../public/legacy/mobile.js',import.meta.url),'utf8');
    const ctx=vm.createContext({InboundReceipts:require('../src/server/inbound-receipts.cjs')});
    vm.runInContext(mobile.match(/^function mobilePackingSummary\([\s\S]*?^}/m)![0],ctx);
    const jobs=[{pieceCount:26,packageCounts:{PLT:26,CTN:32}},{pieceCount:11,packageCounts:{PLT:11,CTN:40}}];
    const before=JSON.stringify(jobs);
    ctx.jobs=jobs;
    assert.match(String(vm.runInContext('mobilePackingSummary(jobs)',ctx)),/72 CTN/);
    assert.match(String(vm.runInContext('mobilePackingSummary(jobs)',ctx)),/37 PLT/);
    assert.match(String(vm.runInContext('mobilePackingSummary([jobs[0]])',ctx)),/32 CTN/);
    assert.equal(vm.runInContext('mobilePackingSummary([{packageType:"Carton",pieceCount:12}])',ctx),'12 CTN');
    assert.equal(JSON.stringify(jobs),before);
});
test('CS bulk prompt and final confirmation preserve mixed CTN and PLT totals rather than legacy pieceCount',async()=>{
    const jobs=[{houseNumber:'SIT1',customerName:'A',pieceCount:26,packageCounts:{PLT:26,CTN:32}},{houseNumber:'SIT2',customerName:'B',pieceCount:12,packageCounts:{CTN:12}},{houseNumber:'SIT3',customerName:'A',pieceCount:11,packageCounts:{PLT:11,CTN:40}},{houseNumber:'SIT4',customerName:'C',pieceCount:1,packageCounts:{PLT:1,CTN:3}}];
    const prompts:string[]=[],confirmations:string[]=[];
    const ctx=vm.createContext({_csQueueTab:'pending',_csQueueData:jobs,_csJobDate:()=>'',_csApplyFilters:(j:unknown)=>j,scdPrompt:async(p:{note:string})=>{prompts.push(p.note);return 'SIT-REF';},showWhConfirm:async(s:string)=>{confirmations.push(s);return false;}});
    for(const pattern of [/^function csPackingSummary\([\s\S]*?^}/m,/^async function csBulkConfirmFiltered\([\s\S]*?^}/m])vm.runInContext(source.match(pattern)![0],ctx);
    await vm.runInContext('csBulkConfirmFiltered()',ctx);
    assert.equal(prompts.length,1);assert.equal(confirmations.length,1);
    for(const text of [...prompts,...confirmations]){assert.match(text,/87 CTN \/ 38 PLT/);assert.doesNotMatch(text,/50 ชิ้น/);assert.match(text,/3 ราย/);}
});
test('Cargo preview refresh preserves the assigned job plate, while an explicit driver change applies the new default',()=>{
    const fields:Record<string,{value:string;innerHTML?:string}>={'#adminDriverSelect':{value:'SIT-driver'},'#adminDriverName':{value:'SIT Job Driver'},'#adminVehiclePlate':{value:'SIT-JOB-PLATE'}};
    const driver={id:'SIT-driver',name:'SIT Default Driver',vehiclePlate:''};
    const ctx=vm.createContext({$:(id:string)=>fields[id],driverUsers:()=>[driver],selectedAdminDriver:()=>driver,updateAdminBatchSummary:()=>{},renderCargoPreview:()=>{}});
    for(const pattern of [/^function renderAdminDriverOptions\([\s\S]*?^}/m,/^function applyAdminDriver\([\s\S]*?^}/m])vm.runInContext(source.match(pattern)![0],ctx);
    vm.runInContext('renderAdminDriverOptions()',ctx);
    assert.equal(fields['#adminVehiclePlate'].value,'SIT-JOB-PLATE');assert.equal(fields['#adminDriverName'].value,'SIT Job Driver');
    driver.vehiclePlate='SIT-NEW-DRIVER';vm.runInContext('applyAdminDriver({type:"change"})',ctx);
    assert.equal(fields['#adminVehiclePlate'].value,'SIT-NEW-DRIVER');assert.equal(fields['#adminDriverName'].value,'SIT Default Driver');
});
