// Early-access request form for a static site. Submissions go to a provider-hosted form endpoint
// (configured in site-config.js); there is no QuoteTend backend. The page only reports success after
// the provider accepts the request, and nothing is ever shown as sent while unconfigured.
import { esc, icon } from './components.js';

export const TRADES = ['Roofing', 'Siding', 'Windows & doors', 'Gutters', 'Exterior remodeling', 'General contracting', 'Other'];
export const LIMITS = Object.freeze({ name: 120, company: 160, email: 200, phone: 40, message: 1500 });
export const MIN_FILL_MS = 3000; // Faster than a person can fill the form: almost certainly automated.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PLACEHOLDER_EMAIL = /@(example\.(com|org|net)|[^@]*\.(example|test|invalid|localhost))$/i;

// Accept only values that can really be used. Placeholder domains are never published.
export function resolveContactConfig(raw = {}, { hostname = '', protocol = 'https:' } = {}) {
  const https = v => typeof v === 'string' && /^https:\/\/[^\s]+$/i.test(v) ? v : '';
  const email = typeof raw.contactEmail === 'string' && EMAIL.test(raw.contactEmail) && !PLACEHOLDER_EMAIL.test(raw.contactEmail) ? raw.contactEmail : '';
  const extra = raw.formExtraFields && typeof raw.formExtraFields === 'object' && !Array.isArray(raw.formExtraFields)
    ? Object.fromEntries(Object.entries(raw.formExtraFields).filter(([k, v]) => /^[\w-]{1,40}$/.test(k) && ['string', 'number', 'boolean'].includes(typeof v))) : {};
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(hostname) || hostname.endsWith('.localhost') || protocol === 'file:';
  const endpoint = https(raw.formEndpoint);
  return { endpoint, email, booking: https(raw.bookingUrl), extra, local, mode: endpoint ? 'endpoint' : email ? 'email' : local ? 'preview' : 'closed' };
}

export function validateRequest(data) {
  const v = Object.fromEntries(['name', 'company', 'email', 'phone', 'trade', 'message'].map(k => [k, String(data[k] ?? '').trim()]));
  const errors = {};
  if (!v.name) errors.name = 'Enter your name.';
  if (!v.company) errors.company = 'Enter your company name.';
  if (!v.email) errors.email = 'Enter your business email.';
  else if (!EMAIL.test(v.email)) errors.email = 'Enter a valid email address, like name@yourcompany.com.';
  if (v.phone && !/^[+()\d\s.-]{7,}$/.test(v.phone)) errors.phone = 'Enter a phone number using digits, spaces or dashes.';
  if (!TRADES.includes(v.trade)) errors.trade = 'Choose the type of contracting business.';
  if ((v.message.match(/https?:\/\/|www\./gi) || []).length > 2) errors.message = 'Please remove the links from your message.';
  for (const [k, max] of Object.entries(LIMITS)) if (v[k].length > max) errors[k] = `Keep this under ${max} characters.`;
  return { values: v, errors, ok: Object.keys(errors).length === 0 };
}

export function buildPayload(values, config, page = '') {
  return {
    ...config.extra, ...values,
    _subject: `QuoteTend early access: ${values.company}`,
    _gotcha: '', source: 'quotetend-website', ...(page ? { page } : {})
  };
}

// Formspree's JSON contract: success is a 2xx response with { next } (older forms also send
// { ok: true }); errors are { error, errors: [{ code, field, message }] }. Only a 2xx response that
// positively confirms acceptance counts as received.
const FIELDS = ['name', 'company', 'email', 'phone', 'trade', 'message'];
const sentence = s => { const t = String(s).trim().slice(0, 160); return t && `${t[0].toUpperCase()}${t.slice(1)}${/[.!?]$/.test(t) ? '' : '.'}`; };
export function interpretResponse(status, body) {
  const b = body && typeof body === 'object' ? body : {};
  const errors = Array.isArray(b.errors) ? b.errors.filter(e => e && typeof e.message === 'string') : [];
  const codes = errors.map(e => e.code).filter(c => typeof c === 'string');
  const providerError = errors.length > 0 || typeof b.error === 'string' || b.ok === false;
  if (status >= 200 && status < 300 && !providerError) {
    return typeof b.next === 'string' || b.ok === true ? { ok: true }
      : { ok: false, unconfirmed: true, codes, message: 'The form service didn’t confirm that your request was received.' };
  }
  if (status === 429) return { ok: false, codes, message: 'Too many requests were sent from this connection. Please wait a minute and try again.' };
  const fieldErrors = {};
  for (const e of errors) if (FIELDS.includes(e.field) && !fieldErrors[e.field]) fieldErrors[e.field] = sentence(e.message);
  const detail = (errors.find(e => !FIELDS.includes(e.field))?.message || (typeof b.error === 'string' ? b.error : '')).slice(0, 200);
  const message = Object.keys(fieldErrors).length ? 'The form service flagged the highlighted fields.'
    : detail ? `The request wasn’t accepted: ${detail}` : `The request wasn’t accepted by the form service (HTTP ${status}).`;
  return { ok: false, codes, fieldErrors, message };
}

export function mailtoUrl(values, email) {
  const body = [`Name: ${values.name}`, `Company: ${values.company}`, `Email: ${values.email}`, values.phone && `Phone: ${values.phone}`,
    `Business type: ${values.trade}`, values.message && `\n${values.message}`].filter(Boolean).join('\n');
  return `mailto:${email}?subject=${encodeURIComponent(`QuoteTend early access: ${values.company}`)}&body=${encodeURIComponent(body)}`;
}

// ---------------- DOM ----------------
const field = (name, label, control, { optional = false, full = false } = {}) => `<div class="field ${full ? 'full' : ''}">
  <label for="ea-${name}">${label}${optional ? ' <span class="opt">optional</span>' : ''}</label>${control}
  <p class="field-error" id="ea-${name}-error" data-error-for="${name}"></p></div>`;
const input = (name, attrs) => `<input id="ea-${name}" name="${name}" aria-describedby="ea-${name}-error" ${attrs}>`;

function formMarkup(config) {
  const submitLabel = 'Request Early Access';
  const booking = config.booking ? `<a class="btn" href="${esc(config.booking)}" target="_blank" rel="noopener">Book a Demo ${icon('external')}</a>` : '';
  const note = {
    endpoint: 'Your details are sent to QuoteTend through Formspree, our form service, and used to reply about early access.',
    email: 'Opens your email app with your details filled in. Nothing is sent until you press Send there.',
    preview: 'Local preview: this form isn’t connected to a form service yet, so requests are checked but not sent.'
  }[config.mode];
  return `${config.mode === 'preview' ? `<p class="config-hint" data-preview-hint><strong>Not connected (local preview only).</strong> Set <code>formEndpoint</code> in <code>assets/js/site-config.js</code> to receive requests. See <code>docs/PUBLIC_SITE.md</code>.</p>` : ''}
    <form class="form" data-early-form novalidate>
      ${field('name', 'Your name', input('name', `autocomplete="name" required maxlength="${LIMITS.name}"`))}
      ${field('company', 'Company name', input('company', `autocomplete="organization" required maxlength="${LIMITS.company}"`))}
      ${field('email', 'Business email', input('email', `type="email" autocomplete="email" inputmode="email" required maxlength="${LIMITS.email}"`))}
      ${field('phone', 'Phone', input('phone', `type="tel" autocomplete="tel" maxlength="${LIMITS.phone}"`), { optional: true })}
      ${field('trade', 'Type of contracting business', `<select id="ea-trade" name="trade" required aria-describedby="ea-trade-error"><option value="">Choose one</option>${TRADES.map(t => `<option>${esc(t)}</option>`).join('')}</select>`, { full: true })}
      ${field('message', 'Anything we should know?', `<textarea id="ea-message" name="message" maxlength="${LIMITS.message}" aria-describedby="ea-message-error" placeholder="For example: how many estimates you send, and where they live today"></textarea>`, { optional: true, full: true })}
      <div class="hp" aria-hidden="true"><label for="ea-gotcha">Leave this field empty</label><input id="ea-gotcha" name="_gotcha" tabindex="-1" autocomplete="off"></div>
      <p class="form-status" data-form-status role="status" aria-live="polite"></p>
      <div class="form-actions"><button class="btn btn--primary" type="submit">${submitLabel} ${icon('arrowRight')}</button>${booking}</div>
      <p class="form-privacy">${note}${config.email && config.mode === 'endpoint' ? ` Prefer email? <a href="mailto:${esc(config.email)}">${esc(config.email)}</a>` : ''}</p>
    </form>`;
}

function closedMarkup(config) {
  return config.booking
    ? `<div class="form-actions"><a class="btn btn--primary" href="${esc(config.booking)}" target="_blank" rel="noopener">Book a Demo ${icon('external')}</a><a class="btn" href="demo.html?tour=1">Start the guided tour</a></div>`
    : `<div class="form-actions"><a class="btn btn--primary" href="demo.html?tour=1">Start the guided tour ${icon('arrowRight')}</a></div>`;
}

export function mountEarlyAccess(card, config, { fetchImpl = (...a) => fetch(...a), now = () => Date.now(), navigate = url => { location.href = url; } } = {}) {
  const slot = card.querySelector('[data-early-pending]');
  const title = card.querySelector('h3'), intro = card.querySelector(':scope > p');
  card.dataset.mode = config.mode;
  if (config.mode === 'closed') {
    title.textContent = config.booking ? 'Book a demo' : 'Early-access requests open soon';
    intro.textContent = config.booking ? 'Pick a time for a short call about how your team handles estimates today and whether QuoteTend fits.'
      : 'Requests aren’t being taken on this site yet. In the meantime, the interactive demo walks through the core workflow with fictional data.';
    slot.innerHTML = closedMarkup(config);
    return null;
  }
  slot.innerHTML = formMarkup(config);
  const form = slot.querySelector('[data-early-form]');
  const status = form.querySelector('[data-form-status]');
  const button = form.querySelector('button[type="submit"]');
  let readyAt = now(), sending = false;
  const setStatus = (kind, text) => { status.className = `form-status${kind ? ` form-status--${kind}` : ''}`; status.textContent = text; };
  const showErrors = errors => {
    for (const el of form.querySelectorAll('[data-error-for]')) {
      const name = el.dataset.errorFor, control = form.elements[name];
      el.textContent = errors[name] || '';
      if (errors[name]) control.setAttribute('aria-invalid', 'true'); else control.removeAttribute('aria-invalid');
    }
  };
  form.addEventListener('input', e => { if (e.target.getAttribute('aria-invalid') === 'true') { e.target.removeAttribute('aria-invalid'); form.querySelector(`[data-error-for="${e.target.name}"]`).textContent = ''; } });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (sending) return;
    const { values, errors, ok } = validateRequest(Object.fromEntries(new FormData(form).entries()));
    showErrors(errors);
    if (!ok) {
      setStatus('error', 'Please check the highlighted fields.');
      form.elements[Object.keys(errors)[0]]?.focus();
      return;
    }
    if (form.elements._gotcha.value) { setStatus('error', 'Your request couldn’t be sent. Please try again.'); return; }
    if (now() - readyAt < MIN_FILL_MS) { readyAt = now() - MIN_FILL_MS; setStatus('warn', 'Please take a moment to check your details, then submit again.'); return; }

    if (config.mode === 'preview') {
      setStatus('warn', 'Not sent. This local preview isn’t connected to a form service yet, so nothing left this page.');
      return;
    }
    if (config.mode === 'email') {
      navigate(mailtoUrl(values, config.email));
      setStatus('warn', `Your email app should open with this request filled in. It hasn’t been sent yet — press Send in your email app to deliver it to ${config.email}.`);
      return;
    }

    sending = true; button.disabled = true; button.setAttribute('aria-busy', 'true');
    setStatus('', 'Sending your request…');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetchImpl(config.endpoint, { method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(buildPayload(values, config, `${location.origin}${location.pathname}`)), signal: controller.signal });
      const body = await res.json().catch(() => null);
      const result = interpretResponse(res.status, body);
      if (!result.ok) {
        // Non-personal diagnostics: tells a site owner whether the form service or the page rejected it.
        console.warn('QuoteTend early-access request not accepted', { status: res.status, codes: result.codes });
        if (result.fieldErrors && Object.keys(result.fieldErrors).length) { showErrors(result.fieldErrors); form.elements[Object.keys(result.fieldErrors)[0]]?.focus(); }
        throw Object.assign(new Error(result.message), { shown: true, unconfirmed: result.unconfirmed });
      }
      slot.innerHTML = `<div class="form-success" tabindex="-1" data-form-success>${icon('checkCircle')}<h4>Request received</h4>
        <p>Thanks, ${esc(values.name.split(/\s+/)[0])}. We’ll reply to <strong>${esc(values.email)}</strong> about early access for ${esc(values.company)}.</p>
        <a class="btn" href="demo.html?tour=1">While you wait, take the guided tour ${icon('arrowRight')}</a></div>`;
      if (intro) intro.hidden = true;
      slot.querySelector('[data-form-success]').focus();
    } catch (error) {
      if (!error.shown) console.warn('QuoteTend early-access request failed before a response', { error: error.name });
      const reason = error.shown ? error.message : error.name === 'AbortError' ? 'The form service didn’t respond in time.' : 'We couldn’t reach the form service.';
      // Without a response (timeout) or with an unconfirmed one, delivery is unknown rather than failed.
      const outcome = error.unconfirmed || error.name === 'AbortError' ? 'We can’t confirm your request was received' : 'Your request was not sent';
      setStatus('error', `${reason} ${outcome} — please try again${config.email ? ` or email ${config.email}` : ''}.`);
    } finally {
      clearTimeout(timer); sending = false;
      if (button.isConnected) { button.disabled = false; button.removeAttribute('aria-busy'); }
    }
  });
  return form;
}
