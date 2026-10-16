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
import { Q_GLYPH, wordmark } from '../public-site/assets/js/components.js';
import { SITE_CONFIG } from '../public-site/assets/js/site-config.js';
import { resolveContactConfig, validateRequest, buildPayload, interpretResponse, mailtoUrl, TRADES, LIMITS } from '../public-site/assets/js/early-access.js';

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
// The marketing pages (Sprint 1.7 multipage site). The demo and 404 page are separate.
const MARKETING = ['index.html', 'how-it-works.html', 'features.html', 'faq.html'];
const PAGES = [...MARKETING, 'demo.html'];
const block = (html, re) => (html.match(re) || [''])[0];
const navOf = html => block(html, /<ul class="nav-links">[\s\S]*?<\/ul>/);
const mobileOf = html => block(html, /<div class="mobile-menu"[\s\S]*?<\/div>/);
const footerOf = html => block(html, /<footer class="site-footer">[\s\S]*?<\/footer>/);
// Links to the early-access form are "#early-access" on the homepage and "./#early-access" elsewhere.
const portable = html => html.replaceAll(' aria-current="page"', '').replaceAll('href="./#early-access"', 'href="#early-access"');

test('public site contains only public static file types', async () => {
  const files = await walk();
  const allowed = new Set(['.html', '.css', '.js', '.svg', '.png', '.ico', '.webmanifest']);
  for (const f of files) {
    if (f === 'serve.mjs') continue;
    assert.ok(allowed.has(extname(f)), `unexpected file type published: ${f}`);
    assert.ok(!/(^|\/)\./.test(f), `dotfile published: ${f}`);
  }
  for (const banned of ['.sqlite', '.env', 'backup', '.json', '.xlsx', '.csv']) assert.ok(!files.some(f => f.toLowerCase().includes(banned)), `private or data file published: ${banned}`);
  assert.deepEqual(files.filter(f => f.endsWith('.html')).sort(), ['404.html', 'demo.html', 'faq.html', 'features.html', 'how-it-works.html', 'index.html']);
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
  // Sprint 1.6 accuracy corrections: claims must match the customer app, now on every marketing page.
  const pages = Object.fromEntries(await Promise.all(MARKETING.map(async p => [p, await read(p)])));
  for (const [name, html] of Object.entries(pages)) {
    assert.doesNotMatch(html, /full backups?|full history/i, `${name}: workspace JSON backup is not a complete account backup`);
    assert.doesNotMatch(html, /streets?\b[^<]*(search|estimate IDs)|search[^<]*(streets?|phone|address|trade)|Filter by status, trade|filter[^<]*by trade|Totals update as you filter|last contact at a glance|each with its dollar value/i, `${name}: claims a search/filter feature the customer app does not have`);
    // Sprint 1.7: no new capability claims (automation, integrations, AI, billing) and no invented proof or prices.
    // (Questions such as "Does QuoteTend send messages automatically?" and "never sends messages" are allowed.)
    for (const claim of [/\bautomatic(ally)? (send|sends|sending|texts?|emails?|reminders?|follow-ups?)\b/i, /(?<!never )\bsends (your |the )?(follow-ups?|messages?|texts?|emails?|reminders?)\b/i,
      /auto-send/i, /\bAI[- ](written|generated|drafted|powered)\b/i, /artificial intelligence/i, /\bsyncs? with\b/i, /\bintegrates with\b/i, /connects to your (CRM|estimating)/i])
      assert.doesNotMatch(html, claim, `${name}: claims unbuilt automation, AI or integrations (${claim})`);
    assert.doesNotMatch(html, /\$\s?\d+(\.\d\d)?\s?(\/|per )\s?(mo|month|user|seat)\b|free trial|money-back|case stud|\d+\+? (contractors|customers|companies) (use|trust)|★|5-star|SOC ?2|HIPAA|GDPR[- ]compliant|bank-level|99\.9/i, `${name}: invented prices, proof, certifications or guarantees`);
  }
  assert.doesNotMatch(text, /shows exactly how QuoteTend works today|is in early access\.|Product in early access/, 'implies the product is already in early access or that the demo is exact');
  assert.match(pages['features.html'], /CSV export and workspace backups/);
  // Sprint 4A: phone, address and trade shipped in the Sprint 2 customer app, so they are no longer described as planned.
  assert.match(pages['features.html'], /Phone numbers, project addresses and trade tags are optional fields on every estimate, in the customer app and the demo/);
  assert.match(pages['index.html'], /trade tags, street and phone details, and charts are part of the customer app too/);
  assert.match(await read('demo.html'), /Phone, street and trade details are optional fields in the customer app too/);
  assert.doesNotMatch(text, /planned customer-app|planned for the customer app|anyone on your team/, 'no outdated planned-feature disclosure or multi-user claim');
  // The distinctions the owner requires: a draft is not a sent message, contact happens outside
  // QuoteTend, and a recorded win is not proof QuoteTend caused the sale.
  const how = pages['how-it-works.html'];
  assert.match(how, /Editing, saving or copying a draft doesn’t send anything and doesn’t record a contact/);
  assert.match(how, /Calls, texts and emails happen in the tools you already use/);
  assert.match(how, /doesn’t show the follow-up caused the sale/);
  assert.match(pages['faq.html'], /won’t describe it as available until it is/);
  assert.match(pages['faq.html'], /doesn’t prove the follow-up caused the sale/);
  assert.match(pages['index.html'], /Nothing is sent automatically/);
});

test('multipage structure: one homepage form, consistent navigation, unique metadata', async () => {
  const pages = Object.fromEntries(await Promise.all(PAGES.map(async p => [p, await read(p)])));
  const marketing = MARKETING.map(p => [p, pages[p]]);
  // One early-access form, on the homepage; every other marketing page links to it.
  assert.equal(PAGES.filter(p => /data-early[\s>]/.test(pages[p])).length, 1);
  assert.match(pages['index.html'], /<section class="early" id="early-access"/);
  for (const [name, html] of marketing) {
    const links = html.match(name === 'index.html' ? /href="#early-access"/g : /href="\.\/#early-access"/g) || [];
    assert.ok(links.length >= (name === 'index.html' ? 3 : 4), `${name}: links to the early-access form (${links.length})`);
    if (name !== 'index.html') assert.doesNotMatch(html, /href="#early-access"/, `${name}: a bare #early-access link would not reach the homepage form`);
    assert.match(html, /<a class="btn btn--primary btn--sm" href="(\.\/)?#early-access" data-cta="header"><span><span class="cta-long">Request <\/span>Early Access<\/span><\/a>/, `${name}: header call to action`);
    assert.match(html, /href="demo\.html"/, `${name}: links to the demo`);
  }
  // Header, mobile menu and footer are identical on every marketing page apart from the active
  // state and the homepage's in-page form link.
  const [, first] = marketing[0];
  for (const [name, html] of marketing) {
    assert.equal(portable(navOf(html)), portable(navOf(first)), `${name}: primary navigation matches`);
    assert.equal(portable(mobileOf(html)), portable(mobileOf(first)), `${name}: mobile menu matches`);
    assert.equal(portable(footerOf(html)), portable(footerOf(first)), `${name}: footer matches`);
    assert.deepEqual([...navOf(html).matchAll(/<a href="([^"]+)"/g)].map(m => m[1]), ['how-it-works.html', 'features.html', 'demo.html', 'faq.html'], `${name}: navigation order`);
    const current = [...navOf(html).matchAll(/<a href="([^"]+)" aria-current="page"/g)].map(m => m[1]);
    assert.deepEqual(current, name === 'index.html' ? [] : [name], `${name}: active navigation state`);
    const mobileCurrent = [...mobileOf(html).matchAll(/<a href="([^"]+)" aria-current="page"/g)].map(m => m[1]);
    assert.deepEqual(mobileCurrent, [name === 'index.html' ? './' : name], `${name}: active mobile menu state`);
  }
  // SEO: unique, descriptive titles and descriptions; one h1; no invented canonical or social URLs.
  const titles = new Set(), descriptions = new Set();
  for (const [name, html] of marketing) {
    const title = html.match(/<title>([^<]+)<\/title>/)[1], description = html.match(/<meta name="description" content="([^"]+)">/)[1];
    assert.match(title, /QuoteTend/, `${name}: title names QuoteTend`);
    assert.ok(description.length >= 80 && description.length <= 200, `${name}: description length ${description.length}`);
    titles.add(title); descriptions.add(description);
    assert.equal((html.match(/<h1[\s>]/g) || []).length, 1, `${name}: exactly one h1`);
    assert.match(html, /<html lang="en">/);
    assert.match(html, /<a class="skip-link" href="#main">/);
    assert.match(html, /<main id="main">/);
    assert.doesNotMatch(html, /rel="canonical"|property="og:(url|image)"|name="twitter:/, `${name}: no invented production URLs or social assets`);
    assert.doesNotMatch(html, /googletagmanager|google-analytics|gtag\(|plausible|segment\.com|hotjar|clarity\.ms|facebook\.net/, `${name}: no analytics or tracking`);
    for (const css of ['assets/css/tokens.css', 'assets/css/app.css', 'assets/css/site.css']) assert.ok(html.includes(`href="${css}"`), `${name}: ${css}`);
    assert.match(html, /<script type="module" src="assets\/js\/site\.js"><\/script>/);
  }
  assert.equal(titles.size, MARKETING.length, 'titles are unique');
  assert.equal(descriptions.size, MARKETING.length, 'descriptions are unique');
  // The homepage stays focused: hero, problem, three benefits, product preview and early access.
  const home = pages['index.html'];
  assert.deepEqual([...home.matchAll(/<section class="([\w -]+)"/g)].map(m => m[1].split(' ')[0]), ['hero', 'trades', 'section', 'section', 'section', 'early']);
  assert.equal((home.match(/<li class="benefit reveal">/g) || []).length, 3);
  for (const moved of ['data-calc', 'class="faq-item"', 'class="truth"', 'class="steps"']) assert.equal(home.includes(moved), false, `homepage no longer carries ${moved}`);
  assert.match(pages['how-it-works.html'], /data-calc="count"/);
  assert.equal((pages['how-it-works.html'].match(/<li class="flow-step reveal" id="step-\d">/g) || []).length, 5);
  assert.equal((pages['faq.html'].match(/<details class="faq-item">/g) || []).length, 11);
  assert.match(pages['features.html'], /<section class="section availability-section" id="availability"/);
  // Feature-page previews show only what the customer app has today.
  assert.equal((pages['features.html'].match(/data-shot="\w+" data-core/g) || []).length, 8);
});

test('contact configuration: only the official Formspree endpoint, nothing invented, no secrets', async () => {
  // The endpoint was supplied by the owner (Formspree form xbgdylzd). Booking and email stay unset.
  assert.deepEqual({ ...SITE_CONFIG, formExtraFields: { ...SITE_CONFIG.formExtraFields } },
    { formEndpoint: 'https://formspree.io/f/xbgdylzd', formExtraFields: {}, bookingUrl: '', contactEmail: '' });
  const url = new URL(SITE_CONFIG.formEndpoint);
  assert.equal(url.protocol, 'https:');
  assert.equal(url.host, 'formspree.io');
  assert.equal(url.search + url.hash + url.username + url.password, '', 'no credentials or keys in the endpoint URL');
  assert.equal(resolveContactConfig(SITE_CONFIG, { hostname: 'quotetend.com' }).mode, 'endpoint');
  assert.equal(resolveContactConfig(SITE_CONFIG, { hostname: '127.0.0.1' }).mode, 'endpoint', 'local preview submits too, for the owner’s live test');
  // No credential-shaped strings anywhere in the published site.
  const files = (await walk()).filter(f => /\.(html|css|js|svg|webmanifest)$/.test(f));
  const text = (await Promise.all(files.map(read))).join('\n');
  for (const pattern of [/\b(sk|pk|rk)_(live|test)_[0-9a-z]{8,}/i, /-----BEGIN [A-Z ]*PRIVATE KEY-----/, /\bAKIA[0-9A-Z]{16}\b/, /\bBearer\s+[\w.-]{16,}/,
    /(api[_-]?key|secret|access[_-]?token|auth[_-]?token|password)\s*[:=]\s*['"][^'"]+['"]/i, /\bgh[pousr]_[A-Za-z0-9]{20,}/, /\bxox[baprs]-[A-Za-z0-9-]{10,}/])
    assert.doesNotMatch(text, pattern, `credential-like string in published site: ${pattern}`);
  assert.deepEqual(text.match(/https:\/\/formspree\.io\/f\/\w+/g), ['https://formspree.io/f/xbgdylzd'], 'the endpoint appears once, in site-config.js');
});

test('brand: one vector Ꝙ source for the wordmark, favicon and icons; plain "QuoteTend" in metadata', async () => {
  const pages = { index: await read('index.html'), how: await read('how-it-works.html'), features: await read('features.html'), faq: await read('faq.html'), demo: await read('demo.html'), notFound: await read('404.html') };
  const marketing = [pages.index, pages.how, pages.features, pages.faq];
  const favicon = await read('assets/favicon.svg');
  for (const part of ['bowl', 'tail', 'stroke']) {
    for (const [name, html] of Object.entries({ ...pages, favicon })) assert.ok(html.includes(Q_GLYPH[part]), `${name} uses the shared ${part} path`);
  }
  // Header/footer wordmarks are exactly the component output; accessible text is the ordinary spelling.
  for (const html of marketing) {
    assert.ok(html.includes(wordmark().replace('class="wordmark "', 'class="wordmark"')), 'header wordmark matches components.wordmark()');
    assert.ok(html.includes(wordmark('wordmark--on-dark')), 'footer wordmark matches components.wordmark()');
    assert.equal((html.match(/aria-label="QuoteTend home"/g) || []).length, 2, 'header and footer brand links');
  }
  assert.ok(pages.demo.includes(wordmark('wordmark--on-dark')), 'demo wordmark matches components.wordmark()');
  assert.match(wordmark(), /aria-hidden="true">[\s\S]*<\/svg><\/span><span class="sr-only">QuoteTend<\/span>$/);
  assert.match(await read('assets/css/tokens.css'), /\.wordmark::after \{ content: "uoteTend"; \}/);
  for (const [name, html] of Object.entries(pages)) {
    assert.match(html.match(/<title>([^<]*)<\/title>/)[1], /QuoteTend/, `${name} title uses the ordinary spelling`);
    assert.doesNotMatch(html.replace(/<svg[\s\S]*?<\/svg>/g, ''), /\uA758|(?<!Q)uoteTend|Ƭ/, `${name} contains no stylized spelling in text, titles or labels`);
  }
  assert.match(pages.index, /aria-label="QuoteTend home"/);
  assert.match(pages.demo, /aria-label="QuoteTend website"/);
  for (const page of [...marketing, pages.demo]) {
    for (const link of ['href="favicon.ico"', 'href="assets/favicon.svg"', 'href="assets/icons/apple-touch-icon.png"', 'href="site.webmanifest"']) assert.ok(page.includes(link), link);
  }
  const manifest = JSON.parse(await read('site.webmanifest'));
  assert.equal(manifest.name, 'QuoteTend');
  const files = new Set(await walk());
  for (const icon of manifest.icons) assert.ok(files.has(icon.src), icon.src);
  for (const png of ['assets/icons/apple-touch-icon.png', ...manifest.icons.map(i => i.src)]) {
    const buf = await readFile(join(ROOT, png));
    assert.equal(buf.subarray(1, 4).toString(), 'PNG', `${png} is a PNG`);
    const [w, h] = [buf.readUInt32BE(16), buf.readUInt32BE(20)];
    assert.equal(w, h, `${png} is square`);
    assert.ok(w >= 180, `${png} is large enough (${w}px)`);
  }
  const ico = await readFile(join(ROOT, 'favicon.ico'));
  assert.deepEqual([ico.readUInt16LE(0), ico.readUInt16LE(2), ico.readUInt16LE(4)], [0, 1, 3], 'favicon.ico holds 16, 32 and 48px images');
});

test('early-access form logic: configuration, validation, payload and honest results', () => {
  // Configuration: only real, HTTPS, non-placeholder destinations are accepted.
  assert.equal(resolveContactConfig({}, { hostname: 'quotetend.com' }).mode, 'closed');
  assert.equal(resolveContactConfig({}, { hostname: '127.0.0.1' }).mode, 'preview');
  assert.equal(resolveContactConfig({ formEndpoint: 'http://formspree.io/f/abc' }, { hostname: 'quotetend.com' }).mode, 'closed', 'plain HTTP endpoint rejected');
  assert.equal(resolveContactConfig({ formEndpoint: 'https://formspree.io/f/abc' }, { hostname: 'quotetend.com' }).mode, 'endpoint');
  for (const placeholder of ['hello@example.com', 'a@quotetend.example', 'b@site.test', 'c@x.invalid', 'not-an-email'])
    assert.equal(resolveContactConfig({ contactEmail: placeholder }, { hostname: 'quotetend.com' }).email, '', placeholder);
  assert.equal(resolveContactConfig({ contactEmail: 'owner@quotetend-fixture.net' }, { hostname: 'quotetend.com' }).mode, 'email');
  assert.equal(resolveContactConfig({ bookingUrl: 'javascript:alert(1)' }).booking, '');
  assert.deepEqual(resolveContactConfig({ formExtraFields: { access_key: 'public-key', 'bad key': 'x', nested: { a: 1 } } }).extra, { access_key: 'public-key' });

  // Validation.
  const good = { name: 'Fictional Owner', company: 'Fictional Roofing Co', email: 'owner@fictional-roofing.net', phone: '(555) 010-0142', trade: 'Roofing', message: 'About 40 estimates a month.' };
  assert.deepEqual(validateRequest(good).errors, {});
  assert.deepEqual(Object.keys(validateRequest({}).errors).sort(), ['company', 'email', 'name', 'trade']);
  assert.match(validateRequest({ ...good, email: 'owner@' }).errors.email, /valid email/);
  assert.match(validateRequest({ ...good, phone: 'call me' }).errors.phone, /phone number/);
  assert.match(validateRequest({ ...good, trade: 'Plumbing' }).errors.trade, /Choose/);
  assert.match(validateRequest({ ...good, message: 'see https://a.co https://b.co www.c.co' }).errors.message, /links/);
  assert.match(validateRequest({ ...good, name: 'x'.repeat(LIMITS.name + 1) }).errors.name, /under/);
  assert.equal(validateRequest({ ...good, name: '  Fictional Owner  ' }).values.name, 'Fictional Owner');
  assert.ok(TRADES.includes('Roofing') && TRADES.includes('Other'));

  // Payload: honeypot present and empty, extra provider fields cannot override visitor input.
  const payload = buildPayload(validateRequest(good).values, { extra: { access_key: 'public-key', name: 'spoof' } }, 'https://quotetend.com/');
  assert.equal(payload.name, 'Fictional Owner');
  assert.equal(payload.access_key, 'public-key');
  assert.equal(payload._gotcha, '');
  assert.equal(payload.source, 'quotetend-website');
  assert.match(payload._subject, /Fictional Roofing Co/);

  // Results (Formspree contract): only a 2xx that positively confirms acceptance is success.
  assert.deepEqual(interpretResponse(200, { next: 'https://formspree.io/thanks', ok: true }), { ok: true });
  assert.deepEqual(interpretResponse(200, { next: 'https://formspree.io/thanks' }), { ok: true });
  assert.deepEqual(interpretResponse(200, { ok: true }), { ok: true });
  for (const unconfirmed of [null, {}, 'Thanks!']) {
    const r = interpretResponse(200, unconfirmed);
    assert.equal(r.ok, false, `2xx without confirmation (${JSON.stringify(unconfirmed)}) is not success`);
    assert.equal(r.unconfirmed, true);
  }
  assert.equal(interpretResponse(201, null).ok, false);
  assert.equal(interpretResponse(200, { errors: [{ message: 'should be an email' }] }).ok, false);
  assert.equal(interpretResponse(200, { error: 'Form not found' }).ok, false);
  assert.equal(interpretResponse(200, { ok: false }).ok, false);
  const validation = interpretResponse(422, { error: 'Validation errors', errors: [{ code: 'TYPE_EMAIL', field: 'email', message: 'should be an email' }] });
  assert.deepEqual(validation.fieldErrors, { email: 'Should be an email.' });
  assert.deepEqual(validation.codes, ['TYPE_EMAIL']);
  assert.match(validation.message, /flagged the highlighted fields/);
  assert.match(interpretResponse(422, { errors: [{ message: 'should be an email' }] }).message, /should be an email/);
  const inactive = interpretResponse(403, { error: 'Form not active', errors: [{ code: 'INACTIVE', message: 'This form is not active' }] });
  assert.match(inactive.message, /This form is not active/);
  assert.deepEqual(inactive.codes, ['INACTIVE']);
  assert.match(interpretResponse(404, { error: 'Form not found', errors: [{ code: 'FORM_NOT_FOUND', message: 'Form not found' }] }).message, /Form not found/);
  assert.match(interpretResponse(429, null).message, /wait a minute/);
  assert.match(interpretResponse(500, null).message, /HTTP 500/);
  assert.equal(interpretResponse(302, null).ok, false);

  // Email fallback only prepares a message for the visitor's own email app.
  assert.match(mailtoUrl(validateRequest(good).values, 'owner@quotetend-fixture.net'), /^mailto:owner@quotetend-fixture\.net\?subject=QuoteTend%20early%20access/);
});

test('every internal link and asset reference resolves inside the public site', async () => {
  const files = new Set(await walk());
  for (const page of PAGES) {
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
  for (const js of ['assets/js/site.js', 'assets/js/demo.js', 'assets/js/tour.js', 'assets/js/early-access.js']) {
    for (const [, href] of (await read(js)).matchAll(/href="((?:index|demo)\.html[^"]*)"/g)) assert.ok(files.has(href.split(/[?#]/)[0]), `${js}: ${href}`);
  }
  // Primary calls to action: Request Early Access first, the interactive demo second.
  const home = await read('index.html');
  assert.match(home, /<a class="btn btn--primary btn--lg" href="#early-access" data-cta="hero">Request Early Access /);
  assert.match(home, /<a class="btn btn--lg" href="demo\.html" data-cta="hero-demo">Try the Interactive Demo<\/a>/);
  assert.match(home, /href="demo\.html\?tour=1"/);
  assert.match(home, /id="early-access"/);
  // The demo keeps its own links back to the website and the homepage form.
  const demo = await read('demo.html');
  assert.match(demo, /class="app-brand" href="index\.html"/);
  assert.match(demo, /<a class="app-cta" href="index\.html#early-access">Early access<\/a>/);
  assert.match(demo, /href="index\.html" data-icon="arrowLeft">Back to website<\/a>/);
});

function raw(port, path, method = 'GET') {
  return new Promise((done, fail) => {
    const req = request({ host: '127.0.0.1', port, path, method }, res => {
      let body = ''; res.setEncoding('utf8'); res.on('data', c => { body += c; }); res.on('end', () => done({ status: res.statusCode, type: res.headers['content-type'] || '', headers: res.headers, body }));
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
    for (const missing of ['/apple-touch-icon-precomposed.png', '/missing-page', '/assets/missing.css', '/demo', '/assets']) {
      const r = await raw(srv.port, missing);
      assert.equal(r.status, 404, missing);
    }
    assert.match((await raw(srv.port, '/missing-page')).body, /This page isn’t here/);
    for (const page of ['/demo.html', '/demo.html?tour=1', '/index.html#early-access', '/assets/css/site.css', '/assets/js/demo.js', '/assets/favicon.svg', '/favicon.ico', '/site.webmanifest', '/assets/icons/icon-512.png']) {
      const r = await raw(srv.port, page);
      assert.equal(r.status, 200, page);
    }
    // Sprint 1.7 pages are plain .html files served like the others, with the same protective headers.
    for (const [page, heading] of [['/', /Your next job might already be in/], ['/how-it-works.html', /From a pile of estimates to a clear next step/], ['/features.html', /Everything that happens after the estimate goes out/], ['/faq.html', /Practical questions, straight answers/]]) {
      const r = await raw(srv.port, page);
      assert.equal(r.status, 200, page); assert.match(r.type, /text\/html/, page); assert.match(r.body, heading, page);
      assert.equal(r.headers['x-content-type-options'], 'nosniff', page);
      assert.equal(r.headers['x-frame-options'], 'SAMEORIGIN', page);
      assert.equal(r.headers['referrer-policy'], 'strict-origin-when-cross-origin', page);
    }
    for (const missing of ['/how-it-works', '/features/', '/faq.htm']) assert.equal((await raw(srv.port, missing)).status, 404, missing);
    assert.match((await raw(srv.port, '/assets/js/demo.js')).type, /javascript/);
    assert.match((await raw(srv.port, '/assets/css/site.css')).type, /text\/css/);
    assert.match((await raw(srv.port, '/favicon.ico')).type, /image\/x-icon/);
    assert.match((await raw(srv.port, '/site.webmanifest')).type, /manifest\+json/);
    assert.match((await raw(srv.port, '/assets/icons/icon-512.png')).type, /image\/png/);
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
  // The demo maps the original columns; the private mapper also offers optional phone, address and trade
  // columns (schema 3), which the sample file does not contain.
  assert.deepEqual(Object.fromEntries(Object.entries(demo.mapping).map(([k, v]) => [k, v < 0 ? '' : String(v)])), Object.fromEntries(Object.keys(demo.mapping).map(k => [k, sheet.mapping[k]])));
  assert.deepEqual(Object.keys(sheet.mapping).filter(k => !(k in demo.mapping)), ['customer_phone', 'address', 'trade']);
  for (const k of ['customer_phone', 'address', 'trade']) assert.equal(sheet.mapping[k], '');
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
