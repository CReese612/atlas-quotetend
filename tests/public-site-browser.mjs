// Browser regression for the public website and interactive demo.
// Uses disposable headless contexts (installed Microsoft Edge by default; set QUOTETEND_BROWSER=chrome
// to use Chrome). Never attaches to the user's browser profile. Screenshots go to test-results/public-site/.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { startPublicServer } from '../public-site/serve.mjs';
import { createWorkspace, metrics, pipelineByState, todayISO, addDays } from '../public-site/assets/js/workspace.js';

const OUT = fileURLToPath(new URL('../test-results/public-site/', import.meta.url));
await mkdir(OUT, { recursive: true });
const today = todayISO();
const seed = createWorkspace(today);
const usd = n => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
const M = metrics(seed.quotes, today), S = pipelineByState(seed.quotes, today);

const server = await startPublicServer({ port: 0 });
const base = server.url;
const browser = await chromium.launch({ channel: process.env.QUOTETEND_BROWSER || 'msedge', headless: true });
const results = [];
const shots = [];

async function group(name, fn) {
  const started = Date.now();
  try { await fn(); results.push({ ok: true, name, ms: Date.now() - started }); console.log(`PASS  ${name}`); }
  catch (error) { results.push({ ok: false, name, error }); console.log(`FAIL  ${name}\n      ${error.message.split('\n').join('\n      ')}`); }
}

// Fresh context per scenario; collect page errors and console errors (font CDN failures are tolerated
// so the suite can run offline).
async function open(path, { width = 1440, height = 900, mobile = false, reducedMotion = 'no-preference', clipboard = false, config } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, isMobile: mobile, hasTouch: mobile, reducedMotion });
  if (clipboard) await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base.replace(/\/$/, '') });
  if (config) await context.route('**/assets/js/site-config.js', route => route.fulfill({ contentType: 'text/javascript', body: `export const SITE_CONFIG = Object.freeze(${JSON.stringify({ contactEmail: '', bookingUrl: '', formEndpoint: '', ...config })});` }));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)/.test(m.text() + (m.location()?.url || ''))) errors.push(`console: ${m.text()}`); });
  page.on('requestfailed', r => { if (!/fonts\.(googleapis|gstatic)/.test(r.url()) && !r.url().startsWith('mailto:')) errors.push(`requestfailed: ${r.url()}`); });
  page.setDefaultTimeout(8000);
  await page.goto(base + path, { waitUntil: 'networkidle' });
  return { context, page, errors };
}
const noErrors = errors => assert.deepEqual(errors, [], `browser errors:\n${errors.join('\n')}`);
const noOverflow = async page => {
  const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  assert.ok(sw <= iw, `horizontal overflow: page is ${sw}px wide in a ${iw}px viewport`);
};
async function shot(page, name, opts = {}) {
  await page.evaluate(() => document.querySelectorAll('.reveal').forEach(e => e.classList.add('is-in')));
  await page.waitForTimeout(250);
  const path = `${OUT}${name}.png`;
  await page.screenshot({ path, ...opts });
  shots.push(path);
}
const text = (page, sel) => page.locator(sel).first().innerText();
const count = (page, sel) => page.locator(sel).count();
const dueBadge = async page => (await text(page, '.app-nav a[href="#followups"] em')).replace(/\D/g, '');

try {
  // ---------------- Website ----------------
  await group('homepage renders product visuals from live demo data without errors (1440px)', async () => {
    const { context, page, errors } = await open('');
    assert.match(await text(page, 'h1'), /Your next job might already be in\s+your estimates\./);
    for (const name of ['hero', 'scatter', 'sorted', 'estimates', 'queue', 'draft', 'contact', 'results', 'import', 'showcase']) {
      assert.ok(await page.locator(`[data-shot="${name}"] *`).count() > 3, `${name} visual rendered`);
    }
    assert.equal(await text(page, '[data-fill="openValue"]'), usd(M.openValue));
    assert.equal(await text(page, '[data-fill="overdueValue"]'), usd(S.overdue.value));
    assert.equal(await page.locator('[data-shot] [id]').count(), 0, 'decorative previews carry no duplicate ids');
    assert.equal(await page.locator('[data-shot="hero"][inert]').count(), 1, 'previews are inert');
    await noOverflow(page);
    await shot(page, 'home-desktop-1440');
    await shot(page, 'home-desktop-1440-full', { fullPage: true });
    noErrors(errors); await context.close();
  });

  await group('homepage hero is complete at 1920px', async () => {
    const { context, page, errors } = await open('', { width: 1920, height: 1080 });
    const box = await page.locator('.hero-actions .btn--primary').boundingBox();
    assert.ok(box.y + box.height < 1080, 'primary CTA visible in the first screen');
    const visual = await page.locator('.hero-visual .window').boundingBox();
    assert.ok(visual.width > 700 && visual.y < 400, 'product window is large and high on the page');
    await noOverflow(page);
    await shot(page, 'home-desktop-1920');
    noErrors(errors); await context.close();
  });

  await group('every link on the homepage resolves; CTAs reach the demo (Sprint 1 failure path)', async () => {
    const { context, page, errors } = await open('');
    const hrefs = await page.$$eval('a[href]', as => as.map(a => ({ raw: a.getAttribute('href'), abs: a.href })));
    for (const { raw, abs } of hrefs) {
      assert.doesNotMatch(raw, /^(https?:|file:|javascript:)|localhost|127\.0\.0\.1/, `unexpected link ${raw}`);
      assert.doesNotMatch(raw, /^mailto:/, 'no email link is shown while contact is unconfigured');
      if (raw.startsWith('#')) { assert.ok(await page.locator(raw).count(), `missing anchor ${raw}`); continue; }
      const res = await page.request.get(abs);
      assert.equal(res.status(), 200, `${raw} -> ${res.status()}`);
    }
    // The browser's automatic favicon request crashed the Sprint 1 server; make sure the next click still works.
    assert.equal((await page.request.get(base + 'favicon.ico')).status(), 404);
    assert.equal(await page.locator('.header-cta .btn--primary').getAttribute('href'), 'demo.html');
    assert.equal(await page.locator('.hero-actions .btn--primary').getAttribute('href'), 'demo.html');
    assert.equal(await page.locator('#demo .showcase-actions .btn--primary').getAttribute('href'), 'demo.html?tour=1');
    await page.locator('.hero-actions .btn--primary').click();
    await page.waitForURL('**/demo.html');
    await page.locator('[data-main] h1').waitFor();
    assert.match(await text(page, '[data-main] h1'), /follow-ups need attention/);
    await page.goBack(); await page.locator('#hero-title').waitFor();
    await page.locator('.nav-links a[href="#faq"]').click();
    await page.waitForFunction(() => document.activeElement?.id === 'faq');
    await page.locator('.faq-item summary').first().click();
    assert.equal(await page.locator('.faq-item').first().getAttribute('open'), '');
    noErrors(errors); await context.close();
  });

  await group('calculator updates from slider input and stays labeled as arithmetic', async () => {
    const { context, page, errors } = await open('');
    await page.locator('#calc-count').fill('60');
    await page.locator('#calc-avg').fill('20000');
    await page.locator('#calc-share').fill('50');
    assert.equal(await text(page, '[data-out="total"]'), '$600,000');
    assert.equal(await text(page, '[data-out="open"]'), '30');
    assert.match(await text(page, '.calc-result small'), /not a forecast or a promise/);
    noErrors(errors); await context.close();
  });

  await group('early access: unconfigured shows no form, no address, and an honest message', async () => {
    const { context, page, errors } = await open('');
    assert.equal(await page.locator('[data-early-form]').count(), 0);
    assert.match(await text(page, '[data-early] h3'), /open soon/);
    assert.equal(await page.locator('a[href^="mailto:"]').count(), 0);
    assert.match(await text(page, '.config-hint'), /site-config\.js/, 'local preview explains the missing configuration');
    noErrors(errors); await context.close();
  });

  await group('early access: email mode never claims delivery', async () => {
    const { context, page, errors } = await open('', { config: { contactEmail: 'fixture-owner@quotetend-fixture.net' } });
    await page.locator('#early-access').scrollIntoViewIfNeeded();
    await page.locator('[data-early-form] button[type="submit"]').click();
    assert.match(await text(page, '[data-form-status]'), /fill in your name/);
    assert.equal(await page.locator('[data-early-form] [name="name"]').getAttribute('aria-invalid'), 'true');
    await page.locator('[name="name"]').fill('Fictional Owner');
    await page.locator('[name="company"]').fill('Fictional Roofing Co');
    await page.locator('[name="email"]').fill('owner@fictional-roofing.net');
    await page.locator('[name="trade"]').selectOption('Roofing');
    await page.locator('[data-early-form] button[type="submit"]').click();
    const status = await text(page, '[data-form-status]');
    assert.match(status, /has not been sent yet/);
    assert.doesNotMatch(status, /received|sent successfully|thank/i);
    assert.equal(await page.locator('a[href="mailto:fixture-owner@quotetend-fixture.net"]').count() >= 1, true);
    noErrors(errors); await context.close();
  });

  await group('early access: endpoint mode reports success only on a 2xx response', async () => {
    const { context, page, errors } = await open('', { config: { formEndpoint: 'https://forms.quotetend-fixture.net/early-access' } });
    const bodies = [];
    let status = 200;
    await page.route('https://forms.quotetend-fixture.net/**', route => { bodies.push(route.request().postDataJSON()); route.fulfill({ status, body: '{}' }); });
    const fill = async () => {
      await page.locator('[name="name"]').fill('Fictional Owner'); await page.locator('[name="company"]').fill('Fictional Roofing Co');
      await page.locator('[name="email"]').fill('owner@fictional-roofing.net'); await page.locator('[name="trade"]').selectOption('Siding');
    };
    status = 503; await fill(); await page.locator('[data-early-form] button[type="submit"]').click();
    await page.waitForFunction(() => /could not be sent/.test(document.querySelector('[data-form-status]').textContent));
    assert.doesNotMatch(await text(page, '[data-form-status]'), /received/);
    status = 200; await page.locator('[data-early-form] button[type="submit"]').click();
    await page.waitForFunction(() => /was received/.test(document.querySelector('[data-form-status]').textContent));
    assert.equal(bodies.length, 2); assert.equal(bodies[1].company, 'Fictional Roofing Co'); assert.equal(bodies[1].source, 'quotetend-website');
    noErrors(errors.filter(e => !/status of 503/.test(e))); // the 503 is the failure this group simulates
    await context.close();
  });

  await group('homepage mobile (390px): no overflow, working menu, readable hero', async () => {
    const { context, page, errors } = await open('', { width: 390, height: 844, mobile: true });
    await noOverflow(page);
    const btn = page.locator('[data-menu-btn]');
    assert.equal(await btn.getAttribute('aria-expanded'), 'false');
    await btn.click();
    assert.equal(await btn.getAttribute('aria-expanded'), 'true');
    assert.ok(await page.locator('#mobile-menu').isVisible());
    await page.keyboard.press('Escape');
    assert.ok(await page.locator('#mobile-menu').isHidden());
    await shot(page, 'home-mobile-390');
    await shot(page, 'home-mobile-390-full', { fullPage: true });
    await btn.click(); await page.locator('#mobile-menu a[href="#how"]').click();
    assert.ok(await page.locator('#mobile-menu').isHidden(), 'menu closes after navigation');
    noErrors(errors); await context.close();
  });

  await group('keyboard: skip links work and focus is visible on both pages', async () => {
    for (const [path, target] of [['', 'main'], ['demo.html', 'app-main']]) {
      const { context, page, errors } = await open(path);
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement?.textContent.trim()), 'Skip to content');
      const outline = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
      assert.notEqual(outline, 'none', 'focused control shows an outline');
      await page.keyboard.press('Enter');
      await page.waitForFunction(id => document.activeElement?.id === id, target);
      noErrors(errors); await context.close();
    }
  });

  await group('reduced motion: content is visible without scroll animations', async () => {
    const { context, page, errors } = await open('', { reducedMotion: 'reduce' });
    const opacity = await page.locator('#faq .faq-aside').evaluate(el => getComputedStyle(el).opacity);
    assert.equal(opacity, '1');
    noErrors(errors); await context.close();
  });

  // ---------------- Demo ----------------
  await group('demo dashboard: fictional labeling and metrics match the records', async () => {
    const { context, page, errors } = await open('demo.html');
    assert.match(await text(page, '[data-main] h1'), new RegExp(`${M.dueCount} follow-ups need attention`));
    assert.equal(await text(page, '[data-tour="kpis"] .qt-kpi__value'), usd(M.openValue));
    assert.match(await text(page, '.app-pill'), /Fictional demo data/);
    assert.match(await text(page, '.app-ws'), /Fictional demo company/);
    assert.equal(await dueBadge(page), String(M.dueCount));
    assert.equal(await count(page, '.qt-attn'), M.dueCount);
    await noOverflow(page);
    await shot(page, 'demo-dashboard-1440');
    noErrors(errors); await context.close();
  });

  await group('demo: search, filters, queues, drafts, copy, contact, outcome, reporting, import and reset', async () => {
    const { context, page, errors } = await open('demo.html', { clipboard: true });
    const summary = () => text(page, '[data-results] .summary');
    // Search and filters
    await page.locator('.app-nav a[href="#estimates"]').click();
    assert.match(await summary(), /Showing 22 of 22/);
    await page.locator('#est-q').fill('roof');
    assert.match(await summary(), /Showing 9 of 22/);
    await page.locator('#est-q').fill('Linden');
    assert.equal(await count(page, '[data-results] tbody tr'), 1);
    await page.locator('#est-q').fill('zzzz');
    assert.match(await text(page, '[data-results] .qt-empty h3'), /No estimates match/);
    await page.locator('[data-results] [data-action="clear-filters"]').first().click();
    assert.match(await summary(), /Showing 22 of 22/);
    await page.locator('[data-status="won"]').click();
    assert.equal(await count(page, '[data-results] tbody tr'), 4);
    await page.locator('[data-status="all"]').click();
    await page.locator('#est-fu').selectOption('overdue');
    assert.equal(await count(page, '[data-results] tbody tr'), S.overdue.count);
    await page.locator('#est-fu').selectOption('any');
    await page.locator('#est-trade').selectOption('Siding');
    assert.equal(await count(page, '[data-results] tbody tr'), 4);
    await page.locator('#est-q').fill('roof');
    await page.locator('#est-trade').selectOption('all');
    await shot(page, 'demo-estimates-search-1440');
    // Global search from the top bar
    await page.locator('#global-search').fill('Okafor'); await page.keyboard.press('Enter');
    assert.equal(await count(page, '[data-results] tbody tr'), 1);
    // Follow-up queues and keyboard tabs
    await page.locator('.app-nav a[href="#followups"]').click();
    assert.equal(await count(page, '.qt-queue__row'), 6);
    await page.locator('[data-queue="upcoming"]').click();
    assert.equal(await count(page, '.qt-queue__row'), 5);
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('[data-queue="unscheduled"]').getAttribute('aria-selected'), 'true');
    assert.equal(await count(page, '.qt-queue__row'), 2);
    await page.locator('[data-queue="due"]').click();
    // Open the record
    await page.locator('.qt-queue [data-open="FR-2318"]').first().click();
    assert.ok(await page.locator('[data-drawer]').isVisible());
    assert.equal(await text(page, '#drawer-title'), 'Dana Whitfield');
    assert.equal(await page.locator('[data-app]').evaluate(el => el.inert), true, 'app behind the record is inert');
    const historyCount = () => count(page, '[data-drawer] .qt-timeline__item');
    const h0 = await historyCount();
    assert.match(await page.locator('#draft-text').inputValue(), /Hi Dana,[\s\S]*\$21,480\.00 estimate/);
    // Edit and save the draft: no contact is recorded
    const custom = 'Hi Dana — quick check-in on your roof estimate. Happy to walk through the ice & water shield options. (Fictional)';
    await page.locator('#draft-text').fill(custom);
    assert.equal(await text(page, '[data-section="draft"] .qt-chip'), 'Unsaved changes');
    await page.locator('[data-action="save-draft"]').click();
    assert.match(await text(page, '[data-draft-status]'), /Draft saved/);
    assert.equal(await text(page, '[data-section="draft"] .qt-chip'), 'Saved draft');
    assert.equal(await historyCount(), h0, 'saving a draft records nothing');
    // Copy: clipboard gets the text, nothing is sent or recorded
    await page.locator('[data-action="copy-draft"]').click();
    await page.locator('[data-draft-status]', { hasText: 'Nothing was sent' }).waitFor();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), custom);
    assert.equal(await historyCount(), h0, 'copying a draft records nothing');
    await shot(page, 'demo-followup-draft-1440');
    // Contact validation then a valid fictional contact
    await page.locator('[data-form="contact"] [name="nextDate"]').fill(today);
    await page.locator('[data-form="contact"] button[type="submit"]').click();
    assert.match(await text(page, '[data-form="contact"] [data-form-error]'), /after the contact date/);
    assert.equal(await page.locator('[data-form="contact"] [name="nextDate"]').getAttribute('aria-invalid'), 'true');
    await page.locator('[data-form="contact"] [name="nextDate"]').fill(addDays(today, 3));
    await page.locator('[data-form="contact"] [name="note"]').fill('Fictional test call');
    await page.locator('[data-form="contact"] button[type="submit"]').click();
    await page.locator('.toast.is-on', { hasText: 'Phone contact recorded' }).waitFor();
    assert.match(await text(page, '.toast'), /Phone contact recorded for Dana Whitfield/);
    assert.equal(await historyCount(), h0 + 1);
    assert.match(await text(page, '[data-drawer] .qt-timeline__item'), /Phone contact recorded — Fictional test call/);
    assert.match(await text(page, '[data-drawer] .qt-facts'), /Due in 3 days/);
    assert.equal(await dueBadge(page), '5');
    // Escape closes the record and focus is not lost
    await page.keyboard.press('Escape');
    assert.ok(await page.locator('[data-drawer]').isHidden());
    assert.equal(await page.locator('[data-app]').evaluate(el => el.inert), false);
    assert.notEqual(await page.evaluate(() => document.activeElement?.tagName), 'BODY');
    // Persistence across reload
    await page.reload(); await page.locator('[data-main] h1').waitFor();
    assert.equal(await dueBadge(page), '5');
    // Reporting reflects the recorded contact
    await page.locator('.app-nav a[href="#results"]').click();
    assert.equal(await text(page, '[data-group="contacts"] strong'), '19');
    // Record the outcome with confirmation
    await page.locator('.app-nav a[href="#followups"]').click();
    await page.locator('[data-queue="upcoming"]').click();
    await page.locator('.qt-queue [data-open="FR-2318"]').first().click();
    await page.locator('[data-outcome="won"]').click();
    assert.ok(await page.locator('[data-confirm]').isVisible());
    assert.match(await text(page, '#confirm-title'), /Mark this estimate won/);
    await page.locator('[data-confirm-cancel]').click();
    assert.match(await text(page, '[data-drawer] .qt-drawer__tools'), /Sent/, 'cancel changes nothing');
    await page.locator('[data-outcome="won"]').click();
    await page.locator('[data-confirm-ok]').click();
    await page.locator('.toast.is-on', { hasText: 'marked won' }).waitFor();
    assert.match(await text(page, '[data-drawer] .qt-drawer__tools'), /Won/);
    assert.match(await text(page, '[data-drawer] .qt-notice'), /closed/);
    assert.match(await text(page, '[data-drawer] .qt-timeline__item'), /Estimate marked won/);
    await page.locator('[data-action="close-drawer"]').click();
    await page.locator('.app-nav a[href="#results"]').click();
    assert.equal(await text(page, '[data-group="won"] strong'), '3');
    assert.equal(await text(page, '[data-group="won-value"] strong'), usd(29755 + 21480));
    await page.locator('[data-group="won"]').click();
    assert.match(await text(page, '[data-supporting]'), /Dana Whitfield/);
    await page.locator('[data-range="7"]').click();
    assert.equal(await page.locator('[data-range="7"]').getAttribute('aria-pressed'), 'true');
    await page.locator('[data-range="30"]').click();
    await shot(page, 'demo-results-1440');
    // Import the fictional sample
    await page.locator('.app-nav a[href="#import"]').click();
    await page.locator('[data-action="preview-import"]').click();
    assert.equal(await count(page, '.qt-import-row'), 5);
    assert.equal(await count(page, '.qt-import-row--ready'), 3);
    await shot(page, 'demo-import-1440');
    await page.locator('[data-action="import-ready"]').click();
    assert.match(await text(page, '.toast'), /3 fictional estimates imported/);
    assert.equal(await text(page, '.app-nav a[href="#estimates"] em'), '25');
    // Reset restores the original workspace
    await page.locator('.app-side [data-action="reset"]').click();
    assert.match(await text(page, '#confirm-title'), /Reset the demo/);
    await page.locator('[data-confirm-ok]').click();
    await page.locator('.toast.is-on', { hasText: 'Original fictional workspace restored' }).waitFor();
    assert.match(await text(page, '[data-main] h1'), /6 follow-ups need attention/);
    assert.equal(await text(page, '[data-tour="kpis"] .qt-kpi__value'), usd(M.openValue));
    assert.equal(await text(page, '.app-nav a[href="#estimates"] em'), '22');
    await page.locator('.qt-attn [data-open="FR-2318"]').first().click();
    assert.doesNotMatch(await page.locator('#draft-text').inputValue(), /quick check-in/, 'saved draft cleared by reset');
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('quotetend.public-demo.v2')).quotes.length), 22);
    noErrors(errors); await context.close();
  });

  await group('guided tour: five steps, actions, back/next, exit, restart and reset; app stays usable', async () => {
    const { context, page, errors } = await open('demo.html?tour=1', { clipboard: true });
    const step = () => page.locator('.qt-tour__step').textContent();
    await page.locator('[data-tour-dock] .qt-tour').waitFor();
    assert.match(await step(), /Step 1 of 5/);
    assert.equal(new URL(page.url()).search, '', 'tour parameter removed after start');
    assert.equal(await page.locator('[data-tour="kpis"].tour-target').count(), 1);
    assert.match(await text(page, '.qt-tour__body'), new RegExp(usd(M.openValue).replace('$', '\\$')));
    await shot(page, 'demo-guided-tour-step1-1440');
    await page.locator('[data-tour-act="next"]').click();
    assert.match(await step(), /Step 2 of 5/);
    assert.equal(await page.locator('[data-row="FR-2318"].tour-target').count(), 1);
    assert.match(await text(page, '.qt-tour__body'), /6 days past its follow-up date/);
    await page.locator('[data-tour-act="open-focus"]').click();
    assert.match(await step(), /Step 3 of 5/);
    assert.equal(await text(page, '#drawer-title'), 'Dana Whitfield');
    assert.equal(await page.locator('[data-section="draft"].tour-target').count(), 1);
    await page.locator('[data-tour-act="copy-draft"]').click();
    await page.locator('[data-draft-status]', { hasText: 'Nothing was sent' }).waitFor();
    await shot(page, 'demo-guided-tour-step3-1440');
    await page.keyboard.press('ArrowRight');
    assert.match(await step(), /Step 4 of 5/);
    assert.equal(await page.locator('[data-section="contact"].tour-target').count(), 1);
    await page.locator('[data-tour-act="log-example"]').click();
    await page.locator('.toast.is-on', { hasText: 'Example phone call recorded' }).waitFor();
    assert.match(await text(page, '.toast'), /Example phone call recorded/);
    assert.match(await text(page, '[data-drawer] .qt-timeline__item'), /Example call/);
    assert.equal(await page.locator('[data-tour-act="log-example"]').isDisabled(), true);
    await shot(page, 'demo-guided-tour-step4-1440');
    await page.locator('[data-tour-act="next"]').click();
    assert.match(await step(), /Step 5 of 5/);
    assert.equal(await text(page, '[data-group="contacts"] strong'), '19');
    assert.match(await text(page, '.qt-tour__body'), /19 contacts/);
    await shot(page, 'demo-guided-tour-step5-1440');
    // The tour does not block normal use
    await page.locator('.app-nav a[href="#estimates"]').click();
    await page.locator('#est-q').fill('metal');
    assert.equal(await count(page, '[data-results] tbody tr'), 1);
    assert.ok(await page.locator('[data-tour-dock]').isVisible());
    // Back, minimize, exit
    await page.locator('[data-tour-act="back"]').click();
    assert.match(await step(), /Step 4 of 5/);
    await page.locator('[data-tour-act="minimize"]').click();
    assert.ok(await page.locator('.qt-tour.is-min').isVisible());
    await page.locator('[data-tour-act="minimize"]').click();
    await page.locator('[data-tour-act="exit"]').click();
    assert.ok(await page.locator('[data-tour-dock]').isHidden());
    assert.equal(await count(page, '.tour-target'), 0);
    assert.ok(await page.locator('[data-drawer]').isVisible(), 'exiting the tour keeps the open record');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'drawer-title', 'focus moves into the record after exit');
    await page.keyboard.press('Escape');
    // Restart from the sidebar, jump to the end, finish and reset everything
    await page.locator('.app-side [data-action="start-tour"]').click();
    assert.match(await step(), /Step 1 of 5/);
    await page.locator('[data-tour-go="4"]').click();
    await page.locator('[data-tour-act="next"]').click();
    assert.match(await text(page, '.qt-tour__title'), /core workflow/);
    await page.locator('.qt-tour__finish [data-tour-act="reset-data"]').click();
    await page.locator('[data-confirm-ok]').click();
    await page.locator('.toast.is-on', { hasText: 'Original fictional workspace restored' }).waitFor();
    assert.match(await step(), /Step 1 of 5/, 'reset restarts the tour');
    assert.equal(await dueBadge(page), '6');
    noErrors(errors); await context.close();
  });

  await group('demo mobile (390px): navigation, record and tour fit the screen', async () => {
    const { context, page, errors } = await open('demo.html', { width: 390, height: 844, mobile: true });
    await noOverflow(page);
    await shot(page, 'demo-mobile-390');
    assert.equal(await page.locator('.app-side').evaluate(el => getComputedStyle(el).visibility), 'hidden', 'closed navigation is not focusable');
    const toggle = page.locator('[data-nav-toggle]');
    await toggle.click();
    assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
    await page.locator('.app-nav a[href="#followups"]').click();
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
    assert.match(await text(page, '[data-main] h1'), /Follow-ups/);
    await page.locator('.qt-queue [data-open="FR-2318"]').first().click();
    const drawer = await page.locator('[data-drawer]').boundingBox();
    assert.ok(drawer.width >= 389, 'record uses the full width');
    await shot(page, 'demo-mobile-record-390');
    await page.locator('[data-action="close-drawer"]').click();
    await page.locator('.app-top [data-action="start-tour"]').click();
    const dock = await page.locator('[data-tour-dock]').boundingBox();
    assert.ok(dock.x >= 0 && dock.x + dock.width <= 390, 'tour fits the viewport');
    await noOverflow(page);
    await shot(page, 'demo-mobile-tour-390');
    noErrors(errors); await context.close();
  });

  await group('demo works when browser storage is blocked', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await context.addInitScript(() => {
      const deny = { get() { throw new DOMException('blocked', 'SecurityError'); } };
      Object.defineProperty(window, 'localStorage', deny); Object.defineProperty(window, 'sessionStorage', deny);
    });
    const page = await context.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(base + 'demo.html');
    await page.locator('[data-main] h1').waitFor();
    assert.match(await text(page, '.toast'), /storage is unavailable/);
    await page.locator('.qt-attn [data-open="FR-2327"]').first().click();
    await page.locator('[data-form="contact"] button[type="submit"]').click();
    assert.match(await text(page, '[data-drawer] .qt-timeline__item'), /Phone contact recorded/);
    noErrors(errors); await context.close();
  });
} finally {
  await browser.close();
  await server.close();
}

const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} browser groups passed.`);
console.log(`Screenshots (${shots.length}):\n${shots.map(s => `  ${s}`).join('\n')}`);
if (failed.length) process.exitCode = 1;
