// QuoteTend private application: authenticated state, routing, commands and interaction.
// The server is authoritative. This module renders the workspace it returns and sends focused
// commands (create, edit, draft, contact, outcome, import, restore …) through app/api.js. Nothing is
// recorded on the client alone, and copying a draft never records a contact.
import { request, sendCommand, loadAccount, announceSessionChange } from '/app/api.js';
import * as D from '/domain.js';
import { inspectSpreadsheet, statusesFor, statusSuggestions, previewSpreadsheet, looksDayMonthYear, FIELD_LABELS } from '/import-mapping.js';
import { contactEvidence, contactsPerWeek } from '/results.js';
import { esc, icon, wordmark, initials, money, plural, weekdayDate, shortDate, applySizes, detailHeader, factsAndJob, blockedNotice, draftPanel,
  contactForm, scheduleSection, outcomeSection, timeline } from '/app/ui.js';
import * as V from '/app/views.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const VIEWS = { overview: 'Overview', estimates: 'Estimates', followups: 'Follow-ups', results: 'Follow-up Results', import: 'Import', settings: 'Settings & data' };
const NAV = ['overview', 'estimates', 'followups', 'results', 'import'];
const RENDER = { overview: V.overview, estimates: V.estimates, followups: V.followups, results: V.resultsView, import: V.importView, settings: V.settings };
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const app = $('[data-app]'), main = $('[data-main]'), drawer = $('[data-drawer]'), scrim = $('[data-drawer-scrim]'), toastEl = $('[data-toast]');
const confirmEl = $('[data-confirm]'), editorEl = $('[data-editor]'), exportEl = $('[data-export]'), banner = $('[data-banner]');
const navToggle = $('[data-nav-toggle]'), navScrim = $('[data-nav-scrim]');

let me = null, configuration = {}, ws = null, prefs = {};
let busy = false;          // one command at a time; protects against double submission
let blocked = null;        // { kind: 'stale' | 'session' } — further changes wait for a reload or sign-in
let lastTrigger = null;
const freshImport = () => ({ step: 'choose', name: '', sheet: null, mapping: null, options: { dateFormat: 'iso', defaultStatus: 'sent', statusMap: {}, optOutReviewed: false, defaultFollowUp: '' }, rows: null, revision: null, error: '', pasted: '', done: null });
const ui = { view: 'overview', query: '', status: 'all', followup: 'any', trade: 'all', sort: 'followup', limit: 100, queueLimit: 100, queue: 'due', range: 30, from: '', to: '', group: 'cohort',
  drawer: null, drafts: {}, contactValues: {}, draftStatus: '', draftOk: false, imp: freshImport() };
const results = { key: '', data: null, weekly: null, error: '', request: 0 };
const ctx = () => ({ ws, me, configuration, ui, prefs, results, today: D.todayISO() });
const find = id => ws.quotes.find(q => q.estimate_id === id);

// ---------- Per-browser UI preferences (never business data) ----------
const prefsKey = () => `quotetend.account.${ws.businessId}.prefs`;
function loadPrefs() { try { prefs = JSON.parse(localStorage.getItem(prefsKey())) || {}; } catch { prefs = {}; } }
function savePrefs() { try { localStorage.setItem(prefsKey(), JSON.stringify(prefs)); } catch { /* storage unavailable */ } }

// ---------- Feedback ----------
let toastTimer;
function toast(message, { error = false } = {}) {
  toastEl.innerHTML = `${icon(error ? 'alert' : 'checkCircle')}<span>${esc(message)}</span>`;
  toastEl.classList.toggle('is-error', error);
  toastEl.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('is-on'), error ? 7000 : 4200);
}
function confirmAction({ title, body, confirm, tone = 'ok', focusCancel = false }) {
  return new Promise(resolve => {
    confirmEl.innerHTML = `<form method="dialog"><div class="confirm__body"><span class="confirm__icon ${tone === 'warn' ? 'is-warn' : ''}">${icon(tone === 'warn' ? 'alert' : 'checkCircle')}</span>
      <h2 id="confirm-title">${esc(title)}</h2><p id="confirm-body">${esc(body)}</p></div>
      <div class="confirm__actions"><button class="qt-btn" type="submit" value="cancel" data-confirm-cancel>Cancel</button><button class="qt-btn qt-btn--primary" type="submit" value="ok" data-confirm-ok>${esc(confirm)}</button></div></form>`;
    confirmEl.returnValue = '';
    confirmEl.addEventListener('close', () => resolve(confirmEl.returnValue === 'ok'), { once: true });
    confirmEl.showModal();
    $(focusCancel ? '[data-confirm-cancel]' : '[data-confirm-ok]', confirmEl).focus();
  });
}
function showBanner() {
  if (!blocked) { banner.hidden = true; banner.innerHTML = ''; return; }
  banner.innerHTML = blocked.kind === 'session'
    ? `${icon('alert')}<p>Your session has ended. Sign in again to keep working. Changes that were not confirmed were not saved.</p><a class="qt-btn qt-btn--primary" href="/signin">Sign in again</a>`
    : `${icon('alert')}<p>This workspace changed in another tab or device. Your last change was not saved. Copy any unsaved text, then load the latest data.</p><button class="qt-btn qt-btn--primary" type="button" data-action="reload-workspace">${icon('refresh')}Load latest data</button>`;
  banner.hidden = false;
}
function showError(message, target) {
  const box = target && (target.matches?.('[data-form-error], .dialog-error') ? target : $('[data-form-error], .dialog-error', target));
  if (box) box.textContent = message;
}
function failure(error, target) {
  if (error.kind === 'stale' || error.kind === 'session') { blocked = { kind: error.kind }; showBanner(); }
  const message = error.kind === 'stale' ? 'Not saved: this workspace changed in another tab or device. Copy any unsaved text, then load the latest data.'
    : error.kind === 'session' ? 'Not saved: your session has ended. Sign in again, then retry.' : error.message;
  showError(message, target);
  toast(message, { error: true });
}
function setPending(button, on) { if (button) { button.disabled = on; button.setAttribute('aria-busy', String(on)); } }

// ---------- Commands ----------
async function run(command, { success, target, button, after } = {}) {
  if (blocked) { failure({ kind: blocked.kind, message: '' }, target); return false; }
  if (busy) { toast('Still saving your previous change…'); return false; }
  busy = true; setPending(button, true); showError('', target);
  try {
    const { replayed, ...saved } = await sendCommand(ws.businessId, ws.revision, command);
    ws = saved; results.key = '';
    after?.();
    renderAll();
    if (success) toast(success);
    return true;
  } catch (error) { failure(error, target); return false; }
  finally { busy = false; setPending(button, false); }
}
async function reloadWorkspace({ announce = true } = {}) {
  try {
    ws = await request('/workspaces/' + encodeURIComponent(ws.businessId));
    me = await request('/me');
    blocked = null; results.key = ''; showBanner(); renderAll();
    if (announce) toast('Latest saved data loaded.');
  } catch (error) { failure(error); }
}

// ---------- Rendering ----------
function renderChrome() {
  const m = D.metrics(ws.quotes, D.todayISO());
  $('[data-nav-list]').innerHTML = NAV.map(k => `<li><a href="#${k}" data-nav="${k}" ${ui.view === k ? 'aria-current="page"' : ''}>${icon(k)}<span>${VIEWS[k]}</span>${
    k === 'estimates' ? `<em>${ws.quotes.length}</em>` : k === 'followups' ? `<em class="${m.dueCount ? 'is-alert' : ''}">${m.dueCount}<span class="sr-only"> due</span></em>` : ''}</a></li>`).join('');
  $$('.app-side__foot [data-nav]').forEach(a => a.dataset.nav === ui.view ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'));
  $('[data-crumb]').textContent = VIEWS[ui.view];
  document.title = `${VIEWS[ui.view]} · QuoteTend`;
}
function render({ focus = false } = {}) {
  renderChrome();
  if (ui.view === 'import' && ui.imp.step === 'preview' && ui.imp.revision !== ws.revision) {
    Object.assign(ui.imp, { step: 'map', rows: null, error: 'Your workspace changed since this preview. Preview again before importing.' });
  }
  if (ui.view === 'results') { prefs.visitedResults = true; savePrefs(); ensureRange(); }
  main.innerHTML = RENDER[ui.view](ctx());
  applySizes(main);
  if (ui.view === 'results') loadResults();
  if (focus) $('h1', main)?.focus();
}
function renderAll() {
  render();
  if (ui.drawer) renderDrawer();
}

// ---------- Routing (hash: #view or #view/estimate-id) ----------
function parseHash() {
  const raw = location.hash.slice(1), cut = raw.indexOf('/');
  const view = cut < 0 ? raw : raw.slice(0, cut);
  let id = null; try { id = cut < 0 ? null : decodeURIComponent(raw.slice(cut + 1)) || null; } catch { id = null; }
  return { view: VIEWS[view] ? view : 'overview', id };
}
function navigate(view, { focus = true } = {}) {
  if (!VIEWS[view]) view = 'overview';
  if (ui.drawer) closeDrawerUI({ restoreFocus: false });
  ui.view = view; ui.limit = 100; ui.queueLimit = 100;
  if (view === 'import' && ui.imp.step === 'done') ui.imp = freshImport();   // a finished import starts fresh; in-progress ones are kept
  if (location.hash !== '#' + view) history.pushState(null, '', '#' + view);
  closeNav();
  render({ focus });
  window.scrollTo({ top: 0, behavior: 'auto' });
}
function applyPreset(preset) {
  const [key, value] = preset.split(':');
  if (key === 'queue') ui.queue = value;
  if (key === 'status') Object.assign(ui, { status: value, query: '', followup: 'any', trade: 'all' });
  if (key === 'query') Object.assign(ui, { query: value, status: 'all', followup: 'any', trade: 'all' });
}
addEventListener('popstate', () => {
  if (!ws) return;
  const { view, id } = parseHash();
  if (view !== ui.view) { if (ui.drawer) closeDrawerUI({ restoreFocus: false }); ui.view = view; render({ focus: true }); }
  if (id && id !== ui.drawer) openDrawer(id, { push: false });
  else if (!id && ui.drawer) closeDrawerUI();
});

// ---------- Mobile navigation ----------
function closeNav() {
  if (!app.classList.contains('nav-open')) return;
  app.classList.remove('nav-open'); navScrim.hidden = true; navToggle.setAttribute('aria-expanded', 'false');
}
navToggle.addEventListener('click', () => {
  const open = !app.classList.contains('nav-open');
  app.classList.toggle('nav-open', open); navScrim.hidden = !open; navToggle.setAttribute('aria-expanded', String(open));
  if (open) $('.app-nav a', app)?.focus();
});
navScrim.addEventListener('click', closeNav);

// ---------- Estimate drawer ----------
function originOf(q) { return ws.identities?.find(i => i.estimateId.toLowerCase() === q.estimate_id.toLowerCase())?.origin; }
function renderDrawer() {
  const q = find(ui.drawer);
  if (!q) { closeDrawerUI({ restoreFocus: false }); toast('That estimate is no longer in this workspace.', { error: true }); return; }
  const today = D.todayISO(), quotes = ws.quotes, canFollow = D.eligible(q, quotes), origin = originOf(q);
  const body = $('.drawer__body', drawer), scroll = body?.scrollTop || 0;
  const correctionsOpen = !!$('[data-corrections]', drawer)?.open;
  const hasContacts = q.last_contact_date || q.history.some(h => h.type === 'contact');
  drawer.innerHTML = `<div class="drawer__head">${detailHeader(q, quotes, origin)}</div><div class="drawer__body"><div class="qt-detail">
    ${factsAndJob(q, today, quotes)}${blockedNotice(q, quotes)}
    ${canFollow ? draftPanel(q, { text: ui.drafts[q.estimate_id], template: D.draftMessage(q, ws.businessName, quotes), status: ui.draftStatus, statusOk: ui.draftOk }) + contactForm(q, today, ui.contactValues[q.estimate_id]) + scheduleSection(q, today) : ''}
    ${outcomeSection(q, today)}
    ${origin && origin !== 'created' ? `<div class="qt-notice qt-notice--gold">${icon('info')}<p>This estimate was ${origin === 'imported' ? 'imported' : origin === 'restored' ? 'restored from a workspace export' : 'recorded before Follow-up Results began'}. Activity before that is not verified and is not counted in Follow-up Results.</p></div>` : ''}
    <section class="qt-section" aria-labelledby="history-h"><div class="qt-section__head"><h3 id="history-h">${icon('followups')}Activity history</h3><span class="qt-chip">${plural(q.history.length, 'entry', 'entries')}</span></div>${timeline(q, today)}</section>
    ${hasContacts ? `<section class="qt-section qt-section--muted" aria-label="Contact corrections"><details data-corrections ${correctionsOpen ? 'open' : ''}><summary>Correct or void a logged contact</summary><div data-corrections-body><div class="loading-line"><span class="spinner" aria-hidden="true"></span>Loading logged contacts…</div></div></details></section>` : ''}
  </div></div>`;
  applySizes(drawer);
  $('.drawer__body', drawer).scrollTop = scroll;
  if (correctionsOpen) loadCorrections(q.estimate_id);
}
function openDrawer(id, { trigger = document.activeElement, push = true } = {}) {
  if (!find(id)) { toast('That estimate is no longer in this workspace.', { error: true }); return; }
  const wasOpen = !!ui.drawer;
  if (ui.drawer !== id) { ui.draftStatus = ''; ui.draftOk = false; }
  ui.drawer = id;
  if (!wasOpen) lastTrigger = trigger;
  if (push) history[wasOpen ? 'replaceState' : 'pushState']({ drawer: true }, '', `#${ui.view}/${encodeURIComponent(id)}`);
  renderDrawer();
  drawer.hidden = false; scrim.hidden = false; app.inert = true;
  document.body.classList.add('drawer-open');
  closeNav();
  $('#drawer-title', drawer)?.focus();
}
function closeDrawer() {
  if (!ui.drawer) return;
  if (history.state?.drawer) history.back();      // popstate closes it, so Back and the close button agree
  else { history.replaceState(null, '', '#' + ui.view); closeDrawerUI(); }
}
function closeDrawerUI({ restoreFocus = true } = {}) {
  if (!ui.drawer) return;
  const id = ui.drawer;
  ui.drawer = null; ui.draftStatus = '';
  drawer.hidden = true; scrim.hidden = true; drawer.innerHTML = '';
  app.inert = false;
  document.body.classList.remove('drawer-open');
  if (restoreFocus) (lastTrigger?.isConnected ? lastTrigger : $(`[data-open="${CSS.escape(id)}"]`, main) || $('h1', main))?.focus();
}
function setDraftStatus(text, ok) {
  ui.draftStatus = text; ui.draftOk = ok;
  const el = $('[data-draft-status]', drawer);
  if (el) { el.textContent = text; el.classList.toggle('is-success', ok); }
}
async function copyDraft() {
  const ta = $('#draft-text', drawer);
  if (!ta) return;
  let ok = false;
  try { await navigator.clipboard.writeText(ta.value); ok = true; } catch { /* fall back below */ }
  if (!ok) { ta.focus(); ta.select(); try { ok = document.execCommand('copy'); } catch { ok = false; } }
  setDraftStatus(ok ? 'Draft copied to your clipboard. Nothing was sent and no contact was recorded — paste it into your own email or text app, then log the contact once it happens.'
    : 'Your browser blocked copying. The draft is selected — press Ctrl+C (or ⌘C) to copy it. Nothing was sent.', ok);
  toast(ok ? 'Draft copied. Nothing was sent.' : 'Copy blocked — the draft is selected instead.', { error: !ok });
}
async function outcome(kind, button) {
  const q = find(ui.drawer); if (!q) return;
  const date = $('[data-outcome-date]', drawer)?.value || D.todayISO();
  if (['won', 'lost', 'confirm'].includes(kind) && (!D.validDate(date) || date < q.estimate_date || date > D.todayISO())) {
    toast('Choose a decision date between the estimate date and today.', { error: true }); $('[data-outcome-date]', drawer)?.focus(); return;
  }
  const next = D.addDays(D.todayISO(), 3);
  const copy = {
    won: { title: 'Mark this estimate won?', body: `This records ${q.customer_name}’s ${money(q.amount_usd)} estimate as won on ${weekdayDate(date)} and clears its follow-up date. The activity history is kept.`, confirm: 'Mark won', done: 'Estimate marked won. It has left the follow-up queues.', command: { kind: 'outcome', estimateId: q.estimate_id, status: 'won', effectiveDate: date } },
    lost: { title: 'Mark this estimate lost?', body: `This records ${q.customer_name}’s ${money(q.amount_usd)} estimate as lost on ${weekdayDate(date)} and clears its follow-up date. The activity history is kept.`, confirm: 'Mark lost', done: 'Estimate marked lost. It has left the follow-up queues.', command: { kind: 'outcome', estimateId: q.estimate_id, status: 'lost', effectiveDate: date } },
    confirm: { title: 'Correct the reported decision date?', body: `This records that the ${q.status} decision was reported on ${weekdayDate(date)}. The earlier entry stays in the history.`, confirm: 'Save date', done: 'Decision date corrected. Results recalculated.', command: { kind: 'outcome', estimateId: q.estimate_id, status: q.status, effectiveDate: date } },
    reopen: { title: 'Reopen this estimate?', body: `This changes the status from ${q.status} back to sent. It will appear under “Needs a date” until you schedule a follow-up. The history is kept.`, confirm: 'Reopen as sent', done: 'Estimate reopened. Schedule its next follow-up.', command: { kind: 'edit', estimateId: q.estimate_id, fields: { status: 'sent' } } },
    sent: { title: 'Mark this estimate sent?', body: `Use this once you have shared the estimate with ${q.customer_name}. It enters the follow-up queue with a first follow-up on ${weekdayDate(next)}; you can change the date afterward.`, confirm: 'Mark sent', done: `Marked sent. First follow-up ${weekdayDate(next)}.`, command: { kind: 'edit', estimateId: q.estimate_id, fields: { status: 'sent', next_follow_up_date: next } } },
    optout: { title: 'Stop follow-ups for this customer?', body: 'This estimate and any estimates sharing the same email leave every follow-up queue. Their follow-up dates are cleared and drafts are paused. Only remove an opt-out later after confirming the customer’s preference.', confirm: 'Do not contact', done: 'Follow-ups stopped for this customer.', tone: 'warn', command: { kind: 'edit', estimateId: q.estimate_id, fields: { do_not_contact: true } } }
  }[kind];
  // Follow-up Results only counts a decision that follows a logged contact. Say so before the owner records one without
  // any, so a decision reached on a follow-up call isn't silently left out (log the call first, then the decision).
  if (['won', 'lost'].includes(kind) && !q.history.some(h => h.type === 'contact'))
    copy.body += ' No contact is logged for this estimate, so Follow-up Results won’t count this as a decision after a follow-up. If it came out of a call or message, cancel and log that contact first.';
  if (!copy || !await confirmAction({ ...copy, focusCancel: kind === 'optout' })) return;
  if (await run(copy.command, { success: copy.done, button })) $('#drawer-title', drawer)?.focus();
}

// ---------- Contact corrections ----------
async function loadCorrections(id) {
  const box = $('[data-corrections-body]', drawer); if (!box || box.dataset.state) return;
  box.dataset.state = 'loading';
  try {
    const events = await request('/workspaces/' + encodeURIComponent(ws.businessId) + '/events');
    const contacts = contactEvidence(events.filter(e => e.epoch === ws.measurement.epoch && (e.estimateId || '').toLowerCase() === id.toLowerCase()));
    if (ui.drawer !== id || !box.isConnected) return;
    if (!contacts.length) { box.innerHTML = '<p class="qt-help">No contacts logged in the current reporting period. Imported or restored activity notes are not reporting evidence and cannot be corrected here.</p>'; return; }
    box.innerHTML = `<p class="qt-help qt-help--top">Corrections keep the original record and recalculate Follow-up Results. Void a contact that did not happen or was logged twice. The next follow-up date is not changed.</p>
      <form class="qt-form" data-form="correction" novalidate><div class="qt-form__grid">
        <label class="qt-form__full">Logged contact<select name="eventId">${contacts.map(e => `<option value="${esc(e.id)}">${esc(shortDate(e.effectiveDate))} · ${esc(e.data.channel)}${e.voided ? ' · voided' : ''} · ref ${esc(e.id.slice(0, 8))}</option>`).join('')}</select></label>
        <label>Correct date<input type="date" name="date" required max="${esc(D.todayISO())}"></label>
        <label>Correct method<select name="channel">${D.CHANNELS.map(c => `<option>${c}</option>`).join('')}</select></label>
        <label>Treatment<select name="treatment"><option value="active">Keep as a contact</option><option value="void">Void — didn’t happen / duplicate</option></select></label>
        <label class="qt-form__full">Reason<input name="reason" required maxlength="1000" placeholder="Why is this correction needed?"></label>
      </div><p class="qt-form__error" data-form-error role="alert"></p><button class="qt-btn" type="submit">${icon('save')}Save correction</button></form>`;
    const form = $('form', box);
    const sync = () => { const c = contacts.find(e => e.id === form.elements.eventId.value); form.elements.date.value = c.effectiveDate; form.elements.channel.value = c.data.channel; form.elements.treatment.value = c.voided ? 'void' : 'active'; };
    form.elements.eventId.addEventListener('change', sync); sync();
  } catch (error) {
    if (box.isConnected) box.innerHTML = `<p class="qt-form__error">Logged contacts could not be loaded. ${esc(error.message)}</p>`;
    if (error.kind === 'session') failure(error);
  }
}

// ---------- Estimate editor ----------
const EDITABLE = D.CSV_COLUMNS.filter(k => !['estimate_id', 'last_contact_date'].includes(k));
function showEditor(q = null) {
  const today = D.todayISO();
  const nextId = 'QT-' + (Math.max(1000, ...ws.quotes.map(x => Number(/^QT-(\d{1,9})$/i.exec(x.estimate_id)?.[1]) || 0)) + 1);
  const v = q || { estimate_id: nextId, customer_name: '', customer_email: '', customer_phone: '', address: '', trade: '', job_description: '', amount_usd: '', estimate_date: today, status: 'sent', next_follow_up_date: D.addDays(today, 3), do_not_contact: false, notes: '' };
  const trades = D.tradeOptions(ws.quotes).suggestions;
  editorEl.innerHTML = `<form class="qt-form" data-form="estimate" novalidate>
    <div class="editor__head"><div><p class="qt-eyebrow">${q ? esc(q.estimate_id) : 'Keep the next job moving'}</p><h2 id="editor-title">${q ? 'Edit estimate' : 'Add an estimate'}</h2></div><button class="qt-icon-btn" type="button" data-action="close-dialog" aria-label="Close">${icon('x')}</button></div>
    <div class="editor__body"><p class="dialog-error" role="alert"></p>
      <fieldset><legend>Customer</legend><div class="qt-form__grid">
        <label class="qt-form__full">Customer name<input name="customer_name" required maxlength="150" autocomplete="off" value="${esc(v.customer_name)}" placeholder="e.g. Dana Whitfield"></label>
        <label><span>Email <span class="qt-optional">optional</span></span><input name="customer_email" type="email" maxlength="254" autocomplete="off" value="${esc(v.customer_email)}" placeholder="name@example.com"></label>
        <label><span>Phone <span class="qt-optional">optional</span></span><input name="customer_phone" type="tel" maxlength="40" autocomplete="off" value="${esc(v.customer_phone)}" placeholder="(555) 010-0100"></label>
        <label class="qt-form__full"><span>Project address <span class="qt-optional">optional</span></span><input name="address" maxlength="300" autocomplete="off" value="${esc(v.address)}" placeholder="Street address or job site"></label>
      </div></fieldset>
      <fieldset><legend>Estimate</legend><div class="qt-form__grid">
        <label>Estimate ID<input name="estimate_id" required maxlength="80" autocomplete="off" value="${esc(v.estimate_id)}" ${q ? 'readonly aria-describedby="id-help"' : ''}></label>
        <label><span>Trade or service <span class="qt-optional">optional</span></span><input name="trade" list="trade-options" maxlength="80" autocomplete="off" value="${esc(v.trade)}" placeholder="e.g. Roofing"></label>
        <datalist id="trade-options">${trades.map(t => `<option value="${esc(t)}"></option>`).join('')}</datalist>
        ${q ? '<p class="qt-help qt-form__full" id="id-help">Estimate IDs stay fixed so imports and reports can match the same estimate.</p>' : ''}
        <label class="qt-form__full">Job description<input name="job_description" required maxlength="500" autocomplete="off" value="${esc(v.job_description)}" placeholder="e.g. Roof replacement · 28 sq architectural shingles"></label>
        <label>Amount (USD)<input name="amount_usd" type="number" min="0" max="999999999.99" step="0.01" inputmode="decimal" required value="${esc(v.amount_usd)}"></label>
        <label>Estimate date<input name="estimate_date" type="date" required max="${esc(D.addDays(today, 365))}" value="${esc(v.estimate_date)}"></label>
        <label>Status<select name="status">${D.STATUSES.map(s => `<option value="${s}" ${v.status === s ? 'selected' : ''}>${{ draft: 'Draft — not yet shared', sent: 'Sent — awaiting a decision', won: 'Won', lost: 'Lost' }[s]}</option>`).join('')}</select></label>
        <label><span>Next follow-up <span class="qt-optional">optional</span></span><input name="next_follow_up_date" type="date" value="${esc(v.next_follow_up_date)}"></label>
        <p class="qt-help qt-form__full" data-followup-help></p>
        <label class="qt-check"><input name="do_not_contact" type="checkbox" ${v.do_not_contact ? 'checked' : ''}> Customer asked not to be contacted</label>
        <label class="qt-form__full"><span>Notes <span class="qt-optional">optional</span></span><textarea name="notes" class="qt-field" rows="3" maxlength="10000" placeholder="Project details, preferences or context…">${esc(v.notes)}</textarea></label>
      </div></fieldset>
    </div>
    <div class="editor__foot"><button class="qt-btn" type="button" data-action="close-dialog">Cancel</button><button class="qt-btn qt-btn--primary" type="submit">${q ? 'Save changes' : 'Add estimate'}</button></div></form>`;
  editorEl.dataset.id = q ? q.estimate_id : '';
  syncEditor();
  editorEl.showModal();
  $('[name=customer_name]', editorEl).focus();
}
function syncEditor() {
  const form = $('form', editorEl); if (!form) return;
  const id = editorEl.dataset.id;
  const candidate = { estimate_id: form.elements.estimate_id.value || '__new', customer_email: form.elements.customer_email.value, status: form.elements.status.value, do_not_contact: form.elements.do_not_contact.checked };
  const allowed = D.eligible(candidate, [...ws.quotes.filter(x => x.estimate_id !== id), candidate]);
  form.elements.next_follow_up_date.disabled = !allowed;
  $('[data-followup-help]', form).textContent = allowed ? 'A follow-up date puts this estimate in your follow-up queue on that day.'
    : 'Follow-up dates apply only to sent estimates without an opt-out, so this date will be cleared.';
}
async function submitEditor(form, button) {
  const id = editorEl.dataset.id, q = id ? find(id) : null;
  const f = new FormData(form), text = k => String(f.get(k) ?? '').trim();
  const amount = text('amount_usd');
  const item = { estimate_id: q ? q.estimate_id : text('estimate_id'), customer_name: text('customer_name'), customer_email: text('customer_email'), customer_phone: text('customer_phone'),
    address: text('address'), trade: text('trade'), job_description: text('job_description'), amount_usd: amount === '' ? NaN : Number(amount), estimate_date: text('estimate_date'),
    status: text('status'), next_follow_up_date: form.elements.next_follow_up_date.disabled ? '' : text('next_follow_up_date'), do_not_contact: f.has('do_not_contact'), notes: String(f.get('notes') ?? '') };
  const base = q || { last_contact_date: '', history: [], saved_draft: '' };
  const candidate = D.normalize({ ...base, ...item });
  const errors = D.validateEstimate(candidate);
  if (!q && ws.quotes.some(x => x.estimate_id.trim().toLowerCase() === item.estimate_id.toLowerCase())) errors.push('That estimate ID is already used in this workspace');
  $$('[aria-invalid]', form).forEach(el => el.removeAttribute('aria-invalid'));
  if (errors.length) {
    showError(errors.join('. ') + '.', editorEl);
    for (const [k, pattern] of [['customer_name', /customer name/i], ['job_description', /job description/i], ['amount_usd', /amount/i], ['estimate_date', /estimate date/i], ['customer_email', /email/i], ['customer_phone', /phone/i], ['next_follow_up_date', /follow-up/i], ['estimate_id', /estimate id/i]])
      if (errors.some(e => pattern.test(e))) form.elements[k]?.setAttribute('aria-invalid', 'true');
    $('[aria-invalid="true"]', form)?.focus();
    return;
  }
  if (!q) {
    const fields = Object.fromEntries(['estimate_id', ...EDITABLE].map(k => [k, candidate[k]]));
    await run({ kind: 'create', fields }, { success: `Estimate ${item.estimate_id} added.`, target: editorEl, button, after: () => editorEl.close() });
    return;
  }
  // Text areas report line breaks as \n; an imported \r\n in notes is not a change the owner made.
  const lf = v => typeof v === 'string' ? v.replace(/\r\n?/g, '\n') : v;
  const fields = Object.fromEntries(EDITABLE.filter(k => lf(candidate[k]) !== lf(q[k])).map(k => [k, candidate[k]]));
  if (!Object.keys(fields).length) { editorEl.close(); toast('No changes to save.'); return; }
  const optOutReview = q.do_not_contact && (!candidate.do_not_contact || D.emailKey(candidate.customer_email) !== D.emailKey(q.customer_email));
  if (optOutReview && !await confirmAction({ title: 'Change an opt-out?', body: 'Removing an opt-out, or changing the email it is attached to, can release the do-not-contact block on other estimates with that email. Continue only after confirming the customer’s current preference. Cleared follow-up dates are not restored automatically.', confirm: 'Save reviewed change', tone: 'warn', focusCancel: true })) return;
  await run({ kind: 'edit', estimateId: q.estimate_id, fields, ...(optOutReview ? { reviewedOptOut: true } : {}) }, { success: 'Estimate updated.', target: editorEl, button, after: () => editorEl.close() });
}

// ---------- Export, restore and safety copies ----------
function exportFile(name, text, type, { title, description }) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  exportEl.innerHTML = `<div class="editor__head"><div><p class="qt-eyebrow">Your data</p><h2 id="export-title">${esc(title)}</h2></div><button class="qt-icon-btn" type="button" data-action="close-dialog" aria-label="Close">${icon('x')}</button></div>
    <div class="editor__body"><p>${esc(description)}</p><label class="qt-sr" for="export-text">File contents</label><textarea id="export-text" class="qt-field export-text" readonly rows="10" spellcheck="false">${esc(text)}</textarea><p class="qt-help" data-export-status role="status">If downloads are blocked, copy the contents into a text file named ${esc(name)}.</p></div>
    <div class="editor__foot"><button class="qt-btn" type="button" data-action="copy-export">${icon('copy')}Copy contents</button><a class="qt-btn qt-btn--primary" data-download download="${esc(name)}">${icon('download')}Download file</a></div>`;
  $('[data-download]', exportEl).href = url;
  exportEl.addEventListener('close', () => URL.revokeObjectURL(url), { once: true });
  exportEl.showModal();
}
const exportCSV = () => exportFile(`quotetend-estimates-${D.todayISO()}.csv`, D.exportCSV(ws.quotes), 'text/csv;charset=utf-8',
  { title: 'CSV export', description: `${plural(ws.quotes.length, 'estimate')} with every estimate field, including phone, project address and trade. Activity history and drafts are not included. Not a database backup.` });
const exportJSON = () => exportFile(`quotetend-workspace-${D.todayISO()}.json`, JSON.stringify({ version: 1, exported_at: new Date().toISOString(), business: ws.businessName, quotes: ws.quotes }, null, 2), 'application/json',
  { title: 'Workspace export', description: 'Estimates with activity notes and saved drafts, in a file you can restore into this workspace. The reporting ledger and account details are not included, so this is not a complete database backup.' });
async function restoreFrom(file) {
  try {
    if (file.size > 5_000_000) throw new Error('Workspace exports must be smaller than 5 MB.');
    const restored = D.parseBackup(await file.text());
    const ok = await confirmAction({ title: 'Replace this workspace?', body: `Replace the ${plural(ws.quotes.length, 'estimate')} in ${ws.businessName} with ${plural(restored.length, 'estimate')} from “${file.name}”? A safety copy of the current workspace is saved first and opt-outs are kept. Follow-up Results start a new reporting period.`, confirm: 'Restore workspace', tone: 'warn', focusCancel: true });
    if (ok) await run({ kind: 'restore', quotes: restored, confirmReplacement: true }, { success: 'Workspace restored. A safety copy of the previous data was saved.' });
  } catch (error) { toast(`Could not restore: ${error.message}`, { error: true }); }
}
async function showSnapshots() {
  const box = $('[data-snapshots]', main); if (!box) return;
  box.innerHTML = '<div class="loading-line"><span class="spinner" aria-hidden="true"></span>Loading safety copies…</div>';
  try {
    const rows = await request('/workspaces/' + encodeURIComponent(ws.businessId) + '/snapshots');
    box.innerHTML = rows.length ? `<ul class="snapshot-list">${rows.map(r => `<li><span>Saved before a restore on <strong>${esc(new Date(r.recordedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: D.BUSINESS_TIME_ZONE }))}</strong></span><button class="qt-btn qt-btn--sm" type="button" data-action="snapshot-download" data-id="${esc(r.id)}">${icon('download')}Download</button></li>`).join('')}</ul><p class="qt-help">Restore a safety copy with “Choose workspace export…”.</p>`
      : '<p class="qt-help">No restores have been made, so there are no safety copies.</p>';
  } catch (error) { box.innerHTML = `<p class="qt-form__error">${esc(error.message)}</p>`; }
}

// ---------- Import ----------
function guessDateFormat(sheet, mapping) {
  const cells = ['estimate_date', 'next_follow_up_date', 'last_contact_date'].filter(k => mapping[k] !== '').flatMap(k => sheet.rows.map(r => (r[Number(mapping[k])] || '').trim()));
  return cells.some(looksDayMonthYear) ? 'mdy' : 'iso';
}
function beginImport(text, name) {
  const imp = ui.imp;
  try {
    const sheet = inspectSpreadsheet(text), mapping = { ...sheet.mapping };
    Object.assign(imp, { step: 'map', name, sheet, mapping, rows: null, error: '', options: { dateFormat: guessDateFormat(sheet, mapping), defaultStatus: 'sent', statusMap: statusSuggestions(sheet, mapping), optOutReviewed: false, defaultFollowUp: '' } });
  } catch (error) { Object.assign(imp, { step: 'choose', error: error.message }); }
  render({ focus: true });
}
function previewImport() {
  const imp = ui.imp;
  try {
    const statusMap = Object.fromEntries(statusesFor(imp.sheet, imp.mapping).map((value, i) => [value, $(`[data-status-map="${i}"]`, main)?.value || value]));
    imp.options.statusMap = statusMap;
    imp.rows = previewSpreadsheet(imp.sheet, imp.mapping, imp.options, ws.quotes);
    Object.assign(imp, { step: 'preview', revision: ws.revision, error: '' });
    render({ focus: true });
  } catch (error) { imp.error = error.message; const box = $('[data-import-error]', main); if (box) box.textContent = error.message; }
}
async function commitImport(button) {
  const imp = ui.imp;
  let candidates;
  try { candidates = D.importCandidates(imp.rows, ws.quotes); } catch (error) { toast(error.message, { error: true }); return; }
  if (!candidates.length) { toast('No ready estimates to import.', { error: true }); return; }
  const total = imp.rows.length;
  await run({ kind: 'import', quotes: candidates }, { success: `${plural(candidates.length, 'estimate')} imported. Existing records were not changed.`, button,
    after: () => Object.assign(ui.imp, freshImport(), { step: 'done', done: { count: candidates.length, skipped: total - candidates.length } }) });
}
function importReport() {
  const imp = ui.imp, blocks = D.importOptOutBlockers(imp.rows, ws.quotes);
  const text = (blocks.length ? 'IMPORT BLOCKED: an opt-out on a rejected or conflicting row would be lost. No data changed.\n' + blocks.map(b => `Row ${b.row}: ${b.email} (matching IDs: ${b.affectedIds.join(', ') || 'none'})`).join('\n') + '\n\n' : '')
    + imp.rows.map(r => `Row ${r.row} | ${r.quote.estimate_id} | ${r.outcome}\n${[...r.errors, ...(r.differences || []).map(d => `${FIELD_LABELS[d.field]}: file "${d.file}", saved "${d.saved}"`), ...r.warnings].join('\n') || 'Ready to add'}`).join('\n\n');
  exportFile('quotetend-import-review.txt', text, 'text/plain;charset=utf-8', { title: 'Import validation report', description: `Every row in ${imp.name}, with the reason it will or will not be imported. Nothing has been imported.` });
}
async function readCSVFile(file) {
  const imp = ui.imp;
  if (!file) return;
  if (file.size > 2_000_000) { imp.error = 'Use a CSV smaller than 2 MB, or split the file.'; render(); return; }
  if (/\.(xlsx|xls|numbers|ods)$/i.test(file.name)) { imp.error = 'That looks like a spreadsheet file. Export it as CSV (comma-separated values) first, then choose the CSV.'; render(); return; }
  beginImport(await file.text(), file.name);
}
const EXAMPLE_CSV = () => D.exportCSV([
  { estimate_id: 'EXAMPLE-1001', customer_name: 'Alex Example', customer_email: 'alex@example.com', customer_phone: '555-0100', address: '100 Example St', trade: 'Roofing', job_description: 'Roof replacement · 24 sq architectural shingles', amount_usd: 14250, estimate_date: D.addDays(D.todayISO(), -7), status: 'sent', next_follow_up_date: D.addDays(D.todayISO(), 1), last_contact_date: '', do_not_contact: false, notes: 'Fictional example row — replace with your own estimates.' },
  { estimate_id: 'EXAMPLE-1002', customer_name: 'Sam Sample', customer_email: '', customer_phone: '555-0101', address: '', trade: 'Gutters', job_description: 'Seamless gutters + guards', amount_usd: 3880, estimate_date: D.addDays(D.todayISO(), -3), status: 'sent', next_follow_up_date: '', last_contact_date: '', do_not_contact: false, notes: '' }]);

// ---------- Results ----------
function ensureRange() {
  if (ui.range === 'custom') { if (!ui.from || !ui.to) Object.assign(ui, { from: D.addDays(D.todayISO(), -29), to: D.todayISO() }); return; }
  const today = D.todayISO(); ui.from = D.addDays(today, -(ui.range - 1)); ui.to = today;
}
async function loadResults() {
  const today = D.todayISO(), key = `${ui.from}|${ui.to}|${ws.revision}|${today}`;
  if (results.key === key) return;
  Object.assign(results, { key, data: null, weekly: null, error: '' });
  const n = ++results.request, base = '/workspaces/' + encodeURIComponent(ws.businessId) + '/results?';
  try {
    const [r, w] = await Promise.all([request(base + `from=${ui.from}&to=${ui.to}`), request(base + `from=${D.addDays(today, -55)}&to=${today}`)]);
    if (n !== results.request) return;
    results.data = r; results.weekly = contactsPerWeek(w.contacts, today);
  } catch (error) {
    if (n !== results.request) return;
    results.error = error.kind === 'session' ? 'Your session has ended. Sign in again to see results.' : error.message;
    if (error.kind === 'session') failure(error);
  }
  if (ui.view === 'results') {
    const focused = document.activeElement?.dataset?.group || document.activeElement?.dataset?.range;
    render();
    if (focused) $(`[data-group="${focused}"], [data-range="${focused}"]`, main)?.focus();
  }
}

// ---------- Events ----------
document.addEventListener('click', async event => {
  const el = event.target;
  if (!ws) return;
  try {
    const nav = el.closest('[data-nav]');
    if (nav) {
      event.preventDefault();
      if (nav.dataset.preset) applyPreset(nav.dataset.preset);
      return navigate(nav.dataset.nav);
    }
    const opener = el.closest('[data-open]');
    if (opener) return openDrawer(opener.dataset.open, { trigger: opener });
    if (el.closest('[data-drawer-scrim]')) return closeDrawer();
    const outcomeBtn = el.closest('[data-outcome]');
    if (outcomeBtn) return outcome(outcomeBtn.dataset.outcome, outcomeBtn);
    const tab = el.closest('[data-queue]');
    if (tab) { ui.queue = tab.dataset.queue; ui.queueLimit = 100; render(); return $(`[data-queue="${ui.queue}"]`, main)?.focus(); }
    const statusBtn = el.closest('[data-status]');
    if (statusBtn && main.contains(statusBtn)) {
      ui.status = statusBtn.dataset.status; ui.limit = 100;
      $$('[data-status]', main).forEach(b => b.setAttribute('aria-pressed', String(b === statusBtn)));
      return updateEstimateResults();
    }
    const range = el.closest('[data-range]');
    if (range) { ui.range = range.dataset.range === 'custom' ? 'custom' : Number(range.dataset.range); render(); return $(`[data-range="${range.dataset.range}"]`, main)?.focus(); }
    const group = el.closest('[data-group]');
    if (group && results.data) { ui.group = group.dataset.group; render(); return $(`[data-group="${ui.group}"]`, main)?.focus(); }

    const action = el.closest('[data-action]'); if (!action) return;
    const q = ui.drawer ? find(ui.drawer) : null;
    switch (action.dataset.action) {
      case 'add': return showEditor();
      case 'edit': return showEditor(find(action.dataset.id));
      case 'close-drawer': return closeDrawer();
      case 'close-dialog': return action.closest('dialog')?.close();
      case 'sign-out': return signOut();
      case 'reload-workspace': return reloadWorkspace();
      case 'dismiss-guide': prefs.guideDismissed = true; savePrefs(); render(); return $('h1', main)?.focus();
      case 'clear-filters': Object.assign(ui, { query: '', status: 'all', followup: 'any', trade: 'all', limit: 100 }); render(); return $('#est-q', main)?.focus();
      case 'more': ui.limit += 200; return updateEstimateResults();
      case 'more-queue': ui.queueLimit += 200; render(); return $('#queue-tabpanel', main)?.focus();
      case 'export-csv': return exportCSV();
      case 'export-json': return exportJSON();
      case 'copy-export': {
        const text = $('#export-text', exportEl).value, status = $('[data-export-status]', exportEl);
        try { await navigator.clipboard.writeText(text); status.textContent = 'Contents copied.'; }
        catch { $('#export-text', exportEl).select(); status.textContent = 'Contents selected. Press Ctrl+C (or ⌘C) to copy.'; }
        return undefined;
      }
      case 'snapshots': return showSnapshots();
      case 'snapshot-download': {
        try { const data = await request('/workspaces/' + encodeURIComponent(ws.businessId) + '/snapshots/' + encodeURIComponent(action.dataset.id));
          return exportFile(`quotetend-safety-copy-${D.todayISO()}.json`, JSON.stringify(data, null, 2), 'application/json', { title: 'Safety copy', description: 'The workspace as it was before a restore. Restore it from Settings & data if you need it back.' }); }
        catch (error) { return failure(error); }
      }
      case 'release-retained': {
        if (!await confirmAction({ title: 'Release this retained opt-out?', body: `Release “${action.dataset.preference.replace(/^email:/, '')}” only after confirming the customer’s current preference. Opt-outs on individual estimates stay until you edit them.`, confirm: 'Release reviewed preference', tone: 'warn', focusCancel: true })) return undefined;
        return run({ kind: 'release-optout', preference: action.dataset.preference, reviewedOptOut: true }, { success: 'Retained preference released.' });
      }
      case 'copy-draft': return copyDraft();
      case 'save-draft': {
        const text = $('#draft-text', drawer).value;
        if (await run({ kind: 'draft', estimateId: q.estimate_id, text }, { success: 'Draft saved. Nothing was sent.', button: action, after: () => { delete ui.drafts[q.estimate_id]; ui.draftStatus = 'Draft saved with this estimate. Saving never sends a message or records a contact.'; ui.draftOk = true; } }))
          $('[data-action="save-draft"]', drawer)?.focus();
        return undefined;
      }
      case 'reset-draft': {
        const ta = $('#draft-text', drawer); ta.value = D.draftMessage(q, ws.businessName, ws.quotes);
        ui.drafts[q.estimate_id] = ta.value; draftChanged(ta);
        setDraftStatus('Template restored. Save the draft to keep this version.', false);
        return ta.focus();
      }
      case 'example-csv': return exportFile('quotetend-example.csv', EXAMPLE_CSV(), 'text/csv;charset=utf-8', { title: 'Example CSV', description: 'Two fictional rows showing every column QuoteTend understands. Your own file can use different headings; you match them in the next step.' });
      case 'inspect-paste': { const text = $('#paste-csv', main).value; ui.imp.pasted = text; if (!text.trim()) { ui.imp.error = 'Paste CSV text including the header row first.'; return render(); } return beginImport(text, 'Pasted CSV'); }
      case 'import-restart': ui.imp = freshImport(); return render({ focus: true });
      case 'import-back': Object.assign(ui.imp, { step: 'map', rows: null, error: '' }); return render({ focus: true });
      case 'import-preview': return previewImport();
      case 'import-commit': return commitImport(action);
      case 'import-report': return importReport();
      case 'view-imported': Object.assign(ui, { query: '', status: 'all', followup: 'any', trade: 'all', sort: 'followup' }); ui.imp = freshImport(); return navigate('estimates');
      case 'reload-results': results.key = ''; return render();
      default: return undefined;
    }
  } catch (error) {
    console.error(error);
    toast('Something went wrong. Reload the page to check saved data.', { error: true });
  }
});

function updateEstimateResults() {
  const box = $('[data-results]', main);
  if (box) { box.innerHTML = V.estimateResults(ctx()); applySizes(box); }
}
function draftChanged(ta) {
  const q = find(ui.drawer); if (!q) return;
  const chip = $('[data-draft-chip]', drawer), count = $('[data-draft-count]', drawer);
  if (chip) chip.textContent = ta.value !== (q.saved_draft || D.draftMessage(q, ws.businessName, ws.quotes)) ? 'Unsaved changes' : q.saved_draft ? 'Saved draft' : 'From template';
  if (count) count.textContent = `${ta.value.length.toLocaleString('en-US')} / 10,000 characters`;
}

document.addEventListener('submit', async event => {
  const form = event.target, kind = form.dataset.form;
  if (!kind || !ws) return;
  event.preventDefault();
  const button = event.submitter || $('[type=submit]', form);
  if (kind === 'global-search') {
    Object.assign(ui, { query: form.elements.q.value.trim(), status: 'all', followup: 'any', trade: 'all', limit: 100 });
    form.reset(); navigate('estimates', { focus: false });
    const input = $('#est-q', main); input?.focus(); input?.setSelectionRange(input.value.length, input.value.length);
    return;
  }
  if (kind === 'estimate') return submitEditor(form, button);
  if (kind === 'range') {
    const from = form.elements.from.value, to = form.elements.to.value, today = D.todayISO();
    if (!D.validDate(from) || !D.validDate(to) || from > to || to > today) { toast('Choose a start date on or before the end date, ending no later than today.', { error: true }); return; }
    Object.assign(ui, { from, to }); return render();
  }
  const q = find(ui.drawer);
  if (!q) return;
  if (kind === 'contact') {
    const data = Object.fromEntries(new FormData(form).entries());
    const contact = { date: data.date, channel: data.channel, nextDate: data.nextDate, note: data.note || '', ...(data.result ? { result: data.result } : {}) };
    $$('[aria-invalid]', form).forEach(i => i.removeAttribute('aria-invalid'));
    try { D.recordContact(q, contact, D.todayISO(), ws.quotes); }
    catch (error) {
      showError(error.message, form);
      const field = /next follow-up/i.test(error.message) ? 'nextDate' : /contact date/i.test(error.message) ? 'date' : null;
      if (field) { form.elements[field].setAttribute('aria-invalid', 'true'); form.elements[field].focus(); }
      return;
    }
    if (await run({ kind: 'contact', estimateId: q.estimate_id, contact }, { success: `${contact.channel} contact recorded for ${q.customer_name}. Next follow-up ${weekdayDate(contact.nextDate)}.`, target: form, button, after: () => delete ui.contactValues[q.estimate_id] }))
      $('#drawer-title', drawer)?.focus();
    return;
  }
  if (kind === 'schedule') {
    const date = form.elements.date.value, today = D.todayISO();
    if (!D.validDate(date) || date < today || date < q.estimate_date) { showError('Choose today or a later date, on or after the estimate date.', form); form.elements.date.setAttribute('aria-invalid', 'true'); form.elements.date.focus(); return; }
    if (date === q.next_follow_up_date) { showError('That is already the scheduled date.', form); return; }
    if (await run({ kind: 'edit', estimateId: q.estimate_id, fields: { next_follow_up_date: date } }, { success: `Next follow-up for ${q.customer_name} set for ${weekdayDate(date)}.`, target: form, button }))
      $('#drawer-title', drawer)?.focus();
    return;
  }
  if (kind === 'correction') {
    const f = Object.fromEntries(new FormData(form));
    if (!f.reason.trim()) { showError('Explain why this contact needs a correction.', form); form.elements.reason.focus(); return; }
    await run({ kind: 'correct-contact', estimateId: q.estimate_id, eventId: f.eventId, correction: { date: f.date, channel: f.channel, voided: f.treatment === 'void', reason: f.reason } },
      { success: 'Contact correction saved. Results recalculated.', target: form, button });
  }
});

document.addEventListener('input', event => {
  const el = event.target;
  if (el.id === 'est-q') { ui.query = el.value; ui.limit = 100; return updateEstimateResults(); }
  if (el.id === 'draft-text' && ui.drawer) { ui.drafts[ui.drawer] = el.value; return draftChanged(el); }
  const contact = el.closest('[data-form="contact"]');
  if (contact && ui.drawer) ui.contactValues[ui.drawer] = Object.fromEntries(new FormData(contact).entries());
  if (el.closest('[data-form="estimate"]') && ['customer_email', 'estimate_id'].includes(el.name)) syncEditor();
});
document.addEventListener('change', async event => {
  const el = event.target;
  if (!ws) return;
  if (el.dataset.filter) { ui[el.dataset.filter] = el.value; ui.limit = 100; return updateEstimateResults(); }
  if (el.closest('[data-form="estimate"]') && ['status', 'do_not_contact'].includes(el.name)) return syncEditor();
  if (el.dataset.map) {
    ui.imp.mapping[el.dataset.map] = el.value; ui.imp.error = '';
    if (el.dataset.map === 'status') ui.imp.options.statusMap = statusSuggestions(ui.imp.sheet, ui.imp.mapping);
    render(); return $(`[data-map="${el.dataset.map}"]`, main)?.focus();
  }
  if (el.dataset.importOption) {
    ui.imp.options[el.dataset.importOption] = el.type === 'checkbox' ? el.checked : el.value;
    if (el.dataset.importOption === 'optOutReviewed') return undefined;
    render(); return $(`[data-import-option="${el.dataset.importOption}"]`, main)?.focus();
  }
  if (el.dataset.statusMap !== undefined) { const st = statusesFor(ui.imp.sheet, ui.imp.mapping)[Number(el.dataset.statusMap)]; ui.imp.options.statusMap[st] = el.value; return undefined; }
  if (el.id === 'csv-file') { const file = el.files[0]; el.value = ''; return readCSVFile(file); }
  if (el.id === 'restore-file') { const file = el.files[0]; el.value = ''; if (file) await restoreFrom(file); }
});
document.addEventListener('toggle', event => {
  if (event.target.matches?.('[data-corrections]') && event.target.open && ui.drawer) loadCorrections(ui.drawer);
}, true);
document.addEventListener('dragover', event => {
  const zone = event.target.closest?.('[data-dropzone]'); if (!zone) return;
  event.preventDefault(); zone.classList.add('is-over');
});
document.addEventListener('dragleave', event => event.target.closest?.('[data-dropzone]')?.classList.remove('is-over'));
document.addEventListener('drop', event => {
  const zone = event.target.closest?.('[data-dropzone]'); if (!zone) return;
  event.preventDefault(); zone.classList.remove('is-over');
  readCSVFile(event.dataTransfer.files[0]);
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    if (confirmEl.open || editorEl.open || exportEl.open) return;
    if (app.classList.contains('nav-open')) { closeNav(); return navToggle.focus(); }
    if (ui.drawer) { event.preventDefault(); return closeDrawer(); }
  }
  const tab = event.target.closest?.('[role="tab"]');
  if (tab && ['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) {
    const tabs = $$('[role="tab"]', main), i = tabs.indexOf(tab);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (i + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    event.preventDefault();
    ui.queue = tabs[next].dataset.queue; ui.queueLimit = 100; render();
    $(`[data-queue="${ui.queue}"]`, main)?.focus();
  }
  return undefined;
});

// ---------- Session ----------
async function signOut() {
  if (busy) { toast('Wait for the save to finish before signing out.'); return; }
  try { await request('/logout', 'POST', {}); announceSessionChange(); location.replace('/signin'); }
  catch (error) { toast('Could not sign out. ' + error.message, { error: true }); }
}
// Pick up changes saved in another tab or device, without interrupting open forms.
async function refreshQuietly() {
  if (!ws || busy || document.visibilityState !== 'visible' || confirmEl.open || editorEl.open || exportEl.open) return;
  try {
    const [fresh, latestMe] = await Promise.all([request('/workspaces/' + encodeURIComponent(ws.businessId)), request('/me')]);
    if (latestMe.businessId !== ws.businessId) { location.replace('/signin'); return; }
    const changedMe = latestMe.recoveryCodeSaved !== me.recoveryCodeSaved; me = latestMe;
    if (fresh.revision !== ws.revision && !blocked) { ws = fresh; results.key = ''; renderAll(); toast('Updated with changes saved elsewhere.'); }
    else if (changedMe) render();
  } catch (error) { if (error.kind === 'session') { blocked = { kind: 'session' }; showBanner(); } }
}

// ---------- Start ----------
async function boot() {
  $$('[data-icon]').forEach(el => el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon)));
  navToggle.innerHTML = icon('menu');
  $('.app-search').insertAdjacentHTML('afterbegin', icon('search'));
  $('.app-brand').innerHTML = wordmark('wordmark--on-dark');
  let loaded;
  try { loaded = await loadAccount(); }
  catch (error) {
    if (error.kind === 'session') { location.replace('/signin'); return; }
    main.innerHTML = `<div class="qt-panel"><div class="qt-panel__body qt-panel__body--top"><div class="qt-empty">${icon('alert')}<h3>Your workspace could not be loaded</h3><p>${esc(error.message)}</p><button class="qt-btn qt-btn--primary" type="button" data-reload>Try again</button></div></div></div>`;
    $('[data-reload]', main).addEventListener('click', () => location.reload());
    return;
  }
  ({ me, workspace: ws, configuration } = loaded);
  loadPrefs();
  $('[data-ws-mark]').textContent = initials(ws.businessName);
  $('[data-ws-name]').textContent = ws.businessName;
  $('[data-ws-sub]').textContent = configuration.production ? 'Private business workspace' : 'Local preview workspace';
  $('[data-crumb-business]').textContent = ws.businessName;
  $('[data-user-email]').textContent = me.email;
  $('[data-user-mark]').textContent = initials(me.email.split('@')[0].replace(/[._-]+/g, ' '));
  $('[data-pill]').classList.toggle('is-local', !configuration.production);
  $('[data-pill-text]').textContent = configuration.production ? 'Private business account' : 'Local preview · fictional data only';
  const { view, id } = parseHash();
  ui.view = view;
  history.replaceState(null, '', '#' + view);
  render();
  if (id && find(id)) openDrawer(id, { push: true });
  const channel = 'BroadcastChannel' in window ? new BroadcastChannel('quotetend-account-session') : null;
  if (channel) channel.onmessage = () => location.replace('/signin');
  addEventListener('focus', refreshQuietly);
  document.addEventListener('visibilitychange', refreshQuietly);
  setInterval(refreshQuietly, 60000);
  addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
}
boot();
