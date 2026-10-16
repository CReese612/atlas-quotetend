// Sprint 4A contractor workflow audit. A research tool, not a test: it drives the real private app (disposable SQLite
// database, fresh browser profiles) and the public demo through scripted contractor scenarios A–J, counts the UI actions
// each scenario needs and times the scripted run. Timings measure this script on this machine, not a person; nobody
// outside the project performed these tasks. Every record is fictional (example.com, 555-01xx).
// Run: node scripts/sprint4a-workflow-audit.mjs   → test-results/sprint4a/ (report.json, report.md, screenshots)
// Uses headless Edge like the browser tests; set QUOTETEND_BROWSER_PATH or QUOTETEND_BROWSER to change it.
import { chromium } from 'playwright';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { startServer } from '../server.mjs';
import { startPublicServer } from '../public-site/serve.mjs';
import { todayISO, addDays } from '../domain.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = join(ROOT, 'test-results', 'sprint4a');
await mkdir(OUT, { recursive: true });
const dir = await mkdtemp(join(tmpdir(), 'quotetend-sprint4a-audit-'));
const dbPath = join(dir, 'accounts.sqlite');
const removeDir = () => dirname(dir) === tmpdir() && basename(dir).startsWith('quotetend-sprint4a-audit-') ? rm(dir, { recursive: true, force: true }) : undefined;
const stopServer = async server => { const closing = server.close(); server.server.closeAllConnections(); await closing; };
const freePort = () => new Promise((resolve, reject) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); }); s.on('error', reject); });
const launch = () => chromium.launch({ ...(process.env.QUOTETEND_BROWSER_PATH ? { executablePath: process.env.QUOTETEND_BROWSER_PATH } : { channel: process.env.QUOTETEND_BROWSER || 'msedge' }), headless: true });

// ---------- Fictional pipeline: 30 sent ("outstanding") estimates plus closed and draft ones ----------
const today = todayISO(), mdy = iso => { const [y, m, d] = iso.split('-'); return `${Number(m)}/${Number(d)}/${y}`; };
// [id, customer, email, phone, street, job, amount, ageDays, status, nextOffset|null, doNotContact, notes]
const PIPELINE = [
  ['E-2101', 'Dana Whitfield', 'dana.whitfield@example.com', '555-0142', 'Linden Ave', 'Roof replacement - 32 sq architectural shingles', 21480, 16, 'Pending', -6, 'No', 'Collecting two other bids'],
  ['E-2102', 'Marcus & Elena Ruiz', 'ruiz.household@example.com', '555-0117', 'Chestnut Ridge Rd', 'Fiber-cement siding - full wrap', 38750, 12, 'Pending', -3, 'No', 'HOA design approval first'],
  ['E-2103', "Kevin O'Neill", 'kevin.oneill@example.com', '555-0168', 'Sycamore Ct', 'Roof replacement - 26 sq + ridge vent', 16950, 19, 'Pending', -2, 'No', 'Wind-damage claim with insurer'],
  ['E-2104', 'Priya Nandakumar', 'priya.n@example.com', '555-0133', 'Briarwood Ln', 'Window replacement - 14 units', 17960, 9, 'Pending', -1, 'No', 'Asked about financing'],
  ['E-2105', 'Rosa Jimenez', 'rosa.jimenez@example.com', '555-0104', 'Alder St', 'Moss removal + roof tune-up', 1180, 10, 'Pending', -4, 'No', ''],
  ['E-2106', 'Tom Becker', 'tom.becker@example.com', '555-0151', 'Ash Hollow Dr', 'Storm-damage roof repair', 8240, 7, 'Pending', 0, 'No', 'Adjuster approved scope'],
  ['E-2107', 'Grace Okafor', 'grace.okafor@example.com', '555-0186', 'Meadowlark St', 'Seamless gutters + guards - 180 lf', 4380, 6, 'Pending', 0, 'No', ''],
  ['E-2108', 'Hillcrest Commons HOA', 'board@hillcrest-commons.example.com', '555-0109', 'Hillcrest Commons Bldg C', 'Roof replacement - Building C', 64900, 5, 'Pending', 0, 'No', 'Board votes Thursday'],
  ['E-2109', 'Jasmine Turner', 'jasmine.turner@example.com', '555-0124', 'Willow Bend', 'Window replacement - 8 fiberglass units', 11480, 18, 'Pending', 1, 'No', ''],
  ['E-2110', 'Ben Castillo', 'ben.castillo@example.com', '555-0175', 'Orchard Way', 'Entry door + sidelites', 6150, 4, 'Pending', 3, 'No', ''],
  ['E-2111', 'Hannah Lindqvist', 'hannah.lindqvist@example.com', '555-0193', 'Fox Run', 'Vinyl siding - two elevations', 14620, 3, 'Pending', 4, 'No', ''],
  ['E-2112', 'Samuel Oyelaran', 'samuel.o@example.com', '555-0138', 'Stonegate Dr', 'Standing-seam metal roof - 28 sq', 46300, 2, 'Pending', 5, 'No', ''],
  ['E-2113', 'Carla Mendes', 'carla.mendes@example.com', '555-0187', 'Hawthorne Ave', 'Roof replacement - 28 sq', 19840, 8, 'Pending', 2, 'No', ''],
  ['E-2114', 'Derek Holm', 'derek.holm@example.com', '555-0179', 'Birch Ln', 'Gutter replacement - 140 lf', 2950, 5, 'Pending', 6, 'No', ''],
  ['E-2115', 'Ivy Chen', 'ivy.chen@example.com', '555-0141', 'Spruce Ct', 'Skylight reflash', 1450, 6, 'Pending', 2, 'No', ''],
  ['E-2116', 'Owen Park', 'owen.park@example.com', '555-0166', 'Maple Dr', 'Attic ventilation + ridge vent', 2380, 4, 'Pending', 7, 'No', ''],
  ['E-2117', 'Nora Fitzgerald', 'nora.fitzgerald@example.com', '555-0158', 'Cascade Ave', 'Roof replacement - 34 sq', 23900, 3, 'Pending', 3, 'No', ''],
  ['E-2118', 'Paul Henley', 'paul.henley@example.com', '555-0113', 'Pine St', 'Siding repair - east wall', 3120, 9, 'Pending', 1, 'No', ''],
  ['E-2119', 'Quinn Alvarez', 'quinn.alvarez@example.com', '555-0172', 'Elm Terrace', 'Chimney flashing repair', 1640, 2, 'Pending', 4, 'No', ''],
  ['E-2120', 'Ruth Sandoval', 'ruth.sandoval@example.com', '555-0145', 'Quarry Rd', 'Window replacement - 9 units', 13275, 7, 'Pending', 8, 'No', ''],
  ['E-2121', 'Rachel Kim', 'rachel.kim@example.com', '555-0161', 'Juniper Pl', 'Skylight replacement + flashing', 3890, 24, 'Pending', null, 'No', 'Traveling; will call back'],
  ['E-2122', 'Douglas Pratt', 'doug.pratt@example.com', '555-0102', 'Kingsley Ave', 'Soffit & fascia replacement', 7425, 28, 'Pending', null, 'No', ''],
  ['E-2123', 'Lucy Tran', 'lucy.tran@example.com', '555-0112', 'Oak St', 'Window replacement - 6 units', 9480, 3, 'Pending', null, 'No', ''],
  ['E-2124', 'Monica Reyes', 'monica.reyes@example.com', '555-0110', 'River Rd', 'Roof replacement - 22 sq', 15860, 2, 'Pending', null, 'No', ''],
  ['E-2125', 'Andre Wallace', 'andre.wallace@example.com', '555-0111', 'Mill St', 'Seamless gutters - 150 lf', 3725, 1, 'Pending', null, 'No', ''],
  ['E-2126', 'Sam Whitaker', '', '555-0189', 'Fir Ct', 'Roof leak repair', 950, 12, 'Pending', null, 'No', 'No email on file'],
  ['E-2127', 'Sofia Delgado', 'sofia.delgado@example.com', '555-0129', 'Pinecrest Rd', 'Siding repair - north wall', 5870, 21, 'Pending', null, 'Yes', 'Asked us to stop calling'],
  ['E-2128', 'Sofia Delgado', 'sofia.delgado@example.com', '555-0129', 'Pinecrest Rd', 'Gutter repair', 1350, 14, 'Pending', 2, 'No', ''],
  ['E-2129', 'Victor Hale', 'victor.hale@example.com', '555-0157', 'Lakeshore Dr', 'Exterior package - siding, windows, door', 71200, 1, 'Pending', 6, 'No', ''],
  ['E-2130', 'Wes Ortega', 'wes.ortega@example.com', '555-0163', 'Ferry St', 'Roof replacement - 30 sq', 20450, 11, 'Pending', -9, 'No', ''],
  ['E-2131', 'Olivia Grant', 'olivia.grant@example.com', '555-0114', 'Magnolia Ct', 'Roof replacement - 30 sq', 18900, 34, 'Sold', null, 'No', ''],
  ['E-2132', 'Nathan Brooks', 'nathan.brooks@example.com', '555-0181', 'Elm Terrace', 'Fiber-cement siding - front', 16480, 31, 'Sold', null, 'No', ''],
  ['E-2133', 'Aaron Patel', 'aaron.patel@example.com', '555-0139', 'Bramble Ln', 'Roof replacement - 24 sq', 24600, 26, 'Lost', null, 'No', ''],
  ['E-2134', 'Leah Moreno', 'leah.moreno@example.com', '555-0146', 'Cedar Glen', 'Bay window + 6 casements', 22840, 1, 'Draft', null, 'No', '']
];
const HEAD = 'Estimate #,Customer,Email,Phone,Job Address,Job Description,Estimate Amount,Date Sent,Status,Next Follow Up,Do Not Contact,Notes';
const column = heading => String(HEAD.split(',').indexOf(heading)); // mapping selects use the source column index as the value
const cell = v => /[",\n]/.test(String(v)) ? `"${String(v).replaceAll('"', '""')}"` : String(v);
const money = n => '$' + n.toLocaleString('en-US');
const csvOf = rows => [HEAD, ...rows.map(([id, name, email, phone, street, job, amount, age, status, next, dnc, notes]) =>
  [id, name, email, phone, street, job, money(amount), mdy(addDays(today, -age)), status, next === null ? '' : mdy(addDays(today, next)), dnc, notes].map(cell).join(','))].join('\r\n');
const WEEK1 = csvOf(PIPELINE);
// Re-export a day later: one revised amount, one status the owner changed in the spreadsheet, two new estimates.
const WEEK2 = csvOf([...PIPELINE.map(r => r[0] === 'E-2104' ? Object.assign([...r], { 6: 16980, 11: 'Revised: 12 units' }) : r[0] === 'E-2113' ? Object.assign([...r], { 8: 'Sold', 9: null }) : r),
  ['E-2135', 'Ian Fletcher', 'ian.fletcher@example.com', '555-0198', 'Harbor View', 'Chimney flashing repair', 2640, 0, 'Pending', 4, 'No', ''],
  ['E-2136', 'Megan Walsh', 'megan.walsh@example.com', '555-0165', 'Quarry Rd', 'Gutter replacement - 140 lf', 3150, 0, 'Pending', 5, 'No', '']]);

// ---------- Scenario bookkeeping ----------
const report = { generatedAt: new Date().toISOString(), businessDay: today, note: 'Scripted, automated run with fictional data. Action counts are reproducible; timings describe this script, not human task time.', scenarios: [], demo: [], screenshots: [] };
let current = null;
async function scenario(id, title, { start, intended }, fn) {
  current = { id, title, start, intended, actions: [], observations: [], measurements: {}, ok: true };
  const t0 = performance.now();
  try { await fn(); } catch (error) { current.ok = false; current.observations.push('SCRIPT ERROR: ' + error.message.split('\n')[0]); console.error(error); }
  current.ms = Math.round(performance.now() - t0);
  (id.startsWith('DEMO') ? report.demo : report.scenarios).push(current);
  console.log(`${current.ok ? 'DONE' : 'FAIL'} ${id} ${title}: ${current.actions.length} actions, ${current.ms} ms`);
}
const note = text => current.observations.push(text);
const measure = (key, value) => { current.measurements[key] = value; };
const act = async (kind, label, fn) => { current.actions.push(`${kind}: ${label}`); await fn(); };

function helpers(page) {
  const h = {
    click: (sel, label) => act('click', label, () => page.locator(sel).first().click()),
    fill: (sel, value, label) => act('type', label, () => page.locator(sel).first().fill(value)),
    select: (sel, value, label) => act('select', label, () => page.locator(sel).first().selectOption(value)),
    check: (sel, label) => act('check', label, () => page.locator(sel).first().check()),
    toast: re => page.waitForFunction(source => new RegExp(source).test(document.querySelector('[data-toast]')?.textContent || ''), re.source, { timeout: 15000 }),
    api: (path, method = 'GET', body) => page.evaluate(async ({ path, method, body }) => {
      const r = await fetch('/api' + path, { method, headers: { 'Content-Type': 'application/json', 'X-QuoteTend-Request': '1' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      return { status: r.status, data: await r.json().catch(() => null) };
    }, { path, method, body }),
    ws: async () => { const me = await h.api('/me'); return (await h.api('/workspaces/' + me.data.businessId)).data; },
    events: async () => { const me = await h.api('/me'); return (await h.api('/workspaces/' + me.data.businessId + '/events')).data; },
    nav: async (view, label = `sidebar → ${view}`) => {
      if (await page.locator('[data-nav-toggle]').isVisible()) await h.click('[data-nav-toggle]', 'open menu');
      await h.click(`.app-nav [data-nav="${view}"]`, label); await page.locator('h1').first().waitFor();
    },
    review: async (id, label) => { await h.click(`[data-row="${id}"] .qt-btn, [data-row="${id}"] [data-open]`, label || `Review ${id}`); await page.locator('#drawer-title').waitFor(); },
    closeDrawer: async () => { await h.click('[data-action="close-drawer"]', 'close record'); await page.locator('[data-drawer]').waitFor({ state: 'hidden' }); },
    shot: async (name, opts = {}) => {
      await page.evaluate(() => document.querySelector('[data-toast]')?.classList.remove('is-on'));
      await page.waitForTimeout(350);
      const path = join(OUT, name + '.png'); await page.screenshot({ path, ...opts }); report.screenshots.push(name + '.png');
    },
    queueIds: () => page.locator('#queue-tabpanel [data-row]').evaluateAll(rows => rows.map(r => r.dataset.row)),
    // Where a control sits inside the scrolled record panel, in panel-heights (1.0 = one screen of scrolling).
    drawerDepth: sel => page.evaluate(sel => {
      const body = document.querySelector('.drawer__body'), el = document.querySelector('[data-drawer] ' + sel);
      if (!body || !el) return null;
      const top = el.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop;
      return { px: Math.round(top), screens: Math.round(top / body.clientHeight * 100) / 100, viewport: body.clientHeight };
    }, sel)
  };
  return h;
}

const password = 'Fictional-audit-password-4417!';
let running = await startServer({ port: 0, dbPath, logger: () => {} });
let base = `http://127.0.0.1:${running.port}`;
let browser = await launch();
let child;
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const h = helpers(page);
  await page.goto(base + '/signin');
  await page.locator('#auth-toggle').click();
  await page.locator('[name=businessName]').fill('Fernbrook Roofing & Exteriors (fictional audit)');
  await page.locator('#auth-form [name=email]').fill('owner@example.com');
  await page.locator('#auth-form [name=password]').fill(password);
  await page.locator('#auth-submit').click();
  await page.waitForURL('**/account#overview');
  await page.locator('h1').waitFor();

  // ---------- I. Import (run first: every other scenario starts from the imported pipeline) ----------
  await scenario('I', 'Owner imports spreadsheet estimates', { start: 'Empty account; owner spreadsheet exported as CSV (34 rows, US dates, $ amounts, statuses Pending/Sold/Lost/Draft, a Do Not Contact column).', intended: 'All valid estimates imported with correct statuses, dates and opt-outs.' }, async () => {
    await h.nav('import');
    await act('upload', 'choose CSV file', () => page.locator('#csv-file').setInputFiles({ name: 'fernbrook-estimates.csv', mimeType: 'text/csv', buffer: Buffer.from(WEEK1) }));
    await page.locator('[data-action="import-preview"]').waitFor();
    const unmatched = await page.locator('[data-map]').evaluateAll(sels => sels.filter(s => s.value === '').map(s => s.dataset.map));
    measure('unmatchedAfterAutoMatch', unmatched);
    await h.shot('I-import-mapping-1440', { fullPage: true });
    if (unmatched.includes('amount_usd')) await h.select('[data-map="amount_usd"]', column('Estimate Amount'), 'map Estimate Amount → Amount');
    if (unmatched.includes('estimate_date')) await h.select('[data-map="estimate_date"]', column('Date Sent'), 'map Date Sent → Estimate date');
    const statuses = await page.locator('[data-status-map]').evaluateAll(sels => sels.map(s => ({ i: s.dataset.statusMap, label: s.closest('label').firstChild.textContent.trim(), value: s.value })));
    measure('statusesNeedingManualMeaning', statuses.filter(s => !s.value).map(s => s.label));
    for (const s of statuses.filter(s => !s.value)) await h.select(`[data-status-map="${s.i}"]`, { Pending: 'sent', Sold: 'won' }[s.label] || 'sent', `status "${s.label}" means…`);
    await h.click('[data-action="import-preview"]', 'Preview import');
    await page.locator('[data-action="import-commit"]').waitFor();
    measure('previewChips', await page.locator('.count-chips').innerText());
    await h.shot('I-import-review-1440', { fullPage: true });
    await h.click('[data-action="import-commit"]', 'Import ready estimates');
    await h.toast(/imported/);
    const w = await h.ws();
    measure('imported', w.quotes.length);
    measure('sofiaSiblingSuppressed', !w.quotes.find(q => q.estimate_id === 'E-2128').next_follow_up_date);
  });

  // ---------- A. 30 outstanding estimates: first look ----------
  await scenario('A', 'Owner has 30 outstanding estimates', { start: 'Imported pipeline: 30 sent, 2 won, 1 lost, 1 draft.', intended: 'Understand at a glance what is open, what is due and what needs a date.' }, async () => {
    await h.nav('overview');
    measure('heading', await page.locator('h1').innerText());
    measure('kpis', Object.fromEntries(await Promise.all(['open', 'due', 'unscheduled', 'won'].map(async k => [k, await page.locator(`[data-kpi="${k}"] .qt-kpi__value`).innerText()]))));
    measure('attentionRowsShown', await page.locator('.qt-attn-list [data-row]').count());
    measure('guideBanner', (await page.locator('[data-guide]').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 160));
    await h.shot('A-overview-1440');
    for (const [w, hgt] of [[820, 1180], [390, 844]]) {
      await page.setViewportSize({ width: w, height: hgt });
      const firstRow = await page.locator('.qt-attn-list [data-row]').first().boundingBox();
      measure(`firstDueRowTopAt${w}`, firstRow && Math.round(firstRow.y));
      await h.shot(`A-overview-${w}`);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    note('Overview heading states the due count; the "Needs your attention" list shows the first 6 due estimates with value, due state and last contact.');
  });

  // ---------- B. Identify today's calls ----------
  let dueOrder = [];
  await scenario('B', "Owner identifies today's calls", { start: 'Overview.', intended: 'A list of everyone to call today, most urgent first.' }, async () => {
    await h.click('.view-head [data-preset="queue:due"]', 'Open follow-up queue');
    await page.locator('#queue-tabpanel').waitFor();
    dueOrder = await h.queueIds();
    measure('dueQueue', dueOrder);
    measure('groups', await page.locator('.qt-queue-group').allInnerTexts());
    measure('phoneVisibleInQueueRow', /555-01/.test(await page.locator('#queue-tabpanel').innerText()));
    await h.shot('B-followups-due-1440');
    await page.setViewportSize({ width: 390, height: 844 }); await h.shot('B-followups-due-390', { fullPage: true }); await page.setViewportSize({ width: 1440, height: 900 });
    note('Queue is ordered by follow-up date (oldest promise first), then value. Phone numbers are not shown in queue rows; they are one Review click away (tap-to-call link in the record).');
  });

  // ---------- C. Prioritize a high-value roof job ----------
  await scenario('C', 'Owner prioritizes a high-value roof job', { start: 'Due & overdue queue.', intended: 'Find the most valuable estimate that is due today or overdue.' }, async () => {
    const w = await h.ws();
    const due = w.quotes.filter(q => dueOrder.includes(q.estimate_id)).sort((a, b) => b.amount_usd - a.amount_usd);
    measure('highestValueDue', `${due[0].estimate_id} ${due[0].customer_name} $${due[0].amount_usd}`);
    measure('positionInDueQueue', dueOrder.indexOf(due[0].estimate_id) + 1);
    measure('dueQueueLength', dueOrder.length);
    await h.nav('estimates', 'sidebar → Estimates (alternative path)');
    await h.select('#est-fu', 'due', 'filter: Due & overdue');
    await h.select('#est-sort', 'value', 'sort: highest value');
    const first = await page.locator('.qt-table tbody tr[data-row]').first().getAttribute('data-row');
    measure('estimatesListFirstRowAfterFilterAndSort', first);
    await h.shot('C-estimates-due-by-value-1440');
    note(`The due queue has no value sort. The highest-value due estimate sits at position ${dueOrder.indexOf(due[0].estimate_id) + 1} of ${dueOrder.length}; reaching it by value takes a detour through Estimates (navigate + 2 filter changes).`);
  });

  // ---------- D. Personalize a message ----------
  const target = 'E-2108';
  await scenario('D', 'Owner personalizes a message', { start: 'Estimates list filtered to due, sorted by value.', intended: 'Edit the draft, keep it, and copy it into their own email/text app. Nothing is sent or logged.' }, async () => {
    const before = (await h.events()).length;
    await h.click(`[data-row="${target}"] [data-open]`, 'open Hillcrest record');
    await page.locator('#draft-text').waitFor();
    const template = await page.locator('#draft-text').inputValue();
    measure('templateDraft', template);
    measure('draftPanelDepthAt1440', await h.drawerDepth('[data-section="draft"]'));
    await h.fill('#draft-text', template.replace('Have you had a chance to look it over?', 'I know the board votes Thursday. Happy to join by phone if questions come up about the tear-off schedule.'), 'personalize draft text');
    await h.click('[data-action="save-draft"]', 'Save draft'); await h.toast(/Draft saved/);
    await h.click('[data-action="copy-draft"]', 'Copy draft'); await h.toast(/copied/i);
    measure('clipboardMatches', (await page.evaluate(() => navigator.clipboard.readText())).includes('board votes Thursday'));
    const after = await h.events();
    measure('eventsAddedBySaveAndCopy', after.slice(before).map(e => e.type));
    measure('copyStatus', await page.locator('[data-draft-status]').innerText());
    await h.shot('D-draft-copied-1440');
  });

  // ---------- G-a. Board accepts — owner marks won directly (no contact logged first) ----------
  await scenario('G-a', 'Homeowner accepts; owner marks won directly', { start: 'Hillcrest record open; no contact logged.', intended: 'Record the win.' }, async () => {
    await h.click('[data-outcome="won"]', 'Mark won');
    measure('confirmText', await page.locator('#confirm-body').innerText());
    await h.shot('Ga-confirm-won-without-contact-1440');
    await h.click('[data-confirm-ok]', 'confirm Mark won'); await h.toast(/marked won/);
    await h.closeDrawer();
  });

  // ---------- E. Owner already called a homeowner ----------
  await scenario('E', 'Owner has already called a homeowner', { start: 'Follow-up queue, Dana overdue 6 days.', intended: 'Record the call that happened and when to call back; Dana leaves today\'s list.' }, async () => {
    await h.nav('followups', 'sidebar → Follow-ups');
    await h.review('E-2101', 'Review Dana');
    measure('contactFormDepthAt1440', await h.drawerDepth('[data-form="contact"] [type=submit]'));
    await h.select('[data-form="contact"] [name=result]', 'spoke', 'result: Spoke with customer');
    await h.fill('[data-form="contact"] [name=note]', 'Still comparing bids; wants shingle samples', 'type a note');
    await h.click('[data-form="contact"] [type=submit]', 'Record contact & next step'); await h.toast(/contact recorded/);
    const w = await h.ws();
    const dana = w.quotes.find(q => q.estimate_id === 'E-2101');
    measure('danaAfter', { next: dana.next_follow_up_date, last: dana.last_contact_date });
    note('Defaults (today, Phone, next follow-up in 3 days) make the minimum path two actions: Review → Record contact. The drawer stays on Dana afterward; reaching the next customer needs close + Review.');
    await h.closeDrawer();
    measure('danaStillInDueQueue', (await h.queueIds()).includes('E-2101'));
  });

  // ---------- F. No further contact ----------
  await scenario('F-a', 'Homeowner requests no further contact (owner marks it directly)', { start: 'Follow-up queue.', intended: 'Stop all follow-ups for this customer; keep history.' }, async () => {
    await h.review('E-2103', "Review Kevin O'Neill");
    await h.click('[data-outcome="optout"]', 'Do not contact'); await h.click('[data-confirm-ok]', 'confirm Do not contact'); await h.toast(/stopped/);
    await h.closeDrawer();
    measure('kevinInAnyQueue', (await h.queueIds()).includes('E-2103'));
  });
  await scenario('F-b', 'Homeowner asks for no further contact during a follow-up call (call logged too)', { start: 'Follow-up queue.', intended: 'Record the call that happened and the opt-out.' }, async () => {
    await h.review('E-2104', 'Review Priya');
    await h.fill('[data-form="contact"] [name=note]', 'Asked us not to call again', 'type a note');
    note('The contact form requires a next follow-up date even though the customer just opted out; the default (+3 days) is saved and then cleared by the opt-out.');
    await h.click('[data-form="contact"] [type=submit]', 'Record contact & next step'); await h.toast(/contact recorded/);
    await h.click('[data-outcome="optout"]', 'Do not contact'); await h.click('[data-confirm-ok]', 'confirm Do not contact'); await h.toast(/stopped/);
    const types = (await h.events()).filter(e => e.estimateId === 'E-2104').map(e => e.type);
    measure('priyaEvents', types);
    await h.closeDrawer();
  });

  // ---------- G-b / G-c. Accepts during a follow-up call; declines ----------
  await scenario('G-b', 'Homeowner accepts during a follow-up call (call logged, then won)', { start: 'Follow-up queue.', intended: 'Record the call and the win so Follow-up Results counts it.' }, async () => {
    await h.review('E-2102', 'Review Ruiz');
    await h.select('[data-form="contact"] [name=result]', 'spoke', 'result: Spoke with customer');
    await h.click('[data-form="contact"] [type=submit]', 'Record contact & next step'); await h.toast(/contact recorded/);
    await h.click('[data-outcome="won"]', 'Mark won'); await h.click('[data-confirm-ok]', 'confirm Mark won'); await h.toast(/marked won/);
    await h.closeDrawer();
  });
  await scenario('G-c', 'Homeowner declines', { start: 'Follow-up queue.', intended: 'Record the loss; estimate leaves every queue.' }, async () => {
    await h.review('E-2106', 'Review Tom');
    await h.click('[data-outcome="lost"]', 'Mark lost'); await h.click('[data-confirm-ok]', 'confirm Mark lost'); await h.toast(/marked lost/);
    await h.closeDrawer();
  });

  // ---------- E-2. Work the rest of today's queue (default phone contact each) ----------
  await scenario('E-2', "Owner works through the rest of today's queue", { start: 'Follow-up queue with the remaining due estimates.', intended: 'Log one call per remaining due estimate using defaults.' }, async () => {
    const remaining = await h.queueIds();
    measure('remainingDue', remaining);
    for (const id of remaining) {
      await h.review(id);
      await h.click('[data-form="contact"] [type=submit]', 'Record contact & next step'); await h.toast(/contact recorded/);
      await h.closeDrawer();
    }
    measure('dueAfter', await h.queueIds());
    measure('actionsPerEstimate', remaining.length ? Math.round(current.actions.length / remaining.length * 10) / 10 : 0);
  });

  // ---------- H. Review recorded follow-up activity ----------
  await scenario('H', 'Owner reviews recorded follow-up activity', { start: 'End of the working day.', intended: 'See what was done today and what it led to.' }, async () => {
    await h.click('[data-queue="contacted"]', 'Recently contacted tab');
    measure('recentlyContacted', (await h.queueIds()).length);
    await h.shot('H-recently-contacted-1440');
    await h.nav('results', 'sidebar → Follow-up Results');
    await page.locator('[data-results-body] .qt-results').waitFor();
    const cards = await page.locator('.qt-result').evaluateAll(els => Object.fromEntries(els.map(e => [e.querySelector('.qt-result__label').textContent, e.querySelector('strong').textContent])));
    measure('resultCards', cards);
    const me = await h.api('/me');
    const r = (await h.api(`/workspaces/${me.data.businessId}/results?from=${addDays(today, -29)}&to=${today}`)).data;
    measure('hillcrestInCohort', r.cohort.some(c => c.estimateId === 'E-2108'));
    measure('ruizCohortOutcome', r.cohort.find(c => c.estimateId === 'E-2102')?.outcome);
    await h.shot('H-results-1440', { fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 }); await h.shot('H-results-390', { fullPage: true }); await page.setViewportSize({ width: 1440, height: 900 });
    note('The $64,900 Hillcrest win (marked won without a logged contact) is absent from "Won after a recorded follow-up". The Ruiz win (call logged first) counts. Both are correct under the conservative rule, but nothing in the outcome step tells the owner which path to use.');
  });

  // ---------- I-2. Repeat import of a re-exported spreadsheet ----------
  await scenario('I-2', 'Owner re-imports the updated spreadsheet the next morning', { start: 'Workspace after a day of follow-ups; spreadsheet re-exported with 1 revised amount, 1 status change and 2 new estimates.', intended: 'Add only the new estimates and notice real source changes; never overwrite.' }, async () => {
    await h.nav('import');
    await act('upload', 'choose CSV file', () => page.locator('#csv-file').setInputFiles({ name: 'fernbrook-estimates-reexport.csv', mimeType: 'text/csv', buffer: Buffer.from(WEEK2) }));
    await page.locator('[data-action="import-preview"]').waitFor();
    for (const [k, heading] of [['amount_usd', 'Estimate Amount'], ['estimate_date', 'Date Sent']])
      if (await page.locator(`[data-map="${k}"]`).inputValue() === '') await h.select(`[data-map="${k}"]`, column(heading), `map ${heading}`);
    const statuses = await page.locator('[data-status-map]').evaluateAll(sels => sels.map(s => ({ i: s.dataset.statusMap, label: s.closest('label').firstChild.textContent.trim(), value: s.value })));
    for (const s of statuses.filter(s => !s.value)) await h.select(`[data-status-map="${s.i}"]`, { Pending: 'sent', Sold: 'won' }[s.label] || 'sent', `status "${s.label}" means…`);
    await h.click('[data-action="import-preview"]', 'Preview import');
    await page.locator('[data-action="import-commit"]').waitFor();
    measure('previewChips', await page.locator('.count-chips').innerText());
    const rows = await page.locator('.qt-import-row').evaluateAll(els => els.map(e => ({ cls: e.className.replace('qt-import-row ', ''), text: e.innerText.replace(/\s+/g, ' ').slice(0, 220) })));
    measure('protectedRows', rows.filter(r => /conflict/.test(r.cls)).map(r => r.text));
    await h.shot('I2-reimport-review-1440', { fullPage: true });
    await h.shot('I2-reimport-summary-1440');
    await page.setViewportSize({ width: 390, height: 844 }); await h.shot('I2-reimport-summary-390'); await page.setViewportSize({ width: 1440, height: 900 });
    await h.click('[data-action="import-commit"]', 'Import ready estimates'); await h.toast(/imported/);
    const w = await h.ws();
    measure('priyaAmountAfter', w.quotes.find(q => q.estimate_id === 'E-2104').amount_usd);
    measure('carlaStatusAfter', w.quotes.find(q => q.estimate_id === 'E-2113').status);
  });

  // ---------- Mobile and tablet record layout ----------
  await scenario('M', 'Record panel on tablet and phone', { start: 'Upcoming queue.', intended: 'Reach the draft, the contact form and the decision buttons on smaller screens.' }, async () => {
    for (const [w, hgt] of [[820, 1180], [390, 844]]) {
      await page.setViewportSize({ width: w, height: hgt });
      await page.goto(base + '/account#followups'); await page.locator('#queue-tabpanel').waitFor();
      await page.locator('[data-queue="upcoming"]').click();
      const id = (await h.queueIds())[0];
      await page.locator(`[data-row="${id}"] .qt-btn`).click(); await page.locator('#drawer-title').waitFor();
      measure(`depthAt${w}`, { draft: await h.drawerDepth('[data-section="draft"]'), recordContact: await h.drawerDepth('[data-form="contact"] [type=submit]'), markWon: await h.drawerDepth('[data-outcome="won"]') });
      measure(`horizontalScrollAt${w}`, await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1));
      await h.shot(`M-record-${w}`);
      await page.locator('[data-action="close-drawer"]').click();
    }
    await page.setViewportSize({ width: 1440, height: 900 });
  });
  await context.close();

  // ---------- J. Next day: restart the server and the browser one day later ----------
  await browser.close(); await stopServer(running); running = null;
  const tomorrowMs = Date.now() + 24 * 3_600_000;
  const port = await freePort();
  child = spawn(process.execPath, ['--import', './tests/helpers/freeze-clock.mjs', 'server.mjs'], { cwd: ROOT, stdio: 'ignore',
    env: { ...process.env, PORT: String(port), QUOTETEND_DB: dbPath, QUOTETEND_BACKUP_DIR: join(dir, 'backups'), QUOTETEND_FROZEN_NOW: new Date(tomorrowMs).toISOString(), NODE_ENV: '' } });
  for (let i = 0; ; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/signin`)).ok) break; } catch { /* starting */ } if (i > 100) throw new Error('day-2 server did not start'); await new Promise(r => setTimeout(r, 100)); }
  base = `http://127.0.0.1:${port}`;
  browser = await launch();
  const day2 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await day2.clock.install({ time: new Date(tomorrowMs) });
  const p2 = await day2.newPage(); p2.setDefaultTimeout(15000);
  const h2 = helpers(p2);
  await scenario('J', 'Owner returns the next day', { start: 'Signed out overnight; one business day later.', intended: "See what is due today, including callbacks promised yesterday, without re-entering anything." }, async () => {
    await p2.goto(base + '/signin');
    await h2.fill('#auth-form [name=email]', 'owner@example.com', 'email');
    await h2.fill('#auth-form [name=password]', password, 'password');
    await h2.click('#auth-submit', 'Sign in');
    await p2.waitForURL('**/account#overview'); await p2.locator('h1').waitFor();
    measure('heading', await p2.locator('h1').innerText());
    measure('kpis', Object.fromEntries(await Promise.all(['open', 'due', 'unscheduled', 'won'].map(async k => [k, await p2.locator(`[data-kpi="${k}"] .qt-kpi__value`).innerText()]))));
    await h2.shot('J-overview-next-day-1440');
    await h2.click('.view-head [data-preset="queue:due"]', 'Open follow-up queue');
    measure('dueToday', await h2.queueIds());
    await h2.click('[data-queue="contacted"]', 'Recently contacted tab');
    measure('recentlyContactedYesterday', (await h2.queueIds()).length);
    await h2.click('[data-queue="unscheduled"]', 'Needs a date tab');
    measure('needsADate', (await h2.queueIds()).length);
    note('Yesterday\'s calls moved into Upcoming with their callback dates; estimates scheduled for "tomorrow" are now due. "Needs a date" still holds the imported estimates that never got a date.');
  });
  await scenario('N', 'Owner gives each "Needs a date" estimate a first follow-up, one at a time', { start: 'Needs a date tab (estimates imported without a follow-up date).', intended: 'Every open estimate has a next step.' }, async () => {
    const ids = await h2.queueIds();
    for (const id of ids) {
      await h2.review(id);
      await h2.click('[data-form="schedule"] [type=submit]', 'Save date (suggested default)'); await h2.toast(/set for/);
      await h2.closeDrawer();
    }
    measure('scheduled', ids.length);
    measure('actionsPerEstimate', ids.length ? Math.round(current.actions.length / ids.length * 10) / 10 : 0);
    measure('needsADateAfter', (await h2.queueIds()).length);
    note('Without a follow-up column in the spreadsheet every sent estimate lands here; dating them takes about three actions each. The Sprint 4A import option sets one first follow-up date for all of them during import instead.');
  });
  await day2.close();

  // ---------- Public demo: the five-minute journey ----------
  const pub = await startPublicServer({ port: 0 });
  try {
    const demo = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await demo.route('https://formspree.io/**', r => r.abort('blockedbyclient'));
    await demo.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: pub.url.replace(/\/$/, '') });
    const dp = await demo.newPage(); dp.setDefaultTimeout(15000);
    const dh = helpers(dp);
    await scenario('DEMO-1', 'Demo: open today\'s follow-ups', { start: 'First visit to demo.html.', intended: 'Reach the due queue.' }, async () => {
      const t0 = performance.now();
      await dp.goto(pub.url + 'demo.html'); await dp.locator('h1').waitFor();
      measure('msToFirstHeading', Math.round(performance.now() - t0));
      measure('heading', await dp.locator('h1').innerText());
      measure('sideNote', await dp.locator('.app-side__note').innerText());
      await dh.shot('DEMO-overview-1440');
      await dh.click('.view-head [data-preset="queue:due"]', 'Open follow-up queue');
      measure('dueQueue', await dh.queueIds());
    });
    await scenario('DEMO-2', 'Demo: choose an important estimate, personalize and copy', { start: 'Demo due queue.', intended: 'Open the highest-value due estimate, edit and copy the draft.' }, async () => {
      await dh.click('[data-row="FR-2321"] .qt-btn', 'Review Ruiz ($38,750, overdue)');
      await dp.locator('#draft-text').waitFor();
      measure('templateDraft', await dp.locator('#draft-text').inputValue());
      await dh.fill('#draft-text', (await dp.locator('#draft-text').inputValue()).replace('Have you had a chance to look it over?', 'Any news from the HOA on the color?'), 'personalize draft');
      await dh.click('[data-action="save-draft"]', 'Save draft');
      await dh.click('[data-action="copy-draft"]', 'Copy draft'); await dh.toast(/copied/i);
      measure('copyStatus', await dp.locator('[data-draft-status]').innerText());
    });
    await scenario('DEMO-3', 'Demo: log a simulated contact and schedule the next follow-up', { start: 'Ruiz record open.', intended: 'Record the (simulated) call with a next date.' }, async () => {
      measure('contactHelp', await dp.locator('[data-section="contact"] .qt-help').innerText());
      measure('hasResultField', await dp.locator('[data-form="contact"] [name=result]').count() > 0);
      await dh.fill('[data-form="contact"] [name=note]', 'DEMO: discussed HOA timing', 'type note');
      await dh.click('[data-form="contact"] [type=submit]', 'Record contact & next step'); await dh.toast(/contact recorded/);
      measure('hasDecisionDate', await dp.locator('[data-outcome-date]').count() > 0);
      await dh.shot('DEMO-record-after-contact-1440');
      await dh.click('[data-action="close-drawer"]', 'close record');
    });
    await scenario('DEMO-4', 'Demo: inspect reported results', { start: 'Demo workspace after one logged contact.', intended: 'See the contact reflected in Follow-up Results with its caveats.' }, async () => {
      await dh.click('.app-nav a[href="#results"]', 'sidebar → Follow-up Results');
      await dp.locator('.qt-results').waitFor();
      measure('notice', await dp.locator('.qt-notice--gold').first().innerText());
      measure('subhead', await dp.locator('.view-head .sub').innerText());
      await dh.shot('DEMO-results-1440');
    });
    await scenario('DEMO-5', 'Demo: guided tour copy', { start: 'Fresh demo, tour started.', intended: 'Collect every claim the tour makes.' }, async () => {
      await dp.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
      await dp.goto(pub.url + 'demo.html?tour=1'); await dp.locator('#tour-title').waitFor();
      const steps = [];
      for (let i = 0; i < 6; i++) {
        steps.push((await dp.locator('[data-tour-dock]').innerText()).replace(/\s+/g, ' ').slice(0, 600));
        const next = dp.locator('[data-tour-act="next"]');
        if (!await next.count()) break;
        await act('click', 'tour Next', () => next.click()); await dp.waitForTimeout(250);
      }
      measure('tourText', steps);
    });
    await dp.setViewportSize({ width: 390, height: 844 });
    await dp.goto(pub.url + 'demo.html#followups'); await dp.locator('h1').waitFor();
    report.screenshots.push('DEMO-followups-390.png'); await dp.screenshot({ path: join(OUT, 'DEMO-followups-390.png'), fullPage: true });
    await demo.close();
  } finally { await pub.close(); }
} finally {
  await browser?.close().catch(() => {});
  if (running) await stopServer(running).catch(() => {});
  if (child) { child.kill(); await new Promise(r => setTimeout(r, 300)); }
  await removeDir().catch(() => {});
}

// ---------- Report ----------
await writeFile(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
const md = ['# Sprint 4A workflow audit (generated)', '', report.note, `Business day: ${report.businessDay}. Generated ${report.generatedAt}.`, '',
  '| ID | Scenario | UI actions | Scripted ms | OK |', '|---|---|---|---|---|',
  ...[...report.scenarios, ...report.demo].map(s => `| ${s.id} | ${s.title} | ${s.actions.length} | ${s.ms} | ${s.ok ? 'yes' : 'NO'} |`), '',
  ...[...report.scenarios, ...report.demo].flatMap(s => [`## ${s.id} — ${s.title}`, `- Start: ${s.start}`, `- Intended: ${s.intended}`, `- Actions (${s.actions.length}): ${s.actions.join(' → ') || '(none)'}`,
    ...Object.entries(s.measurements).map(([k, v]) => `- ${k}: ${typeof v === 'string' ? v.replace(/\n/g, ' ⏎ ') : JSON.stringify(v)}`), ...s.observations.map(o => `- Note: ${o}`), ''])];
await writeFile(join(OUT, 'report.md'), md.join('\n'));
console.log(`\nReport: ${join(OUT, 'report.md')}`);
if ([...report.scenarios, ...report.demo].some(s => !s.ok)) process.exitCode = 1;
