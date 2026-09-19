import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { startServer } from '../server.mjs';
import { demoData, recordContact, todayISO, addDays, normalizeWorkspace, eligible, draftMessage, exportCSV, previewImport, importCandidates } from '../domain.js';
import bcrypt from 'bcryptjs';
import { request as httpRequest } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

test('local business accounts, isolation, persistence and recovery', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'quotetend-accounts-test-'));
  const dbPath = join(dir, 'accounts.sqlite');
  let running = await startServer({ port: 0, dbPath });
  const password = 'Fictional-test-password-827!';
  function client() {
    return { cookie: '', async request(path, method = 'GET', body, extra = {}) {
      const origin = `http://127.0.0.1:${running.port}`;
      // Legacy full-dataset fixtures now exercise the explicit restore operation. Ordinary edits are covered in results tests.
      if(method==='PUT') {path+='/commands';method='POST';body={...body,kind:'restore',requestId:crypto.randomUUID(),confirmReplacement:true};}
      const response = await fetch(origin + path, { method, headers: { Origin: origin, 'Content-Type': 'application/json',
        'X-QuoteTend-Request': '1', Cookie: this.cookie, ...extra }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      const set = response.headers.get('set-cookie'); if (set) this.cookie = set.split(';')[0];
      const text = await response.text(); let data; try { data = JSON.parse(text); } catch { data = text; }
      return { status: response.status, data, headers: response.headers };
    } };
  }
  const a = client(), b = client(), anonymous = client();
  let aId, bId, aSnapshot;
  try {
    await t.test('unauthenticated API and private files are inaccessible', async () => {
      assert.equal((await anonymous.request('/api/me')).status, 401);
      assert.equal((await anonymous.request('/api/workspaces/guessed', 'PUT', { revision: 0, quotes: [] })).status, 401);
      for (const path of ['/account-store.mjs', '/accounts.sqlite', '/package.json', '/docs/HANDOFF.md', '/node_modules/bcryptjs/index.js']) assert.equal((await anonymous.request(path)).status, 404);
      const hostStatus = await new Promise((resolve, reject) => { const req = httpRequest({ hostname: '127.0.0.1', port: running.port, path: '/', headers: { Host: 'evil.example' } }, res => { res.resume(); resolve(res.statusCode); }); req.on('error', reject); req.end(); });
      assert.equal(hostStatus, 403);
    });
    await t.test('reject cross-origin, missing request header, weak and truncated passwords', async () => {
      const body = { email: 'owner-a@example.com', password, businessName: 'Fictional A Painting' };
      assert.equal((await a.request('/api/register', 'POST', body, { Origin: 'https://evil.example' })).status, 403);
      assert.equal((await a.request('/api/register', 'POST', body, { 'X-QuoteTend-Request': '' })).status, 403);
      for (const weak of ['short', 'a'.repeat(73), '🔒'.repeat(30)]) assert.equal((await a.request('/api/register', 'POST', { ...body, password: weak })).status, 400);
      assert.equal((await anonymous.request('/api/workspaces/guessed', 'PUT', {}, { 'Content-Type': 'text/plain' })).status, 403);
    });
    await t.test('one owner per business; new accounts are empty; hashed passwords and protected cookies', async () => {
      const r = await a.request('/api/register', 'POST', { email: 'Owner-A@example.com', password, businessName: 'Fictional A Painting' });
      assert.equal(r.status, 201); aId = r.data.businessId;
      assert.match(r.headers.get('set-cookie'), /HttpOnly/); assert.match(r.headers.get('set-cookie'), /SameSite=Strict/);
      assert.match(r.headers.get('set-cookie'), /Path=\/api/);
      const rb = await b.request('/api/register', 'POST', { email: 'owner-b@example.com', password, businessName: 'Fictional B Painting' });
      assert.equal(rb.status, 201); bId = rb.data.businessId; assert.notEqual(aId, bId);
      assert.deepEqual((await a.request('/api/workspaces/' + aId)).data.quotes, []);
      assert.deepEqual((await b.request('/api/workspaces/' + bId)).data.quotes, []);
      const hash = running.store.ownerByEmail('owner-a@example.com').password_hash;
      assert.notEqual(hash, password); assert.equal(await bcrypt.compare(password, hash), true);
      assert.equal((await anonymous.request('/api/register', 'POST', { email: ' OWNER-A@example.com ', password, businessName: 'Duplicate' })).status, 409);
      assert.equal(running.store.db.prepare('SELECT COUNT(*) AS n FROM businesses').get().n, 2);
    });
    await t.test('business A cannot read, overwrite or delete B; forged IDs cannot redirect saves', async () => {
      const qa = { ...demoData()[0], estimate_id: 'SAME-ID', customer_name: 'A Private Client', saved_draft: 'A private draft', history: [{ type: 'note', text: 'A private history', at: new Date().toISOString() }] };
      const qb = { ...qa, customer_name: 'B Private Client', saved_draft: 'B private draft', history: [{ type: 'note', text: 'B private history', at: new Date().toISOString() }] };
      assert.equal((await a.request('/api/workspaces/' + aId, 'PUT', { revision: 0, quotes: [qa], businessId: bId, ownerId: 'forged' })).status, 200);
      assert.equal((await b.request('/api/workspaces/' + bId, 'PUT', { revision: 0, quotes: [qb] })).status, 200);
      for (const method of ['GET', 'PUT', 'DELETE', 'PATCH']) {
        const r = await a.request('/api/workspaces/' + bId, method, method === 'GET' ? undefined : { revision: 1, quotes: [] });
        assert.equal(r.status, 404); assert.doesNotMatch(JSON.stringify(r.data), /B Private|B private/);
      }
      assert.equal((await b.request('/api/workspaces/' + aId)).status, 404);
      for(const suffix of ['/events','/results?from=2026-01-01&to=2026-01-02','/snapshots','/snapshots/guessed']) assert.equal((await a.request('/api/workspaces/'+bId+suffix)).status,404);
      assert.equal((await a.request('/api/workspaces/'+bId+'/commands','POST',{kind:'edit',estimateId:'SAME-ID',fields:{notes:'attack'},revision:1,requestId:crypto.randomUUID()})).status,404);
      const blockedPut=await fetch('http://127.0.0.1:'+running.port+'/api/workspaces/'+aId,{method:'PUT',headers:{Cookie:a.cookie,Origin:'http://127.0.0.1:'+running.port,'Content-Type':'application/json','X-QuoteTend-Request':'1'},body:JSON.stringify({revision:1,quotes:[]})});assert.equal(blockedPut.status,405);
      assert.equal((await a.request('/api/workspaces/' + aId + '?businessId=' + bId)).data.quotes[0].customer_name, 'A Private Client');
      const savedB = (await b.request('/api/workspaces/' + bId)).data;
      assert.deepEqual(savedB.quotes, [qb]); assert.equal(savedB.revision, 1);
    });
    await t.test('server validates records and rejects stale or simultaneous overwrites', async () => {
      const path = '/api/workspaces/' + aId;
      const before = (await a.request(path)).data;
      assert.equal((await a.request(path, 'PUT', { revision: before.revision, quotes: [{ ...before.quotes[0], amount_usd: -1 }] })).status, 400);
      assert.deepEqual((await a.request(path)).data, before);
      const results = await Promise.all([a.request(path, 'PUT', { revision: before.revision, quotes: before.quotes }), a.request(path, 'PUT', { revision: before.revision, quotes: [] })]);
      assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
      assert.equal((await a.request(path, 'PUT', { revision: before.revision, quotes: [] })).status, 409);
    });
    await t.test('estimate entry, draft, contact, outcome and CSV import survive account persistence', async () => {
      const path = '/api/workspaces/' + aId;
      const q = { ...demoData()[0], estimate_id: 'WORKFLOW-1', customer_name: 'Jordan Fictional', customer_email: 'jordan@example.com', status: 'sent', do_not_contact: false,
        estimate_date: todayISO(), next_follow_up_date: todayISO(), last_contact_date: '', history: [], saved_draft: '' };
      q.saved_draft = draftMessage(q, 'Fictional A Painting');
      const contacted = recordContact(q, { date: todayISO(), nextDate: addDays(todayISO(), 3), channel: 'Phone', note: 'DEMO ONLY simulated call' });
      const won = normalizeWorkspace([{ ...contacted, status: 'won' }])[0];
      const imported = importCandidates(previewImport(exportCSV([{ ...q, estimate_id: 'IMPORTED-1' }]), [won]), [won]);
      const before = (await a.request(path)).data;
      assert.equal((await a.request(path, 'PUT', { revision: before.revision, quotes: [won, ...imported] })).status, 200);
      const saved = (await a.request(path)).data.quotes;
      assert.equal(saved[0].status, 'won'); assert.equal(saved[0].next_follow_up_date, '');
      assert.equal(saved[0].saved_draft, q.saved_draft); assert.match(saved[0].history[0].text, /DEMO ONLY/);
      assert.equal(saved[1].estimate_id, 'IMPORTED-1');
    });
    await t.test('shared-email opt-outs normalize on the server only inside the same business', async () => {
      const path = '/api/workspaces/' + aId, before = (await a.request(path)).data;
      const sibling = { ...before.quotes[1], estimate_id: 'OPTED-OUT', do_not_contact: true, status: 'lost' };
      const r = await a.request(path, 'PUT', { revision: before.revision, quotes: [...before.quotes, sibling] });
      assert.equal(r.status, 200); assert.equal(r.data.quotes[1].next_follow_up_date, '');
      assert.equal(eligible(r.data.quotes[1], r.data.quotes), false);
      assert.equal((await b.request('/api/workspaces/' + bId)).data.revision, 1);
      aSnapshot = r.data;
    });
    await t.test('incorrect sign-in, session rotation, logout and forged cookies', async () => {
      const c = client(); assert.equal((await c.request('/api/login', 'POST', { email: 'owner-a@example.com', password: 'Wrong-password-9' })).status, 401);
      assert.equal((await c.request('/api/login', 'POST', { email: 'owner-a@example.com', password })).status, 200);
      const oldCookie = c.cookie;
      assert.equal((await c.request('/api/login', 'POST', { email: 'owner-a@example.com', password })).status, 200);
      assert.notEqual(c.cookie, oldCookie);
      const old = client(); old.cookie = oldCookie; assert.equal((await old.request('/api/me')).status, 401);
      const activeCookie = c.cookie; assert.equal((await c.request('/api/logout', 'POST', {})).status, 200);
      c.cookie = activeCookie; assert.equal((await c.request('/api/me')).status, 401);
      c.cookie = activeCookie + 'forged'; assert.equal((await c.request('/api/me')).status, 401);
    });
    await t.test('expired sessions are denied', async () => {
      const c = client(); await c.request('/api/login', 'POST', { email: 'owner-a@example.com', password });
      const sid = decodeURIComponent(c.cookie.split('=').slice(1).join('')).slice(2).split('.')[0];
      running.store.db.prepare('UPDATE sessions SET expires=? WHERE sid=?').run(Date.now() - 1, sid);
      assert.equal((await c.request('/api/me')).status, 401);
    });
    await t.test('database restart and an isolated stopped-server backup/restore preserve both businesses', async () => {
      await running.close();
      const backup = join(dir, 'backup.sqlite'); await copyFile(dbPath, backup);
      running = await startServer({ port: 0, dbPath });
      assert.deepEqual((await a.request('/api/workspaces/' + aId)).data, aSnapshot);
      await running.close();
      const restored = join(dir, 'restored.sqlite'); await copyFile(backup, restored);
      running = await startServer({ port: 0, dbPath: restored });
      assert.deepEqual((await a.request('/api/workspaces/' + aId)).data, aSnapshot);
      assert.equal((await b.request('/api/workspaces/' + bId)).data.quotes[0].customer_name, 'B Private Client');
      assert.equal((await a.request('/api/workspaces/' + bId)).status, 404);
    });
    await t.test('offline password recovery preserves records and invalidates all sessions', async () => {
      await running.close();
      const restored = join(dir, 'restored.sqlite');
      const result = await promisify(execFile)(process.execPath, ['manage-accounts.mjs', 'reset-password', 'owner-a@example.com'], { env: { ...process.env, QUOTETEND_DB: restored } });
      const recovered = result.stdout.trim().split(/\r?\n/).at(-1);
      assert.equal(recovered.length, 32);
      running = await startServer({ port: 0, dbPath: restored });
      assert.equal((await a.request('/api/me')).status, 401); assert.equal((await b.request('/api/me')).status, 401);
      assert.equal((await a.request('/api/login', 'POST', { email: 'owner-a@example.com', password })).status, 401);
      assert.equal((await a.request('/api/login', 'POST', { email: 'owner-a@example.com', password: recovered })).status, 200);
      assert.deepEqual((await a.request('/api/workspaces/' + aId)).data, aSnapshot);
    });
    await t.test('repeated sign-in attempts are throttled', async () => {
      let status;
      for (let n = 0; n < 41; n++) { status = (await anonymous.request('/api/login', 'POST', { email: 'nobody@example.com', password: '' })).status; if (status === 429) break; }
      assert.equal(status, 429);
    });
  } finally {
    await running.close();
    if (dirname(dir) === tmpdir() && basename(dir).startsWith('quotetend-accounts-test-')) await rm(dir, { recursive: true, force: true });
  }
});
