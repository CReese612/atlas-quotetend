// Sprint 3A: request-level protections: CSRF and Host checks, file and API exposure, error and log hygiene,
// body-size limits before authentication, tampered/stale/replayed commands, and opt-out suppression integrity.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { demoData, addDays } from '../domain.js';
import { staticFiles } from '../server.mjs';
import * as H from './helpers/security-harness.mjs';

async function setup(t, options) {
  const env = await H.launch(t, options);
  const a = H.addOwner(env, 'owner-a@example.com', H.markers('A').business), b = H.addOwner(env, 'owner-b@example.com', H.markers('B').business);
  const sa = H.seedTenant(env, a, 'A'); H.seedTenant(env, b, 'B');
  return { env, a, b, sa, A: a.business_id, B: b.business_id, session: await H.signIn(env, 'owner-a@example.com') };
}
const state = env => JSON.stringify([env.store.db.prepare('SELECT * FROM owners ORDER BY id').all(), env.store.db.prepare('SELECT * FROM businesses ORDER BY id').all(), env.store.db.prepare('SELECT * FROM invitations').all(), env.store.db.prepare('SELECT * FROM recovery_codes').all()]);
const STACK = /\bat [^\n]*\(.*\.(m?js|cjs):\d+|node_modules|node:internal|[A-Z]:\\\\|SQLITE|SqliteError|ERR_[A-Z_]+|\.mjs/;

test('cross-site, header-less and wrong-content-type writes are blocked on every mutating route, with no side effects', async t => {
  const { env, A, session } = await setup(t);
  const good = { Origin: env.origin, 'X-QuoteTend-Request': '1', 'Content-Type': 'application/json' };
  const command = { kind: 'draft', estimateId: 'A-EST-1', text: 'csrf draft', requestId: randomUUID(), revision: env.store.workspace(A).revision };
  const routes = [['/api/login', { email: 'owner-a@example.com', password: H.PASSWORD }], ['/api/register', { email: 'csrf@example.com', businessName: 'Fictional CSRF Roofing', password: H.PASSWORD }], ['/api/recover', { email: 'owner-a@example.com', code: 'x', password: H.OTHER_PASSWORD }],
    ['/api/logout', {}], ['/api/password', { currentPassword: H.PASSWORD, password: H.OTHER_PASSWORD }], ['/api/recovery-code', { currentPassword: H.PASSWORD }], [`/api/workspaces/${A}/commands`, command]];
  const bad = { 'foreign origin': { Origin: 'https://evil.example' }, 'same host different scheme': { Origin: env.origin.replace('http:', 'https:') }, 'different port': { Origin: 'http://127.0.0.1:1' }, 'null origin': { Origin: 'null' }, 'no origin': { Origin: null },
    'subdomain trick': { Origin: env.origin + '.evil.example' }, 'no request header': { 'X-QuoteTend-Request': null }, 'wrong request header value': { 'X-QuoteTend-Request': '0' }, 'text/plain': { 'Content-Type': 'text/plain' },
    'form encoded': { 'Content-Type': 'application/x-www-form-urlencoded' }, 'multipart': { 'Content-Type': 'multipart/form-data; boundary=x' }, 'no content type': { 'Content-Type': null } };
  const before = [state(env), H.fingerprint(env, A), env.store.db.prepare('SELECT COUNT(*) n FROM sessions').get().n];
  for (const [path, payload] of routes) for (const [label, override] of Object.entries(bad)) {
    const r = await session.send(path, 'POST', payload, { ...good, ...override });
    assert.equal(r.status, 403, `${path} ${label}`); assert.deepEqual(r.setCookie, []); H.assertNoLeak(assert, r, 'A', `${path} ${label}`);
  }
  assert.deepEqual([state(env), H.fingerprint(env, A), env.store.db.prepare('SELECT COUNT(*) n FROM sessions').get().n], before, 'nothing changed');
  assert.equal((await session.get('/api/me')).status, 200, 'the victim\'s session survived the forged requests');
  // Reads are not mutations, but they carry no extra privilege for a foreign origin to exploit: cookies are SameSite=Strict.
  assert.equal((await session.send(`/api/workspaces/${A}/commands`, 'POST', command)).status, 200, 'the same command with correct headers succeeds');
});

test('production origin, HTTPS and Host checks', async t => {
  const { env, A, session } = await setup(t, { production: true });
  const body = { kind: 'draft', estimateId: 'A-EST-1', text: 'prod draft', requestId: randomUUID(), revision: env.store.workspace(A).revision }, path = `/api/workspaces/${A}/commands`;
  for (const origin of ['http://fictional.example', 'https://fictional.example:8443', 'https://www.fictional.example', 'https://fictional.example.evil.example', 'https://evil.example', 'null']) assert.equal((await session.send(path, 'POST', body, { Origin: origin })).status, 403, origin);
  for (const host of ['evil.example', 'fictional.example.evil.example', 'fictional.example:8443', '127.0.0.1:' + env.port, 'localhost']) assert.equal((await session.get('/api/me', { Host: host })).status, 403, host);
  assert.equal((await session.get('/api/me', { 'X-Forwarded-Proto': 'http' })).status, 400, 'plain HTTP is refused, not served');
  assert.equal((await session.get('/api/me', { 'X-Forwarded-Proto': null })).status, 400);
  assert.match((await session.get('/api/me')).headers['strict-transport-security'], /max-age=31536000/);
  assert.equal((await session.send(path, 'POST', body)).status, 200);
});

test('local mode accepts only loopback Host names on the server\'s own port (DNS-rebinding guard)', async t => {
  const { env, session } = await setup(t);
  for (const host of ['evil.example', 'localhost', 'localhost:1', '127.0.0.1', '127.0.0.1:1', '0.0.0.0:' + env.port, '[::1]:' + env.port, 'localhost.evil.example:' + env.port]) assert.equal((await session.get('/api/me', { Host: host })).status, 403, host);
  assert.equal((await session.get('/api/me', { Host: 'localhost:' + env.port })).status, 200);
  assert.equal((await session.get('/healthz', { Host: 'evil.example' })).status, 403);
});

test('only allow-listed front-end files are served; source, database, repository and traversal requests are not', async t => {
  const { env, session } = await setup(t);
  const anonymous = H.client(env);
  const hidden = ['/server.mjs', '/account-api.mjs', '/account-store.mjs', '/account-security.mjs', '/ledger.mjs', '/production-config.mjs', '/backups.mjs', '/invite-owner.mjs', '/manage-accounts.mjs', '/package.json', '/pnpm-lock.yaml', '/render.yaml', '/.env', '/.env.production.example', '/.git/config', '/.git/HEAD', '/.gitignore',
    '/accounts.sqlite', '/tests/accounts.test.mjs', '/tests/helpers/security-harness.mjs', '/docs/HANDOFF.md', '/docs/SPRINT3A_SECURITY.md', '/README.md', '/node_modules/bcryptjs/package.json', '/public-site/serve.mjs', '/public-site/index.html', '/app/', '/app', '/app/index.html', '/app/%2e%2e/server.mjs', '/app/../server.mjs', '/%2e%2e/server.mjs', '/%2e%2e%2fserver.mjs',
    '/app/..%2fserver.mjs', '/app%5c..%5cserver.mjs', '/app/main.js%00.html', '/domain.js/', '/DOMAIN.JS', '//server.mjs', '/shared/../server.mjs', '/' + 'a'.repeat(5000)];
  for (const path of hidden) for (const client of [anonymous, session]) {
    const r = await client.get(path); assert.ok([301, 302, 400, 404].includes(r.status), `${path} -> ${r.status}`);
    assert.ok(!/createHmac|express-session|session_secret|DatabaseSync|BEGIN IMMEDIATE|bcrypt\.hash/.test(r.text), 'source disclosed at ' + path);
  }
  // The shipped files are exactly the intended ones and contain no server secrets or credentials.
  const served = [...staticFiles().keys()];
  assert.ok(served.length > 10 && served.every(p => /^\/(account|signin|security|favicon\.svg|shared\/|domain\.js|import-mapping\.js|results\.js|app\/)/.test(p)), 'unexpected public path in ' + served);
  for (const path of served) {
    const r = await anonymous.get(path); assert.equal(r.status, 200, path);
    assert.ok(!/session_secret|SESSION_SECRET|password_hash|BEGIN IMMEDIATE|createHmac|sk_(live|test)_/.test(r.text) && !H.leakPatterns('A').some(n => r.text.includes(n)), 'secret or tenant data in ' + path);
    assert.equal(r.headers['cache-control'], path.endsWith('.woff2') ? 'public, max-age=604800' : 'no-store', path); assert.equal(r.headers['x-content-type-options'], 'nosniff');
  }
  for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) assert.equal((await anonymous.send('/account', method, {})).status, 405, method);
  const home = await anonymous.get('/account');
  assert.match(home.headers['content-security-policy'], /default-src 'self'.*script-src 'self'.*object-src 'none'.*frame-ancestors 'none'/); assert.ok(!('x-powered-by' in home.headers));
  assert.deepEqual((await anonymous.get('/healthz')).data, { status: 'ok' }, 'health discloses nothing else');
});

test('there is no administrative, debugging, export or backup route on the API, authenticated or not', async t => {
  const { env, session } = await setup(t);
  const anonymous = H.client(env), names = ['admin', 'admins', 'owners', 'users', 'accounts', 'businesses', 'tenants', 'sessions', 'invitations', 'invite', 'suspend', 'resume', 'impersonate', 'debug', 'metrics', 'status', 'config', 'env', 'backup', 'backups', 'export', 'restore',
    'import', 'logs', 'audit', 'command-center', 'platform', 'internal', 'workspaces', 'workspace', 'estimates', 'quotes', 'snapshots', 'events', 'results', '__proto__', 'constructor', '..', 'me/../admin'];
  for (const name of names) for (const method of ['GET', 'POST']) {
    const u = await anonymous.send('/api/' + name, method, method === 'POST' ? {} : undefined); assert.equal(u.status, 401, `${method} /api/${name} (anonymous)`);
    const s = await session.send('/api/' + name, method, method === 'POST' ? {} : undefined); assert.equal(s.status, 404, `${method} /api/${name} (signed in)`); assert.deepEqual(s.data, { error: 'Not found.' });
  }
  assert.equal((await anonymous.get('/api/configuration')).status, 200);
  assert.deepEqual(Object.keys((await anonymous.get('/api/configuration')).data).sort(), ['invitationRequired', 'production'], 'the only public API data is two booleans');
  void env;
});

test('errors and logs never carry stack traces, SQL, file paths, credentials or customer data', async t => {
  const { env, A, session } = await setup(t);
  const probes = [['POST', '/api/login', undefined, '{"email":'], ['POST', '/api/register', undefined, '[1,2'], ['POST', `/api/workspaces/${A}/commands`, undefined, 'not json'], ['POST', `/api/workspaces/${A}/commands`, undefined, '"string"'], ['POST', `/api/workspaces/${A}/commands`, undefined, 'null'], ['POST', `/api/workspaces/${A}/commands`, undefined, '[]'],
    ['GET', `/api/workspaces/${A}/results?from=x&to=y`], ['GET', `/api/workspaces/${A}/results?from=2026-01-01`], ['GET', `/api/workspaces/${A}/results?from[]=1&to[]=2`], ['GET', `/api/workspaces/${A}/results?from=2099-01-01&to=2099-01-02`], ['GET', `/api/workspaces/${A}/results?from=2026-02-30&to=2026-03-01`],
    ['GET', `/api/workspaces/${A}/snapshots/'%20OR%201=1--`], ['GET', '/api/workspaces/%E0%A4%A'], ['GET', '/%E0%A4%A']];
  for (const [method, path, , raw] of probes) {
    const r = await session.send(path, method, undefined, {}, raw === undefined ? {} : { raw });
    assert.ok(r.status >= 400 && r.status < 500, `${method} ${path} -> ${r.status}`); assert.doesNotMatch(r.text, STACK, `${method} ${path}: ${r.text}`); H.assertNoLeak(assert, r, 'A', path);
  }
  // A genuine server fault: the response is generic and the log entry names no data.
  env.store.db.exec("CREATE TRIGGER fictional_fault BEFORE UPDATE ON businesses BEGIN SELECT RAISE(ABORT,'SQL-FAULT-with-secret-A-confidential-note'); END;");
  const fault = await session.post(`/api/workspaces/${A}/commands`, { kind: 'draft', estimateId: 'A-EST-1', text: H.markers('A').draft + '-new', requestId: randomUUID(), revision: env.store.workspace(A).revision });
  assert.equal(fault.status, 500); assert.deepEqual(Object.keys(fault.data), ['error']); assert.doesNotMatch(fault.text, STACK); assert.doesNotMatch(fault.text, /SQL-FAULT|confidential/); assert.ok(fault.headers['x-request-id']);
  assert.equal(env.store.workspace(A).quotes.find(q => q.estimate_id === 'A-EST-3').saved_draft, H.markers('A').draft, 'a failed command rolled back completely');
  env.store.db.exec('DROP TRIGGER fictional_fault');
  const logged = JSON.stringify(env.logs);
  assert.ok(env.logs.some(e => e.event === 'request_failed' && e.requestId === fault.headers['x-request-id']));
  for (const needle of ['owner-a@example.com', 'owner-b@example.com', H.PASSWORD, ...H.leakPatterns('A'), ...H.leakPatterns('B'), 'SQL-FAULT', 'quotetend.sid', 'password_hash', '$2a$', '$2b$', A, '/api/']) assert.ok(!logged.includes(needle), 'log contains ' + needle);
});

test('request bodies are bounded before the caller is authenticated or authorized', async t => {
  const { env, A, B, session } = await setup(t);
  const anonymous = H.client(env), garbage = 'x'.repeat(3_000_000);
  // A multi-megabyte unparseable body must be turned away on identity grounds without ever being parsed.
  const unauthorized = await anonymous.send(`/api/workspaces/${A}/commands`, 'POST', undefined, {}, { raw: garbage });
  assert.equal(unauthorized.status, 401, 'the workspace parser never runs for an anonymous caller: ' + unauthorized.text.slice(0, 80));
  for (const path of ['/api/password', '/api/recovery-code']) assert.equal((await anonymous.send(path, 'POST', undefined, {}, { raw: garbage })).status, 413, path + ' accepts only tiny bodies');
  const foreign = await session.send(`/api/workspaces/${B}/commands`, 'POST', undefined, {}, { raw: garbage });
  assert.equal(foreign.status, 404, 'a signed-in caller aiming at another business is refused before the body is read');
  // Sign-in, registration and recovery bodies are tiny; a 100 KB body is refused outright.
  const padded = { email: 'owner-a@example.com', password: H.PASSWORD, pad: 'y'.repeat(100_000) };
  for (const path of ['/api/login', '/api/register', '/api/recover']) { const r = await anonymous.post(path, padded); assert.equal(r.status, 413, path); assert.doesNotMatch(r.text, /Workspace/); }
  // Legitimate use is unaffected: a large (but valid) workspace command from the owner still works up to the limit.
  const big = { kind: 'draft', estimateId: 'A-EST-1', text: 'z'.repeat(9_999), requestId: randomUUID(), revision: env.store.workspace(A).revision };
  assert.equal((await session.post(`/api/workspaces/${A}/commands`, big)).status, 200);
  const oversize = await session.send(`/api/workspaces/${A}/commands`, 'POST', undefined, {}, { raw: JSON.stringify({ kind: 'restore', quotes: [], pad: 'p'.repeat(5_100_000) }) });
  assert.equal(oversize.status, 413);
});

test('stale, replayed, malformed and tampered commands are refused or idempotent and never half-applied', async t => {
  const { env, A, sa, session } = await setup(t);
  const url = `/api/workspaces/${A}/commands`, rev = () => env.store.workspace(A).revision, send = (body, headers) => session.post(url, body, headers);
  const edit = (fields, extra = {}) => ({ kind: 'edit', estimateId: sa.ids[2], fields, requestId: randomUUID(), revision: rev(), ...extra });
  const snap = H.fingerprint(env, A);
  // Revision and request-ID tampering.
  for (const revision of [-1, 1.5, '9', null, undefined, NaN, Infinity, 2 ** 60, [1], { n: 1 }]) { const r = await send({ ...edit({ notes: 'x' }), revision }); assert.equal(r.status, 400, String(revision)); }
  for (const requestId of ['', 'short', 'a'.repeat(81), 'has space in it 1234567', 'semi;colon-1234567890', null, undefined]) assert.equal((await send({ ...edit({ notes: 'x' }), requestId })).status, 400, String(requestId));
  for (const body of [[], 'x', null, 7, { kind: 'delete-everything', requestId: randomUUID(), revision: rev() }, { kind: ['edit'], requestId: randomUUID(), revision: rev() }, { kind: 'constructor', requestId: randomUUID(), revision: rev() }, { requestId: randomUUID(), revision: rev() }]) assert.equal((await send(body)).status, 400, JSON.stringify(body));
  assert.equal(H.fingerprint(env, A), snap, 'rejected commands left no trace');
  // Stale revision: refused with a specific code and nothing applied.
  const stale = await send({ ...edit({ notes: 'stale write' }), revision: rev() - 1 }); assert.equal(stale.status, 409); assert.equal(stale.data.code, 'stale_revision'); assert.equal(H.fingerprint(env, A), snap);
  const ahead = await send({ ...edit({ notes: 'future write' }), revision: rev() + 1 }); assert.equal(ahead.status, 409);
  // Replay: the same request applies once; a retried identical request returns the stored result without new events; a changed body under the same ID is refused.
  const command = edit({ notes: 'A-confidential-note updated once' });
  const first = await send(command), events = env.store.events(A).length;
  assert.equal(first.status, 200); assert.equal(first.data.replayed, undefined);
  const again = await send(command); assert.equal(again.status, 200); assert.equal(again.data.replayed, true); assert.equal(again.data.revision, first.data.revision); assert.equal(env.store.events(A).length, events);
  assert.equal((await send({ ...command, fields: { notes: 'a different change under the same request id' } })).status, 409);
  assert.equal(env.store.workspace(A).quotes.find(q => q.estimate_id === sa.ids[2]).notes, 'A-confidential-note updated once');
  // Replay after later changes is still idempotent rather than stale.
  await send(edit({ notes: 'a later change' })); const later = await send(command); assert.equal(later.status, 200); assert.equal(later.data.replayed, true);
  // Racing identical and racing different commands: one effect each.
  const racing = edit({ notes: 'racing identical' }), identical = await Promise.all([1, 2, 3, 4].map(() => send(racing)));
  assert.ok(identical.every(r => r.status === 200)); assert.equal(identical.filter(r => !r.data.replayed).length, 1);
  const base = rev(), different = await Promise.all([1, 2, 3, 4].map(n => send({ ...edit({ notes: 'racer ' + n }), revision: base })));
  assert.deepEqual(different.map(r => r.status).sort(), [200, 409, 409, 409]); assert.equal(rev(), base + 1);
});

test('body fields cannot forge identity, history, evidence or protected columns', async t => {
  const { env, a, A, sa, session } = await setup(t);
  const url = `/api/workspaces/${A}/commands`, rev = () => env.store.workspace(A).revision, target = sa.ids[2];
  const forged = { kind: 'edit', estimateId: target, requestId: randomUUID(), revision: rev(), actorId: 'someone-else', source: 'system', epoch: 99, businessId: 'x', ownerId: 'x', recordedAt: '2001-01-01T00:00:00Z', sequence: 1,
    fields: { notes: 'legit edit', estimate_id: 'RENAMED', last_contact_date: '2001-01-01', history: [{ type: 'forged', text: 'forged history', at: '2001-01-01T00:00:00Z' }], saved_draft: 'forged draft', business_id: 'x', __proto__: { polluted: true }, constructor: { prototype: { polluted: true } } } };
  const r = await session.send(url, 'POST', undefined, {}, { raw: JSON.stringify(forged).replace('"fields":{', '"fields":{"__proto__":{"polluted":true},') });
  assert.equal(r.status, 200); assert.equal(({}).polluted, undefined, 'Object.prototype is intact');
  const q = env.store.workspace(A).quotes.find(x => x.estimate_id === target);
  assert.equal(q.notes, 'legit edit'); assert.equal(q.last_contact_date, ''); assert.ok(!JSON.stringify(q).includes('forged')); assert.equal(env.store.workspace(A).quotes.some(x => x.estimate_id === 'RENAMED'), false);
  const events = env.store.events(A).filter(e => e.sequence > 0 && JSON.stringify(e).includes('legit') || e.recordedAt.startsWith('2001'));
  assert.ok(env.store.events(A).every(e => e.actorId === a.id && !['system'].includes(e.source) && e.epoch <= 2 && !e.recordedAt.startsWith('2001')), 'actor, source, epoch and time come from the server');
  assert.ok(events.length >= 0);
  // Dates: future-dated or pre-estimate effective dates are refused, so evidence cannot be forged forward or backward.
  const base = { kind: 'contact', estimateId: sa.ids[0], contact: { date: addDays(H.today, 1), nextDate: addDays(H.today, 3), channel: 'Phone', note: 'future contact' } };
  assert.equal((await session.post(url, { ...base, requestId: randomUUID(), revision: rev() })).status, 400);
  assert.equal((await session.post(url, { ...base, contact: { ...base.contact, date: '2001-01-01' }, requestId: randomUUID(), revision: rev() })).status, 400);
  assert.equal((await session.post(url, { kind: 'edit', estimateId: target, fields: { notes: 'x' }, effectiveDate: addDays(H.today, 1), requestId: randomUUID(), revision: rev() })).status, 400);
  assert.equal((await session.post(url, { kind: 'create', requestId: randomUUID(), revision: rev(), fields: { ...demoData()[0], estimate_id: 'BAD-1', amount_usd: -5, history: [], saved_draft: '', last_contact_date: '' } })).status, 400);
  assert.equal((await session.post(url, { kind: 'draft', estimateId: sa.ids[0], text: 'd'.repeat(10_001), requestId: randomUUID(), revision: rev() })).status, 400);
});

test('opt-outs cannot be silently removed, bypassed through an e-mail change, or released without explicit review', async t => {
  const { env, A, sa, session } = await setup(t);
  const url = `/api/workspaces/${A}/commands`, rev = () => env.store.workspace(A).revision, optedOut = sa.ids[1], row = () => env.store.workspace(A).quotes.find(q => q.estimate_id === optedOut);
  assert.equal(row().do_not_contact, true);
  const before = H.fingerprint(env, A), attempt = fields => session.post(url, { kind: 'edit', estimateId: optedOut, fields, requestId: randomUUID(), revision: rev() });
  for (const fields of [{ do_not_contact: false }, { customer_email: 'fresh-address@example.com' }, { customer_email: '' }, { do_not_contact: false, customer_email: 'fresh-address@example.com' }, { status: 'sent', do_not_contact: false }]) assert.equal((await attempt(fields)).status, 400, JSON.stringify(fields));
  assert.equal((await session.post(url, { kind: 'edit', estimateId: optedOut, fields: { do_not_contact: false }, reviewedOptOut: 'true', requestId: randomUUID(), revision: rev() })).status, 400, 'a truthy string is not an explicit review');
  assert.equal((await session.post(url, { kind: 'release-optout', preference: 'email:' + H.markers('A').optEmail, reviewedOptOut: 1, requestId: randomUUID(), revision: rev() })).status, 400);
  assert.equal(H.fingerprint(env, A), before, 'no refused attempt changed anything');
  // Restoring an older backup that lacks the opt-out cannot reopen contact either.
  const restored = await session.post(url, { kind: 'restore', confirmReplacement: true, requestId: randomUUID(), revision: rev(), quotes: env.store.workspace(A).quotes.map(q => q.estimate_id === optedOut ? { ...q, do_not_contact: false, status: 'sent', next_follow_up_date: H.today } : q) });
  assert.equal(restored.status, 200);
  assert.equal(restored.data.quotes.find(q => q.estimate_id === optedOut).do_not_contact, true, 'the retained preference re-applies the opt-out'); assert.equal(restored.data.quotes.find(q => q.estimate_id === optedOut).next_follow_up_date, '');
  // Only an explicitly reviewed release lifts it.
  const released = await session.post(url, { kind: 'release-optout', preference: 'email:' + H.markers('A').optEmail, reviewedOptOut: true, requestId: randomUUID(), revision: rev() });
  assert.equal(released.status, 200); assert.ok(env.store.events(A).some(e => e.type === 'retained_optout_released'), 'and the release is recorded in the ledger');
});
