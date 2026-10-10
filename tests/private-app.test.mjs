// Sprint 2: optional estimate details, schema 3 migration, ledger activity entries, contact results,
// queue/dashboard rules, date handling, reporting consistency and the private app's static routes.
// All data is fictional; every database is a disposable temporary file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readdirSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import * as D from '../domain.js';
import { inspectSpreadsheet, previewSpreadsheet } from '../import-mapping.js';
import { openAccounts, SCHEMA_VERSION } from '../account-store.mjs';
import { startServer } from '../server.mjs';

const today = D.todayISO();
const base = { ...D.demoData(today)[0], estimate_id: 'F-1', estimate_date: D.addDays(today, -20), history: [], saved_draft: '' };
// node:test runs t.after hooks in registration order, so a directory removed by one hook is removed while any
// handle registered later is still open. On Windows an open SQLite file cannot be deleted (EPERM). Each test
// therefore has ONE hook: it awaits every registered closer, newest first, and only then removes the directory.
const closers = new WeakMap();
const closeBeforeRemoval = (t, close) => { closers.get(t).push(close); };
const temp = t => {
  const dir = mkdtempSync(join(tmpdir(), 'quotetend-private-app-test-'));
  const pending = []; closers.set(t, pending);
  t.after(async () => {
    const failures = [];
    for (const close of pending.reverse()) { try { await close(); } catch (error) { failures.push(error); } }
    // A removal failure must not hide a closer failure (the usual cause of a Windows EPERM), so both are reported.
    if (dirname(dir) === tmpdir() && basename(dir).startsWith('quotetend-private-app-test-')) { try { rmSync(dir, { recursive: true, force: true }); } catch (error) { failures.push(error); } }
    if (failures.length) throw new AggregateError(failures, 'test resources failed to close');
  });
  return dir;
};
// Open a store whose handle is released before the directory is removed, even if an assertion throws first.
const openStore = (t, path) => { const store = openAccounts(path); closeBeforeRemoval(t, () => { if (store.db.isOpen) store.close(); }); return store; };
// Read-only inspection of a database file; the handle is always closed so the file can be removed on Windows.
const inspect = (path, sql) => { const db = new DatabaseSync(path, { readOnly: true }); try { return db.prepare(sql).get(); } finally { db.close(); } };
const legacyShape = q => { const copy = { ...q }; for (const k of D.OPTIONAL_FIELDS) delete copy[k]; return copy; };
const csvCell = v => `"${String(v).replaceAll('"', '""')}"`;

test('optional phone, address and trade validate strictly but stay optional for older records', () => {
  assert.deepEqual(D.validateEstimate(base), []);
  assert.deepEqual(D.validateEstimate(legacyShape(base)), [], 'records saved before schema 3 remain valid');
  for (const phone of ['555-0142', '(312) 555-0100', '+44 20 7946 0958', '312.555.0100 x12', '555 0100 ext. 7', '312/555-0100'])
    assert.deepEqual(D.validateEstimate({ ...base, customer_phone: phone }), [], phone);
  for (const phone of ['call me', '12', '555-0100; DROP TABLE', '<script>alert(1)</script>', '5'.repeat(41)])
    assert.ok(D.validateEstimate({ ...base, customer_phone: phone }).some(e => /Phone/.test(e)), phone);
  assert.match(D.validateEstimate({ ...base, address: 'a'.repeat(301) }).join(), /Project address must be at most 300/);
  assert.match(D.validateEstimate({ ...base, trade: 't'.repeat(81) }).join(), /Trade or service must be at most 80/);
  assert.match(D.validateEstimate({ ...base, trade: 7 }).join(), /Trade or service must be text/);
  assert.match(D.validateEstimate({ ...base, address: null }).join(), /Project address must be text/);
  // Normalization fills blanks; it never invents values.
  const normalized = D.normalize(legacyShape(base));
  assert.deepEqual(D.OPTIONAL_FIELDS.map(k => normalized[k]), ['', '', '']);
});

test('older exports and backups import unchanged; new fields round-trip through CSV', () => {
  const legacy = legacyShape(base);
  const legacyCSV = [D.LEGACY_COLUMNS.join(','), D.LEGACY_COLUMNS.map(k => csvCell(legacy[k])).join(',')].join('\r\n');
  const [row] = D.previewImport(legacyCSV);
  assert.deepEqual(row.errors, []);
  assert.deepEqual([row.quote.customer_phone, row.quote.address, row.quote.trade], ['', '', '']);
  const restored = D.parseBackup(JSON.stringify({ version: 1, quotes: [legacy] }));
  assert.deepEqual(D.OPTIONAL_FIELDS.map(k => restored[0][k]), ['', '', '']);
  // An older record (no optional keys) and the same estimate re-exported with blank fields are an exact duplicate, not a conflict.
  assert.equal(D.previewImport(D.exportCSV([D.normalize(legacy)]), [legacy])[0].outcome, 'existing');
  const detailed = { ...base, customer_phone: '(555) 010-0142', address: '12 Linden Ave, Unit "B"', trade: 'Windows & doors' };
  const [round] = D.previewImport(D.exportCSV([detailed]));
  assert.deepEqual([round.quote.customer_phone, round.quote.address, round.quote.trade], [detailed.customer_phone, detailed.address, detailed.trade]);
  assert.equal(D.previewImport(D.exportCSV([detailed]), [detailed])[0].outcome, 'existing');
  assert.equal(D.previewImport(D.exportCSV([{ ...detailed, trade: 'Roofing' }]), [detailed])[0].outcome, 'conflict', 'a changed detail never overwrites the saved record');
});

test('spreadsheet mapping recognizes phone, address and trade headings and validates them', () => {
  const csv = ['Customer,Mobile,Property Address,Service Type,Job,Amount,Quote Date,Quote #', 'Ann Example,555-0101,1 Elm St,Gutters,Gutter guards,"$1,200.00",2026-01-05,A-1', 'Bo Example,not a phone,,Roofing,Repair,300,2026-01-06,A-2'].join('\n');
  const sheet = inspectSpreadsheet(csv);
  assert.deepEqual([sheet.mapping.customer_phone, sheet.mapping.address, sheet.mapping.trade], ['1', '2', '3']);
  const rows = previewSpreadsheet(sheet, sheet.mapping, { optOutReviewed: true, defaultStatus: 'sent' }, []);
  assert.deepEqual(rows[0].errors, []);
  assert.deepEqual([rows[0].quote.customer_phone, rows[0].quote.address, rows[0].quote.trade, rows[0].quote.amount_usd], ['555-0101', '1 Elm St', 'Gutters', 1200]);
  assert.equal(rows[1].outcome, 'invalid'); assert.match(rows[1].errors.join(), /Phone/);
});

test('follow-up state uses calendar dates only, identically in every server time zone', () => {
  const t = '2026-03-08'; // US daylight-saving change
  const q = (next, extra = {}) => ({ ...base, status: 'sent', estimate_date: '2026-03-01', next_follow_up_date: next, do_not_contact: false, ...extra });
  assert.equal(D.followupState(q('2026-03-07'), t), 'overdue');
  assert.equal(D.followupState(q('2026-03-08'), t), 'today');
  assert.equal(D.followupState(q('2026-03-09'), t), 'upcoming');
  assert.equal(D.followupState(q(''), t), 'unscheduled');
  assert.equal(D.followupState(q('2026-03-01', { status: 'won' }), t), 'closed');
  assert.equal(D.followupState(q('', { status: 'draft' }), t), 'draft');
  assert.equal(D.followupState(q('2026-03-07', { do_not_contact: true }), t), 'paused');
  const shared = q('2026-03-07', { estimate_id: 'OTHER', do_not_contact: true });
  assert.equal(D.followupState(q('2026-03-07'), t, [q('2026-03-07'), shared]), 'paused', 'shared-email opt-out pauses');
  assert.deepEqual([D.addDays('2026-03-07', 1), D.addDays('2026-11-01', -1), D.addDays('2026-12-31', 1), D.daysBetween('2026-03-07', '2026-03-09')], ['2026-03-08', '2026-10-31', '2027-01-01', 2]);
  const script = `import * as D from ${JSON.stringify(new URL('../domain.js', import.meta.url).href)};
    const q = n => ({ status: 'sent', estimate_id: 'x', do_not_contact: false, customer_email: '', next_follow_up_date: n });
    console.log(JSON.stringify([D.followupState(q('2026-03-07'), '2026-03-08'), D.followupState(q('2026-03-08'), '2026-03-08'), D.addDays('2026-03-08', 1), D.daysBetween('2026-10-31', '2026-11-02')]));`;
  const outputs = ['UTC', 'Pacific/Honolulu', 'America/Chicago', 'Asia/Tokyo'].map(TZ => execFileSync(process.execPath, ['--input-type=module', '-e', script], { env: { ...process.env, TZ } }).toString().trim());
  assert.equal(new Set(outputs).size, 1, 'no time-zone shift');
  assert.deepEqual(JSON.parse(outputs[0]), ['overdue', 'today', '2026-03-09', 2]);
});

test('queues, pipeline buckets, age chart, status totals and list filters agree with each other', () => {
  const mk = (id, status, amount, next, extra = {}) => ({ ...base, estimate_id: id, customer_name: 'Fictional ' + id, customer_email: id.toLowerCase() + '@example.com', status, amount_usd: amount, next_follow_up_date: next, estimate_date: D.addDays(today, -10), trade: '', ...extra });
  const quotes = D.normalizeWorkspace([
    mk('A', 'sent', 1000, D.addDays(today, -2), { trade: 'Roofing', customer_phone: '(555) 010-0142', address: '12 Linden Ave', estimate_date: D.addDays(today, -40) }),
    mk('B', 'sent', 2000, today, { trade: 'Siding', notes: 'HOA approval pending' }),
    mk('C', 'sent', 3000, D.addDays(today, 4), { trade: 'Roofing', last_contact_date: D.addDays(today, -1), estimate_date: D.addDays(today, -3) }),
    mk('D', 'sent', 4000, ''),
    mk('E', 'won', 5000, '', { trade: 'Roofing', last_contact_date: D.addDays(today, -20) }),
    mk('F', 'lost', 6000, ''),
    mk('G', 'draft', 7000, ''),
    mk('H', 'sent', 8000, '', { do_not_contact: true, customer_email: 'shared@example.com' }),
    mk('I', 'sent', 900, today, { customer_email: 'SHARED@example.com ' })
  ]);
  const ids = list => list.map(q => q.estimate_id);
  const q = D.queues(quotes, today), m = D.metrics(quotes, today), bs = D.pipelineByState(quotes, today);
  assert.deepEqual([ids(q.due), ids(q.upcoming), ids(q.unscheduled), ids(q.contacted)], [['A', 'B'], ['C'], ['D'], ['C']]);
  assert.equal(Object.values(bs).reduce((s, b) => s + b.value, 0), m.openValue);
  assert.deepEqual([bs.overdue.value, bs.today.value, bs.paused.count, bs.paused.value], [1000, 2000, 2, 8900]);
  assert.equal(m.dueCount, q.due.length); assert.equal(m.unscheduled, q.unscheduled.length);
  assert.equal(D.ageBuckets(quotes, today).reduce((s, b) => s + b.value, 0), m.openValue);
  assert.deepEqual(D.ageBuckets(quotes, today).map(b => b.count), [1, 4, 0, 1]);
  const totals = D.statusTotals(quotes);
  assert.deepEqual([totals.won.value, totals.lost.value, totals.draft.count, totals.sent.count], [5000, 6000, 1, 6]);
  const f = opts => ids(D.filterEstimates(quotes, opts, today));
  assert.deepEqual(f({ query: '5550100142' }), ['A'], 'digits match regardless of phone punctuation');
  assert.deepEqual(f({ query: '5550142' }), [], 'digits must match a contiguous run of the stored phone');
  assert.deepEqual(f({ query: '0100142' }), ['A']);
  assert.deepEqual(f({ query: '010-0142' }), ['A']);
  assert.deepEqual(f({ query: 'linden ave' }), ['A']);
  assert.deepEqual(f({ query: 'hoa' }), ['B'], 'notes are searchable');
  assert.deepEqual(f({ status: 'optout' }).sort(), ['H', 'I']);
  assert.deepEqual(f({ trade: 'roofing' }).sort(), ['A', 'C', 'E']);
  assert.deepEqual(f({ trade: '__none' }).sort(), ['D', 'F', 'G', 'H', 'I']);
  assert.deepEqual(f({ followup: 'due' }), ['A', 'B']);
  assert.deepEqual(f({ status: 'sent', trade: 'Roofing', followup: 'upcoming' }), ['C']);
  assert.deepEqual(f({ sort: 'value' }).slice(0, 3), ['H', 'G', 'F']);
  assert.deepEqual(f({ sort: 'followup' }).slice(0, 4), ['A', 'B', 'C', 'D']);
  assert.deepEqual(D.tradeOptions(quotes).used, ['Roofing', 'Siding']);
});

test('contact results are optional, validated and kept in the activity text', () => {
  const q = { ...base, status: 'sent', next_follow_up_date: today };
  const changed = D.recordContact(q, { date: today, nextDate: D.addDays(today, 2), channel: 'Phone', note: 'fictional', result: 'left_message' }, today);
  assert.equal(changed.history.at(-1).text, 'Phone contact recorded · Left a message — fictional');
  assert.equal(D.recordContact(q, { date: today, nextDate: D.addDays(today, 2), channel: 'Email', note: '' }, today).history.at(-1).text, 'Email contact recorded');
  for (const result of ['bogus', '__proto__', 7, {}]) assert.throws(() => D.recordContact(q, { date: today, nextDate: D.addDays(today, 2), channel: 'Phone', note: '', result }, today), /contact result/);
});

test('schema 3 migration keeps stored estimates byte-for-byte, snapshots first and refuses newer databases', t => {
  const dir = temp(t), path = join(dir, 'v2.sqlite');
  let store = openStore(t, path);
  const owner = store.createOwner('legacy@example.com', 'fictional-hash', 'Legacy Fictional Roofing');
  const legacyQuotes = [legacyShape({ ...base, estimate_id: 'OLD-1', status: 'sent', next_follow_up_date: today })];
  store.save(owner.business_id, 0, legacyQuotes);
  store.db.exec('PRAGMA user_version=2'); store.close();
  const bytes = inspect(path, 'SELECT quotes FROM businesses').quotes;
  assert.doesNotMatch(bytes, /customer_phone/);
  const copy = join(dir, 'copy.sqlite'); copyFileSync(path, copy);
  store = openStore(t, copy);
  assert.equal(SCHEMA_VERSION, 3);
  assert.equal(store.db.prepare('PRAGMA user_version').get().user_version, 3);
  assert.equal(readdirSync(dir).filter(n => n.startsWith('copy.sqlite.pre-fields-')).length, 1);
  assert.equal(store.db.prepare('SELECT quotes FROM businesses').get().quotes, bytes, 'opening never rewrites estimate JSON');
  const w = store.workspace(owner.business_id);
  assert.deepEqual(D.OPTIONAL_FIELDS.map(k => w.quotes[0][k]), ['', '', '']);
  const saved = store.command(owner, { kind: 'edit', requestId: crypto.randomUUID(), revision: w.revision, estimateId: 'OLD-1', fields: { customer_phone: '555-0100', trade: 'Roofing' } });
  assert.deepEqual([saved.quotes[0].customer_phone, saved.quotes[0].trade, saved.quotes[0].address], ['555-0100', 'Roofing', '']);
  store.close();
  store = openStore(t, copy);
  assert.equal(store.workspace(owner.business_id).quotes[0].customer_phone, '555-0100', 'persists across reopen');
  assert.equal(readdirSync(dir).filter(n => n.startsWith('copy.sqlite.pre-fields-')).length, 1, 'migration runs once');
  store.close();
  assert.equal(inspect(path, 'PRAGMA user_version').user_version, 2, 'the original file is untouched');
  const newer = join(dir, 'newer.sqlite'); copyFileSync(copy, newer);
  const raw = new DatabaseSync(newer); raw.exec('PRAGMA user_version=4'); raw.close();
  assert.throws(() => openAccounts(newer), /newer QuoteTend version/);
});

test('ledger commands write typed, plain-language activity and reject stale or invalid input', t => {
  const store = openStore(t, join(temp(t), 'ledger.sqlite'));
  const owner = store.createOwner('ledger@example.com', 'fictional-hash', 'Ledger Fictional');
  let w = store.workspace(owner.business_id);
  const cmd = c => { w = store.command(owner, { requestId: crypto.randomUUID(), revision: w.revision, ...c }); return w; };
  const last = () => w.quotes[0].history.at(-1);
  cmd({ kind: 'create', fields: { ...base, estimate_id: 'L-1', status: 'sent', next_follow_up_date: D.addDays(today, 2), customer_phone: '555-0199', address: '9 Oak St', trade: 'Gutters' } });
  assert.deepEqual([last().type, last().text, w.quotes[0].customer_phone, w.quotes[0].trade], ['created', 'Estimate added', '555-0199', 'Gutters']);
  cmd({ kind: 'edit', estimateId: 'L-1', fields: { customer_phone: '555-0100', address: '10 Oak St' } });
  assert.deepEqual([last().type, last().text], ['update', 'Updated phone, project address']);
  assert.deepEqual(store.events(owner.business_id).filter(e => e.type === 'estimate_edited').at(-1).data.changedFields, ['customer_phone', 'address']);
  cmd({ kind: 'edit', estimateId: 'L-1', fields: { next_follow_up_date: D.addDays(today, 5) } });
  assert.equal(last().type, 'schedule'); assert.match(last().text, /^Next follow-up set for [A-Z][a-z]{2} \d{1,2}, \d{4}$/);
  cmd({ kind: 'edit', estimateId: 'L-1', fields: { amount_usd: 1250.5 } });
  assert.match(last().text, /^Amount changed from \$\d[\d,]*\.\d\d to \$1,250\.50$/);
  cmd({ kind: 'contact', estimateId: 'L-1', contact: { date: today, nextDate: D.addDays(today, 3), channel: 'Text', note: 'fictional', result: 'messaged' } });
  const contact = store.events(owner.business_id).filter(e => e.type === 'contact_logged').at(-1);
  assert.deepEqual([contact.data.result, contact.data.channel, last().text], ['messaged', 'Text', 'Text contact recorded · Sent a message — fictional']);
  assert.throws(() => cmd({ kind: 'contact', estimateId: 'L-1', contact: { date: today, nextDate: D.addDays(today, 3), channel: 'Text', note: '', result: 'bogus' } }), e => e.status === 400);
  cmd({ kind: 'outcome', estimateId: 'L-1', status: 'won' });
  assert.deepEqual([last().type, last().text, w.quotes[0].next_follow_up_date], ['outcome', 'Estimate marked won', '']);
  cmd({ kind: 'outcome', estimateId: 'L-1', status: 'won', effectiveDate: D.addDays(today, -1) });
  assert.match(last().text, /^Outcome confirmed: won \(reported /);
  assert.equal(store.events(owner.business_id).at(-2).type, 'outcome_corrected');
  cmd({ kind: 'edit', estimateId: 'L-1', fields: { status: 'sent' } });
  assert.equal(last().text, 'Estimate reopened as sent');
  cmd({ kind: 'edit', estimateId: 'L-1', fields: { do_not_contact: true } });
  assert.deepEqual([last().type, last().text], ['optout', 'Customer opted out; follow-ups stopped']);
  // Stale revision carries a machine-readable code; a replayed request is applied once.
  assert.throws(() => store.command(owner, { requestId: crypto.randomUUID(), revision: w.revision - 1, kind: 'edit', estimateId: 'L-1', fields: { notes: 'x' } }), e => e.status === 409 && e.code === 'stale_revision');
  const replay = { requestId: crypto.randomUUID(), revision: w.revision, kind: 'edit', estimateId: 'L-1', fields: { notes: 'once' } };
  const count = store.events(owner.business_id).length;
  store.command(owner, replay);
  assert.equal(store.command(owner, replay).replayed, true);
  assert.equal(store.events(owner.business_id).length, count + 1);
  assert.throws(() => store.command(owner, { ...replay, fields: { notes: 'different' } }), e => e.status === 409 && !e.code);
});

test('reporting stays consistent after create, contact, amount edits, outcomes, reopen and import', t => {
  const store = openStore(t, join(temp(t), 'report.sqlite'));
  const owner = store.createOwner('report@example.com', 'fictional-hash', 'Report Fictional');
  let w = store.workspace(owner.business_id);
  const cmd = c => { w = store.command(owner, { requestId: crypto.randomUUID(), revision: w.revision, ...c }); return w; };
  const r = () => store.results(owner.business_id, D.addDays(today, -29), today);
  const mk = (id, amount, extra = {}) => ({ ...base, estimate_id: id, customer_email: id.toLowerCase() + '@example.com', amount_usd: amount, status: 'sent', next_follow_up_date: D.addDays(today, -1), ...extra });
  cmd({ kind: 'create', fields: mk('P-1', 1000) }); cmd({ kind: 'create', fields: mk('P-2', 2000) }); cmd({ kind: 'create', fields: mk('P-3', 4000, { next_follow_up_date: '' }) });
  assert.deepEqual(r().counts, { contacts: 0, followed: 0, won: 0, lost: 0, open: 0, unknown: 0 });
  assert.equal(r().values.overdue, 3000);
  assert.equal(D.metrics(w.quotes, today).openValue, 7000);
  cmd({ kind: 'contact', estimateId: 'P-1', contact: { date: today, nextDate: D.addDays(today, 3), channel: 'Phone', note: '' } });
  cmd({ kind: 'contact', estimateId: 'P-2', contact: { date: D.addDays(today, -1), nextDate: D.addDays(today, 3), channel: 'Email', note: '' } });
  assert.deepEqual([r().counts.contacts, r().counts.followed, r().counts.open, r().values.followed, r().values.overdue], [2, 2, 2, 3000, 0]);
  cmd({ kind: 'edit', estimateId: 'P-1', fields: { amount_usd: 1500 } });
  assert.equal(r().values.followed, 3000, 'followed value keeps the amount stored at first contact');
  cmd({ kind: 'outcome', estimateId: 'P-1', status: 'won' });
  assert.deepEqual([r().counts.won, r().values.won], [1, 1500]);
  cmd({ kind: 'edit', estimateId: 'P-1', fields: { amount_usd: 1800 } });
  assert.deepEqual([r().counts.won, r().values.won], [1, 1800], 'a corrected won amount updates won value without moving the outcome');
  cmd({ kind: 'outcome', estimateId: 'P-2', status: 'lost' });
  assert.deepEqual([r().counts.won, r().counts.lost, r().counts.open], [1, 1, 0]);
  cmd({ kind: 'outcome', estimateId: 'P-3', status: 'won' });
  assert.equal(r().counts.won, 1, 'a win without a logged contact is not counted as won after follow-up');
  assert.equal(D.statusTotals(w.quotes).won.value, 5800, 'but it is still a recorded win');
  cmd({ kind: 'edit', estimateId: 'P-1', fields: { status: 'sent' } });
  assert.deepEqual([r().counts.won, r().counts.open], [0, 1], 'reopened estimates return to open');
  cmd({ kind: 'import', quotes: [D.normalize(mk('IMP-1', 500, { next_follow_up_date: D.addDays(today, -3) }))] });
  assert.equal(r().incomplete, 1);
  assert.equal(r().values.overdue, 500);
  assert.equal(D.metrics(w.quotes, today).openValue, 1800 + 500);
});

test('private app routes: redirect, strict CSP, shared design system, fonts and nothing else', async t => {
  const dir = temp(t);
  const running = await startServer({ port: 0, dbPath: join(dir, 'routes.sqlite'), logger: () => {} });
  closeBeforeRemoval(t, () => running.close());
  const origin = `http://127.0.0.1:${running.port}`;
  const get = (path, init = {}) => fetch(origin + path, { redirect: 'manual', ...init });
  const root = await get('/');
  assert.equal(root.status, 302); assert.equal(root.headers.get('location'), '/account');
  for (const path of ['/account', '/signin', '/security']) {
    const res = await get(path);
    assert.equal(res.status, 200, path); assert.match(res.headers.get('content-type'), /text\/html/);
    const csp = res.headers.get('content-security-policy');
    assert.match(csp, /default-src 'self'/); assert.match(csp, /style-src 'self';/); assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval|googleapis/);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    const html = await res.text();
    assert.doesNotMatch(html, / style="|<script>|onclick=/i, `${path} has no inline style or script`);
    assert.match(html, /\/shared\/tokens\.css/);
  }
  const tokens = await get('/shared/tokens.css');
  assert.equal(tokens.status, 200); assert.match(tokens.headers.get('content-type'), /text\/css/); assert.match(await tokens.text(), /--evergreen-900/);
  assert.match(await (await get('/shared/app.css')).text(), /\.qt-kpi/);
  const font = await get('/app/fonts/inter-latin-wght-normal.woff2');
  assert.equal(font.status, 200); assert.equal(font.headers.get('content-type'), 'font/woff2'); assert.match(font.headers.get('cache-control'), /public/);
  for (const path of ['/app/main.js', '/app/ui.js', '/app/views.js', '/app/api.js', '/domain.js', '/import-mapping.js', '/results.js', '/favicon.svg'])
    assert.equal((await get(path)).status, 200, path);
  for (const path of ['/app.js', '/styles.css', '/index.html', '/public-site/index.html', '/public-site/demo.html', '/app/fonts/LICENSE-Inter.txt', '/server.mjs', '/ledger.mjs',
    '/app/%2e%2e/server.mjs', '/app/..%2fserver.mjs', '/shared/demo.css', '/account/', '/.env', '/package.json'])
    assert.equal((await get(path)).status, 404, path);
  assert.equal((await get('/account', { method: 'POST' })).status, 405);
  // /me reports the business name and recovery-code status; stale writes carry a machine-readable code.
  let cookie = '';
  const api = async (path, method = 'GET', body) => {
    const res = await fetch(origin + '/api' + path, { method, headers: { Origin: origin, 'Content-Type': 'application/json', 'X-QuoteTend-Request': '1', Cookie: cookie }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const set = res.headers.get('set-cookie'); if (set) cookie = set.split(';')[0];
    return { status: res.status, data: await res.json() };
  };
  assert.equal((await api('/me')).status, 401);
  const password = 'Fictional-routes-password-551!';
  assert.equal((await api('/register', 'POST', { email: 'routes@example.com', businessName: 'Routes Fictional', password })).status, 201);
  let me = (await api('/me')).data;
  assert.deepEqual([me.businessName, me.recoveryCodeSaved], ['Routes Fictional', false]);
  assert.equal((await api('/recovery-code', 'POST', { currentPassword: password })).status, 200);
  me = (await api('/me')).data; assert.equal(me.recoveryCodeSaved, true);
  const stale = await api(`/workspaces/${me.businessId}/commands`, 'POST', { requestId: crypto.randomUUID(), revision: 5, kind: 'create', fields: base });
  assert.deepEqual([stale.status, stale.data.code], [409, 'stale_revision']);
  const duplicate = await api(`/workspaces/${me.businessId}/commands`, 'POST', { requestId: crypto.randomUUID(), revision: 0, kind: 'create', fields: { ...base, customer_phone: 'not a phone' } });
  assert.equal(duplicate.status, 400); assert.match(duplicate.data.error, /Phone/); assert.equal(duplicate.data.code, undefined);
});
