// Sprint 3A: authentication and session lifecycle through the real HTTP API.
// Missing/forged/expired/revoked sessions, wrong passwords, fixation, logout, password change and suspension.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { tokenHash } from '../account-security.mjs';
import * as H from './helpers/security-harness.mjs';

const HOURS_8 = 8 * 60 * 60 * 1000;
async function setup(t, options) {
  const env = await H.launch(t, options);
  const a = H.addOwner(env, 'owner-a@example.com', H.markers('A').business), b = H.addOwner(env, 'owner-b@example.com', H.markers('B').business);
  H.seedTenant(env, a, 'A'); H.seedTenant(env, b, 'B');
  return { env, a, b, A: a.business_id, B: b.business_id };
}
const protectedRequests = (A, requestId = randomUUID()) => [['GET', '/api/me'], ['GET', `/api/workspaces/${A}`], ['GET', `/api/workspaces/${A}/events`], ['GET', `/api/workspaces/${A}/snapshots`], ['GET', `/api/workspaces/${A}/results?from=2026-01-01&to=2026-01-02`],
  ['POST', `/api/workspaces/${A}/commands`, { kind: 'restore', quotes: [], confirmReplacement: true, requestId, revision: 0 }], ['POST', '/api/password', { currentPassword: H.PASSWORD, password: H.OTHER_PASSWORD }],
  ['POST', '/api/recovery-code', { currentPassword: H.PASSWORD }], ['GET', '/api/does-not-exist'], ['GET', '/api/workspaces/' + A + '/anything']];
const SIGN_IN_AGAIN = { error: 'Please sign in again. Unsaved changes have not been applied.' };

test('every protected route rejects missing, garbage, tampered, wrongly signed and unknown-session cookies with one generic 401', async t => {
  const { env, a, A } = await setup(t);
  const real = await H.signIn(env, 'owner-a@example.com'), sid = H.sidOf(real.cookie), before = H.fingerprint(env, A);
  const wrongSecret = H.signedCookie({ ...env, secret: 'y'.repeat(64) }, sid);
  const cookies = { none: '', garbage: 'quotetend.sid.0=not-a-session', empty: 'quotetend.sid.0=', unsigned: 'quotetend.sid.0=' + sid, tampered: real.cookie.slice(0, -2) + 'AA',
    swappedSid: real.cookie.replace(sid.slice(0, 6), 'AAAAAA'), wrongSecret, validSignatureUnknownSid: H.signedCookie(env, randomUUID()), sqlInjection: "quotetend.sid.0=s%3A'%20OR%201%3D1--.x", otherPort: real.cookie.replace('.0=', '.1=') };
  const rows = env.store.db.prepare('SELECT COUNT(*) n FROM sessions').get().n;
  for (const [label, cookie] of Object.entries(cookies)) for (const [method, path, body] of protectedRequests(A)) {
    const r = await H.client(env).send(path, method, body, { Cookie: cookie || null });
    assert.equal(r.status, 401, `${label} ${method} ${path}`); assert.deepEqual(r.data, SIGN_IN_AGAIN);
    H.assertNoLeak(assert, r, 'A', label); assert.deepEqual(r.setCookie, [], `${label}: a refusal must not mint a session`);
  }
  assert.equal(env.store.db.prepare('SELECT COUNT(*) n FROM sessions').get().n, rows, 'no sessions were created by rejected requests');
  assert.equal(H.fingerprint(env, A), before, 'no mutation from any rejected request');
  assert.equal((await real.get('/api/me')).status, 200, 'the genuine session was never disturbed');
  assert.equal(a.id.length > 0, true);
});

test('wrong passwords and unknown accounts are indistinguishable and never create a session', async t => {
  const { env } = await setup(t);
  const attempts = [['owner-a@example.com', 'Wrong-password-0000'], ['nobody@example.com', H.PASSWORD], ['nobody@example.com', 'Wrong-password-0000'], ['owner-a@example.com', ''], ['owner-a@example.com', 'x'.repeat(200)],
    ['owner-a@example.com', '🔒'.repeat(30)], ['owner-a@example.com', 12345], ['owner-a@example.com', null], ['owner-a@example.com', ['array']], [{ $ne: '' }, H.PASSWORD], [['owner-a@example.com'], H.PASSWORD], [undefined, undefined]];
  const responses = [];
  for (const [email, password] of attempts) {
    const r = await H.client(env).post('/api/login', { email, password });
    assert.equal(r.status, 401, JSON.stringify([email, password])); assert.deepEqual(r.setCookie, []);
    responses.push(JSON.stringify(r.data));
  }
  assert.equal(new Set(responses).size, 1, 'one message for every failure: ' + [...new Set(responses)]);
  assert.equal(env.store.db.prepare('SELECT COUNT(*) n FROM sessions').get().n, 0);
  assert.equal((await H.client(env).post('/api/login', { email: ' OWNER-A@Example.com ', password: H.PASSWORD })).status, 200, 'email matching is case- and whitespace-insensitive');
});

test('sign-in rotates the session ID: planted, pre-login and previous cookies never become authenticated', async t => {
  const { env, B } = await setup(t);
  // Attacker chooses a session ID and tricks a victim into sending it (it is validly signed in this scenario).
  const plantedSid = randomUUID(), attacker = H.client(env), victim = H.client(env);
  victim.cookie = H.signedCookie(env, plantedSid);
  const login = await victim.post('/api/login', { email: 'owner-a@example.com', password: H.PASSWORD });
  assert.equal(login.status, 200); assert.notEqual(H.sidOf(victim.cookie), plantedSid, 'the server issued a new ID');
  attacker.cookie = H.signedCookie(env, plantedSid);
  assert.equal((await attacker.get('/api/me')).status, 401, 'the planted ID did not become authenticated');
  assert.equal(env.store.db.prepare('SELECT COUNT(*) n FROM sessions WHERE sid=?').get(plantedSid).n, 0);
  // Signing in as someone else on top of a live session replaces it; the first identity's cookie dies.
  const first = victim.cookie, second = await victim.post('/api/login', { email: 'owner-b@example.com', password: H.PASSWORD });
  assert.equal(second.status, 200); assert.equal(second.data.businessId, B); assert.notEqual(victim.cookie, first);
  const stale = H.client(env); stale.cookie = first; assert.equal((await stale.get('/api/me')).status, 401);
  assert.equal((await victim.get('/api/me')).data.email, 'owner-b@example.com');
  // Registration (non-production only) also rotates.
  const fresh = H.client(env), preCookie = H.signedCookie(env, randomUUID()); fresh.cookie = preCookie;
  assert.equal((await fresh.post('/api/register', { email: 'new-owner@example.com', password: H.PASSWORD, businessName: 'Fictional New Roofing' })).status, 201);
  assert.notEqual(fresh.cookie, preCookie);
});

test('session cookies are HttpOnly, SameSite=Strict, path-scoped, eight hours, and Secure in production', async t => {
  for (const production of [false, true]) {
    const { env } = await setup(t, { production });
    const r = await H.client(env).post('/api/login', { email: 'owner-a@example.com', password: H.PASSWORD }), header = r.setCookie[0];
    assert.equal(r.status, 200, 'production=' + production);
    assert.match(header, /HttpOnly/); assert.match(header, /SameSite=Strict/); assert.match(header, /Path=\/api/); assert.match(header, /Max-Age=28800|Expires=/);
    assert.equal(/;\s*Secure/.test(header), production);
    assert.ok(!r.text.includes(H.sidOf(header.split(';')[0])), 'the body never carries the session identifier');
  }
});

test('logout revokes the server-side session and is CSRF-protected', async t => {
  const { env, a, A } = await setup(t);
  const one = await H.signIn(env, 'owner-a@example.com'), two = await H.signIn(env, 'owner-a@example.com'), other = await H.signIn(env, 'owner-b@example.com');
  assert.equal(H.sessionRows(env, a.id).length, 2);
  const cookie = one.cookie, sid = H.sidOf(cookie);
  assert.equal((await one.post('/api/logout', {}, { Origin: 'https://evil.example' })).status, 403, 'cross-site logout is refused');
  assert.equal((await one.get('/api/me')).status, 200, 'and did not log the user out');
  assert.equal((await one.post('/api/logout', {})).status, 200);
  assert.equal(env.store.db.prepare('SELECT COUNT(*) n FROM sessions WHERE sid=?').get(sid).n, 0, 'the session row is gone, not just the cookie');
  const replay = H.client(env); replay.cookie = cookie;
  for (const [method, path, body] of protectedRequests(A)) assert.equal((await replay.send(path, method, body)).status, 401, path);
  // Documented behaviour: logout ends this browser's session only; the owner's other session and other businesses continue.
  assert.equal((await two.get('/api/me')).status, 200); assert.equal((await other.get('/api/me')).status, 200);
  assert.equal((await H.client(env).post('/api/logout', {})).status, 200, 'logging out with no session is harmless');
});

test('changing the password revokes every session of that owner immediately and no one else\'s', async t => {
  const { env, a, A } = await setup(t);
  const s1 = await H.signIn(env, 'owner-a@example.com'), s2 = await H.signIn(env, 'owner-a@example.com'), other = await H.signIn(env, 'owner-b@example.com');
  const before = H.fingerprint(env, A);
  assert.equal((await s1.post('/api/password', { currentPassword: 'Wrong-password-0000', password: H.OTHER_PASSWORD })).status, 400);
  assert.equal((await s1.post('/api/password', { currentPassword: H.PASSWORD, password: H.OTHER_PASSWORD }, { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await s1.post('/api/password', { currentPassword: H.PASSWORD, password: 'short' })).status, 400);
  assert.equal((await s2.get('/api/me')).status, 200, 'failed attempts changed nothing');
  assert.equal((await s1.post('/api/password', { currentPassword: H.PASSWORD, password: H.OTHER_PASSWORD })).status, 200);
  for (const session of [s1, s2]) for (const [method, path, body] of protectedRequests(A)) assert.equal((await session.send(path, method, body)).status, 401, path);
  assert.equal(H.sessionRows(env, a.id).length, 0); assert.equal((await other.get('/api/me')).status, 200);
  assert.equal((await H.client(env).post('/api/login', { email: 'owner-a@example.com', password: H.PASSWORD })).status, 401, 'old password');
  assert.equal((await H.client(env).post('/api/login', { email: 'owner-a@example.com', password: H.OTHER_PASSWORD })).status, 200, 'new password');
  assert.equal(H.fingerprint(env, A), before, 'business data survives the password change');
});

test('a suspended owner loses access at once, keeps their data, and cannot recover their way back in', async t => {
  const { env, a, b, A } = await setup(t);
  const session = await H.signIn(env, 'owner-a@example.com'), other = await H.signIn(env, 'owner-b@example.com');
  const code = (await session.post('/api/recovery-code', { currentPassword: H.PASSWORD })).data.code, before = H.fingerprint(env, A);
  env.store.setSuspended(a.id, true);
  for (const [method, path, body] of protectedRequests(A)) assert.equal((await session.send(path, method, body)).status, 401, path);
  const denied = await H.client(env).post('/api/login', { email: 'owner-a@example.com', password: H.PASSWORD });
  const wrong = await H.client(env).post('/api/login', { email: 'owner-a@example.com', password: 'Wrong-password-0000' });
  assert.equal(denied.status, 401); assert.deepEqual(denied.data, wrong.data, 'suspension is not distinguishable from a wrong password'); assert.deepEqual(denied.setCookie, []);
  assert.equal((await other.get('/api/me')).status, 200); assert.equal(b.id.length > 0, true);
  // Recovery resets the password but is not a way around a suspension.
  assert.equal((await H.client(env).post('/api/recover', { email: 'owner-a@example.com', code, password: H.OTHER_PASSWORD })).status, 200);
  assert.equal((await H.client(env).post('/api/login', { email: 'owner-a@example.com', password: H.OTHER_PASSWORD })).status, 401);
  // A session row planted for a suspended owner is refused too.
  env.store.db.prepare('INSERT INTO sessions VALUES(?,?,?)').run('planted-sid', JSON.stringify({ cookie: { expires: new Date(Date.now() + 60000).toISOString() }, ownerId: a.id, credentialVersion: tokenHash(env.store.ownerById(a.id).password_hash), started: Date.now() }), Date.now() + 60000);
  const planted = H.client(env); planted.cookie = H.signedCookie(env, 'planted-sid'); assert.equal((await planted.get('/api/me')).status, 401);
  env.store.setSuspended(a.id, false);
  assert.equal(H.fingerprint(env, A), before, 'suspension and resume leave customer data untouched');
  assert.equal((await H.client(env).post('/api/login', { email: 'owner-a@example.com', password: H.OTHER_PASSWORD })).status, 200);
});

test('session lifetime: exact eight-hour boundary and store expiry, with time frozen', async t => {
  const { env, a } = await setup(t);
  const session = await H.signIn(env, 'owner-a@example.com'), sid = H.sidOf(session.cookie), db = env.store.db;
  const row = () => JSON.parse(db.prepare('SELECT data FROM sessions WHERE sid=?').get(sid).data);
  const write = (patch, expires) => db.prepare('UPDATE sessions SET data=?, expires=? WHERE sid=?').run(JSON.stringify({ ...row(), ...patch }), expires, sid);
  const NOW = Date.now(); t.mock.method(Date, 'now', () => NOW);
  write({ started: NOW - HOURS_8 + 1 }, NOW + 1); assert.equal((await session.get('/api/me')).status, 200, 'one millisecond before the limit');
  write({ started: NOW - HOURS_8 }, NOW + 1); assert.equal((await session.get('/api/me')).status, 401, 'exactly eight hours is expired');
  write({ started: NOW - HOURS_8 - 1 }, NOW + 1); assert.equal((await session.get('/api/me')).status, 401);
  write({ started: NOW }, NOW + 1); assert.equal((await session.get('/api/me')).status, 200, 'store row valid for one more millisecond');
  write({ started: NOW }, NOW); assert.equal((await session.get('/api/me')).status, 401, 'store expiry is exclusive');
  write({ started: NOW }, NOW - 1); assert.equal((await session.get('/api/me')).status, 401);
  write({ started: NOW + 1 }, NOW + 1); assert.equal((await session.get('/api/me')).status, 401, 'a start time in the future cannot stretch the eight-hour limit');
  write({ started: NaN }, NOW + 1); assert.equal((await session.get('/api/me')).status, 401, 'NaN serialises to null and is not a start time');
  t.mock.restoreAll();
  assert.equal(a.id.length > 0, true);
});

test('inconsistent session records are refused: wrong owner, stale credentials, missing fields, deleted owner', async t => {
  const { env, a, b } = await setup(t);
  const session = await H.signIn(env, 'owner-a@example.com'), sid = H.sidOf(session.cookie), db = env.store.db;
  const original = JSON.parse(db.prepare('SELECT data FROM sessions WHERE sid=?').get(sid).data);
  const put = patch => { const data = { ...original, ...patch }; for (const k of Object.keys(patch)) if (patch[k] === undefined) delete data[k]; db.prepare('UPDATE sessions SET data=? WHERE sid=?').run(JSON.stringify(data), sid); };
  assert.equal((await session.get('/api/me')).status, 200);
  const cases = { 'owner swapped to B, A\'s credential version': { ownerId: b.id }, 'credential version of another owner': { credentialVersion: tokenHash(env.store.ownerById(b.id).password_hash) },
    'credential version missing': { credentialVersion: undefined }, 'start time missing': { started: undefined }, 'start time not a number': { started: 'yesterday' }, 'owner id missing': { ownerId: undefined },
    'owner id unknown': { ownerId: randomUUID() }, 'owner id wrong type': { ownerId: { id: a.id } }, 'business id injected': { businessId: b.business_id, ownerId: b.id } };
  for (const [label, patch] of Object.entries(cases)) { put(patch); const r = await session.get('/api/me'); assert.equal(r.status, 401, label); assert.ok(!r.text.includes('owner-b@example.com'), label); }
  put({}); assert.equal((await session.get('/api/me')).status, 200, 'the control record is valid again');
});

test('concurrent sign-ins create independent sessions; revoking one does not affect the others', async t => {
  const { env, a } = await setup(t);
  const clients = await Promise.all(Array.from({ length: 6 }, () => H.signIn(env, 'owner-a@example.com')));
  assert.equal(new Set(clients.map(c => c.cookie)).size, 6); assert.equal(H.sessionRows(env, a.id).length, 6);
  await clients[0].post('/api/logout', {});
  const statuses = await Promise.all(clients.map(c => c.get('/api/me').then(r => r.status)));
  assert.deepEqual(statuses, [401, 200, 200, 200, 200, 200]);
});
