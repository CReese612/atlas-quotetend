// Sprint 3A.2: a workspace export that QuoteTend ACCEPTS must stay usable after it is restored. History entries in older
// exports can carry timestamps with no time zone ("2030-07-10T12:00:00"), a bare date, or a space separator; the importer
// accepts them, so the screens must render them (Sprint 3A.1 regressed this: the page stayed on "Loading your workspace…").
// The restore is driven through the real Settings dialog in a real browser, then every area is visited, the page is
// reloaded, and the owner signs out and in again. Fictional data only.
// Run: node tests/restore-history-browser.mjs   (QUOTETEND_TEST_TZ / QUOTETEND_BROWSER_TZ select the server and browser zones)
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import bcrypt from 'bcryptjs';
import { startServer } from '../server.mjs';
import { configuration } from '../production-config.mjs';
import { demoData, addDays, todayISO } from '../domain.js';

const dir = await mkdtemp(join(tmpdir(), 'quotetend-restore-test-')), password = 'Fictional-restore-password-3318!', today = todayISO();
const logs = [];
const running = await startServer({ port: 0, dbPath: join(dir, 'accounts.sqlite'), logger: entry => logs.push(entry), config: { ...configuration({}), backupDir: join(dir, 'backups') } });
const stopServer = async () => { const closing = running.close(); running.server.closeAllConnections(); await closing; };
const removeDir = () => dirname(dir) === tmpdir() && basename(dir).startsWith('quotetend-restore-test-') ? rm(dir, { recursive: true, force: true }) : undefined;
// QUOTETEND_BROWSER_TZ (an IANA name) sets the browser's own zone so runs can prove the app does not depend on it.
const BROWSER_TZ = process.env.QUOTETEND_BROWSER_TZ ? { timezoneId: process.env.QUOTETEND_BROWSER_TZ } : {};
let browser;
try { browser = await chromium.launch({ ...(process.env.QUOTETEND_BROWSER_PATH ? { executablePath: process.env.QUOTETEND_BROWSER_PATH } : { channel: process.env.QUOTETEND_BROWSER || 'msedge' }), headless: true }); }
catch (error) { await stopServer(); await removeDir(); throw error; }
const failures = [], passed = [];
try {
  // The workspace that exists BEFORE the restore, so the safety copy has something to hold.
  const owner = running.store.createOwner('restore-owner@example.com', bcrypt.hashSync(password, 4), 'Fictional Restore Roofing');
  running.store.command(owner, { kind: 'create', requestId: crypto.randomUUID(), revision: 0, fields: { ...demoData()[0], estimate_id: 'BEFORE-1', customer_name: 'Fictional Before Customer', history: [], saved_draft: '', last_contact_date: '', do_not_contact: false, status: 'sent', estimate_date: addDays(today, -9), next_follow_up_date: today } });

  const base = { ...demoData()[0], status: 'sent', do_not_contact: false, saved_draft: '', last_contact_date: '', estimate_date: addDays(today, -40), next_follow_up_date: '' };
  // What each history entry must be dated as on screen: the written date for date-only and zone-less values (nothing is
  // invented), the Oregon business day for values that carry an offset, and an explicit civil date always wins.
  const HISTORY = [
    { entry: { type: 'contact', text: 'Phone contact recorded — legacy zone-less timestamp', at: '2030-07-10T12:00:00' }, day: 'Wed, Jul 10, 2030' },
    { entry: { type: 'update', text: 'Legacy date-only timestamp', at: '2030-07-09' }, day: 'Tue, Jul 9, 2030' },
    { entry: { type: 'update', text: 'Legacy zone-less timestamp with milliseconds', at: '2030-07-08T23:59:59.999' }, day: 'Mon, Jul 8, 2030' },
    { entry: { type: 'update', text: 'Legacy space-separated timestamp', at: '2030-07-07 08:30:00' }, day: 'Sun, Jul 7, 2030' },
    { entry: { type: 'update', text: 'UTC instant that is still the 11th in Oregon', at: '2030-07-12T05:30:00.000Z' }, day: 'Thu, Jul 11, 2030' },
    { entry: { type: 'update', text: 'Offset instant that is still the 11th in Oregon', at: '2030-07-12T09:00:00+05:30' }, day: 'Thu, Jul 11, 2030' },
    { entry: { type: 'contact', text: 'Email contact with an explicit civil date', at: '2030-07-12T05:30:00.000Z', date: '2030-07-12' }, day: 'Fri, Jul 12, 2030' },
  ];
  const exported = { version: 1, exported_at: '2030-07-13T00:00:00.000Z', business: 'Fictional Restore Roofing', quotes: [
    { ...base, estimate_id: 'LEGACY-1', customer_name: 'Fictional Legacy Customer', customer_email: 'legacy.customer@example.com', notes: 'Legacy note kept verbatim', saved_draft: 'Legacy draft kept verbatim', next_follow_up_date: addDays(today, -1), history: HISTORY.map(h => h.entry) },
    { ...base, estimate_id: 'LEGACY-2', customer_name: 'Fictional Opted Out Customer', customer_email: 'opted.out@example.com', do_not_contact: true, status: 'lost', notes: 'Asked not to be contacted', history: [{ type: 'optout', text: 'Customer opted out; follow-ups stopped', at: '2030-06-30T08:15:00' }] },
    { ...base, estimate_id: 'LEGACY-3', customer_name: 'Fictional Upcoming Customer', customer_email: 'upcoming@example.com', next_follow_up_date: addDays(today, 2), history: [] },
  ] };

  const context = await browser.newContext({ ...BROWSER_TZ, viewport: { width: 1440, height: 900 } });
  const page = await context.newPage(); page.setDefaultTimeout(10000);
  const pageErrors = [], serverErrors = [], badResponses = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  page.on('response', r => { if (r.url().includes('/api/') && r.status() >= 500) serverErrors.push(r.status() + ' ' + r.url()); });
  const step = async (label, fn) => {
    try { await fn(); if (pageErrors.length) throw new Error('page error: ' + pageErrors.join(' | ')); if (serverErrors.length) throw new Error('server error: ' + serverErrors.join(' | ')); passed.push(label); console.log('PASS ' + label); }
    catch (error) {
      const detail = [error.message.split('\n')[0], ...pageErrors.map(e => 'page error: ' + e), ...serverErrors.map(e => 'server error: ' + e)].join(' | ');
      failures.push(`${label}: ${detail}`); console.error('FAIL ' + label + ': ' + detail); pageErrors.length = 0; serverErrors.length = 0;
    }
  };
  const api = (path, method = 'GET', body) => page.evaluate(async ({ path, method, body }) => {
    const r = await fetch('/api' + path, { method, headers: { 'Content-Type': 'application/json', 'X-QuoteTend-Request': '1' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: r.status, data: await r.json().catch(() => null) };
  }, { path, method, body });
  const go = async view => { await page.goto(`http://127.0.0.1:${running.port}/account#${view}`); await page.reload(); await page.locator('h1').first().waitFor(); };
  const signIn = async () => {
    await page.goto(`http://127.0.0.1:${running.port}/signin`);
    await page.locator('#auth-form [name=email]').fill('restore-owner@example.com'); await page.locator('#auth-form [name=password]').fill(password);
    await page.locator('#auth-submit').click(); await page.waitForURL('**/account#overview'); await page.locator('h1').waitFor();
  };

  await step('sign in to the pre-restore workspace', signIn);
  await step('restore the accepted export through the Settings dialog', async () => {
    await go('settings');
    await page.locator('#restore-file').setInputFiles({ name: 'fictional-legacy-export.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(exported)) });
    await page.locator('[data-confirm-ok]').click();
    await page.waitForFunction(() => /Workspace restored|Could not restore/.test(document.querySelector('[data-toast]')?.textContent || ''));
    assert.match(await page.locator('[data-toast]').innerText(), /Workspace restored/);
  });
  await step('the overview renders after the restore and after a reload', async () => {
    await go('overview'); assert.ok((await page.locator('h1').first().innerText()).length > 0);
    await page.locator('[data-kpi="due"]').waitFor();
    assert.match(await page.locator('main').innerText(), /Fictional Legacy Customer/, 'recent activity from the restored history is listed');
  });
  await step('estimate details and the full activity history render with the documented dates', async () => {
    await go('estimates'); await page.locator('[data-open="LEGACY-1"]').first().click(); await page.locator('#drawer-title').waitFor();
    const timeline = await page.locator('.qt-timeline').innerText();
    for (const { entry, day } of HISTORY) { assert.ok(timeline.includes(entry.text), 'entry missing: ' + entry.text); assert.ok(new RegExp(day.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' · ').test(timeline), `"${entry.text}" should be dated ${day}.\n${timeline}`); }
    assert.equal(await page.locator('.qt-timeline__item').count(), HISTORY.length);
    await page.locator('[data-action="close-drawer"]').click();
    await page.locator('[data-open="LEGACY-2"]').first().click(); await page.locator('#drawer-title').waitFor();
    assert.match(await page.locator('.qt-timeline').innerText(), /opted out; follow-ups stopped[\s\S]*Jun 30, 2030/);
    await page.locator('[data-action="close-drawer"]').click();
  });
  await step('follow-ups and Follow-up Results render', async () => {
    await go('followups'); assert.match(await page.locator('main').innerText(), /Fictional Legacy Customer/);
    await go('results'); await page.locator('[data-weekly-coverage]').waitFor();
  });
  await step('Settings and the safety-copy list render and hold the pre-restore workspace', async () => {
    await go('settings'); await page.locator('[data-action="snapshots"]').click(); await page.locator('.snapshot-list').first().waitFor();
    assert.equal(await page.locator('[data-action="snapshot-download"]').count(), 1);
    const me = (await api('/me')).data, list = (await api(`/workspaces/${me.businessId}/snapshots`)).data;
    assert.equal(list.length, 1);
    const copy = (await api(`/workspaces/${me.businessId}/snapshots/${list[0].id}`)).data;
    assert.deepEqual(copy.quotes.map(q => q.estimate_id), ['BEFORE-1'], 'the safety copy is the pre-restore workspace');
  });
  await step('reload, sign out and sign in again: the workspace still renders', async () => {
    await go('overview'); await page.reload(); await page.locator('h1').first().waitFor();
    await go('settings'); await page.locator('[data-action="sign-out"]:visible').first().click(); await page.waitForURL('**/signin**');
    await signIn(); await go('estimates'); await page.locator('[data-open="LEGACY-1"]').first().waitFor();
  });
  await step('stored records, opt-outs and event attribution are exactly what was restored', async () => {
    const me = (await api('/me')).data, workspace = (await api(`/workspaces/${me.businessId}`)).data, events = (await api(`/workspaces/${me.businessId}/events`)).data;
    assert.deepEqual(workspace.quotes.map(q => q.estimate_id).sort(), ['LEGACY-1', 'LEGACY-2', 'LEGACY-3']);
    const legacy = workspace.quotes.find(q => q.estimate_id === 'LEGACY-1');
    assert.deepEqual(legacy.history, HISTORY.map(h => h.entry), 'history is preserved byte for byte: nothing rewritten, no zone invented, nothing dropped');
    assert.equal(legacy.notes, 'Legacy note kept verbatim'); assert.equal(legacy.saved_draft, 'Legacy draft kept verbatim');
    assert.equal(workspace.quotes.find(q => q.estimate_id === 'LEGACY-2').do_not_contact, true);
    assert.deepEqual(workspace.retainedOptOuts, ['email:opted.out@example.com'], 'the retained opt-out preference is kept');
    const restored = events.find(e => e.type === 'workspace_restored');
    assert.ok(restored && restored.actorId === running.store.ownerByEmail('restore-owner@example.com').id && restored.data.count === 3);
    assert.equal(workspace.measurement.epoch, 2);
    assert.ok(!logs.some(e => e.event === 'request_failed'), 'no server fault was logged');
  });
  await context.close();
  if (failures.length) { console.error('\nRESTORE FAILURES:\n- ' + failures.join('\n- ')); process.exitCode = 1; } else console.log(`\n${passed.length} restore/render checks passed.`);
} finally { await browser.close(); await stopServer(); await removeDir(); }
