import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const mobile = readFileSync(new URL('../public/legacy/mobile.js', import.meta.url), 'utf8');
const api = readFileSync(new URL('../src/server/legacy-api.cjs', import.meta.url), 'utf8');
const web = readFileSync(new URL('../public/legacy/app.js', import.meta.url), 'utf8');
const directory = readFileSync(new URL('../public/legacy/people-directory.js', import.meta.url), 'utf8');
const fn = (source: string, name: string) => source.match(new RegExp(`^function ${name}\\([\\s\\S]*?^}`, 'm'))![0];
const policy = vm.createContext({});
vm.runInContext(fn(mobile, 'allowedMobileTabs'), policy);
const tabs = (role: string) => Array.from(vm.runInContext(`allowedMobileTabs(${JSON.stringify(role)})`, policy));

test('all provisioned roles have explicit mobile access; unknown roles get no operations', () => {
  const attendanceOnly = ['People_Viewer', 'Employee', 'CS', 'Tagging_Staff', 'QA_Inspector'];
  for (const role of attendanceOnly) assert.deepEqual(tabs(role), ['attendance'], role);
  for (const role of ['Admin', 'Executive']) assert.deepEqual(tabs(role), ['pickup', 'inbound', 'outbound', 'billing', 'attendance'], role);
  assert.deepEqual(tabs('Driver'), ['pickup', 'attendance']);
  for (const role of ['WH_Staff', 'WH3_TeamLeader']) assert.deepEqual(tabs(role), ['inbound', 'attendance'], role);
  assert.deepEqual(tabs('Team_Transport'), ['inbound', 'outbound', 'attendance']);
  for (const role of ['EI_Customer', 'Check_House', 'Terminal']) assert.deepEqual(tabs(role), ['outbound'], role);
  assert.deepEqual(tabs('Billing'), ['billing']);
  assert.deepEqual(tabs('unrecognised-role'), []);
});

test('direct operation tab selection cannot bypass role visibility', () => {
  let changed = 0;
  const ctx = vm.createContext({ currentUser: () => ({role: 'Employee'}), $$: () => { changed++; return []; }, initAttendanceTab: () => {} });
  vm.runInContext(fn(mobile, 'allowedMobileTabs') + '\n' + fn(mobile, 'showTab'), ctx);
  vm.runInContext('showTab("billing"); showTab("pickup"); showTab("inbound");', ctx);
  assert.equal(changed, 0);
  vm.runInContext('showTab("attendance")', ctx);
  assert.equal(changed, 2);
});

test('employee and directory bootstrap never disclose cargo or evidence data', () => {
  const ctx = vm.createContext({});
  vm.runInContext(fn(api, 'buildMobileDashboard'), ctx);
  for (const role of ['Employee', 'People_Viewer']) {
    const dashboard = vm.runInContext(`buildMobileDashboard({jobs:[{houseNumber:'PRIVATE'}],attachments:[{url:'PRIVATE'}]}, {role:${JSON.stringify(role)}})`, ctx);
    assert.equal(dashboard.jobs.length, 0);
    assert.equal(dashboard.attachments.length, 0);
    assert.equal(dashboard.billing.length, 0);
  }
});

test('switching from attendance-only employee to EI restores the operation shell', () => {
  let role = 'Employee';
  let attendance = false;
  const subtitle = {textContent: ''};
  const ctx = vm.createContext({
    isMobileAuthenticated: () => true,
    currentUser: () => ({role}),
    attendanceEntryRequested: () => false,
    document: { body: {classList: {toggle: (_name: string, value: boolean) => attendance = value}}, querySelector: () => subtitle },
    showMnav: () => {}, showTab: () => {},
  });
  vm.runInContext(fn(mobile, 'allowedMobileTabs') + '\n' + fn(mobile, 'openRequestedMobileView'), ctx);
  assert.equal(vm.runInContext('openRequestedMobileView()', ctx), true);
  assert.equal(attendance, true);
  role = 'EI_Customer';
  assert.equal(vm.runInContext('openRequestedMobileView()', ctx), false);
  assert.equal(attendance, false);
  assert.match(subtitle.textContent, /Field Operation/);
});

test('login user options expose employee codes without private credential fields', () => {
  const ctx = vm.createContext({});
  vm.runInContext(fn(api, 'loginUsers'), ctx);
  const users = vm.runInContext('loginUsers({users:[{id:"sit",code:"SIT003",name:"SIT",role:"CS",passwordHash:"secret",pinHash:"secret"}]})', ctx);
  assert.equal(users[0].code, 'SIT003');
  assert.equal(users[0].passwordHash, undefined);
  assert.equal(users[0].pinHash, undefined);
});

for (const scenario of ['network-failure', 'directory-session', 'first-use-session']) {
  test(`web refresh never replaces actual data with demo records: ${scenario}`, async () => {
    const dashboard = {jobs: [{houseNumber: 'ACTUAL'}]};
    let credentialPrompt = false;
    const win = {location: {search: '', href: ''}, SMART_LOGISTICS_DEMO: {dashboard:{jobs:[{houseNumber:'DEMO'}]}}};
    const ctx = vm.createContext({
      state: {dashboard}, window: win, URLSearchParams,
      showSkeletons: () => {}, clearSkeletons: () => {}, toast: () => {},
      apiUrl: (path: string) => path,
      WEB_SESSION_TOKEN_KEY: 'session',
      localStorage: {getItem: () => 'token'}, sessionStorage: {setItem: () => {}},
      requestWebCredentialChange: () => credentialPrompt = true,
      fetch: async (url: string) => url === '/api/auth/me'
        ? {ok:true,json:async()=>({user:{id:'SIT',role:'People_Viewer'}})}
        : {ok:false,status:scenario==='network-failure'?503:scenario==='first-use-session'?428:403},
    });
    vm.runInContext(web.match(/^async function refresh\([\s\S]*?^}/m)![0], ctx);
    await vm.runInContext('refresh()', ctx);
    assert.equal(ctx.state.dashboard, dashboard);
    if (scenario === 'directory-session') assert.equal(win.location.href, '/legacy/people-directory.html');
    if (scenario === 'first-use-session') assert.equal(credentialPrompt, true);
  });
}

test('directory logout also clears the shared main session to permit another account', () => {
  const removed: string[] = [];
  let reloaded = false;
  const ctx = vm.createContext({TOKEN_KEY:'directory',sessionStorage:{removeItem:(key:string)=>removed.push(key)},localStorage:{removeItem:(key:string)=>removed.push(key)},location:{reload:()=>reloaded=true}});
  vm.runInContext(directory.match(/  function logoutDirectory\([\s\S]*?^  }/m)![0], ctx);
  vm.runInContext('logoutDirectory()', ctx);
  assert.deepEqual(removed, ['directory','scdTransportWebAuth','scdTransportWebSession','scdTransportWebUser']);
  assert.equal(reloaded, true);
});
