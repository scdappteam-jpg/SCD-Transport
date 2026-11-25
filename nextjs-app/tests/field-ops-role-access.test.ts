import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const app=readFileSync(new URL('../public/legacy/app.js',import.meta.url),'utf8');
const ctx=vm.createContext({});
for(const name of ['fieldOpsRoleAccess','allowedWebViews']) {
    const fn=app.match(new RegExp(`function ${name}\\(role\\) \\{[\\s\\S]*?\\n\\}`));
    assert.ok(fn); vm.runInContext(fn[0],ctx);
}
test('operational roles can reach their existing server-authorized outbound forms without personnel navigation',()=>{
    for(const role of ['Team_Transport','WH_Staff','WH3_TeamLeader','EI_Customer','Terminal','Executive']) {
        assert.equal(vm.runInContext(`allowedWebViews('${role}').includes('mobile')`,ctx),true);
        assert.equal(vm.runInContext(`allowedWebViews('${role}').includes('staff')`,ctx),false);
    }
    for(const role of ['CS','Driver','People_Viewer','Tagging_Staff']) assert.equal(vm.runInContext(`allowedWebViews('${role}').includes('mobile')`,ctx),false);
});
test('Transport preparation WH pick EI approval Terminal execution and Executive approval stay separated',()=>{
    const access=(role:string)=>vm.runInContext(`fieldOpsRoleAccess('${role}')`,ctx);
    assert.deepEqual(Array.from(access('Team_Transport').sections),['web-outbound-transfer','web-outbound-queue']);
    assert.equal(access('Team_Transport').actions.issueTransferBtn,true);
    assert.equal(access('Team_Transport').actions.pickingBtn,false);
    assert.equal(access('Team_Transport').actions.aotApproveBtn,false);
    assert.equal(access('WH_Staff').actions.pickingBtn,true);
    assert.equal(access('WH_Staff').actions.eiApproveBtn,false);
    assert.deepEqual(Array.from(access('WH_Staff').panels),['WH_Staff','Terminal']);
    assert.deepEqual(Array.from(access('WH3_TeamLeader').panels),['WH_Staff','Terminal']);
    assert.deepEqual(Array.from(access('EI_Customer').panels),['Terminal']);
    assert.equal(access('EI_Customer').actions.eiApproveBtn,true);
    assert.equal(access('EI_Customer').actions.pickingBtn,false);
    assert.equal(access('Terminal').actions.issueTransferBtn,false);
    assert.equal(access('Terminal').actions.saveTransferDetailsBtn,true);
    assert.equal(access('Terminal').actions.loadBayBtn,true);
    assert.equal(access('Executive').actions.aotApproveBtn,true);
    for(const role of ['CS','People_Viewer','Billing','Driver','Admin']) assert.equal(access(role),null);
});
