// Public website and demo: static structure, honest copy, safe static serving, and parity of the
// demo's fictional workspace with the private application's real domain/reporting/import modules.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { request } from 'node:http';
import { extname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as W from '../public-site/assets/js/workspace.js';
import * as D from '../domain.js';
import { followupResults } from '../results.js';
import { inspectSpreadsheet, previewSpreadsheet } from '../import-mapping.js';
import { startPublicServer, resolvePublicPath } from '../public-site/serve.mjs';

const ROOT = fileURLToPath(new URL('../public-site/', import.meta.url));
const read = p => readFile(join(ROOT, p), 'utf8');
async function walk(dir = ROOT) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(p)); else out.push(relative(ROOT, p).split(sep).join('/'));
  }
  return out;
}
const today = W.todayISO();

test('public site contains only public static file types', async () => {
  const files = await walk();
  const allowed = new Set(['.html', '.css', '.js', '.svg']);
  for (const f of files) {
    if (f === 'serve.mjs') continue;
    assert.ok(allowed.has(extname(f)), `unexpected file type published: ${f}`);
    assert.ok(!/(^|\/)\./.test(f), `dotfile published: ${f}`);
  }
  for (const banned of ['.sqlite', '.env', 'backup', '.json', '.xlsx', '.csv']) assert.ok(!files.some(f => f.toLowerCase().includes(banned)), `private or data file published: ${banned}`);
  assert.deepEqual(files.filter(f => f.endsWith('.html')).sort(), ['404.html', 'demo.html', 'index.html']);
});

test('copy stays honest: no unsupported claims, placeholders or private references', async () => {
  const files = (await walk()).filter(f => f !== 'serve.mjs');
  const text = (await Promise.all(files.map(read))).join('\n');
  const lower = text.toLowerCase();
  assert.match(text, /Your next job might already be in/);
  for (const phrase of ['ai-powered', 'guaranteed', 'automatic follow-up delivery', 'recover lost revenue', 'increase revenue by', '/api/', 'sqlite', 'password', 'quotetend.example', 'hello@', 'testimonial', 'trusted by'])
    assert.equal(lower.includes(phrase), false, `unsupported or private phrase: ${phrase}`);
  assert.doesNotMatch(text, /https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/, 'hardcoded local URL in a distributable asset');
  assert.doesNotMatch(text, /mailto:[^"'\s]*\.(example|test|invalid)\b/i, 'placeholder email link');
  // Required honesty statements about what QuoteTend does and does not do.
  assert.match(text, /never sends messages on its own/);
  assert.match(text, /not collected revenue/);
  assert.match(text, /Not available yet/);
  assert.match(text, /won’t describe it as available until it is/);
  assert.match(text, /fictional/i);
  const config = await read('assets/js/site-config.js');
  assert.match(config, /contactEmail: ''/, 'contact email must stay unset until a monitored inbox is confirmed');
});

test('every internal link and asset reference resolves inside the public site', async () => {
  const files = new Set(await walk());
  for (const page of ['index.html', 'demo.html']) {
    const html = await read(page);
    const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]));
    const refs = [...html.matchAll(/\s(?:href|src)="([^"]+)"/g)].map(m => m[1].replaceAll('&amp;', '&'));
    assert.ok(refs.length > 10, `${page} should have links`);
    for (const ref of refs) {
      if (/^https:\/\/fonts\.(googleapis|gstatic)\.com/.test(ref)) continue;
      assert.ok(!/^(https?:|\/\/|file:|javascript:)/i.test(ref), `${page}: unexpected absolute or unsafe link ${ref}`);
      if (ref.startsWith('#')) { if (ref.length > 1) assert.ok(ids.has(ref.slice(1)), `${page}: missing anchor ${ref}`); continue; }
      const [path, hash] = ref.split('#');
      const file = path.split('?')[0] === './' || path === '' ? 'index.html' : path.split('?')[0];
      assert.ok(files.has(file), `${page}: link to missing file ${ref}`);
      if (hash) assert.match(await read(file), new RegExp(`id="${hash}"`), `${page}: ${ref} anchor missing`);
    }
  }
  // Links created by scripts must resolve too.
  for (const js of ['assets/js/site.js', 'assets/js/demo.js', 'assets/js/tour.js']) {
    for (const [, href] of (await read(js)).matchAll(/href="((?:index|demo)\.html[^"]*)"/g)) assert.ok(files.has(href.split(/[?#]/)[0]), `${js}: ${href}`);
  }
  // Primary calls to action point at the demo and early-access sections.
  const home = await read('index.html');
  assert.match(home, /class="btn btn--primary btn--sm" href="demo\.html"/);
  assert.match(home, /class="btn btn--primary btn--lg" href="demo\.html"/);
  assert.match(home, /href="demo\.html\?tour=1"/);
  assert.match(home, /id="early-access"/);
});

function raw(port, path, method = 'GET') {
  return new Promise((done, fail) => {
    const req = request({ host: '127.0.0.1', port, path, method }, res => {
      let body = ''; res.setEncoding('utf8'); res.on('data', c => { body += c; }); res.on('end', () => done({ status: res.statusCode, type: res.headers['content-type'] || '', body }));
    });
    req.on('error', fail); req.end();
  });
}

test('preview server survives missing files and never serves outside public-site', async () => {
  const srv = await startPublicServer({ port: 0 });
  try {
    const ok = await raw(srv.port, '/');
    assert.equal(ok.status, 200); assert.match(ok.type, /text\/html/); assert.match(ok.body, /Your next job might already be in/);
    // Sprint 1 regression: the browser's automatic /favicon.ico request crashed the server (ERR_HTTP_HEADERS_SENT),
    // so the next click on the demo link failed with ERR_CONNECTION_REFUSED.
    for (const missing of ['/favicon.ico', '/missing-page', '/assets/missing.css', '/demo', '/assets']) {
      const r = await raw(srv.port, missing);
      assert.equal(r.status, 404, missing);
    }
    assert.match((await raw(srv.port, '/missing-page')).body, /This page isn’t here/);
    for (const page of ['/demo.html', '/demo.html?tour=1', '/index.html#faq', '/assets/css/site.css', '/assets/js/demo.js', '/assets/favicon.svg']) {
      const r = await raw(srv.port, page);
      assert.equal(r.status, 200, page);
    }
    assert.match((await raw(srv.port, '/assets/js/demo.js')).type, /javascript/);
    assert.match((await raw(srv.port, '/assets/css/site.css')).type, /text\/css/);
    // Traversal, absolute drive paths, dotfiles and private files are refused.
    for (const evil of ['//C:/Windows/win.ini', '/C:/Windows/win.ini', '/../package.json', '/..%2fpackage.json', '/%2e%2e/package.json', '/assets/..%5c..%5cpackage.json',
      '/serve.mjs', '/.git/config', '/../server.mjs', '/%00index.html', '/..\\package.json', '/%E0%A4%A']) {
      const r = await raw(srv.port, evil);
      assert.ok([400, 404].includes(r.status), `${evil} returned ${r.status}`);
      assert.doesNotMatch(r.body, /"name": "quotetend"|express|\[fonts\]/, evil);
    }
    assert.equal((await raw(srv.port, '/', 'POST')).status, 405);
    assert.equal((await raw(srv.port, '/demo.html')).status, 200, 'server still running after hostile requests');
  } finally { await srv.close(); }
  assert.equal(resolvePublicPath('/'), join(ROOT, 'index.html'));
  assert.equal(resolvePublicPath('/assets/'), join(ROOT, 'assets', 'index.html'));
  assert.equal(resolvePublicPath('/serve.mjs'), null);
});

test('fictional workspace is clearly fictional and well formed', () => {
  const s = W.createWorkspace(today);
  assert.equal(s.quotes.length, 22);
  assert.equal(new Set(s.quotes.map(q => q.estimate_id)).size, 22);
  for (const q of s.quotes) {
    assert.match(q.customer_email, /@([a-z-]+\.)?example\.com$/, `${q.estimate_id} email must use a reserved domain`);
    assert.match(q.customer_phone, /^555-01\d\d$/, `${q.estimate_id} phone must use the reserved 555-01xx range`);
    assert.deepEqual(D.validateEstimate({ ...q }), [], `${q.estimate_id} must satisfy the private app's validation`);
  }
  assert.equal(W.restoreWorkspace('not json'), null);
  assert.equal(W.restoreWorkspace(JSON.stringify({ version: 1, quotes: [] })), null);
  assert.deepEqual(W.restoreWorkspace(JSON.stringify(s)), s);
});

test('dashboard metrics and queues match the private domain rules', () => {
  let s = W.createWorkspace(today);
  const check = label => {
    assert.deepEqual(W.metrics(s.quotes, today), D.metrics(s.quotes, today), label);
    const q = W.queues(s.quotes, today);
    assert.deepEqual(q.due.map(x => x.estimate_id).sort(), s.quotes.filter(x => D.due(x, today, s.quotes)).map(x => x.estimate_id).sort(), label);
    const byState = W.pipelineByState(s.quotes, today);
    assert.equal(Object.values(byState).reduce((t, v) => t + v.value, 0), W.metrics(s.quotes, today).openValue, `${label}: state buckets sum to open pipeline`);
    for (const x of s.quotes.filter(x => D.eligible(x, s.quotes))) assert.equal(W.draftMessage(x, W.COMPANY.name, s.quotes), D.draftMessage(x, W.COMPANY.name, s.quotes));
  };
  check('seed');
  const seed = W.metrics(s.quotes, today);
  assert.deepEqual(seed, { openValue: 268395, openCount: 14, dueCount: 6, wonValue: 51295, wonCount: 4, unscheduled: 2 });
  s = W.recordContact(s, 'FR-2318', { date: today, nextDate: W.addDays(today, 3), channel: 'Phone', note: 'test' }, today); check('after contact');
  s = W.recordOutcome(s, 'FR-2321', 'lost', today); check('after lost');
  s = W.recordOutcome(s, 'FR-2314', 'optout', today); check('after opt-out');
  s = W.setFollowUp(s, 'FR-2312', W.addDays(today, 1), today); check('after scheduling');
  assert.equal(W.metrics(s.quotes, today).dueCount, 3, 'Dana contacted, Ruiz lost, Kevin opted out; Rachel scheduled for tomorrow');
});

test('contact validation matches the private recordContact rules', () => {
  const s = W.createWorkspace(today);
  const q = s.quotes.find(x => x.estimate_id === 'FR-2318');
  const cases = [
    { date: W.addDays(today, 1), nextDate: W.addDays(today, 3), channel: 'Phone' },
    { date: W.addDays(q.estimate_date, -1), nextDate: W.addDays(today, 3), channel: 'Phone' },
    { date: today, nextDate: today, channel: 'Phone' },
    { date: today, nextDate: W.addDays(today, 2), channel: 'Carrier pigeon' },
    { date: 'not-a-date', nextDate: W.addDays(today, 2), channel: 'Email' }
  ];
  for (const c of cases) {
    const privateError = (() => { try { D.recordContact(q, { ...c, note: '' }, today, s.quotes); return null; } catch (e) { return e.message; } })();
    assert.throws(() => W.recordContact(s, 'FR-2318', c, today), { message: privateError });
  }
  const closed = s.quotes.find(x => x.status === 'won');
  assert.throws(() => W.recordContact(s, closed.estimate_id, { date: today, nextDate: W.addDays(today, 2), channel: 'Phone' }, today), /paused/);
});

test('demo actions are immutable and drafts never record contact', () => {
  const s = W.createWorkspace(today);
  const before = JSON.stringify(s);
  const drafted = W.saveDraft(s, 'FR-2318', 'Edited fictional draft');
  assert.equal(JSON.stringify(s), before, 'saveDraft must not mutate');
  assert.equal(drafted.events.length, s.events.length, 'saving a draft adds no event');
  assert.equal(drafted.quotes.find(q => q.estimate_id === 'FR-2318').history.length, s.quotes.find(q => q.estimate_id === 'FR-2318').history.length);
  const contacted = W.recordContact(s, 'FR-2318', { date: today, nextDate: W.addDays(today, 2), channel: 'Text' }, today);
  assert.equal(JSON.stringify(s), before, 'recordContact must not mutate');
  assert.equal(contacted.events.length, s.events.length + 1);
  const won = W.recordOutcome(contacted, 'FR-2318', 'won', today);
  const q = won.quotes.find(x => x.estimate_id === 'FR-2318');
  assert.equal(q.status, 'won'); assert.equal(q.next_follow_up_date, ''); assert.equal(q.history.at(-1).text, 'Estimate marked won');
  assert.throws(() => W.recordOutcome(won, 'FR-2318', 'won', today), /already marked won/);
  assert.equal(JSON.stringify(W.createWorkspace(today)), before, 'reset recreates the identical seed');
});

test('Follow-up Results match the private results.js semantics', () => {
  let s = W.createWorkspace(today);
  const compare = label => {
    for (const days of [7, 30, 90]) {
      const r = W.resultsForRange(s, days, today);
      assert.deepEqual(r, followupResults(s, r.from, r.to, today), `${label} (${days} days)`);
    }
  };
  compare('seed');
  const r30 = W.resultsForRange(s, 30, today);
  assert.deepEqual(r30.counts, { contacts: 18, followed: 12, won: 2, lost: 2, open: 8, unknown: 0 });
  assert.deepEqual(r30.values, { followed: 229065, won: 29755, overdue: 95140 });
  s = W.recordContact(s, 'FR-2318', { date: today, nextDate: W.addDays(today, 3), channel: 'Phone' }, today); compare('after contact');
  s = W.recordOutcome(s, 'FR-2318', 'won', today); compare('after won');
  s = W.recordOutcome(s, 'FR-2302', 'lost', today); compare('won-without-contact reclassified');
  s = W.recordOutcome(s, 'FR-2325', 'optout', today); compare('after opt-out');
  const after = W.resultsForRange(s, 30, today);
  assert.equal(after.counts.contacts, 19);
  assert.equal(after.counts.won, 3);
  assert.equal(after.values.won, 29755 + 21480);
});

test('sample CSV import preview matches the private import mapping', () => {
  const s = W.createWorkspace(today);
  const csv = W.sampleImportCSV(today);
  const demo = W.previewImport(csv, s.quotes);
  const sheet = inspectSpreadsheet(csv);
  const real = previewSpreadsheet(sheet, sheet.mapping, { dateFormat: 'mdy', statusMap: { Sent: 'sent' }, optOutReviewed: true }, s.quotes);
  assert.deepEqual(demo.rows.map(r => r.outcome), real.map(r => r.outcome));
  assert.deepEqual(demo.rows.map(r => r.outcome), ['ready', 'ready', 'ready', 'conflict', 'invalid']);
  assert.deepEqual(Object.fromEntries(Object.entries(demo.mapping).map(([k, v]) => [k, v < 0 ? '' : String(v)])), sheet.mapping);
  for (const [i, r] of demo.rows.entries()) if (r.outcome === 'ready') {
    for (const k of ['estimate_id', 'customer_name', 'job_description', 'amount_usd', 'estimate_date', 'status', 'next_follow_up_date']) assert.equal(r.quote[k], real[i].quote[k], `${r.quote.estimate_id} ${k}`);
  }
  const { state, imported } = W.importReady(s, demo, today);
  assert.equal(imported, 3);
  assert.equal(state.quotes.length, 25);
  assert.deepEqual(state.quotes.find(q => q.estimate_id === 'FR-2318'), s.quotes.find(q => q.estimate_id === 'FR-2318'), 'existing estimate untouched');
  assert.equal(W.resultsForRange(state, 30, today).incomplete, 3, 'imported records are flagged as having incomplete history');
  assert.equal(W.importReady(state, demo, today).imported, 0, 'importing twice adds nothing');
});
