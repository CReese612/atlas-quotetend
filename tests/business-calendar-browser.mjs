// Sprint 3A.1: the Oregon business day in a real browser, with the clock frozen and the SERVER and the BROWSER set to
// deliberately different zones (neither is Pacific). The UI must show the same business-day results in every scenario.
// Instants are in the real future on purpose: Chromium expires cookies against the real clock, so a frozen date in the past would drop the session cookie.
// The server runs as a separate process (frozen clock + chosen zone); the browser's clock and zone are set by Playwright.
// Run: node tests/business-calendar-browser.mjs   (QUOTETEND_BROWSER_PATH / QUOTETEND_BROWSER select the browser)
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mock } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import bcrypt from 'bcryptjs';
import { openAccounts } from '../account-store.mjs';
import { demoData, addDays } from '../domain.js';

const password = 'Fictional-calendar-password-6641!';
// frozen instant, Oregon business day at that instant, server process zone, browser zone
const SCENARIOS = [
  { label: 'Oregon 22:30 while Chicago and UTC are already tomorrow', now: '2026-10-14T05:30:00.000Z', today: '2026-10-13', short: 'Oct 13', tomorrow: 'Oct 14', serverTz: 'America/Chicago', browserTz: 'Pacific/Kiritimati' },
  { label: 'one second before Pacific midnight (PST)', now: '2026-12-15T07:59:59.000Z', today: '2026-12-14', short: 'Dec 14', tomorrow: 'Dec 15', serverTz: 'Pacific/Kiritimati', browserTz: 'UTC' },
  { label: 'spring-forward morning 2027, 03:00 PDT', now: '2027-03-14T10:00:00.000Z', today: '2027-03-14', short: 'Mar 14', tomorrow: 'Mar 15', serverTz: 'UTC', browserTz: 'America/Chicago' },
];
const freePort = () => new Promise((resolve, reject) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); }); s.on('error', reject); });

const browser = await chromium.launch({ ...(process.env.QUOTETEND_BROWSER_PATH ? { executablePath: process.env.QUOTETEND_BROWSER_PATH } : { channel: process.env.QUOTETEND_BROWSER || 'msedge' }), headless: true });
const failures = [];
try {
  for (const s of SCENARIOS) {
    const dir = await mkdtemp(join(tmpdir(), 'quotetend-calendar-browser-')), dbPath = join(dir, 'accounts.sqlite');
    let child, context;
    try {
      // Seed at the frozen instant so every stored timestamp and default date matches what the server will see.
      mock.timers.enable({ apis: ['Date'], now: Date.parse(s.now) });
      const store = openAccounts(dbPath), owner = store.createOwner('oregon-browser@example.com', bcrypt.hashSync(password, 4), 'Fictional Oregon Roofing');
      const base = { ...demoData()[0], status: 'sent', do_not_contact: false, history: [], saved_draft: '', last_contact_date: '', estimate_date: addDays(s.today, -20) };
      for (const [id, next] of [['BC-OVERDUE', addDays(s.today, -1)], ['BC-DUE', s.today], ['BC-TOMORROW', addDays(s.today, 1)]])
        store.command(owner, { kind: 'create', requestId: crypto.randomUUID(), revision: store.workspace(owner.business_id).revision, fields: { ...base, estimate_id: id, customer_name: 'Fictional ' + id, customer_email: id.toLowerCase() + '@example.com', next_follow_up_date: next } });
      store.close(); mock.timers.reset();

      const port = await freePort();
      child = spawn(process.execPath, ['--import', './tests/helpers/set-timezone.mjs', '--import', './tests/helpers/freeze-clock.mjs', 'server.mjs'], { stdio: 'ignore',
        env: { ...process.env, PORT: String(port), QUOTETEND_DB: dbPath, QUOTETEND_BACKUP_DIR: join(dir, 'backups'), QUOTETEND_TEST_TZ: s.serverTz, QUOTETEND_FROZEN_NOW: s.now, NODE_ENV: '' } });
      const exited = new Promise(resolve => child.on('exit', resolve));
      for (let i = 0; ; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/signin`)).ok) break; } catch { /* not listening yet */ } if (i > 100) throw new Error('server did not start'); await new Promise(r => setTimeout(r, 100)); }
      const base_url = `http://127.0.0.1:${port}`;

      context = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: s.browserTz });
      await context.clock.setFixedTime(new Date(s.now));
      const page = await context.newPage(); page.setDefaultTimeout(10000);
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      const api = (path, method = 'GET', body) => page.evaluate(async ({ path, method, body }) => {
        const r = await fetch('/api' + path, { method, headers: { 'Content-Type': 'application/json', 'X-QuoteTend-Request': '1' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
        return { status: r.status, data: await r.json().catch(() => null) };
      }, { path, method, body });

      const label = `${s.label} [server ${s.serverTz}, browser ${s.browserTz}]`;
      // Browser and server agree on the business day: the page's own idea of "now" and the clock the server froze.
      await page.goto(base_url + '/signin');
      assert.equal(await page.evaluate(() => new Date().toISOString()), s.now, 'browser clock is frozen at the instant');
      assert.equal(await page.evaluate(async () => (await import('/domain.js')).todayISO()), s.today, label + ': browser todayISO');
      await page.locator('#auth-form [name=email]').fill('oregon-browser@example.com');
      await page.locator('#auth-form [name=password]').fill(password);
      await page.locator('#auth-submit').click();
      await page.waitForURL('**/account#overview'); await page.locator('h1').waitFor();

      // Due and overdue are judged on the Oregon day: overdue + due today count, "tomorrow" does not.
      assert.equal(await page.locator('[data-kpi="due"] .qt-kpi__value').innerText(), '2', label + ': due & overdue count');
      const me = (await api('/me')).data, workspace = '/workspaces/' + me.businessId;
      // The contact form defaults to the Oregon day and refuses later dates.
      await page.goto(`${base_url}/account#estimates/BC-DUE`); await page.reload(); await page.locator('#drawer-title').waitFor();
      const form = page.locator('[data-form="contact"]');
      assert.equal(await form.locator('[name=date]').inputValue(), s.today, label + ': default contact date');
      assert.equal(await form.locator('[name=date]').getAttribute('max'), s.today, label + ': latest contact date');
      assert.equal(await form.locator('[name=nextDate]').inputValue(), addDays(s.today, 3), label + ': default next follow-up');
      await form.locator('button[type=submit]').click();
      await page.waitForFunction(() => /contact recorded/i.test(document.querySelector('[data-toast]')?.textContent || ''));
      const events = (await api(workspace + '/events')).data, contact = events.filter(e => e.type === 'contact_logged').at(-1);
      assert.equal(contact.effectiveDate, s.today, label + ': stored effective date of the contact');
      assert.equal(contact.recordedAt, s.now, label + ': recorded timestamp stays the UTC instant');
      // Report ranges follow the Oregon day; the server's asOf agrees with the browser.
      const ok = await api(workspace + `/results?from=${addDays(s.today, -29)}&to=${s.today}`), future = await api(workspace + `/results?from=${addDays(s.today, -29)}&to=${addDays(s.today, 1)}`);
      assert.equal(ok.status, 200); assert.equal(ok.data.asOf, s.today, label + ': server asOf'); assert.equal(future.status, 400, label + ': a range ending after the Oregon day is refused');
      assert.equal(ok.data.counts.contacts, 1);
      // The Results page says the period began on the Oregon day, never the UTC/Chicago/Kiritimati day.
      await page.goto(`${base_url}/account#results`); await page.reload(); await page.locator('[data-weekly-coverage]').waitFor();
      const text = await page.locator('main').innerText();
      assert.ok(text.includes(`began ${s.short}`), `${label}: results page should say the period began ${s.short}. Page text: ${text.match(/began[^.]*/)?.[0]}`);
      assert.ok(!text.includes(`began ${s.tomorrow}`), label + ': never "began tomorrow"');
      assert.match(await page.locator('[data-weekly-coverage]').innerText(), new RegExp(`began ${s.short}`));
      assert.deepEqual(errors, [], label + ': no page errors');
      console.log('PASS ' + label);
    } catch (error) { failures.push(`${s.label}: ${error.message}`); console.error('FAIL ' + s.label + ': ' + error.message); }
    finally {
      mock.timers.reset();
      await context?.close();
      if (child && child.exitCode === null) { child.kill(); await new Promise(resolve => child.once('exit', resolve)); }
      if (dirname(dir) === tmpdir() && basename(dir).startsWith('quotetend-calendar-browser-')) await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }
} finally { await browser.close(); }
if (failures.length) { console.error('\nCALENDAR FAILURES:\n- ' + failures.join('\n- ')); process.exitCode = 1; } else console.log(`\n${SCENARIOS.length} business-calendar browser scenarios passed.`);
