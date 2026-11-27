import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const require=createRequire(import.meta.url);
const access=require('../src/server/outbound-action-access.cjs');
const rounds=require('../public/legacy/transport-round-core.js');
const integrity=require('../src/server/workflow-integrity.cjs');
const front=readFileSync(new URL('../public/legacy/app.js',import.meta.url),'utf8');

test('changing Cargo header date synchronizes existing rows, serialized payload and physical-trip billing',()=>{
    const header={value:'2026-11-27'};
    const dates=[{value:'2026-11-28'},{value:'2026-11-27'}];
    let serialized='';
    const context=vm.createContext({$:(selector:string)=>selector==='#adminPickupDate'?header:null,$$:()=>dates,
        syncAdminPickupRowsText:()=>{serialized=dates.map(d=>d.value).join(',');}});
    const start=front.indexOf('function applyAdminPickupDateToRows(');
    vm.runInContext(front.slice(start,front.indexOf('\nfunction ',start+1)),context);
    vm.runInContext('applyAdminPickupDateToRows()',context);
    assert.deepEqual(dates.map(d=>d.value),['2026-11-27','2026-11-27']);
    assert.equal(serialized,'2026-11-27,2026-11-27');
    const jobs=dates.map((d,i)=>({houseNumber:`SIT-ROUND-${i}`,pickupDate:d.value,batchId:'SIT-ONE-ROUND',driverId:'SIT-DRIVER',vehiclePlate:'SIT-1127'}));
    assert.equal(rounds.identity(jobs[0]).id,rounds.identity(jobs[1]).id);
    assert.equal(rounds.billingKey(jobs[0]),rounds.billingKey(jobs[1]));
    assert.equal(integrity.tripCount(jobs,{}),1);
    header.value='';dates[0].value='2026-11-29';vm.runInContext('applyAdminPickupDateToRows()',context);
    assert.equal(dates[0].value,'2026-11-29'); // an incomplete header does not erase row dates
});

test('WH Staff and Leader can finish WH3 loading but cannot record Terminal queue or arrival',()=>{
    for(const role of ['WH_Staff','WH3_TeamLeader']) {
        assert.ok(access.loadBayRoles({phase:'wh3-load-start'}).includes(role));
        assert.ok(access.loadBayRoles({arrived:false}).includes(role));
        for(const payload of [{arrived:true},{phase:'queue'},{phase:'unknown'},{arrived:'false'}])
            assert.ok(!access.loadBayRoles(payload).includes(role));
    }
    for(const role of ['Check_House','Billing','Driver','CS','People_Viewer','QA_Inspector'])
        assert.ok(!access.loadBayRoles({arrived:false}).includes(role));
    assert.ok(!access.loadBayRoles({arrived:false}).includes('Team_Transport'));
});

test('Check House receives document-validation access only; Terminal and existing roles keep milestones',()=>{
    assert.ok(access.terminalDocumentRoles.includes('Check_House'));
    for(const role of ['Driver','Billing','People_Viewer','CS','QA_Inspector','Tagging_Staff'])
        assert.ok(!access.terminalDocumentRoles.includes(role));
    for(const role of ['Admin','Executive','Terminal'])
        for(const payload of [{phase:'queue'},{arrived:true},{arrived:false}])assert.ok(access.loadBayRoles(payload).includes(role));
});
