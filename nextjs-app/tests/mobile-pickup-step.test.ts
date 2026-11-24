import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const mobile = readFileSync(new URL('../public/legacy/mobile.js', import.meta.url), 'utf8');
const helper = mobile.match(/function pickupWorkflowStep\(job\) \{[\s\S]*?\n\}/)?.[0];
if (!helper) throw new Error('pickupWorkflowStep helper not found');
const context = vm.createContext({});
vm.runInContext(helper, context);

test('Driver attendance restores an open shift through GET so checkout remains available after navigation', async () => {
    const load = mobile.match(/async function loadAttendanceStatus\(\) \{[\s\S]*?\n\}/)?.[0];
    assert.ok(load);
    const shift = {userId:'sit-driver',checkInTime:'2026-11-24T08:43:39Z',checkOutTime:null};
    const state: {currentRecord: unknown} = {currentRecord:null};
    let rendered: unknown;
    const ctx=vm.createContext({currentUser:()=>({id:'sit-driver'}),attState:state,
        api:async (path:string,_body:unknown,method:string)=>{assert.equal(path,'/api/attendance/today');assert.equal(method,'GET');return {records:[shift]};},
        renderAttendanceStatus:(record:unknown)=>{rendered=record;}});
    vm.runInContext(load,ctx);
    await vm.runInContext('loadAttendanceStatus()',ctx);
    assert.equal(state.currentRecord,shift);
    assert.equal(rendered,shift);
});

test('returning WH3 jobs open the actionable final pickup step', () => {
    assert.equal(vm.runInContext('pickupWorkflowStep({driverRouteStatus:"ReturningWH3"})', context), 4);
    assert.equal(vm.runInContext('pickupWorkflowStep({status:"AwaitingReleaseDocument"})', context), 4);
    assert.equal(vm.runInContext('pickupWorkflowStep({status:"Loading"})', context), 4);
    assert.equal(vm.runInContext('pickupWorkflowStep({driverRouteStatus:"Loading",status:"ArrivedAtPickup"})', context), 4);
    assert.equal(vm.runInContext('pickupWorkflowStep({status:"PickedUp"})', context), 4);
    assert.equal(vm.runInContext('pickupWorkflowStep({status:"Pending"})', context), 1);
    assert.equal(vm.runInContext('pickupWorkflowStep({status:"ArrivedAtPickup"})', context), 1);
});

test('changing the selected House clears previous evidence, but refreshing the same selection retains the draft', () => {
    const reset = mobile.match(/function resetPickupEvidenceForSelection\(selectionKey\) \{[\s\S]*?\n\}/)?.[0];
    assert.ok(reset);
    const inputs = Object.fromEntries(['productImages', 'cargoImages', 'doorClosedImages', 'driverInspectorName', 'driverReceiverName'].map(id => [id, {value:'previous-house'}]));
    const checks = [{checked:true}, {checked:true}];
    let cleared = 0;
    const canvas = {width:300, height:100, getContext:()=>({clearRect:()=>{cleared++;}})};
    const state = {pickupEvidenceSelection:'["A"]', pickupStartTime:'old-time', simulatedPickupEvidenceHouse:'A'};
    const ctx = vm.createContext({state, $$:()=>checks, document:{getElementById:(id:string)=>inputs[id] || canvas}});
    vm.runInContext(reset, ctx);
    vm.runInContext('resetPickupEvidenceForSelection(\'["A"]\')', ctx);
    assert.equal(inputs.productImages.value, 'previous-house');
    assert.equal(cleared, 0);
    vm.runInContext('resetPickupEvidenceForSelection(\'["B"]\')', ctx);
    assert.ok(Object.values(inputs).every(input=>input.value===''));
    assert.ok(checks.every(check=>!check.checked));
    assert.equal(cleared, 2);
    assert.equal(state.pickupStartTime, null);
    assert.equal(state.simulatedPickupEvidenceHouse, '');
    inputs.productImages.value='new-house';checks[0].checked=true;
    vm.runInContext('resetPickupEvidenceForSelection(\'["B"]\')', ctx);
    assert.equal(inputs.productImages.value, 'new-house');
    assert.equal(checks[0].checked, true);
});
