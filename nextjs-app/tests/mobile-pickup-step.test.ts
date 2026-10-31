import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const mobile = readFileSync(new URL('../public/legacy/mobile.js', import.meta.url), 'utf8');
const helper = mobile.match(/function pickupWorkflowStep\(job\) \{[\s\S]*?\n\}/)?.[0];
if (!helper) throw new Error('pickupWorkflowStep helper not found');
const context = vm.createContext({});
vm.runInContext(helper, context);

test('returning WH3 jobs open the actionable final pickup step', () => {
    assert.equal(vm.runInContext('pickupWorkflowStep({driverRouteStatus:"ReturningWH3"})', context), 4);
    assert.equal(vm.runInContext('pickupWorkflowStep({status:"AwaitingReleaseDocument"})', context), 4);
    assert.equal(vm.runInContext('pickupWorkflowStep({status:"Loading"})', context), 1);
});
