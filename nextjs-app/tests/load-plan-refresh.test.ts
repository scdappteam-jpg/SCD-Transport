import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../public/legacy/app.js', import.meta.url), 'utf8');
const extract = (name: string) => {
    const match = source.match(new RegExp(`async function ${name}\\(\\) \\{[\\s\\S]*?\\n\\}`));
    assert.ok(match, name);
    return match[0];
};

test('confirmed Load Plan import reloads persisted KPI table and history without a second user refresh', async () => {
    const persisted = {totalRows:4,matchedCount:4,rows:[{houseNumber:'SIT-VIDEO-1',warehouseLocation:'SIT-01',jobStatus:'Stored'}]};
    const rendered: Record<string, unknown> = {};
    const requests: string[] = [];
    const context = vm.createContext({
        document:{getElementById:()=>({style:{display:'flex'}})},
        $:()=>({value:'08:00'}), state:{user:{id:'sit-role-team_transport'}},
        _lpPendingFileBase64:'', _lpPendingCsvText:'HOUSE\nSIT-VIDEO-1',
        obOpenState:{flightKey:'old'}, lpCurrentPlan:null,
        api:async (path:string)=>{requests.push(path);return path.endsWith('/import') ? {ok:true,plan:{totalRows:4,rows:[]}} : {latest:persisted,todayOutbound:4};},
        toast:()=>{}, obOpenRenderFlightGroups:()=>{}, obOpenRenderHistory:()=>{},
        renderLpKpi:(data:unknown)=>{rendered.kpi=data;},
        renderLpFlightSummaryCards:(plan:unknown)=>{rendered.flight=plan;},
        renderLpTable:(plan:unknown)=>{rendered.table=plan;},
        renderLpHistory:()=>{rendered.history=true;},
        renderLpChangeBanner:(plan:unknown)=>{rendered.changes=plan;}, console,
    });
    vm.runInContext(extract('renderLoadPlan')+'\n'+extract('doLpImport'),context);
    await vm.runInContext('doLpImport()',context);
    assert.deepEqual(requests,['/api/loadplan/import','/api/loadplan/latest']);
    assert.equal(rendered.table,persisted);
    assert.equal(rendered.flight,persisted);
    assert.equal(rendered.changes,persisted);
    assert.equal(rendered.history,true);
    assert.equal((rendered.kpi as {todayOutbound:number}).todayOutbound,4);
});
