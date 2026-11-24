import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../public/legacy/people-directory.js', import.meta.url), 'utf8');
const block = source.slice(source.indexOf('  function showSessionRestore('), source.indexOf('  async function signIn('));
function fixture(token: string | null = 'saved-session', fetcher: () => Promise<Response> = async () => Response.json({items: []})) {
  const nodes = new Map<string, {textContent: string; classList: {add: (value: string) => void; remove: (value: string) => void; contains: (value: string) => boolean; toggle: (value: string, force: boolean) => void}}>();
  for (const id of ['login', 'directory', 'changePassword', 'sessionRestore', 'sessionRestoreMessage', 'retrySession', 'restoreLogout', 'directoryMessage', 'message']) {
    const classes = new Set(id === 'sessionRestore' ? [] : ['hidden']);
    nodes.set(id, {textContent: '', classList: {add: v => {classes.add(v);}, remove: v => {classes.delete(v);}, contains: v => classes.has(v), toggle: (v, force) => {if (force) classes.add(v); else classes.delete(v);}}});
  }
  const state = {token};
  const ctx = vm.createContext({TOKEN_KEY: 'session', sessionStorage: {getItem: () => state.token, removeItem: () => {state.token = null;}}, $: (id: string) => nodes.get(id), fetch: fetcher, items: [], refreshDepartments: () => {}, render: () => {}});
  vm.runInContext(block, ctx);
  return {state, nodes, run: (): Promise<boolean> => vm.runInContext('loadDirectory()', ctx), hidden: (id: string) => nodes.get(id)!.classList.contains('hidden')};
}

test('reload hides sign-in while the saved session is checked, then restores the directory', async () => {
  let finish!: (response: Response) => void;
  const f = fixture('saved-session', () => new Promise(r => {finish = r;}));
  const pending = f.run();
  assert.equal(f.hidden('login'), true); assert.equal(f.hidden('sessionRestore'), false);
  finish(Response.json({items: []}));
  assert.equal(await pending, true); assert.equal(f.state.token, 'saved-session');
  assert.equal(f.hidden('directory'), false); assert.equal(f.hidden('sessionRestore'), true);
});

test('temporary network, server, forbidden, and malformed-response failures preserve login and offer retry', async () => {
  for (const fetcher of [async () => {throw Error('offline');}, async () => new Response('', {status: 503}), async () => new Response('', {status: 403}), async () => new Response('invalid JSON'), async () => Response.json({error: 'invalid contract'})]) {
    const f = fixture('saved-session', fetcher);
    assert.equal(await f.run(), false); assert.equal(f.state.token, 'saved-session');
    assert.equal(f.hidden('login'), true); assert.equal(f.hidden('retrySession'), false);
  }
});

test('retry recovers using the original session without asking for PIN again', async () => {
  let calls = 0;
  const f = fixture('saved-session', async () => ++calls === 1 ? new Response('', {status: 503}) : Response.json({items: []}));
  assert.equal(await f.run(), false); assert.equal(await f.run(), true);
  assert.equal(f.hidden('directory'), false); assert.equal(f.state.token, 'saved-session');
});

test('confirmed expired sessions show login, and first-login PIN changes remain mandatory', async () => {
  const expired = fixture('expired', async () => new Response('', {status: 401}));
  await expired.run(); assert.equal(expired.state.token, null); assert.equal(expired.hidden('login'), false);
  const first = fixture('first', async () => new Response('', {status: 428}));
  await first.run(); assert.equal(first.state.token, 'first'); assert.equal(first.hidden('changePassword'), false);
  const anonymous = fixture(null); await anonymous.run(); assert.equal(anonymous.hidden('login'), false);
});

test('main system forbidden responses do not erase an authenticated session', async () => {
  const app = readFileSync(new URL('../public/legacy/app.js', import.meta.url), 'utf8');
  const start = app.indexOf('        if (res.status === 403) {', app.indexOf('async function refresh()'));
  const end = app.indexOf('        if (res.ok) {', start);
  const messages: string[] = [];
  const ctx = vm.createContext({res: {status: 403}, toast: (value: string) => messages.push(value), clearSkeletons: () => {}, localStorage: {removeItem: () => {throw Error('Must not clear session');}}});
  await vm.runInContext('(async()=>{' + app.slice(start, end) + '})()', ctx);
  assert.equal(messages.length, 1);
});
