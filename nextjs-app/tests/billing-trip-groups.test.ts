import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url),integrity=require('../src/server/workflow-integrity.cjs');
const source=readFileSync(new URL('../public/legacy/app.js',import.meta.url),'utf8');
const helpers=source.slice(source.indexOf('function billingJobDate('),source.indexOf('function renderBillingBatchBuilder('));
const jobs=[1,2,3].map(i=>({houseNumber:'SIT-'+i,jobId:'unique-house-'+i,transportRoundId:i<3?'SIT-ROUND-A':'SIT-ROUND-B',billingTripId:'conflicting-legacy-'+i,customerId:'SIT-customer',workDate:'2026-11-23',pickupDate:'2026-11-23',status:'BillingReviewed',readyForBilling:true,amount:100}));
function context(rows=jobs){const ctx=vm.createContext({TransportRounds:require('../public/legacy/transport-round-core.js'),state:{dashboard:{jobs:rows}},$:()=>null});vm.runInContext(helpers,ctx);return ctx;}
test('Billing Preview groups three Houses into the same two date-scoped rounds as invoice API',()=>{
 const c=context(),groups=c.buildBillingBatchGroups();assert.equal(groups.length,1);assert.equal(groups[0].jobs.length,3);assert.equal(groups[0].trips.length,integrity.tripCount(jobs,{}));assert.equal(groups[0].trips.length,2);assert.equal(groups[0].amount,200);
});
test('reused round on another work date is separate while House IDs never split one round',()=>{
 const c=context();assert.equal(c.billingTripKey(jobs[0]),c.billingTripKey(jobs[1]));assert.notEqual(c.billingTripKey(jobs[0]),c.billingTripKey({...jobs[0],workDate:'2026-11-24'}));
});
