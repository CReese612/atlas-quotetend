// Sprint 3A: stored-XSS regression in a real browser. Hostile markup is stored in every free-text field the owner
// (or an imported file) can supply, then every private view is rendered. Nothing may execute, nothing may become
// markup, and the page must show the text literally. Content-Security-Policy would also stop inline handlers, so the
// DOM itself is inspected: an escaped payload leaves no <img>, <svg>, <script> or on* attribute behind.
// Run: node tests/security-xss-browser.mjs   (QUOTETEND_BROWSER_PATH / QUOTETEND_BROWSER select the browser)
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import bcrypt from 'bcryptjs';
import { startServer } from '../server.mjs';
import { configuration } from '../production-config.mjs';
import { demoData, todayISO, addDays } from '../domain.js';

const dir = await mkdtemp(join(tmpdir(), 'quotetend-xss-test-'));
const password = 'Fictional-xss-password-5530!', today = todayISO();
const removeDir = () => dirname(dir) === tmpdir() && basename(dir).startsWith('quotetend-xss-test-') ? rm(dir, { recursive: true, force: true }) : undefined;
const running = await startServer({ port: 0, dbPath: join(dir, 'accounts.sqlite'), logger: () => {}, config: { ...configuration({}), backupDir: join(dir, 'backups') } });
// QUOTETEND_BROWSER_TZ (an IANA name) sets the browser's own zone so runs can prove the app does not depend on it.
const BROWSER_TZ = process.env.QUOTETEND_BROWSER_TZ ? { timezoneId: process.env.QUOTETEND_BROWSER_TZ } : {};
let browser;
const stopServer = async () => { const closing = running.close(); running.server.closeAllConnections(); await closing; };
try {
  browser = await chromium.launch({ ...(process.env.QUOTETEND_BROWSER_PATH ? { executablePath: process.env.QUOTETEND_BROWSER_PATH } : { channel: process.env.QUOTETEND_BROWSER || 'msedge' }), headless: true });
} catch (error) { await stopServer(); await removeDir(); throw error; }
const failures = [];
try {
  const payloads = {
    img: `<img src=x onerror="window.__xss='img'">`, script: `"><script>window.__xss='script'</script>`, svg: `'"><svg onload="window.__xss='svg'">`,
    textarea: `</textarea><img src=x onerror="window.__xss='textarea'">`, mail: `x"onmouseover="window.__xss='mail'"@example.com`, breakout: `</li></ul><b id="injected-bold">x</b>`,
  };
  const businessName = `Fictional ${payloads.img} Roofing`.slice(0, 120);
  const owner = running.store.createOwner('xss-owner@example.com', bcrypt.hashSync(password, 4), businessName);
  const run = (kind, args = {}) => running.store.command(owner, { kind, requestId: crypto.randomUUID(), revision: running.store.workspace(owner.business_id).revision, ...args });
  const base = { ...demoData()[0], estimate_date: addDays(today, -6), history: [], saved_draft: '', last_contact_date: '', do_not_contact: false, status: 'sent' };
  run('create', { fields: { ...base, estimate_id: 'XSS-1', customer_name: payloads.img, customer_email: payloads.mail, customer_phone: '555-0123', address: payloads.script, trade: payloads.svg, job_description: payloads.textarea, notes: payloads.breakout + payloads.img, next_follow_up_date: today, amount_usd: 1234 } });
  run('create', { fields: { ...base, estimate_id: 'XSS-2', customer_name: 'Fictional Second Customer ' + payloads.svg, customer_email: 'second@example.com', job_description: payloads.script, notes: payloads.textarea, next_follow_up_date: addDays(today, -1) } });
  run('create', { fields: { ...base, estimate_id: 'XSS-3', customer_name: 'Fictional Opted Out ' + payloads.img, customer_email: 'optout@example.com', job_description: 'Opted-out job', do_not_contact: true, status: 'lost', next_follow_up_date: '', notes: payloads.script } });
  run('draft', { estimateId: 'XSS-1', text: payloads.textarea + payloads.script });
  run('contact', { estimateId: 'XSS-2', contact: { date: today, nextDate: addDays(today, 3), channel: 'Phone', note: payloads.img + payloads.svg } });
  const contact = running.store.events(owner.business_id).filter(e => e.type === 'contact_logged').at(-1);
  run('correct-contact', { estimateId: 'XSS-2', eventId: contact.id, correction: { date: today, channel: 'Email', voided: false, reason: payloads.script + payloads.img } });
  run('restore', { quotes: running.store.workspace(owner.business_id).quotes, confirmReplacement: true });

  const context = await browser.newContext({ ...BROWSER_TZ, viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const pageErrors = [], violations = [], dialogs = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  page.on('console', m => { if (/Content Security Policy|Refused to (apply|load|execute|connect)/i.test(m.text())) violations.push(m.text()); });
  page.on('dialog', async d => { dialogs.push(d.message()); await d.dismiss(); });
  page.setDefaultTimeout(10000);
  const base_url = `http://127.0.0.1:${running.port}`;
  await page.goto(base_url + '/signin');
  await page.locator('#auth-form [name=email]').fill('xss-owner@example.com');
  await page.locator('#auth-form [name=password]').fill(password);
  await page.locator('#auth-submit').click();
  await page.waitForURL('**/account#overview'); await page.locator('h1').waitFor();

  const inspect = async label => {
    await page.waitForTimeout(250);
    const report = await page.evaluate(() => ({
      flag: window.__xss ?? null,
      injected: document.querySelectorAll('img[src="x"], svg[onload], #injected-bold, [onerror], [onload], [onmouseover], [onclick], [onfocus]').length,
      scripts: [...document.scripts].filter(s => !s.src).length,
      mailtoBroken: [...document.querySelectorAll('a[href^="mailto:"]')].filter(a => a.attributes.length > 3 || a.hasAttribute('onmouseover')).length,
      text: document.body.innerText,
    }));
    const problems = [];
    if (report.flag) problems.push('payload executed: ' + report.flag);
    if (report.injected) problems.push(report.injected + ' injected element(s)/handler(s)');
    if (report.scripts) problems.push(report.scripts + ' inline script(s) in the DOM');
    if (report.mailtoBroken) problems.push('mailto attribute breakout');
    if (pageErrors.length) problems.push('page errors: ' + pageErrors.splice(0).join(' | '));
    if (violations.length) problems.push('CSP violations: ' + violations.splice(0).join(' | '));
    if (dialogs.length) problems.push('dialogs: ' + dialogs.splice(0).join(' | '));
    if (problems.length) failures.push(label + ': ' + problems.join('; ')); else console.log('PASS ' + label);
    return report;
  };
  const nav = async view => { await page.goto(`${base_url}/account#${view}`); await page.reload(); await page.locator('h1').first().waitFor(); };

  const overview = await inspect('overview, business name in the shell and workspace menu');
  assert.ok(overview.text.includes('<img src=x'), 'hostile business name is displayed as literal text, not markup');
  for (const view of ['estimates', 'followups', 'results', 'import', 'settings']) { await nav(view); await inspect(view + ' view'); }
  await nav('estimates');
  for (const id of ['XSS-1', 'XSS-2', 'XSS-3']) {
    await page.locator(`[data-open="${id}"]`).first().click(); await page.locator('#drawer-title').waitFor();
    const detail = await inspect('estimate detail ' + id);
    if (id === 'XSS-1') assert.ok(detail.text.includes('<img src=x') && detail.text.includes('<script>'), 'detail shows hostile strings as text');
    await page.locator('[data-action="close-drawer"]').click(); await page.locator('[data-drawer]').waitFor({ state: 'hidden' });
  }
  await page.goto(`${base_url}/account#estimates/XSS-2`); await page.reload(); await page.locator('#drawer-title').waitFor();
  await inspect('deep-linked detail with activity timeline and contact correction list');
  await page.goto(`${base_url}/account#estimates`); await page.reload();
  await page.locator('[data-action="add"]').first().click(); await page.locator('form[data-form="estimate"]').waitFor();
  await inspect('add-estimate editor');
  await page.keyboard.press('Escape');
  await nav('settings');
  await page.locator('[data-action="snapshots"]').click(); await page.locator('.snapshot-list').first().waitFor();
  await inspect('safety-copy list');
  await page.locator('[data-action="export-json"]').click(); await page.waitForTimeout(300); await inspect('export dialog');
  // Hostile CSV pasted into the import preview (names, notes and an e-mail attempt at attribute breakout).
  await nav('import');
  await page.getByText('Or paste CSV text', { exact: true }).click();
  const csv = ['estimate_id,customer_name,customer_email,job_description,amount_usd,estimate_date,status,next_follow_up_date,last_contact_date,do_not_contact,notes',
    `XSS-CSV,"${payloads.img.replaceAll('"', '""')}","${payloads.mail.replaceAll('"', '""')}","${payloads.script.replaceAll('"', '""')}",100.00,${addDays(today, -2)},sent,${today},,false,"${payloads.textarea.replaceAll('"', '""')}"`].join('\n');
  await page.locator('#paste-csv').fill(csv); await page.locator('[data-action="inspect-paste"]').click();
  await page.locator('[data-action="import-preview"]').waitFor(); await inspect('import column mapping');
  await page.locator('[data-action="import-preview"]').click(); await page.waitForTimeout(500); await inspect('import review with hostile rows');
  // The sign-in page reflects nothing from its query string.
  await context.clearCookies();
  await page.goto(`${base_url}/signin?changed=1&error=${encodeURIComponent(payloads.img)}&next=${encodeURIComponent('javascript:window.__xss=1')}`); await page.locator('#auth-form').waitFor();
  await inspect('sign-in page with hostile query string');
  await context.close();
  if (failures.length) { console.error('\nXSS FAILURES:\n- ' + failures.join('\n- ')); process.exitCode = 1; } else console.log('\nAll XSS browser checks passed.');
} finally {
  await browser.close(); await stopServer(); await removeDir();
}
