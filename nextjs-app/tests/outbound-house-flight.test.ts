import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const source = readFileSync(new URL('../public/legacy/app.js', import.meta.url), 'utf8');
const cut = (a: string, b: string) => source.slice(source.indexOf(a), source.indexOf(b, source.indexOf(a)));
function fixture(overrides: Record<string,string> = {}, flights = ['NH850/21','NH999/22','NH850/20']) {
    const jobs = flights.map((flightNo, i) => ({ houseNumber: `H${i+1}`, flightNo, onhandNumber:`F${i+1}`, mawbNumber:'205-86393230', packageCounts:{CTN:i+1} }));
    const state = { dashboard:{jobs}, loadPlan:{rows:jobs.map(j => ({houseNumber:j.houseNumber,flightNumber:'NH850/20',destination:'NRT',pieces:3}))},outboundGroupOverrides:overrides,outboundExpandedIdx:null };
    const notices: string[] = [];
    const ctx = vm.createContext({state,toast:(s:string)=>notices.push(s),document:{getElementById:()=>({style:{}})},renderOutboundGroups:()=>{}});
    vm.runInContext(cut('function outboundGroupsByFlight(', 'function renderOutboundGroups(') + cut('function doMoveObJob(', 'function getGroupPreviewFitZoom('),ctx);
    const groups = () => JSON.parse(vm.runInContext('JSON.stringify(outboundGroupsByFlight())',ctx));
    return {state,ctx,groups,notices};
}
test('stale Load Plan splits three Houses under their current Flights without mutating sources',()=>{
    const f=fixture(),before=structuredClone(f.state),groups=f.groups();
    assert.deepEqual(groups.map((g:{flight:string})=>g.flight).sort(),['NH850/20','NH850/21','NH999/22']);
    const rows=groups.flatMap((g:{rows:{houseNumber:string,flightNumber:string}[]})=>g.rows);
    assert.equal(new Set(rows.map((r:{houseNumber:string})=>r.houseNumber)).size,3);
    for(const row of rows) assert.equal(row.flightNumber,f.state.dashboard.jobs.find(j=>j.houseNumber===row.houseNumber)?.flightNo);
    assert.deepEqual(f.state,before);
});
test('old manual Flight override cannot put changed House back in previous Flight',()=>{
    const f=fixture({H1:'NH850/20|NRT'}),g=f.groups().find((g:{rows:{houseNumber:string}[]})=>g.rows.some(r=>r.houseNumber==='H1'));
    assert.equal(g.flight,'NH850/21');assert.equal(g.rows[0].moved,false);
});
test('same Flight destination move remains supported',()=>{
    const f=fixture({H1:'NH850/21|HND'}),g=f.groups().find((g:{dest:string})=>g.dest==='HND');
    assert.equal(g.flight,'NH850/21');assert.equal(g.rows[0].moved,true);
});
test('new manual groups retain current Flight and separate different Flights',()=>{
    const f=fixture({H1:'__new__',H2:'__new__'}),groups=f.groups();
    assert.equal(groups.length,3);assert.ok(groups.every((g:{rows:{flightNumber:string}[],flight:string})=>g.rows.every(r=>r.flightNumber===g.flight)));
});
test('missing House or missing live Flight falls back to Load Plan',()=>{
    const f=fixture({},['','','']);f.state.dashboard.jobs.pop();assert.equal(f.groups().length,1);assert.equal(f.groups()[0].flight,'NH850/20');
});
test('Flight changed again ignores the earlier override and follows newest value',()=>{
    const f=fixture({H1:'NH850/21|HND'});f.state.dashboard.jobs[0].flightNo='NH851/23';
    assert.equal(f.groups().find((g:{rows:{houseNumber:string}[]})=>g.rows.some(r=>r.houseNumber==='H1')).flight,'NH851/23');
});
test('moving into another Flight is rejected before changing override',()=>{
    const f=fixture();vm.runInContext("doMoveObJob('H1','NH850/21|NRT','NH850/20|NRT')",f.ctx);
    assert.deepEqual(f.state.outboundGroupOverrides,{});assert.equal(f.notices.length,1);
});
test('same Flight move and new-group move remain available',()=>{
    const f=fixture();vm.runInContext("doMoveObJob('H1','NH850/21|NRT','NH850/21|HND')",f.ctx);assert.equal(f.state.outboundGroupOverrides.H1,'NH850/21|HND');
    vm.runInContext("doMoveObJob('H1','NH850/21|HND','__new__')",f.ctx);assert.equal(f.state.outboundGroupOverrides.H1,'__new__');
});
