import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../public/legacy/mobile.js',import.meta.url),'utf8');
const context=vm.createContext({});
vm.runInContext(source.match(/^function mobileAirportTiming\([\s\S]*?^}/m)![0],context);
const timing=(job:Record<string,unknown>,now='2026-11-26T03:00:00Z')=>{
 context.job=job;context.now=Date.parse(now);
 return JSON.parse(JSON.stringify(vm.runInContext('mobileAirportTiming(job, now)',context)));
};
test('expired airport deadline cannot turn green when server risk was cleared after completion',()=>{
 assert.equal(timing({effectiveAirportDueAt:'2026-11-25T13:50:00Z',flightRiskStatus:'Clear'}).risk,'Breached');
});
test('arrival compares the recorded event with the deadline, not the later viewing time',()=>{
 const due='2026-11-25T13:50:00Z';
 assert.equal(timing({effectiveAirportDueAt:due,terminalArrivedAt:'2026-11-25T13:49:00Z'}).label,'ถึงสนามบินตามกำหนด');
 assert.equal(timing({effectiveAirportDueAt:due,cargoReceivedAt:'2026-11-26T03:21:14Z'}).label,'ถึงสนามบินหลังกำหนด');
});
test('missing deadline remains unknown and does not claim on-time arrival',()=>{
 assert.equal(timing({}).label,'ยังไม่ทราบกำหนดถึงสนามบิน');
 assert.equal(timing({effectiveAirportDueAt:'invalid'}).label,'ยังไม่ทราบกำหนดถึงสนามบิน');
});
test('unexpired jobs retain server warning and no-miss risk thresholds',()=>{
 assert.equal(timing({effectiveAirportDueAt:'2026-11-27T03:00:00Z',flightRiskStatus:'Urgent'}).risk,'Urgent');
});
