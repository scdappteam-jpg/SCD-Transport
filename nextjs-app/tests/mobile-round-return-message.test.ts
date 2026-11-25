import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../public/legacy/mobile.js',import.meta.url),'utf8');
const fn=source.match(/function renderPickupDriverActions\(\) \{[\s\S]*?\n\}/)![0];
test('a completed two-House stop cannot show the whole three-House run as complete',()=>{
 const elements:Record<string,{disabled?:boolean;hidden?:boolean;textContent?:string}>={}; const selected=[{status:'ReturningWH3',driverRouteStatus:'ReturningWH3',completedAt:'now'},{status:'ReturningWH3',completedAt:'now'}];
 let round=[...selected,{status:'Pending'}];
 const ctx=vm.createContext({$: (id:string)=>elements[id]??=( {} ),jobsFromSelection:()=>selected,pickupRoundJobsForMobile:()=>round});vm.runInContext(fn,ctx);
 vm.runInContext('renderPickupDriverActions()',ctx);
 assert.equal(elements['#arriveWh3Btn'].disabled,true);assert.match(String(elements['#pickupRoundTitle'].textContent),/ยังเหลือ 1 House/);
 round=[...selected,{status:'ReturningWH3',completedAt:'now'}];vm.runInContext('renderPickupDriverActions()',ctx);
 assert.equal(elements['#arriveWh3Btn'].disabled,false);assert.equal(elements['#pickupRoundTitle'].textContent,'รับครบทั้งรอบรถแล้ว');
});
