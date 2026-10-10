// End-to-end rehearsal of the private application in a disposable headless browser and database.
// It drives the real UI, checks every important result against the authenticated API (and therefore
// the SQLite database), restarts the server, and verifies cross-business isolation. All data is
// fictional. Screenshots are written to test-results/private-app/.
// Run: node tests/browser-rehearsal.mjs   (set QUOTETEND_BROWSER_PATH to use a specific Chromium build)
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { startServer } from '../server.mjs';
import { todayISO, addDays, metrics, exportCSV, statusTotals, pipelineByState } from '../domain.js';

const dir = await mkdtemp(join(tmpdir(), 'quotetend-browser-test-'));
const dbPath = join(dir, 'accounts.sqlite');
const shots = 'test-results/private-app';
await mkdir(shots, { recursive: true });
let running = await startServer({ port: 0, dbPath, logger: () => {} });
const browser = await chromium.launch({ ...(process.env.QUOTETEND_BROWSER_PATH ? { executablePath: process.env.QUOTETEND_BROWSER_PATH } : { channel: process.env.QUOTETEND_BROWSER || 'msedge' }), headless: true });
let base = `http://127.0.0.1:${running.port}`;
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const cspViolations = [];
page.on('console', m => { if (/Content Security Policy|Refused to (apply|load|execute|connect)/i.test(m.text())) cspViolations.push(m.text()); });
page.setDefaultTimeout(10000);
const today = todayISO(), mdy = iso => { const [y, m, d] = iso.split('-'); return `${Number(m)}/${Number(d)}/${y}`; };
const password = 'Fictional-ui-password-982!';
const passed = [];
const pass = label => { passed.push(label); console.log('PASS ' + label); };

const api = (path, method = 'GET', body) => page.evaluate(async ({ path, method, body }) => {
  const r = await fetch('/api' + path, { method, headers: { 'Content-Type': 'application/json', 'X-QuoteTend-Request': '1' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: r.status, data: await r.json().catch(() => null) };
}, { path, method, body });
const state = async () => { const me = await api('/me'); return (await api('/workspaces/' + me.data.businessId)).data; };
const events = async () => { const me = await api('/me'); return (await api('/workspaces/' + me.data.businessId + '/events')).data; };
const toast = re => page.waitForFunction(source => new RegExp(source).test(document.querySelector('[data-toast]')?.textContent || ''), re.source);
const noHorizontalScroll = async label => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `${label}: no horizontal page scroll`);
// Let slide-in/fade animations settle; hide leftover toasts unless the screenshot is about one.
const shot = async (name, { keepToast = false, ...opts } = {}) => {
  if (!keepToast) await page.evaluate(() => document.querySelector('[data-toast]')?.classList.remove('is-on'));
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${shots}/${name}.png`, ...opts });
};
// Uses the sidebar like a person would: on tablets and phones it opens the off-canvas menu first.
const nav = async view => {
  if (await page.locator('[data-nav-toggle]').isVisible()) { await page.locator('[data-nav-toggle]').click(); await page.locator('.app-side').waitFor({ state: 'visible' }); }
  await page.locator(`.app-nav [data-nav="${view}"], .app-side__foot [data-nav="${view}"]`).first().click(); await page.locator('h1').first().waitFor();
};
const openEstimate = async id => { await page.locator(`[data-open="${id}"]`).first().click(); await page.locator('#drawer-title').waitFor(); };
const closeDrawer = async () => { await page.locator('[data-action="close-drawer"]').click(); await page.locator('[data-drawer]').waitFor({ state: 'hidden' }); };
const kpiText = id => page.locator(`[data-kpi="${id}"] .qt-kpi__value`).innerText();
const usd = n => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: Number.isInteger(n) ? 0 : 2, minimumFractionDigits: Number.isInteger(n) ? 0 : 2 }).format(n);
async function register(email, name) {
  await page.goto(base + '/signin');
  await page.locator('#auth-toggle').click();
  await page.locator('[name=businessName]').fill(name);
  await page.locator('#auth-form [name=email]').fill(email);
  await page.locator('#auth-form [name=password]').fill(password);
  await page.locator('#auth-submit').click();
  await page.waitForURL('**/account#overview');
  await page.locator('h1').waitFor();
}
async function signIn(email, pw = password) {
  await page.goto(base + '/signin');
  await page.locator('#auth-form [name=email]').fill(email);
  await page.locator('#auth-form [name=password]').fill(pw);
  await page.locator('#auth-submit').click();
  await page.waitForURL('**/account#overview');
  await page.locator('h1').waitFor();
}
async function pasteImport(csv) {
  await nav('import');
  await page.getByText('Or paste CSV text', { exact: true }).click();
  await page.locator('#paste-csv').fill(csv);
  await page.locator('[data-action="inspect-paste"]').click();
  await page.locator('[data-action="import-preview"]').waitFor();
}

// Fictional contractor export with spreadsheet-style headings, US dates and $ amounts.
const row = (id, name, email, phone, site, trade, job, total, age, status, next, notes = '') => [id, name, email, phone, site, trade, job, total, mdy(addDays(today, -age)), status, next === null ? '' : mdy(addDays(today, next)), notes];
const cell = v => /[",\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v;
const sourceRows = [
  row('R-1001', 'Dana Whitfield', 'dana.whitfield@example.com', '555-0142', '12 Linden Ave', 'Roofing', 'Roof replacement · 32 sq architectural shingles', '$21,480.00', 16, 'Sent', -6, 'Wants ice & water shield on all eaves.'),
  row('R-1002', 'Marcus Ruiz', 'ruiz.household@example.com', '555-0117', '8 Chestnut Ridge Rd', 'Siding', 'Fiber-cement siding · full wrap', '$38,750.00', 12, 'Sent', 0),
  row('R-1002', 'Marcus Ruiz', 'ruiz.household@example.com', '555-0117', '8 Chestnut Ridge Rd', 'Siding', 'Fiber-cement siding · full wrap', '$38,750.00', 12, 'Sent', 0),
  row('R-1003', 'Priya Nandakumar', 'priya.n@example.com', '555-0133', '41 Briarwood Ln', 'Windows & doors', 'Window replacement · 14 double-hung', '$17,960.00', 9, 'Sent', 3),
  row('R-1004', 'Tom Becker', '', '555-0151', '', 'Gutters', 'Seamless gutters + guards · 180 lf', '$4,380.00', 6, 'Sent', null),
  row('R-1005', 'Grace Okafor', 'grace.okafor@example.com', '555-0186', '3 Meadowlark St', 'Roofing', 'Storm-damage roof repair', '$9,800.00', 30, 'Won', null),
  row('R-1006', 'Kevin O’Neill', 'kevin.oneill@example.com', '555-0168', '77 Sycamore Ct', 'Roofing', 'Ridge vent upgrade', '$5,200.00', 20, 'Lost', null),
  row('R-1007', 'Iris Lane', 'iris.lane@example.com', '', '', 'Exterior remodel', 'Front entry & porch remodel', '$12,400.00', 2, 'Draft', null),
  row('R-1008', 'Broken Amount', 'broken@example.com', '', '', '', 'Invalid amount row', 'twelve', 2, 'Sent', 1),
  row('R-1009', 'Held Version A', 'held@example.com', '', '', '', 'Conflicting row', '$1,000.00', 4, 'Sent', 1),
  row('R-1009', 'Held Version B', 'held@example.com', '', '', '', 'Conflicting row', '$1,100.00', 4, 'Sent', 1)
];
const contractorCSV = ['Quote #,Client,Email,Phone,Job Site,Trade,Project,Total,Date Issued,Quote Status,Follow Up,Notes', ...sourceRows.map(r => r.map(cell).join(','))].join('\r\n');

try {
  // 1–3. Start the real application, provision a business through the supported sign-up flow, sign in.
  await page.goto(base + '/');
  await page.waitForURL('**/signin');
  await page.locator('#auth-submit').waitFor();
  await shot('login-1440');
  await register('owner-a@example.com', 'Fictional Fernbrook Roofing');
  pass('server redirects to sign-in; supported registration provisions and signs in a new business');

  // 4. Empty overview.
  assert.match(await page.locator('h1').innerText(), /Welcome to QuoteTend/);
  assert.equal(await kpiText('open'), '$0');
  assert.equal(await page.locator('[data-guide]').count(), 1);
  assert.match(await page.locator('[data-guide]').innerText(), /0 of 6 done/);
  assert.equal((await state()).quotes.length, 0);
  await shot('dashboard-empty-1440', { fullPage: false });
  pass('empty overview shows real zeros, a getting-started guide and no fictional records');

  // 5–7. Import a contractor CSV: column matching, validation, conflicts, confirmation.
  await nav('import');
  await page.locator('#csv-file').setInputFiles({ name: 'fernbrook-estimates.csv', mimeType: 'text/csv', buffer: Buffer.from(contractorCSV) });
  await page.locator('[data-action="import-preview"]').waitFor();
  for (const [field, heading] of [['customer_phone', 'Phone'], ['address', 'Job Site'], ['trade', 'Trade'], ['job_description', 'Project'], ['amount_usd', 'Total']])
    assert.match(await page.locator(`[data-map="${field}"] option:checked`).innerText(), new RegExp('^' + heading), `${field} auto-matched to ${heading}`);
  assert.equal(await page.locator('[data-import-option="dateFormat"]').inputValue(), 'mdy');
  await shot('import-mapping-1440', { fullPage: true });
  await page.locator('[data-action="import-preview"]').click();
  assert.match(await page.locator('[data-import-error]').innerText(), /opt-out/i, 'missing opt-out column must be reviewed explicitly');
  await page.locator('[data-import-option="optOutReviewed"]').check();
  await page.locator('[data-action="import-preview"]').click();
  await page.locator('[data-action="import-commit"]').waitFor();
  const chips = await page.locator('.count-chips').innerText();
  assert.match(chips, /7 ready/); assert.match(chips, /2 held/); assert.match(chips, /1 invalid/); assert.match(chips, /1 duplicates/);
  assert.equal((await state()).quotes.length, 0, 'preview writes nothing');
  await shot('import-review-1440', { fullPage: true });
  await page.locator('[data-action="import-commit"]').click();
  await toast(/7 estimates imported/);
  let current = await state();
  assert.equal(current.quotes.length, 7);
  const dana = current.quotes.find(q => q.estimate_id === 'R-1001');
  assert.deepEqual([dana.customer_phone, dana.address, dana.trade, dana.amount_usd, dana.next_follow_up_date], ['555-0142', '12 Linden Ave', 'Roofing', 21480, addDays(today, -6)]);
  assert.equal(current.quotes.find(q => q.estimate_id === 'R-1004').next_follow_up_date, '');
  assert.ok(current.identities.every(i => i.origin === 'imported'));
  assert.match(await page.locator('.qt-empty h3').innerText(), /7 estimates imported/);
  pass('CSV import maps phone/address/trade, converts dates and amounts, holds conflicts, rejects invalid rows and saves only on confirm');

  // Re-importing is conservative: exact duplicates are skipped and a changed existing ID is protected.
  await pasteImport([contractorCSV.split('\r\n')[0], sourceRows[0].map(cell).join(','), row('R-1001', 'Dana Whitfield', 'dana.whitfield@example.com', '555-0142', '12 Linden Ave', 'Roofing', 'Roof replacement · 32 sq architectural shingles', '$99,999.00', 16, 'Sent', -6).map(cell).join(','), row('R-1010', 'New Lead', 'new.lead@example.com', '', '', 'Siding', 'Siding repair', '$2,000.00', 1, 'Sent', 2).map(cell).join(',')].join('\r\n'));
  await page.locator('[data-import-option="optOutReviewed"]').check();
  await page.locator('[data-action="import-preview"]').click();
  await page.locator('[data-action="import-commit"]').waitFor();
  const reimport = await page.locator('.qt-import-rows').innerText();
  assert.match(reimport, /Duplicate · skipped\s+Dana Whitfield\s+Row 2 · R-1001/); assert.match(reimport, /Existing ID · protected\s+Dana Whitfield\s+Row 3 · R-1001[\s\S]*nothing overwritten/); assert.match(reimport, /Ready\s+New Lead\s+Row 4 · R-1010/);
  await page.locator('[data-action="import-restart"]').last().click();
  assert.deepEqual((await state()).quotes, current.quotes, 'cancelled re-import changed nothing');
  pass('re-import conflict review protects existing records; cancel leaves data untouched');

  // 8–9. Dashboard figures equal the server records.
  await nav('overview');
  const m = metrics(current.quotes, today), bs = pipelineByState(current.quotes, today);
  assert.equal(await kpiText('open'), usd(m.openValue)); assert.equal(m.openValue, 82570);
  assert.equal(await kpiText('due'), String(m.dueCount)); assert.equal(m.dueCount, 2);
  assert.equal(await kpiText('unscheduled'), String(m.unscheduled)); assert.equal(m.unscheduled, 1);
  assert.equal(await kpiText('won'), usd(m.wonValue)); assert.equal(m.wonValue, 9800);
  assert.match(await page.locator('[aria-label="Open pipeline by follow-up state"]').innerText(), new RegExp(usd(bs.overdue.value).replace('$', '\\$')));
  assert.equal(await page.locator('.qt-attn').count(), 2);
  assert.match(await page.locator('.app-nav [data-nav="followups"] em').innerText(), /^2/);
  await shot('dashboard-1440');
  await page.setViewportSize({ width: 1920, height: 1080 }); await shot('dashboard-1920'); await page.setViewportSize({ width: 1440, height: 900 });
  assert.match(await page.locator('[data-guide]').innerText(), /Getting started · 2 of 6 done[\s\S]*Next: Save a recovery code/);
  await page.locator('[data-action="dismiss-guide"]').click();
  assert.equal(await page.locator('[data-guide]').count(), 0);
  await page.reload(); await page.locator('[data-kpi="open"]').waitFor();
  assert.equal(await page.locator('[data-guide]').count(), 0, 'dismissed guide stays hidden for this browser');
  pass('overview KPIs, state bar, queue and nav counts match server records exactly; setup guide shows progress and can be hidden');

  // 10–11. Search by customer and project details; filter by status and trade.
  await nav('estimates');
  const visibleIds = async () => page.locator('tbody tr[data-row]').evaluateAll(rows => rows.map(r => r.dataset.row));
  await page.locator('#est-q').fill('5550142'); assert.deepEqual(await visibleIds(), ['R-1001'], 'digit search matches formatted phone');
  await page.locator('#est-q').fill('linden'); assert.deepEqual(await visibleIds(), ['R-1001'], 'address search');
  await page.locator('#est-q').fill('Becker'); assert.deepEqual(await visibleIds(), ['R-1004'], 'customer search');
  await page.locator('#est-q').fill('');
  await page.locator('[data-status="sent"]').click(); assert.equal((await visibleIds()).length, 4);
  await page.locator('#est-trade').selectOption('Roofing'); assert.deepEqual(await visibleIds(), ['R-1001']);
  await page.locator('[data-status="all"]').click(); assert.deepEqual((await visibleIds()).sort(), ['R-1001', 'R-1005', 'R-1006']);
  assert.match(await page.locator('.summary').innerText(), /Showing 3 of 7/);
  await page.locator('#est-trade').selectOption('all');
  await page.locator('#est-sort').selectOption('value'); assert.equal((await visibleIds())[0], 'R-1002');
  await shot('estimate-list-1440');
  pass('search covers name, address and phone digits; status, trade and sort filters work together');

  // 12–14. Open an estimate, edit supported fields, save and reload.
  await openEstimate('R-1001');
  await shot('estimate-detail-1440');
  await page.locator('[data-action="edit"]').click();
  await page.locator('[data-editor] [name=customer_phone]').fill('(555) 010-0199 x12');
  await page.locator('[data-editor] [name=address]').fill('12 Linden Ave, Unit B');
  await page.locator('[data-editor] [type=submit]').click();
  await toast(/Estimate updated/);
  await page.reload(); await page.locator('#drawer-title').waitFor();
  assert.match(await page.locator('.qt-job-card').innerText(), /\(555\) 010-0199 x12/);
  assert.match(await page.locator('.qt-job-card').innerText(), /Unit B/);
  current = await state();
  assert.equal(current.quotes.find(q => q.estimate_id === 'R-1001').customer_phone, '(555) 010-0199 x12');
  assert.match(current.quotes.find(q => q.estimate_id === 'R-1001').history.at(-1).text, /Updated phone, project address/);
  const edited = (await events()).filter(e => e.type === 'estimate_edited').at(-1);
  assert.deepEqual(edited.data.changedFields.sort(), ['address', 'customer_phone']);
  pass('estimate detail edits only changed fields, persists them and survives a reload (deep link reopens the record)');
  await closeDrawer();

  // 15–19. Follow-up queue, draft editing, copying (no contact), real contact logging.
  await nav('followups');
  assert.match(await page.locator('.qt-queue-group').first().innerText(), /Overdue · 1/i);
  await shot('followups-1440');
  await page.locator('.qt-queue__row--overdue [data-open="R-1001"]').last().click();
  await page.locator('#draft-text').waitFor();
  assert.match(await page.locator('#draft-text').inputValue(), /Hi Dana,[\s\S]*Fictional Fernbrook Roofing/);
  const customDraft = 'Hi Dana — quick check-in on your roof estimate. Happy to walk through the ice & water shield options. (Fictional)';
  await page.locator('#draft-text').fill(customDraft);
  assert.equal(await page.locator('[data-draft-chip]').innerText(), 'Unsaved changes');
  await page.locator('[data-action="save-draft"]').click(); await toast(/Draft saved/);
  assert.equal((await state()).quotes.find(q => q.estimate_id === 'R-1001').saved_draft, customDraft);
  const before = { events: (await events()).length, last: (await state()).quotes.find(q => q.estimate_id === 'R-1001').last_contact_date };
  await page.locator('[data-action="copy-draft"]').click(); await toast(/Draft copied\. Nothing was sent/);
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), customDraft);
  assert.equal((await events()).length, before.events, 'copying records no event');
  assert.equal((await state()).quotes.find(q => q.estimate_id === 'R-1001').last_contact_date, before.last, 'copying records no contact');
  await shot('draft-editor-1440', { keepToast: true });
  pass('queue opens the overdue estimate; draft edits save; copying fills the clipboard and records nothing');

  const contact = page.locator('[data-form="contact"]');
  await contact.locator('[name=channel]').selectOption('Phone');
  await contact.locator('[name=result]').selectOption('spoke');
  await contact.locator('[name=nextDate]').fill(addDays(today, 3));
  await contact.locator('[name=note]').fill('FICTIONAL call: comparing two other bids');
  await contact.scrollIntoViewIfNeeded(); await shot('contact-logging-1440');
  await contact.locator('[type=submit]').click(); await toast(/Phone contact recorded for Dana Whitfield/);
  current = await state();
  const danaAfter = current.quotes.find(q => q.estimate_id === 'R-1001');
  assert.equal(danaAfter.last_contact_date, today); assert.equal(danaAfter.next_follow_up_date, addDays(today, 3));
  const logged = (await events()).filter(e => e.type === 'contact_logged');
  assert.equal(logged.length, 1); assert.equal(logged[0].data.result, 'spoke'); assert.equal(logged[0].data.channel, 'Phone');
  assert.match(danaAfter.history.at(-1).text, /^Phone contact recorded · Spoke with customer — FICTIONAL call/);
  pass('logged contact persists to the ledger with channel, result, note and next follow-up');

  // 20–21. Reschedule without logging a contact; record the decision.
  await page.locator('#schedule-date').fill(addDays(today, 7));
  await page.locator('[data-form="schedule"] [type=submit]').click(); await toast(/set for/);
  current = await state();
  assert.equal(current.quotes.find(q => q.estimate_id === 'R-1001').next_follow_up_date, addDays(today, 7));
  assert.equal((await events()).filter(e => e.type === 'contact_logged').length, 1, 'scheduling is not a contact');
  await page.locator('[data-outcome="won"]').click();
  await page.locator('[data-confirm-ok]').click(); await toast(/marked won/);
  current = await state();
  const won = current.quotes.find(q => q.estimate_id === 'R-1001');
  assert.equal(won.status, 'won'); assert.equal(won.next_follow_up_date, '');
  // 22. Timeline shows the whole sequence.
  const timelineText = await page.locator('.qt-timeline').innerText();
  for (const re of [/Estimate imported/, /Updated phone, project address/, /Phone contact recorded · Spoke with customer/, /Next follow-up set for/, /Estimate marked won/]) assert.match(timelineText, re);
  await closeDrawer();
  pass('rescheduling and the won outcome persist; the activity timeline records each step');

  // 23. Dashboard and Results update from server data.
  await nav('overview');
  const m2 = metrics(current.quotes, today);
  assert.equal(await kpiText('won'), usd(31280)); assert.equal(m2.wonValue, 31280);
  assert.equal(await kpiText('open'), usd(61090)); assert.equal(await kpiText('due'), '1');
  assert.match(await page.locator('.qt-feed').innerText(), /Estimate marked won/);
  await nav('results');
  await page.locator('.qt-result').first().waitFor();
  const results = (await api(`/workspaces/${current.businessId}/results?from=${addDays(today, -29)}&to=${today}`)).data;
  assert.deepEqual(results.counts, { contacts: 1, followed: 1, won: 1, lost: 0, open: 0, unknown: 0 });
  assert.equal(await page.locator('[data-group="contacts"] strong').innerText(), '1');
  assert.equal(await page.locator('[data-group="won"] strong').innerText(), '1');
  assert.equal(await page.locator('[data-group="won-value"] strong').innerText(), usd(results.values.won));
  assert.equal(results.values.won, 21480);
  assert.equal(await page.locator('[data-group="overdue"] strong').innerText(), usd(results.values.overdue));
  assert.match(await page.locator('.qt-cols').getAttribute('aria-label'), /1$/);
  await page.locator('[data-group="won"]').click();
  assert.match(await page.locator('[data-supporting]').innerText(), /Dana Whitfield/);
  await shot('results-1440', { fullPage: true });
  await page.locator('[data-range="custom"]').click();
  await page.locator('[data-form="range"] [name=from]').fill(addDays(today, -1));
  await page.locator('[data-form="range"] [name=to]').fill(addDays(today, -1));
  await page.locator('[data-form="range"] [type=submit]').click();
  await page.waitForFunction(() => document.querySelector('[data-group="contacts"] strong')?.textContent === '0');
  await page.locator('[data-range="30"]').click();
  await page.waitForFunction(() => document.querySelector('[data-group="contacts"] strong')?.textContent === '1');
  pass('Results cards, cohort, weekly chart and supporting rows match the server calculation and follow the date range');

  // Contact correction keeps evidence and recalculates results.
  await nav('estimates'); await openEstimate('R-1001');
  await page.locator('[data-corrections] summary').click();
  await page.locator('[data-form="correction"]').waitFor();
  await page.locator('[data-form="correction"] [name=treatment]').selectOption('void');
  await page.locator('[data-form="correction"] [name=reason]').fill('FICTIONAL duplicate entry');
  await page.locator('[data-form="correction"] [type=submit]').click(); await toast(/Contact correction saved/);
  assert.equal((await api(`/workspaces/${current.businessId}/results?from=${today}&to=${today}`)).data.counts.contacts, 0);
  await page.locator('[data-form="correction"]').waitFor();
  await page.locator('[data-form="correction"] [name=treatment]').selectOption('active');
  await page.locator('[data-form="correction"] [name=reason]').fill('FICTIONAL reviewed: the call happened');
  await page.locator('[data-form="correction"] [type=submit]').click();
  await page.waitForFunction(() => document.querySelector('[data-form="correction"] [name=treatment]')?.value === 'active' && !document.querySelector('[data-form="correction"] [name=reason]')?.value);
  assert.equal((await api(`/workspaces/${current.businessId}/results?from=${today}&to=${today}`)).data.counts.contacts, 1);
  assert.equal((await events()).filter(e => e.type === 'contact_logged').length, 1, 'corrections never delete the original evidence');
  await closeDrawer();
  pass('contact void and reinstatement are appended to the ledger and recalculate Results');

  // Draft → sent, opt-out and outcome guards in the drawer.
  await openEstimate('R-1007');
  assert.equal(await page.locator('#draft-text').count(), 0, 'drafts are unavailable for draft estimates');
  await page.locator('[data-outcome="sent"]').click(); await page.locator('[data-confirm-ok]').click(); await toast(/Marked sent/);
  assert.equal((await state()).quotes.find(q => q.estimate_id === 'R-1007').next_follow_up_date, addDays(today, 3));
  await page.locator('[data-outcome="optout"]').click(); await page.locator('[data-confirm-ok]').click(); await toast(/Follow-ups stopped/);
  assert.equal(await page.locator('#draft-text').count(), 0, 'opt-out pauses drafts');
  current = await state();
  assert.equal(current.quotes.find(q => q.estimate_id === 'R-1007').do_not_contact, true);
  assert.equal(current.quotes.find(q => q.estimate_id === 'R-1007').next_follow_up_date, '');
  await closeDrawer();
  pass('draft estimates can be marked sent; do-not-contact pauses drafts and clears the follow-up date');

  // Failure paths: validation, hostile and long text, keyboard close, offline saves, expired session.
  await page.locator('.app-cta').click();
  await page.locator('[data-editor] [type=submit]').click();
  assert.match(await page.locator('[data-editor] .dialog-error').innerText(), /customer name is required/i);
  assert.equal(await page.locator('[data-editor] [name=customer_name]').getAttribute('aria-invalid'), 'true');
  const hostile = 'Zoë "O’Brien" <img src=x onerror="window.__xss=1"> & Søn — Extraordinarily Long Customer Name Roofing & Exteriors Holdings LLC';
  await page.locator('[data-editor] [name=customer_name]').fill(hostile);
  await page.locator('[data-editor] [name=job_description]').fill('<b>Bold?</b> Roof & gutter package with a very long description that keeps going to test wrapping on narrow screens');
  for (const [amount, phone, re] of [['-5', '', /Amount must be between/], ['1234.567', '', /Amount must be between/], ['abc', '', /Amount must be between/], ['1234.56', 'call me maybe', /Phone/]]) {
    await page.locator('[data-editor] [name=amount_usd]').fill(amount === 'abc' ? '' : amount);
    await page.locator('[data-editor] [name=customer_phone]').fill(phone);
    await page.locator('[data-editor] [type=submit]').click();
    assert.match(await page.locator('[data-editor] .dialog-error').innerText(), re, `${amount}/${phone}`);
  }
  const countBefore = (await state()).quotes.length;
  await page.locator('[data-editor] [name=customer_phone]').fill('555-0177');
  await page.locator('[data-editor] [type=submit]').click(); await toast(/added/);
  const created = (await state()).quotes.find(x => x.customer_name === hostile);
  assert.ok(created); assert.equal((await state()).quotes.length, countBefore + 1); assert.equal(created.amount_usd, 1234.56);
  await nav('estimates'); await page.locator('#est-q').fill('Søn');
  assert.equal(await page.locator('[data-main] img').count(), 0); assert.equal(await page.evaluate(() => window.__xss), undefined);
  assert.match(await page.locator('tbody').innerText(), /<img src=x/);
  const opener = page.locator(`button.qt-link[data-open="${created.estimate_id}"]`);
  await opener.click(); await page.locator('#drawer-title').waitFor();
  assert.equal(await page.locator('#drawer-title').innerText(), hostile);
  assert.equal(await page.locator('[data-drawer] img').count(), 0);
  await page.keyboard.press('Escape'); await page.locator('[data-drawer]').waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.open), created.estimate_id, 'focus returns to the control that opened the drawer');
  await page.setViewportSize({ width: 390, height: 844 });
  await opener.click(); await page.locator('#drawer-title').waitFor();
  assert.equal(await page.locator('[data-drawer]').evaluate(e => e.scrollWidth <= e.clientWidth), true, 'long text wraps inside the drawer');
  await noHorizontalScroll('390 long names');
  await page.setViewportSize({ width: 1440, height: 900 });
  await context.setOffline(true);
  await page.locator('#draft-text').fill('Offline fictional draft');
  await page.locator('[data-action="save-draft"]').click(); await toast(/could not be reached/);
  await context.setOffline(false);
  assert.equal((await state()).quotes.find(x => x.estimate_id === created.estimate_id).saved_draft, '', 'nothing saved while offline');
  assert.equal(await page.locator('#draft-text').inputValue(), 'Offline fictional draft', 'unsaved text is kept');
  await page.locator('[data-action="save-draft"]').click(); await toast(/Draft saved/);
  assert.equal((await state()).quotes.find(x => x.estimate_id === created.estimate_id).saved_draft, 'Offline fictional draft');
  await api('/logout', 'POST', {});   // the session ends (expiry or sign-out elsewhere) while the page is open
  await page.locator('#draft-text').fill('Typed after the session ended');
  await page.locator('[data-action="save-draft"]').click();
  await page.locator('[data-banner]').waitFor({ state: 'visible' });
  assert.match(await page.locator('[data-banner]').innerText(), /session has ended/);
  assert.equal(await page.locator('#draft-text').inputValue(), 'Typed after the session ended');
  await signIn('owner-a@example.com');
  assert.equal((await state()).quotes.find(x => x.estimate_id === created.estimate_id).saved_draft, 'Offline fictional draft');
  pass('validation errors, hostile text, keyboard close, offline saves and an expired session are handled without data loss or script injection');

  // Opt-out safeguard: an import that would discard an opt-out is blocked without writes.
  const blockedBefore = await state();
  const q = { estimate_id: 'NEW-GOOD', customer_name: 'Risk Example', customer_email: 'risk@example.com', job_description: 'Fictional job', amount_usd: 100, estimate_date: today, status: 'sent', next_follow_up_date: '', last_contact_date: '', do_not_contact: false, notes: '' };
  await pasteImport(exportCSV([q, { ...q, estimate_id: 'NEW-INVALID', amount_usd: -1, do_not_contact: true }]));
  await page.locator('[data-action="import-preview"]').click();
  await page.locator('[data-action="import-commit"]').waitFor();
  assert.equal(await page.locator('[data-action="import-commit"]').isDisabled(), true);
  assert.match(await page.locator('.import-block').innerText(), /Import blocked/);
  await page.locator('[data-action="import-restart"]').last().click();
  assert.deepEqual(await state(), blockedBefore);
  pass('import that would lose an opt-out is blocked with no writes');

  // 25. Exports: CSV includes the new fields; workspace export round-trips the server state.
  await nav('settings');
  await page.locator('[data-action="export-csv"]').first().click();
  const csv = await page.locator('#export-text').inputValue();
  assert.match(csv.split(/\r?\n/)[0], /notes,customer_phone,address,trade$/);
  assert.match(csv, /"\(555\) 010-0199 x12","12 Linden Ave, Unit B","Roofing"/);
  await page.locator('[data-export] [data-action="close-dialog"]').click();
  await page.locator('[data-action="export-json"]').click();
  const workspaceExport = await page.locator('#export-text').inputValue();
  assert.deepEqual(JSON.parse(workspaceExport).quotes, (await state()).quotes);
  await page.locator('[data-export] [data-action="close-dialog"]').click();
  await shot('settings-1440', { fullPage: true });
  pass('CSV export includes phone, address and trade; workspace export matches server records');

  // Stale data: another tab saves first; this tab must not overwrite it and keeps the typed text.
  await page.locator('.app-cta').click();
  await page.locator('[data-editor] [name=customer_name]').fill('Unsaved stale customer');
  await page.locator('[data-editor] [name=job_description]').fill('Fictional stale test');
  await page.locator('[data-editor] [name=amount_usd]').fill('50');
  const beforeStale = await state();
  await api(`/workspaces/${beforeStale.businessId}/commands`, 'POST', { requestId: crypto.randomUUID(), kind: 'edit', estimateId: 'R-1003', fields: { notes: 'Concurrent fictional edit' }, revision: beforeStale.revision });
  await page.locator('[data-editor] [type=submit]').click();
  await page.locator('[data-banner]').waitFor({ state: 'visible' });
  assert.match(await page.locator('[data-banner]').innerText(), /changed in another tab/);
  assert.match(await page.locator('[data-editor] .dialog-error').innerText(), /another tab/);
  assert.equal(await page.locator('[data-editor] [name=customer_name]').inputValue(), 'Unsaved stale customer');
  assert.equal((await state()).quotes.length, beforeStale.quotes.length);
  assert.equal((await state()).quotes.find(x => x.estimate_id === 'R-1003').notes, 'Concurrent fictional edit');
  await page.locator('[data-editor] [data-action="close-dialog"]').first().click();
  await page.locator('[data-action="reload-workspace"]').click(); await toast(/Latest saved data loaded/);
  assert.equal(await page.locator('[data-banner]').isHidden(), true);
  pass('a stale tab is blocked from overwriting newer data, keeps typed text, and recovers without a page reload');

  // Duplicate submission and retry protection.
  const dup = await state();
  const command = { requestId: crypto.randomUUID(), kind: 'draft', estimateId: 'R-1002', text: 'Retry-safe fictional draft', revision: dup.revision };
  const [first, second] = await Promise.all([api(`/workspaces/${dup.businessId}/commands`, 'POST', command), api(`/workspaces/${dup.businessId}/commands`, 'POST', command)]);
  assert.deepEqual([first.status, second.status].sort(), [200, 200]);
  assert.equal((await events()).filter(e => e.type === 'draft_saved' && e.estimateId === 'R-1002').length, 1, 'a retried request is applied once');
  await page.reload(); await page.locator('h1').waitFor();
  pass('retried and double-submitted commands are applied exactly once');

  // Workspace restore with safety copy (cancel first), then recover the safety copy.
  await nav('settings');
  const beforeRestore = await state();
  await page.locator('#restore-file').setInputFiles({ name: 'fictional-export.json', mimeType: 'application/json', buffer: Buffer.from(workspaceExport) });
  await page.locator('[data-confirm]').waitFor({ state: 'visible' });
  assert.match(await page.locator('[data-confirm]').innerText(), /Fictional Fernbrook Roofing/);
  await page.locator('[data-confirm-cancel]').click();
  assert.deepEqual(await state(), beforeRestore);
  await page.locator('#restore-file').setInputFiles({ name: 'fictional-export.json', mimeType: 'application/json', buffer: Buffer.from(workspaceExport) });
  await page.locator('[data-confirm-ok]').click(); await toast(/Workspace restored/);
  assert.equal((await state()).measurement.epoch, 2);
  await page.locator('[data-action="snapshots"]').click();
  await page.locator('[data-action="snapshot-download"]').first().click();
  const safety = JSON.parse(await page.locator('#export-text').inputValue());
  assert.deepEqual(safety.quotes, beforeRestore.quotes);
  await page.locator('[data-export] [data-action="close-dialog"]').click();
  await page.locator('#restore-file').setInputFiles({ name: 'safety.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(safety)) });
  await page.locator('[data-confirm-ok]').click(); await toast(/Workspace restored/);
  current = await state();
  assert.equal(current.measurement.epoch, 3);
  assert.deepEqual(current.quotes.map(x => [x.estimate_id, x.status, x.customer_phone]), beforeRestore.quotes.map(x => [x.estimate_id, x.status, x.customer_phone]));
  assert.equal(current.quotes.find(x => x.estimate_id === 'R-1007').do_not_contact, true, 'opt-outs survive restore');
  await nav('results'); await page.locator('.qt-result').first().waitFor();
  assert.match(await page.locator('[data-results-body] > .qt-help').last().innerText(), /Reporting period 3/);
  pass('workspace restore saves a safety copy, retains opt-outs, starts a new reporting period and can be undone');

  // Responsive layouts: tablet and phone.
  await page.setViewportSize({ width: 820, height: 1180 });
  await nav('overview'); await noHorizontalScroll('820 overview'); await shot('dashboard-820');
  await nav('estimates'); await noHorizontalScroll('820 estimates'); await shot('estimate-list-820');
  await page.setViewportSize({ width: 390, height: 844 });
  await nav('overview');
  await noHorizontalScroll('390 overview'); await shot('dashboard-390'); await shot('dashboard-390-full', { fullPage: true });
  for (const view of ['estimates', 'followups', 'results', 'import', 'settings']) {
    await nav(view);
    if (view === 'results') await page.locator('.qt-result').first().waitFor();
    await noHorizontalScroll('390 ' + view);
    await shot(`${view === 'estimates' ? 'estimate-list' : view}-390`);
  }
  await nav('followups');
  await page.locator('[data-queue="upcoming"]').click();
  await page.locator('[data-open="R-1003"]').first().click(); await page.locator('#drawer-title').waitFor();
  assert.equal(await page.locator('[data-drawer]').evaluate(e => e.scrollWidth <= e.clientWidth), true);
  await shot('estimate-detail-390');
  await page.locator('[data-form="contact"]').scrollIntoViewIfNeeded(); await shot('contact-logging-390');
  await closeDrawer();
  await page.setViewportSize({ width: 1440, height: 900 });
  pass('tablet (820px) and phone (390px) layouts have no horizontal scroll; navigation and drawer work');

  // 26–29. Sign out, restart the server, sign back in: data is intact.
  const beforeRestart = await state();
  await page.locator('[data-action="sign-out"]').click(); await page.waitForURL('**/signin');
  assert.equal((await api('/me')).status, 401);
  await running.close();
  running = await startServer({ port: 0, dbPath, logger: () => {} });
  base = `http://127.0.0.1:${running.port}`;
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
  await signIn('owner-a@example.com');
  const afterRestart = await state();
  assert.deepEqual(afterRestart.quotes, beforeRestart.quotes); assert.equal(afterRestart.revision, beforeRestart.revision);
  assert.deepEqual((await events()).length, (await (async () => (await api(`/workspaces/${afterRestart.businessId}/events`)).data.length)()));
  assert.equal(await kpiText('won'), usd(metrics(afterRestart.quotes, today).wonValue));
  pass('sign-out ends the session; after a server restart sign-in shows identical data');

  // 30–31. A second business cannot see or change the first business's records.
  const aId = afterRestart.businessId;
  await page.locator('[data-action="sign-out"]').click(); await page.waitForURL('**/signin');
  await register('owner-b@example.com', 'Fictional Maple Exteriors');
  assert.equal((await state()).quotes.length, 0);
  for (const path of ['', '/events', '/snapshots', `/results?from=${today}&to=${today}`]) assert.equal((await api(`/workspaces/${aId}${path}`)).status, 404, `B cannot read A${path}`);
  assert.equal((await api(`/workspaces/${aId}/commands`, 'POST', { requestId: crypto.randomUUID(), revision: 0, kind: 'edit', estimateId: 'R-1003', fields: { notes: 'intrusion' } })).status, 404);
  await page.goto(`${base}/account#estimates/R-1003`); await page.locator('h1').waitFor();
  assert.equal(await page.locator('[data-drawer]').isHidden(), true, 'deep link to another business’s estimate opens nothing');
  assert.equal(await page.locator('[data-crumb-business]').innerText(), 'Fictional Maple Exteriors');
  assert.doesNotMatch(await page.locator('body').innerText(), /Dana|Whitfield|Fernbrook/);
  pass('second business sees an empty workspace and gets 404 for every route of the first business');

  // Account security on a phone: recovery code, password change, recovery reset.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base + '/security');
  await page.locator('#code-form [name=currentPassword]').fill(password); await page.locator('#code-form button').click();
  await page.locator('#code-result').waitFor({ state: 'visible' });
  assert.ok((await page.locator('#recovery-code').inputValue()).length >= 40);
  await noHorizontalScroll('390 security'); await shot('account-security-390', { fullPage: true });
  await page.locator('#password-form [name=currentPassword]').fill(password);
  await page.locator('#password-form [name=password]').fill('Fictional-changed-password-298!');
  await page.locator('#password-form [name=confirm]').fill('Fictional-changed-password-298!');
  await page.locator('#password-form button').click(); await page.waitForURL('**/signin?changed=1');
  await signIn('owner-b@example.com', 'Fictional-changed-password-298!');
  await page.goto(base + '/security');
  await page.locator('#code-form [name=currentPassword]').fill('Fictional-changed-password-298!'); await page.locator('#code-form button').click();
  await page.locator('#code-result').waitFor({ state: 'visible' });
  const freshCode = await page.locator('#recovery-code').inputValue();
  await api('/logout', 'POST', {});
  await page.goto(base + '/signin'); await shot('login-390');
  await page.getByText('Forgot your password?', { exact: true }).click();
  await page.locator('#recover-form [name=email]').fill('owner-b@example.com');
  await page.locator('#recover-form [name=code]').fill(freshCode);
  await page.locator('#recover-form [name=password]').fill(password);
  await page.locator('#recover-form [name=confirm]').fill(password);
  await page.locator('#recover-form button').click();
  await page.waitForFunction(() => document.querySelector('#recover-message').textContent.startsWith('Password reset.'));
  await noHorizontalScroll('390 sign-in');
  await signIn('owner-b@example.com');
  assert.equal((await state()).quotes.length, 0);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(base + '/security'); await page.locator('#code-form').waitFor(); await shot('account-security-1440', { fullPage: true });
  pass('recovery code, password change (signs out) and recovery-code reset work on a phone');

  // Unauthenticated access.
  await api('/logout', 'POST', {});
  assert.equal((await api('/me')).status, 401);
  assert.equal((await api(`/workspaces/${aId}`)).status, 401);
  await page.goto(base + '/account'); await page.waitForURL('**/signin');
  assert.deepEqual(errors, [], 'no uncaught browser errors');
  assert.deepEqual(cspViolations, [], 'the strict Content-Security-Policy is never violated');
  pass('signed-out requests are rejected and /account returns to sign-in; no uncaught browser errors or CSP violations');
  console.log(`\n${passed.length} private-app browser groups passed. Screenshots in ${shots}/`);
} finally {
  await browser.close(); await running.close();
  if (dirname(dir) === tmpdir() && basename(dir).startsWith('quotetend-browser-test-')) await rm(dir, { recursive: true, force: true });
}
