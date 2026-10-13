// Sprint 3A: invitation-only registration (production mode) and recovery-code handling over the real HTTP API.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { openAccounts } from '../account-store.mjs';
import { startServer } from '../server.mjs';
import { tokenHash } from '../account-security.mjs';
import * as H from './helpers/security-harness.mjs';

const INVITE_DENIED = { error: 'A valid invitation for this email is required.' };
const owners = db => db.prepare('SELECT COUNT(*) n FROM owners').get().n, businesses = db => db.prepare('SELECT COUNT(*) n FROM businesses').get().n, invitations = db => db.prepare('SELECT COUNT(*) n FROM invitations').get().n;
const invite = (env, email, code, expires = Date.now() + 60_000) => env.store.db.prepare('INSERT INTO invitations VALUES(?,?,?)').run(tokenHash(code), email, expires);
const body = (email, invitation, extra = {}) => ({ email, businessName: 'Fictional Invited Roofing', password: H.PASSWORD, invitation, ...extra });

test('production registration needs a matching, unexpired, unused invitation, and failures create nothing', async t => {
  const env = await H.launch(t, { production: true }), c = H.client(env);
  invite(env, 'invited@example.com', 'fictional-invite-one');
  const before = [owners(env.store.db), businesses(env.store.db), invitations(env.store.db)];
  const refused = [body('invited@example.com'), body('invited@example.com', ''), body('invited@example.com', 'wrong-code'), body('invited@example.com', 123), body('invited@example.com', { code: 'fictional-invite-one' }), body('invited@example.com', null),
    body('other@example.com', 'fictional-invite-one'), body('invited@example.com', 'FICTIONAL-INVITE-ONE'), body('invited@example.com', ' fictional-invite-one')];
  for (const payload of refused) { const r = await c.post('/api/register', payload); assert.equal(r.status, 403, JSON.stringify(payload.invitation)); assert.deepEqual(r.data, INVITE_DENIED); assert.deepEqual(r.setCookie, []); }
  assert.deepEqual([owners(env.store.db), businesses(env.store.db), invitations(env.store.db)], before, 'no owner, business or invitation change from refusals');
  // An invalid password must not burn the invitation.
  assert.equal((await c.post('/api/register', body('invited@example.com', 'fictional-invite-one', { password: 'short' }))).status, 400);
  assert.equal(invitations(env.store.db), 1);
  const ok = await c.post('/api/register', body('  Invited@Example.com ', 'fictional-invite-one'));
  assert.equal(ok.status, 201); assert.match(ok.setCookie[0], /Secure/); assert.equal((await c.get('/api/me')).data.email, 'invited@example.com');
  assert.deepEqual([owners(env.store.db), businesses(env.store.db), invitations(env.store.db)], [1, 1, 0]);
  assert.equal((await H.client(env).post('/api/register', body('invited@example.com', 'fictional-invite-one'))).status, 403, 'a used invitation cannot be used again');
  assert.equal(owners(env.store.db), 1);
});

test('invitations are stored only as hashes and expire exactly at their stated time', async t => {
  const env = await H.launch(t, { production: true }), c = H.client(env), now = Date.now();
  invite(env, 'late@example.com', 'fictional-invite-late', now - 1);
  invite(env, 'edge@example.com', 'fictional-invite-edge', now);
  invite(env, 'live@example.com', 'fictional-invite-live', now + 1);
  const rows = env.store.db.prepare('SELECT hash, email FROM invitations').all();
  assert.ok(rows.every(r => /^[0-9a-f]{64}$/.test(r.hash) && !r.hash.includes('fictional-invite')), 'no plaintext invitation in the database');
  t.mock.method(Date, 'now', () => now);
  for (const [email, code] of [['late@example.com', 'fictional-invite-late'], ['edge@example.com', 'fictional-invite-edge']]) {
    const r = await c.post('/api/register', body(email, code)); assert.equal(r.status, 403, email); assert.deepEqual(r.data, INVITE_DENIED);
  }
  assert.equal(owners(env.store.db), 0);
  assert.equal((await c.post('/api/register', body('live@example.com', 'fictional-invite-live'))).status, 201, 'valid for one more millisecond');
  t.mock.restoreAll();
});

test('an invitation cannot be used to take over an existing owner, and a double-submit creates exactly one owner', async t => {
  const env = await H.launch(t, { production: true });
  const existing = H.addOwner(env, 'existing@example.com', 'Fictional Existing Roofing'), hash = env.store.ownerById(existing.id).password_hash;
  invite(env, 'existing@example.com', 'fictional-invite-existing');
  const r = await H.client(env).post('/api/register', body('existing@example.com', 'fictional-invite-existing', { password: H.OTHER_PASSWORD, businessName: 'Hijack Roofing' }));
  assert.equal(r.status, 409); assert.doesNotMatch(r.text, /existing@example\.com|Existing Roofing/);
  assert.equal(env.store.ownerById(existing.id).password_hash, hash, 'the owner\'s password is untouched'); assert.equal(businesses(env.store.db), 1);
  assert.equal((await H.client(env).post('/api/login', { email: 'existing@example.com', password: H.PASSWORD })).status, 200);
  invite(env, 'twice@example.com', 'fictional-invite-twice');
  const results = await Promise.all([1, 2, 3].map(() => H.client(env).post('/api/register', body('twice@example.com', 'fictional-invite-twice'))));
  assert.equal(results.filter(x => x.status === 201).length, 1, 'exactly one registration wins: ' + results.map(x => x.status));
  assert.ok(results.every(x => [201, 403, 409].includes(x.status)));
  assert.equal(env.store.db.prepare("SELECT COUNT(*) n FROM owners WHERE email='twice@example.com'").get().n, 1); assert.equal(businesses(env.store.db), 2);
});

test('the invite-owner command issues a one-use hashed invitation that replaces any earlier one for the same email', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'quotetend-security-test-')), dbPath = join(dir, 'accounts.sqlite');
  let running;
  // One hook: the server must release the database before Windows can delete its directory.
  t.after(async () => { try { await running?.close(); } finally { rmSync(dir, { recursive: true, force: true }); } });
  openAccounts(dbPath).close();
  const issue = email => execFileSync(process.execPath, ['invite-owner.mjs', email], { env: { ...process.env, QUOTETEND_DB: dbPath }, encoding: 'utf8', stdio: 'pipe' }).trim().split(/\r?\n/).at(-1);
  const first = issue('cli-owner@example.com'), second = issue('cli-owner@example.com');
  assert.notEqual(first, second); assert.ok(first.length >= 40);
  running = await startServer({ port: 0, dbPath, logger: () => {}, config: { production: true, host: '127.0.0.1', origin: H.PROD_ORIGIN, secret: 'z'.repeat(64), backupDir: join(dir, 'backups') } });
  const env = { running, store: running.store, port: running.port, production: true, origin: H.PROD_ORIGIN, host: 'fictional.example' };
  assert.equal(invitations(running.store.db), 1);
  assert.ok(!JSON.stringify(running.store.db.prepare('SELECT * FROM invitations').all()).includes(second));
  assert.equal((await H.client(env).post('/api/register', body('cli-owner@example.com', first))).status, 403, 'the superseded invitation is dead');
  assert.equal((await H.client(env).post('/api/register', body('cli-owner@example.com', second))).status, 201);
  assert.throws(() => issue('cli-owner@example.com'), /Owner already exists/);
});

async function tenants(t) {
  const env = await H.launch(t);
  const a = H.addOwner(env, 'owner-a@example.com', H.markers('A').business), b = H.addOwner(env, 'owner-b@example.com', H.markers('B').business);
  H.seedTenant(env, a, 'A'); H.seedTenant(env, b, 'B');
  return { env, a, b, A: a.business_id, B: b.business_id };
}
const recover = (env, email, code, password = H.OTHER_PASSWORD, extra) => H.client(env).post('/api/recover', { email, code, password }, extra);
const issue = async (session, password = H.PASSWORD) => (await session.post('/api/recovery-code', { currentPassword: password }));

test('recovery codes: issued only with the current password, stored hashed, one use, replaced by the next code', async t => {
  const { env, a } = await tenants(t);
  const session = await H.signIn(env, 'owner-a@example.com');
  assert.equal((await H.client(env).post('/api/recovery-code', { currentPassword: H.PASSWORD })).status, 401);
  for (const currentPassword of ['Wrong-password-0000', '', null, ['x'], 'x'.repeat(100)]) assert.equal((await session.post('/api/recovery-code', { currentPassword })).status, 400);
  assert.equal(env.store.db.prepare('SELECT COUNT(*) n FROM recovery_codes').get().n, 0, 'no code exists after refusals');
  const first = (await issue(session)).data.code, second = (await issue(session)).data.code;
  assert.ok(first.length >= 40 && first !== second);
  assert.deepEqual(env.store.db.prepare('SELECT hash FROM recovery_codes WHERE owner_id=?').all(a.id).map(r => ({ ...r })), [{ hash: tokenHash(second) }], 'only the newest code, only as a hash');
  assert.equal((await recover(env, 'owner-a@example.com', first)).status, 400, 'a replaced code is dead');
  const used = await recover(env, 'owner-a@example.com', second);
  assert.equal(used.status, 200); assert.deepEqual(used.setCookie, [], 'recovery resets a password; it does not sign anyone in');
  assert.equal((await recover(env, 'owner-a@example.com', second, 'Fictional-third-password-5521!')).status, 400, 'a used code cannot be replayed');
  assert.equal(env.store.db.prepare('SELECT COUNT(*) n FROM recovery_codes').get().n, 0);
  assert.equal((await H.client(env).post('/api/login', { email: 'owner-a@example.com', password: H.OTHER_PASSWORD })).status, 200);
});

test('a recovery code works only for its own owner; every failure is the same answer and changes nothing', async t => {
  const { env, a, b } = await tenants(t);
  const sa = await H.signIn(env, 'owner-a@example.com'), sb = await H.signIn(env, 'owner-b@example.com');
  const codeA = (await issue(sa)).data.code, codeB = (await issue(sb)).data.code;
  const hashes = [env.store.ownerById(a.id).password_hash, env.store.ownerById(b.id).password_hash];
  const attempts = [['owner-b@example.com', codeA], ['owner-a@example.com', codeB], ['nobody@example.com', codeA], ['owner-a@example.com', 'wrong'], ['owner-a@example.com', ''], ['owner-a@example.com', null], ['owner-a@example.com', { code: codeA }], ['owner-a@example.com', codeA.toUpperCase()], ['owner-a@example.com', codeA + ' '], [undefined, codeA], [['owner-a@example.com'], codeA], ['', codeA]];
  const answers = new Set();
  for (const [email, code] of attempts) { const r = await recover(env, email, code); assert.equal(r.status, 400, JSON.stringify([email, code])); answers.add(JSON.stringify(r.data)); assert.deepEqual(r.setCookie, []); }
  assert.equal(answers.size, 1, 'unknown owner, wrong owner and wrong code are indistinguishable: ' + [...answers]);
  assert.deepEqual([env.store.ownerById(a.id).password_hash, env.store.ownerById(b.id).password_hash], hashes);
  assert.equal((await sa.get('/api/me')).status, 200); assert.equal((await sb.get('/api/me')).status, 200);
  assert.equal(env.store.db.prepare('SELECT COUNT(*) n FROM recovery_codes').get().n, 2, 'a failed guess does not consume or reveal a code');
});

test('successful recovery signs out only that owner; a weak new password does not burn the code', async t => {
  const { env, a, A } = await tenants(t);
  const s1 = await H.signIn(env, 'owner-a@example.com'), s2 = await H.signIn(env, 'owner-a@example.com'), other = await H.signIn(env, 'owner-b@example.com');
  const code = (await issue(s1)).data.code, before = H.fingerprint(env, A);
  for (const weak of ['short', 'a'.repeat(73), '🔒'.repeat(30), '', null]) assert.equal((await recover(env, 'owner-a@example.com', code, weak)).status, 400);
  assert.equal(env.store.db.prepare('SELECT COUNT(*) n FROM recovery_codes WHERE owner_id=?').get(a.id).n, 1, 'still usable after weak-password rejections');
  assert.equal((await recover(env, 'owner-a@example.com', code, H.OTHER_PASSWORD, { Origin: 'https://evil.example' })).status, 403, 'cross-site recovery is blocked');
  assert.equal((await s1.get('/api/me')).status, 200);
  const results = await Promise.all([1, 2, 3].map(() => recover(env, ' Owner-A@Example.com ', code)));
  assert.equal(results.filter(r => r.status === 200).length, 1, 'racing requests with one code: exactly one wins ' + results.map(r => r.status));
  for (const session of [s1, s2]) assert.equal((await session.get('/api/me')).status, 401);
  assert.equal(H.sessionRows(env, a.id).length, 0); assert.equal((await other.get('/api/me')).status, 200);
  assert.equal(H.fingerprint(env, A), before, 'customer data is untouched by recovery');
});

test('changing the password consumes the saved recovery code', async t => {
  const { env } = await tenants(t);
  const session = await H.signIn(env, 'owner-a@example.com'), code = (await issue(session)).data.code;
  assert.equal((await session.post('/api/password', { currentPassword: H.PASSWORD, password: H.OTHER_PASSWORD })).status, 200);
  assert.equal((await recover(env, 'owner-a@example.com', code, 'Fictional-third-password-5521!')).status, 400);
});

test('recovery, sign-in and registration guesses are throttled together, before the code is even examined', async t => {
  const { env, a } = await tenants(t);
  const session = await H.signIn(env, 'owner-a@example.com'), code = (await issue(session)).data.code; // two auth-limited requests so far
  let last;
  for (let n = 0; n < 38; n++) last = await recover(env, 'owner-a@example.com', 'guess-' + n, 'short');
  assert.equal(last.status, 400, 'guess 38 is still examined');
  const throttled = await recover(env, 'owner-a@example.com', code, H.OTHER_PASSWORD);
  assert.equal(throttled.status, 429, 'the 41st request is refused even though the code is correct'); assert.doesNotMatch(throttled.text, /owner-a|code|password hash/i);
  assert.ok(throttled.headers['ratelimit'] || throttled.headers['ratelimit-policy'], 'standard rate-limit headers are present');
  assert.equal((await H.client(env).post('/api/login', { email: 'owner-b@example.com', password: H.PASSWORD })).status, 429, 'the counter is shared across authentication routes');
  assert.equal(env.store.db.prepare('SELECT COUNT(*) n FROM recovery_codes WHERE owner_id=?').get(a.id).n, 1, 'the throttled request did not consume the code');
  assert.equal((await session.get('/api/me')).status, 200, 'throttling applies to guessing routes, not to an established session\'s ordinary requests');
});
