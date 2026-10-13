// Shared harness for the Sprint 3A security tests. Everything here is fictional and disposable:
// each launch() gets its own temporary database, port and rate-limit counters, and is torn down
// (server closed, then directory removed) by a single t.after hook so Windows can delete the file.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { request } from 'node:http';
import { createHmac, randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { startServer } from '../../server.mjs';
import { configuration } from '../../production-config.mjs';
import { demoData, addDays, todayISO } from '../../domain.js';

export const PASSWORD = 'Fictional-sec-password-4821!';
export const OTHER_PASSWORD = 'Fictional-sec-replacement-7730!';
// Cost 4 is bcryptjs' minimum: fixtures sign in through the real login route without paying for cost 12.
// Each owner gets its own salt, like production, so no two owners share a password hash.
const fastHash = () => bcrypt.hashSync(PASSWORD, 4);
export const today = todayISO();
export const PROD_ORIGIN = 'https://fictional.example';

export async function launch(t, { production = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'quotetend-security-test-'));
  const logs = [];
  const config = production
    ? { production: true, host: '127.0.0.1', origin: PROD_ORIGIN, secret: 'z'.repeat(64), backupDir: join(dir, 'backups') }
    : { ...configuration({}), backupDir: join(dir, 'backups') };
  const running = await startServer({ port: 0, dbPath: join(dir, 'accounts.sqlite'), config, logger: entry => logs.push(entry) });
  t.after(async () => {
    try { await running.close(); }
    finally { if (dirname(dir) === tmpdir() && basename(dir).startsWith('quotetend-security-test-')) rmSync(dir, { recursive: true, force: true }); }
  });
  return { running, store: running.store, port: running.port, production, logs, dir,
    origin: production ? PROD_ORIGIN : 'http://127.0.0.1:' + running.port,
    host: production ? 'fictional.example' : '127.0.0.1:' + running.port, secret: production ? config.secret : running.store.secret, cookieName: 'quotetend.sid.0' };
}

// Raw HTTP so tests control Host, Origin and the request header exactly. A header set to null is omitted.
// An owner id of undefined means "do not send"; the cookie jar holds only the latest session cookie.
export function client(env) {
  return { cookie: '', async send(path, method = 'GET', body, headers = {}, { raw } = {}) {
    const merged = { Host: env.host, Origin: env.origin, 'Content-Type': 'application/json', 'X-QuoteTend-Request': '1',
      ...(this.cookie ? { Cookie: this.cookie } : {}), ...(env.production ? { 'X-Forwarded-Proto': 'https' } : {}), ...headers };
    for (const key of Object.keys(merged)) if (merged[key] === null) delete merged[key];
    const payload = raw !== undefined ? raw : body === undefined ? undefined : JSON.stringify(body);
    // Node sends DELETE and OPTIONS without a length by default, which the server would treat as bodyless.
    if (payload !== undefined && !('Content-Length' in merged)) merged['Content-Length'] = Buffer.byteLength(payload);
    const result = await new Promise((resolve, reject) => {
      const req = request({ hostname: '127.0.0.1', port: env.port, path, method, headers: merged }, res => {
        const chunks = []; res.on('data', c => chunks.push(c));
        res.on('end', () => { const text = Buffer.concat(chunks).toString('utf8'); let data = text; try { data = JSON.parse(text); } catch { /* not JSON */ }
          resolve({ status: res.statusCode, data, text, headers: res.headers, setCookie: res.headers['set-cookie'] || [] }); });
      });
      req.on('error', reject); req.end(payload);
    });
    const session = result.setCookie.find(c => c.startsWith('quotetend.sid.'));
    if (session) this.cookie = session.split(';')[0].endsWith('=') ? '' : session.split(';')[0];
    return result;
  },
  get(path, headers) { return this.send(path, 'GET', undefined, headers); },
  post(path, body, headers) { return this.send(path, 'POST', body, headers); } };
}

export const signIn = async (env, email, password = PASSWORD) => {
  const c = client(env); const r = await c.post('/api/login', { email, password });
  if (r.status !== 200) throw new Error('Fixture sign-in failed: ' + r.status);
  return c;
};

// Create an owner directly in the database (not through /api/register) to keep auth-route rate limits free.
export const addOwner = (env, email, businessName) => env.store.createOwner(email, fastHash(), businessName);

export function commander(env, owner) {
  return (kind, args = {}) => env.store.command(owner, { kind, requestId: randomUUID(), revision: env.store.workspace(owner.business_id).revision, ...args });
}

// Distinct, recognizable private data per tenant. Every string below must never appear in another tenant's responses.
export function markers(tag) {
  const lower = tag.toLowerCase(), phone = tag === 'A' ? '555-0111' : '555-0222';
  return { tag, name: `${tag}-Private-Customer`, email: `${lower}-private@example.com`, optEmail: `${lower}-optout@example.com`, phone,
    address: `${tag === 'A' ? 111 : 222} Fictional-${tag} Lane`, notes: `${tag}-confidential-note`, draft: `${tag}-confidential-draft`,
    contact: `${tag}-confidential-contact-note`, correction: `${tag}-confidential-correction`, business: `Fictional ${tag} Roofing`, idPrefix: `${tag}-EST` };
}
export const leakPatterns = tag => { const m = markers(tag); return [m.name, m.email, m.optEmail, m.phone, m.address, m.notes, m.draft, m.contact, m.correction, m.business, m.idPrefix]; };
export function assertNoLeak(assert, response, tag, label = '', { except = [] } = {}) {
  const text = typeof response === 'string' ? response : response.text ?? JSON.stringify(response.data);
  for (const needle of leakPatterns(tag).filter(n => !except.includes(n))) assert.ok(!text.includes(needle), `${label} leaked tenant ${tag} data: ${needle}`);
}

// Seed one tenant with estimates, a logged contact, an outcome, an opt-out, a draft, a retained preference and a safety snapshot.
export function seedTenant(env, owner, tag) {
  const m = markers(tag), run = commander(env, owner), id = n => `${m.idPrefix}-${n}`;
  const base = { ...demoData()[0], estimate_date: addDays(today, -6), history: [], saved_draft: '', last_contact_date: '', do_not_contact: false, status: 'sent', trade: 'Roofing' };
  run('create', { fields: { ...base, estimate_id: id(1), customer_name: m.name, customer_email: m.email, customer_phone: m.phone, address: m.address, notes: m.notes, amount_usd: 8400, next_follow_up_date: today } });
  run('create', { fields: { ...base, estimate_id: id(2), customer_name: m.name + '-Two', customer_email: m.optEmail, customer_phone: m.phone, address: m.address, notes: m.notes, amount_usd: 1900, next_follow_up_date: '' } });
  run('create', { fields: { ...base, estimate_id: id(3), customer_name: m.name + '-Three', customer_email: `${tag.toLowerCase()}-three@example.com`, notes: m.notes, amount_usd: 5200, next_follow_up_date: today } });
  run('contact', { estimateId: id(1), contact: { date: today, nextDate: addDays(today, 3), channel: 'Phone', note: m.contact } });
  run('draft', { estimateId: id(3), text: m.draft });
  run('outcome', { estimateId: id(3), status: 'won' });
  run('edit', { estimateId: id(2), fields: { do_not_contact: true, status: 'lost' } });
  // A restore writes a safety snapshot of the pre-restore workspace and a retained opt-out preference.
  const before = env.store.workspace(owner.business_id);
  run('restore', { quotes: before.quotes, confirmReplacement: true });
  run('contact', { estimateId: id(1), contact: { date: today, nextDate: addDays(today, 5), channel: 'Email', note: m.correction } });
  const eventId = env.store.events(owner.business_id).filter(e => e.type === 'contact_logged').at(-1).id;
  return { owner, m, ids: [id(1), id(2), id(3)], snapshotId: env.store.snapshots(owner.business_id)[0].id, eventId, run };
}

// Complete observable state of a tenant. Equal fingerprints before and after an attack prove no mutation occurred.
export function fingerprint(env, businessId) {
  const db = env.store.db, one = (sql, ...args) => db.prepare(sql).all(...args);
  return JSON.stringify({ workspace: env.store.workspace(businessId), events: env.store.events(businessId), snapshots: one('SELECT * FROM safety_snapshots WHERE business_id=? ORDER BY id', businessId),
    operations: one('SELECT * FROM operations WHERE business_id=? ORDER BY request_id', businessId), optouts: one('SELECT * FROM retained_optouts WHERE business_id=? ORDER BY preference', businessId),
    identity: one('SELECT * FROM estimate_identity WHERE business_id=? ORDER BY estimate_key', businessId), measurement: one('SELECT * FROM measurement WHERE business_id=?', businessId) });
}

// express-session signs cookies as "s:<sid>.<base64 HMAC-SHA256 without padding>". Tests that know the secret can
// forge structurally valid cookies to prove the server still rejects unknown, expired or inconsistent sessions.
export const signedCookie = (env, sid) => env.cookieName + '=' + encodeURIComponent('s:' + sid + '.' + createHmac('sha256', env.secret).update(sid).digest('base64').replace(/=+$/, ''));
export const sidOf = cookie => decodeURIComponent(cookie.split('=').slice(1).join('=')).slice(2).split('.')[0];
export const sessionRows = (env, ownerId) => env.store.db.prepare("SELECT sid, data FROM sessions WHERE json_extract(data,'$.ownerId')=?").all(ownerId);
