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
const browser = await chromium.launch({ ...(process.env.QUOTETEND_BROWSER_PATH ? { executablePath: process.env.QUOTETEND_BROWSER_PATH } : { channel: process.env.QUOTETEND_BROWSER || 'msedge' }), headless: true });
const results = [];
const shots = [];
// The shipped config points at QuoteTend's real Formspree form. Every context aborts and records
// requests to formspree.io; groups that exercise submissions mock the endpoint with page.route(),
// which takes precedence. A final group asserts that nothing tried to reach the live service.
const FORMSPREE = 'https://formspree.io/f/xbgdylzd';
const liveAttempts = [];
const blockLiveFormService = context => context.route('https://formspree.io/**', route => { liveAttempts.push(route.request().url()); return route.abort('blockedbyclient'); });

async function group(name, fn) {
  const started = Date.now();
  try { await fn(); results.push({ ok: true, name, ms: Date.now() - started }); console.log(`PASS  ${name}`); }
  catch (error) { results.push({ ok: false, name, error }); console.log(`FAIL  ${name}\n      ${error.message.split('\n').join('\n      ')}`); }
}

// Fresh context per scenario; collect page errors and console errors (font CDN failures are tolerated
// so the suite can run offline).
async function open(path, { width = 1440, height = 900, mobile = false, reducedMotion = 'no-preference', clipboard = false, config, fixedTime = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, isMobile: mobile, hasTouch: mobile, reducedMotion });
  await blockLiveFormService(context);
  if (clipboard) await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base.replace(/\/$/, '') });
  if (config) await context.route('**/assets/js/site-config.js', route => route.fulfill({ contentType: 'text/javascript', body: `export const SITE_CONFIG = Object.freeze(${JSON.stringify({ contactEmail: '', bookingUrl: '', formEndpoint: '', ...config })});` }));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)/.test(m.text() + (m.location()?.url || ''))) errors.push(`console: ${m.text()}`); });
  page.on('requestfailed', r => { if (!/fonts\.(googleapis|gstatic)/.test(r.url()) && !r.url().startsWith('mailto:')) errors.push(`requestfailed: ${r.url()}`); });
  page.setDefaultTimeout(8000);
  // Freezing Date.now makes the form's minimum-fill-time check deterministic (timers keep running).
  if (fixedTime) await page.clock.setFixedTime(new Date());
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
async function shotEl(page, selector, name) {
  await page.evaluate(() => document.querySelectorAll('.reveal').forEach(e => e.classList.add('is-in')));
  await page.waitForTimeout(250);
  const path = `${OUT}${name}.png`;
  await page.locator(selector).screenshot({ path });
  shots.push(path);
}
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
    // A missing auto-requested file (Sprint 1: /favicon.ico) crashed the old server; the next click must still work.
    assert.equal((await page.request.get(base + 'apple-touch-icon-precomposed.png')).status(), 404);
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

  await group('brand: ꝘuoteTend wordmark renders from vector Ꝙ + live text; favicon and app icons are served', async () => {
    for (const [width, height, mobile] of [[1440, 900, false], [390, 844, true]]) {
      const { context, page, errors } = await open('', { width, height, mobile });
      const brand = page.locator('.site-header .brand');
      assert.equal(await brand.getAttribute('aria-label'), 'QuoteTend home');
      assert.equal((await brand.textContent()).trim(), 'QuoteTend', 'DOM text is the ordinary spelling');
      const mark = await brand.locator('.wordmark').evaluate(el => {
        const svg = el.querySelector('svg').getBoundingClientRect(), box = el.getBoundingClientRect(), cs = getComputedStyle(el);
        return { after: getComputedStyle(el, '::after').content, font: cs.fontFamily, size: parseFloat(cs.fontSize), svgW: svg.width, svgH: svg.height, boxW: box.width, stroke: getComputedStyle(el.querySelector('.wordmark__stroke')).stroke };
      });
      assert.equal(mark.after, '"uoteTend"');
      assert.match(mark.font, /Bricolage Grotesque/);
      assert.ok(Math.abs(mark.svgH - 0.95 * mark.size) < 1.5 && Math.abs(mark.svgW - 0.87 * mark.size) < 1.5, `Ꝙ scales with the text (${mark.svgW}x${mark.svgH} at ${mark.size}px)`);
      assert.ok(mark.boxW > 4.5 * mark.size, 'live "uoteTend" text renders beside the Ꝙ');
      assert.equal(mark.stroke, 'rgb(168, 122, 44)', 'gold stroke on light backgrounds');
      await page.locator('.site-header .brand').screenshot({ path: `${OUT}brand-wordmark-${width}.png` });
      shots.push(`${OUT}brand-wordmark-${width}.png`);
      if (width === 1440) {
        assert.equal(await page.locator('.site-footer .wordmark--on-dark').count(), 1);
        for (const [path, type] of [['favicon.ico', 'image/x-icon'], ['assets/favicon.svg', 'image/svg+xml'], ['assets/icons/apple-touch-icon.png', 'image/png'], ['assets/icons/icon-192.png', 'image/png'], ['assets/icons/icon-512.png', 'image/png'], ['assets/icons/icon-maskable-512.png', 'image/png'], ['site.webmanifest', 'application/manifest+json']]) {
          const res = await page.request.get(base + path);
          assert.equal(res.status(), 200, path); assert.match(res.headers()['content-type'], new RegExp(type.replace('+', '\\+')), path);
        }
        const icons = await page.$$eval('link[rel~="icon"], link[rel="apple-touch-icon"], link[rel="manifest"]', ls => ls.map(l => l.getAttribute('href')));
        assert.deepEqual(icons, ['favicon.ico', 'assets/favicon.svg', 'assets/icons/apple-touch-icon.png', 'site.webmanifest']);
      }
      noErrors(errors); await context.close();
    }
    const { context, page, errors } = await open('demo.html');
    assert.equal(await page.locator('.app-brand').getAttribute('aria-label'), 'QuoteTend website');
    assert.equal(await page.locator('.app-brand .wordmark').evaluate(el => getComputedStyle(el, '::after').content), '"uoteTend"');
    assert.match(await page.title(), /QuoteTend/);
    noErrors(errors); await context.close();
  });

  const fillRequest = async (page, overrides = {}) => {
    const v = { name: 'Fictional Owner', company: 'Fictional Roofing Co', email: 'owner@fictional-roofing.net', phone: '555-0100', trade: 'Roofing', message: 'About 40 estimates a month in a spreadsheet.', ...overrides };
    await page.locator('#ea-name').fill(v.name); await page.locator('#ea-company').fill(v.company); await page.locator('#ea-email').fill(v.email);
    await page.locator('#ea-phone').fill(v.phone); await page.locator('#ea-trade').selectOption(v.trade); await page.locator('#ea-message').fill(v.message);
  };
  const submitRequest = page => page.locator('[data-early-form] button[type="submit"]').click();
  const formStatus = page => page.locator('[data-form-status]').textContent();

  await group('early access (local preview, no endpoint configured): full form and validation, never reports anything as sent', async () => {
    const { context, page, errors } = await open('', { fixedTime: true, config: {} });
    const outbound = [];
    page.on('request', r => { if (!r.url().startsWith(base) && !/fonts\.(googleapis|gstatic)/.test(r.url())) outbound.push(r.url()); });
    await page.locator('#early-access').scrollIntoViewIfNeeded();
    assert.equal(await page.locator('[data-early]').getAttribute('data-mode'), 'preview');
    assert.match(await text(page, '[data-preview-hint]'), /Not connected \(local preview only\)/);
    assert.equal(await page.locator('[data-early-form] button[type="submit"]').innerText(), 'Request Early Access');
    assert.equal(await page.locator('[data-early] a', { hasText: 'Book a Demo' }).count(), 0, 'no booking action without a booking URL');
    assert.equal(await page.locator('a[href^="mailto:"]').count(), 0);
    // Accessible labels for every field.
    for (const id of ['ea-name', 'ea-company', 'ea-email', 'ea-phone', 'ea-trade', 'ea-message']) assert.equal(await page.locator(`label[for="${id}"]`).count(), 1, id);
    // Validation: empty submit flags the required fields and focuses the first one.
    await submitRequest(page);
    assert.match(await formStatus(page), /check the highlighted fields/);
    for (const name of ['name', 'company', 'email', 'trade']) assert.equal(await page.locator(`#ea-${name}`).getAttribute('aria-invalid'), 'true', name);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'ea-name');
    assert.match(await text(page, '#ea-email-error'), /business email/);
    await fillRequest(page, { email: 'owner@', phone: 'call me' });
    await submitRequest(page);
    assert.match(await text(page, '#ea-email-error'), /valid email/);
    assert.match(await text(page, '#ea-phone-error'), /phone number/);
    await shotEl(page, '.early-panel', 'early-access-validation-1440');
    await fillRequest(page);
    await submitRequest(page); // first quick submit trips the minimum-time check
    assert.match(await formStatus(page), /take a moment/);
    await submitRequest(page);
    const status = await formStatus(page);
    assert.match(status, /Not sent/);
    assert.doesNotMatch(status, /received|thank/i);
    assert.equal(await page.locator('[data-form-success]').count(), 0);
    assert.deepEqual(outbound, [], 'nothing left the page');
    await shotEl(page, '.early-panel', 'early-access-form-1440');
    noErrors(errors); await context.close();
  });

  await group('early access (public host): no endpoint → honest "open soon"; official endpoint → live form without developer notes', async () => {
    // Map a non-local hostname onto the preview server so the page behaves as it would when deployed.
    const port = new URL(base).port;
    const publicBrowser = await chromium.launch({ ...(process.env.QUOTETEND_BROWSER_PATH ? { executablePath: process.env.QUOTETEND_BROWSER_PATH } : { channel: process.env.QUOTETEND_BROWSER || 'msedge' }), headless: true, args: ['--host-resolver-rules=MAP public.quotetend-fixture.net 127.0.0.1'] });
    try {
      const unconfigured = await publicBrowser.newContext({ viewport: { width: 1440, height: 900 } });
      await blockLiveFormService(unconfigured);
      await unconfigured.route('**/assets/js/site-config.js', route => route.fulfill({ contentType: 'text/javascript', body: "export const SITE_CONFIG = Object.freeze({ formEndpoint: '', bookingUrl: '', contactEmail: '' });" }));
      const page = await unconfigured.newPage();
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.goto(`http://public.quotetend-fixture.net:${port}/`, { waitUntil: 'networkidle' });
      assert.equal(await page.locator('[data-early]').getAttribute('data-mode'), 'closed');
      assert.equal(await page.locator('[data-early-form]').count(), 0);
      assert.match(await text(page, '[data-early] h3'), /open soon/);
      assert.equal(await page.locator('.config-hint').count(), 0, 'no developer notes on a public host');
      assert.equal(await page.locator('a[href^="mailto:"]').count(), 0);
      assert.deepEqual(errors, []);
      // As deployed with the shipped configuration.
      const shipped = await publicBrowser.newContext({ viewport: { width: 1440, height: 900 } });
      await blockLiveFormService(shipped);
      const live = await shipped.newPage();
      await live.goto(`http://public.quotetend-fixture.net:${port}/`, { waitUntil: 'networkidle' });
      assert.equal(await live.locator('[data-early]').getAttribute('data-mode'), 'endpoint');
      assert.equal(await live.locator('[data-early-form]').count(), 1);
      assert.equal(await live.locator('[data-preview-hint], .config-hint').count(), 0);
    } finally { await publicBrowser.close(); }
  });

  await group('early access (form service configured): honeypot, failures and success are reported truthfully', async () => {
    const endpoint = 'https://forms.quotetend-fixture.net/f/early-access';
    const { context, page, errors } = await open('', { fixedTime: true, config: { formEndpoint: endpoint, bookingUrl: 'https://booking.quotetend-fixture.net/demo', contactEmail: 'owner@quotetend-fixture.net' } });
    const bodies = [];
    let reply = { status: 200, body: { ok: true } };
    await page.route(`${endpoint}**`, route => { bodies.push(route.request().postDataJSON()); route.fulfill({ status: reply.status, contentType: 'application/json', body: JSON.stringify(reply.body) }); });
    await page.locator('#early-access').scrollIntoViewIfNeeded();
    assert.equal(await page.locator('[data-early]').getAttribute('data-mode'), 'endpoint');
    assert.equal(await page.locator('[data-preview-hint]').count(), 0);
    const booking = page.locator('[data-early] a', { hasText: 'Book a Demo' });
    assert.equal(await booking.getAttribute('href'), 'https://booking.quotetend-fixture.net/demo');
    assert.equal(await booking.getAttribute('rel'), 'noopener');
    await fillRequest(page);
    await submitRequest(page); // minimum-time check
    // Honeypot: a filled hidden field is never submitted.
    await page.locator('#ea-gotcha').evaluate(el => { el.value = 'bot'; });
    await submitRequest(page);
    assert.match(await formStatus(page), /couldn’t be sent/);
    assert.equal(bodies.length, 0);
    await page.locator('#ea-gotcha').evaluate(el => { el.value = ''; });
    // Provider failure and provider-side rejection are errors, never success.
    reply = { status: 503, body: {} };
    await submitRequest(page);
    await page.locator('[data-form-status]', { hasText: 'was not sent' }).waitFor();
    reply = { status: 200, body: { errors: [{ message: 'email should be an email' }] } };
    await submitRequest(page);
    await page.locator('[data-form-status]', { hasText: 'should be an email' }).waitFor();
    assert.match(await formStatus(page), /was not sent/);
    assert.equal(await page.locator('[data-form-success]').count(), 0);
    // Accepted: success panel replaces the form and receives focus.
    reply = { status: 200, body: { ok: true } };
    await submitRequest(page);
    await page.locator('[data-form-success]').waitFor();
    assert.match(await text(page, '[data-form-success]'), /Request received[\s\S]*owner@fictional-roofing\.net/);
    assert.equal(await page.evaluate(() => document.activeElement?.hasAttribute('data-form-success')), true);
    assert.equal(bodies.length, 3);
    const sent = bodies[2];
    assert.deepEqual([sent.name, sent.company, sent.email, sent.phone, sent.trade, sent._gotcha, sent.source], ['Fictional Owner', 'Fictional Roofing Co', 'owner@fictional-roofing.net', '555-0100', 'Roofing', '', 'quotetend-website']);
    await shotEl(page, '.early-panel', 'early-access-success-1440');
    noErrors(errors.filter(e => !/status of 503/.test(e))); // the 503 is the failure this group simulates
    await context.close();
  });

  for (const [width, height, mobile] of [[1440, 900, false], [390, 844, true]]) await group(`early access (official Formspree endpoint, ${width}px): AJAX JSON to ${FORMSPREE}, success only when confirmed`, async () => {
    const { context, page, errors } = await open('', { width, height, mobile, fixedTime: true });
    await page.locator('#early-access').scrollIntoViewIfNeeded();
    assert.equal(await page.locator('[data-early]').getAttribute('data-mode'), 'endpoint', 'shipped config is live');
    assert.equal(await page.locator('[data-preview-hint]').count(), 0);
    assert.equal(await page.locator('[data-early] a', { hasText: 'Book a Demo' }).count(), 0, 'no booking URL is configured');
    assert.match(await text(page, '.form-privacy'), /through Formspree/);
    const requests = [];
    let reply = null, delay = 0;
    await page.route(FORMSPREE, async route => {
      requests.push(route.request());
      if (delay) await new Promise(r => setTimeout(r, delay));
      if (reply === 'network') return route.abort('failed');
      return route.fulfill({ status: reply.status, contentType: 'application/json', body: JSON.stringify(reply.body) });
    });
    const fields = { '#ea-name': 'Fictional Owner', '#ea-company': 'Fictional Roofing Co', '#ea-email': 'owner@fictional-roofing.net', '#ea-phone': '555-0100', '#ea-message': 'Mock submission from the automated test suite.' };
    await fillRequest(page, { message: fields['#ea-message'] });
    await submitRequest(page); // minimum-time check
    const kept = async label => { for (const [sel, value] of Object.entries(fields)) assert.equal(await page.locator(sel).inputValue(), value, `${label}: ${sel} kept`); assert.equal(await page.locator('#ea-trade').inputValue(), 'Roofing'); };
    const attempt = async (r, expect) => {
      reply = r;
      const before = requests.length;
      await submitRequest(page);
      await page.locator('[data-form-status]', { hasText: expect }).waitFor();
      assert.equal(requests.length, before + 1);
      assert.equal(await page.locator('[data-form-success]').count(), 0, 'no success state');
    };
    await attempt({ status: 503, body: {} }, 'HTTP 503'); await kept('after 503');
    await attempt({ status: 429, body: { error: 'Too many requests' } }, 'wait a minute'); await kept('after 429');
    await attempt('network', 'couldn’t reach the form service'); await kept('after network failure');
    await attempt({ status: 200, body: {} }, 'didn’t confirm'); await kept('after unconfirmed 2xx');
    assert.match(await formStatus(page), /can’t confirm your request was received/);
    await attempt({ status: 403, body: { error: 'Form not active', errors: [{ code: 'INACTIVE', message: 'This form is not active' }] } }, 'This form is not active');
    await attempt({ status: 422, body: { error: 'Validation errors', errors: [{ code: 'TYPE_EMAIL', field: 'email', message: 'should be an email' }] } }, 'flagged the highlighted fields');
    assert.equal(await page.locator('#ea-email').getAttribute('aria-invalid'), 'true');
    assert.equal(await text(page, '#ea-email-error'), 'Should be an email.');
    await kept('after Formspree validation error');
    // Duplicate protection: a second submit while the first is in flight is ignored.
    reply = { status: 200, body: { next: 'https://formspree.io/thanks', ok: true } }; delay = 1200;
    const before = requests.length;
    await page.locator('[data-early-form]').evaluate(form => { form.requestSubmit(); form.requestSubmit(); });
    await page.waitForFunction(() => document.querySelector('[data-early-form] button[type="submit"]')?.disabled === true);
    assert.equal(await page.locator('[data-early-form] button[type="submit"]').getAttribute('aria-busy'), 'true');
    assert.match(await formStatus(page), /Sending your request/);
    await page.locator('[data-early-form] button[type="submit"]').click({ force: true }).catch(() => {});
    await page.locator('[data-form-success]').waitFor();
    assert.equal(requests.length, before + 1, 'exactly one request for repeated submits');
    // The accepted request: AJAX, JSON, the right fields, no credentials.
    const req = requests.at(-1);
    assert.equal(req.method(), 'POST');
    assert.equal(req.url(), FORMSPREE);
    assert.match(req.headers()['content-type'], /application\/json/);
    assert.match(req.headers()['accept'], /application\/json/);
    assert.equal(req.headers()['cookie'], undefined, 'no cookies sent to the form service');
    const sent = req.postDataJSON();
    assert.deepEqual(Object.keys(sent).sort(), ['_gotcha', '_subject', 'company', 'email', 'message', 'name', 'page', 'phone', 'source', 'trade']);
    assert.deepEqual([sent.name, sent.company, sent.email, sent.phone, sent.trade, sent.message, sent._gotcha, sent.source],
      ['Fictional Owner', 'Fictional Roofing Co', 'owner@fictional-roofing.net', '555-0100', 'Roofing', fields['#ea-message'], '', 'quotetend-website']);
    assert.equal(sent._subject, 'QuoteTend early access: Fictional Roofing Co');
    assert.equal(sent.page, base);
    assert.match(await text(page, '[data-form-success]'), /Request received/);
    if (width === 390) await shotEl(page, '.early-panel', 'early-access-success-390');
    noErrors(errors.filter(e => !/status of (503|429|403|422)|net::ERR_FAILED|requestfailed: https:\/\/formspree\.io\/f\/xbgdylzd/.test(e))); // simulated failures
    await context.close();
  });

  await group('early access (email only): opens the visitor’s email app and never claims delivery', async () => {
    const { context, page, errors } = await open('', { fixedTime: true, config: { contactEmail: 'owner@quotetend-fixture.net' } });
    await page.locator('#early-access').scrollIntoViewIfNeeded();
    assert.equal(await page.locator('[data-early]').getAttribute('data-mode'), 'email');
    await fillRequest(page);
    await submitRequest(page); await submitRequest(page);
    const status = await formStatus(page);
    assert.match(status, /hasn’t been sent yet/);
    assert.doesNotMatch(status, /received|thank/i);
    assert.equal(await page.locator('[data-footer-contact] a[href="mailto:owner@quotetend-fixture.net"]').count(), 1);
    noErrors(errors); await context.close();
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

  await group('guided tour stays synchronized with the workspace: navigation, pause/resume, Back/Next and deep links', async () => {
    const { context, page, errors } = await open('demo.html?tour=1');
    const stepText = () => page.locator('.qt-tour__step').textContent();
    const dockState = () => page.locator('[data-tour-dock]').getAttribute('data-state');
    const view = () => page.locator('[data-main] h1').textContent();
    // Next and Back always move the workspace to the step's screen.
    const expected = [[/Step 1/, /follow-ups need attention/, false], [/Step 2/, /Follow-ups/, false], [/Step 3/, /Follow-ups/, true], [/Step 4/, /Follow-ups/, true], [/Step 5/, /Follow-up Results/, false]];
    for (const [i, [label, heading, drawerOpen]] of expected.entries()) {
      if (i) await page.locator('[data-tour-act="next"]').click();
      assert.match(await stepText(), label); assert.match(await view(), heading);
      assert.equal(await page.locator('[data-drawer]').isVisible(), drawerOpen, `step ${i + 1} record state`);
      assert.equal(await dockState(), 'active');
      assert.equal(await page.locator('.tour-target').count(), 1, `step ${i + 1} highlights its target`);
    }
    for (const [label, heading, drawerOpen] of [...expected].reverse().slice(1)) {
      await page.locator('[data-tour-act="back"]').click();
      assert.match(await stepText(), label); assert.match(await view(), heading);
      assert.equal(await page.locator('[data-drawer]').isVisible(), drawerOpen);
    }
    // The recorded failure: step 5 shown while the Import screen is open.
    await page.locator('[data-tour-go="4"]').click();
    await page.locator('.app-nav a[href="#import"]').click();
    assert.match(await view(), /Import estimates/);
    assert.equal(await dockState(), 'paused');
    assert.match(await text(page, '.qt-tour__title'), /Tour paused/);
    assert.match(await text(page, '.qt-tour__body'), /You’re viewing Import\. Step 5, “Review reporting”, happens on Follow-up Results/);
    assert.equal(await page.locator('.tour-target').count(), 0, 'no highlight for a step that is not on screen');
    await shot(page, 'demo-guided-tour-paused-1440');
    await page.locator('[data-tour-act="resume"]').click();
    assert.match(await view(), /Follow-up Results/); assert.equal(await dockState(), 'active');
    // Navigating back to the expected screen manually resumes automatically.
    await page.locator('.app-nav a[href="#estimates"]').click();
    assert.equal(await dockState(), 'paused');
    await page.locator('.app-nav a[href="#results"]').click();
    assert.equal(await dockState(), 'active');
    // Next from a paused state still lands on the right screen.
    await page.locator('[data-tour-go="1"]').click();
    await page.locator('[data-queue="upcoming"]').click();
    assert.equal(await dockState(), 'paused', 'switching away from the queue tab that holds the estimate pauses');
    assert.match(await text(page, '.qt-tour__body'), /Upcoming tab of Follow-ups[\s\S]*Due & overdue tab of Follow-ups/);
    await page.locator('[data-tour-act="next"]').click();
    assert.match(await stepText(), /Step 3/); assert.equal(await text(page, '#drawer-title'), 'Dana Whitfield'); assert.equal(await dockState(), 'active');
    // Closing the record during step 3 pauses; Resume reopens it.
    await page.locator('[data-action="close-drawer"]').click();
    assert.equal(await dockState(), 'paused');
    assert.match(await text(page, '.qt-tour__body'), /Dana Whitfield’s estimate/);
    await page.locator('[data-tour-act="resume"]').click();
    assert.equal(await page.locator('[data-drawer]').isVisible(), true); assert.equal(await dockState(), 'active');
    // Opening the featured estimate from step 2 advances to step 3.
    await page.locator('[data-tour-go="1"]').click();
    await page.locator('.qt-queue [data-open="FR-2318"]').first().click();
    assert.match(await stepText(), /Step 3/); assert.equal(await dockState(), 'active');
    // Opening a different record pauses instead of describing the wrong customer.
    await page.locator('[data-action="close-drawer"]').click();
    await page.locator('[data-tour-act="resume"]').click();
    await page.keyboard.press('Escape');
    await page.locator('.qt-queue [data-open="FR-2321"]').first().click();
    assert.equal(await dockState(), 'paused');
    assert.match(await text(page, '.qt-tour__body'), /Marcus & Elena Ruiz’s estimate/);
    // Minimize works while paused; the range shown in step 5 copy follows the selected range.
    await page.locator('[data-tour-act="minimize"]').click();
    assert.ok(await page.locator('.qt-tour.is-min').isVisible());
    await page.locator('[data-tour-act="minimize"]').click();
    await page.locator('[data-tour-go="4"]').click();
    await page.locator('[data-range="90"]').click();
    assert.match(await text(page, '.qt-tour__body'), /last 90 days/);
    assert.equal(await dockState(), 'active');
    noErrors(errors); await context.close();
    // Deep links open the right step on the right screen.
    for (const [n, heading, drawerOpen] of [[3, /Follow-ups/, true], [5, /Follow-up Results/, false]]) {
      const deep = await open(`demo.html?tour=${n}`);
      assert.match(await deep.page.locator('.qt-tour__step').textContent(), new RegExp(`Step ${n} of 5`));
      assert.match(await deep.page.locator('[data-main] h1').textContent(), heading);
      assert.equal(await deep.page.locator('[data-drawer]').isVisible(), drawerOpen);
      noErrors(deep.errors); await deep.context.close();
    }
  });

  await group('tablet (820px): homepage and demo fit with working navigation', async () => {
    const home = await open('', { width: 820, height: 1180, mobile: true });
    await noOverflow(home.page);
    assert.ok(await home.page.locator('[data-menu-btn]').isVisible(), 'compact navigation on tablet');
    await shot(home.page, 'home-tablet-820');
    noErrors(home.errors); await home.context.close();
    const demo = await open('demo.html?tour=1', { width: 820, height: 1180, mobile: true });
    await noOverflow(demo.page);
    const dock = await demo.page.locator('[data-tour-dock]').boundingBox();
    assert.ok(dock.x >= 0 && dock.x + dock.width <= 820, 'tour card fits the tablet viewport');
    await demo.page.locator('[data-tour-act="next"]').click();
    await demo.page.locator('[data-tour-act="next"]').click();
    const record = await demo.page.locator('[data-drawer]').boundingBox();
    assert.ok(record.width <= 820 && record.x >= 0, 'record panel fits');
    await shot(demo.page, 'demo-tablet-820');
    noErrors(demo.errors); await demo.context.close();
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
  await group('no test submission reached the live Formspree form', async () => {
    assert.deepEqual(liveAttempts, [], `unmocked requests to Formspree: ${liveAttempts.join(', ')}`);
  });
} finally {
  await browser.close();
  await server.close();
}

const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} browser groups passed.`);
console.log(`Screenshots (${shots.length}):\n${shots.map(s => `  ${s}`).join('\n')}`);
if (failed.length) process.exitCode = 1;
