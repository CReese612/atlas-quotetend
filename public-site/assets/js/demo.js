// QuoteTend interactive demo. Every record is fictional and lives only in this browser.
// Nothing here sends messages, calls an API, or touches private QuoteTend accounts.
import { COMPANY, STORAGE_KEY, TRADES, createWorkspace, restoreWorkspace, todayISO, addDays, daysBetween, metrics, queues, pipelineByState,
  ageBuckets, statusTotals, recentActivity, filterEstimates, followupState, draftMessage, saveDraft, recordContact, recordOutcome,
  setFollowUp, resultsForRange, weeklyContacts, previewImport, importReady, sampleImportCSV } from './workspace.js';
import { esc, money, icon, kpi, attentionRow, stateBar, ageChart, activityItem, estimateTable, queueRow, detailBody, detailHeader,
  resultCards, cohortBar, weeklyChart, supportingRows, mappingTable, importRows, longDate, weekdayDate, shortDate, plural } from './components.js';
import { STEPS, tourCard, tourContext, FOCUS_ID } from './tour.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const today = todayISO();
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const VIEWS = { overview: 'Overview', estimates: 'Estimates', followups: 'Follow-ups', results: 'Follow-up Results', import: 'Import' };
const PREFS_KEY = 'quotetend.public-demo.prefs';
const TOUR_KEY = 'quotetend.public-demo.tour';

// ---------- Storage (all access guarded; private windows may block it) ----------
const safe = area => ({
  get(k) { try { return window[area].getItem(k); } catch { return null; } },
  set(k, v) { try { window[area].setItem(k, v); return true; } catch { return false; } },
  remove(k) { try { window[area].removeItem(k); } catch { /* storage unavailable */ } }
});
const local = safe('localStorage'), session = safe('sessionStorage');
const readJSON = (area, k) => { try { return JSON.parse(area.get(k)) || {}; } catch { return {}; } };

let state = restoreWorkspace(local.get(STORAGE_KEY), today) || createWorkspace(today);
let storageOk = local.set(STORAGE_KEY, JSON.stringify(state));
const prefs = readJSON(local, PREFS_KEY);
const savePrefs = () => local.set(PREFS_KEY, JSON.stringify(prefs));

const ui = {
  view: 'overview', query: '', status: 'all', followup: 'any', trade: 'all', sort: 'followup', queue: 'due', range: 30, group: 'cohort',
  drawer: null, drafts: {}, draftStatus: '', importPreview: null, tour: null, tourMin: false, loggedExample: false, scrolledStep: null
};
const save = () => { storageOk = local.set(STORAGE_KEY, JSON.stringify(state)); };

const app = $('[data-app]'), main = $('[data-main]'), drawer = $('[data-drawer]'), scrim = $('[data-drawer-scrim]');
const dock = $('[data-tour-dock]'), toastEl = $('[data-toast]'), confirmEl = $('[data-confirm]');
let lastTrigger = null;

// ---------- Small UI helpers ----------
let toastTimer;
function toast(message, { error = false } = {}) {
  toastEl.innerHTML = `${icon(error ? 'alert' : 'checkCircle')}<span>${esc(message)}</span>`;
  toastEl.classList.toggle('is-error', error);
  toastEl.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('is-on'), 3600);
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

const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };
const panel = (title, desc, body, { action = '', cls = '', bodyCls = 'qt-panel__body' } = {}) =>
  `<section class="qt-panel ${cls}"><div class="qt-panel__head"><div><h2 class="qt-panel__title">${title}</h2>${desc ? `<p class="qt-panel__desc">${desc}</p>` : ''}</div>${action}</div>${bodyCls ? `<div class="${bodyCls}">${body}</div>` : body}</section>`;
const empty = (ic, title, text, action = '') => `<div class="qt-empty">${icon(ic)}<h3>${esc(title)}</h3><p>${esc(text)}</p>${action}</div>`;

// ---------- Views ----------
const views = {
  overview() {
    const m = metrics(state.quotes, today), q = queues(state.quotes, today), bs = pipelineByState(state.quotes, today), st = statusTotals(state.quotes);
    const overdue = q.due.filter(x => x.next_follow_up_date < today);
    const age = daysBetween(state.seededOn, today);
    return `<div class="view-head"><div><p class="qt-eyebrow">${esc(longDate(today))}</p>
        <h1 tabindex="-1">${greeting()}. ${m.dueCount ? `${plural(m.dueCount, 'follow-up')} need${m.dueCount === 1 ? 's' : ''} attention.` : 'Your follow-up queue is clear.'}</h1>
        <p class="sub">${esc(COMPANY.name)} is a fictional company. Changes stay in this browser until you reset.</p></div>
        <div class="view-actions"><a class="qt-btn" href="#estimates">${icon('estimates')}All estimates</a><a class="qt-btn qt-btn--primary" href="#followups" data-preset="queue:due">${icon('followups')}Open follow-up queue</a></div></div>
      ${prefs.welcomeDismissed || ui.tour !== null ? '' : `<div class="welcome" data-welcome><span class="welcome__icon">${icon('tour')}</span><div><strong>Welcome to the Fernbrook demo account</strong><p>Take the five-step guided tour, or explore on your own. Everything here is fictional and nothing is ever sent.</p></div>
        <div class="welcome__actions"><button class="qt-btn qt-btn--primary" type="button" data-action="start-tour">${icon('tour')}Start guided tour</button><button class="qt-btn qt-btn--ghost" type="button" data-action="dismiss-welcome">Explore on my own</button></div></div>`}
      ${age >= 3 ? `<div class="qt-notice qt-notice--gold">${icon('info')}<p>This demo was first opened ${plural(age, 'day')} ago, and its follow-up dates have kept moving since. <button class="qt-link" type="button" data-action="reset">Reset demo data</button> to start fresh.</p></div>` : ''}
      <div class="qt-kpis" data-tour="kpis">
        <a class="kpi-link" href="#estimates" data-preset="status:sent">${kpi({ label: 'Open pipeline', value: money(m.openValue), sub: `${m.openCount} sent estimates awaiting a decision`, ic: 'dollar' })}</a>
        <a class="kpi-link" href="#followups" data-preset="queue:due">${kpi({ label: 'Due & overdue', value: String(m.dueCount), sub: `<strong class="qt-tone-overdue">${overdue.length} overdue · ${money(overdue.reduce((s, x) => s + x.amount_usd, 0))}</strong>`, ic: 'alert', accent: 'alert' })}</a>
        <a class="kpi-link" href="#followups" data-preset="queue:unscheduled">${kpi({ label: 'Needs a date', value: String(m.unscheduled), sub: `${money(bs.unscheduled.value)} with no follow-up scheduled`, ic: 'calendar', accent: 'gold' })}</a>
        <a class="kpi-link" href="#estimates" data-preset="status:won">${kpi({ label: 'Recorded wins', value: money(m.wonValue), sub: `${plural(m.wonCount, 'estimate')} marked won`, ic: 'checkCircle', accent: 'won' })}</a>
      </div>
      <div class="grid-2">
        ${panel(`Needs your attention <span class="qt-count">${q.due.length}</span>`, 'Due and overdue follow-ups, oldest promise first',
          q.due.length ? `<ul class="qt-attn-list">${q.due.map(x => attentionRow(x, today, state.quotes)).join('')}</ul>`
            : empty('checkCircle', 'All caught up', 'No follow-ups are due today. Upcoming check-ins appear here on their date.', `<a class="qt-btn" href="#followups" data-preset="queue:upcoming">View upcoming</a>`),
          { action: `<a class="panel-link" href="#followups" data-preset="queue:due">Follow-up queue ${icon('arrowRight')}</a>`, bodyCls: '' })}
        <div class="stack">
          ${panel('Open pipeline', `${money(m.openValue)} across ${plural(m.openCount, 'sent estimate')}`, stateBar(bs, m.openValue))}
          ${panel('Open estimates by age', 'Days since the estimate was sent', ageChart(ageBuckets(state.quotes, today)))}
        </div>
      </div>
      <div class="grid-2">
        ${panel('Recent follow-up activity', 'Contacts and outcomes recorded by your team', `<ol class="qt-feed">${recentActivity(state, 7).map(a => activityItem(a, today)).join('')}</ol>`, { bodyCls: '' })}
        ${panel('Recorded outcomes', 'Current status of closed estimates', `<div class="outcome-split"><div class="won"><span>Won</span><strong>${money(st.won.value)}</strong><small>${plural(st.won.count, 'estimate')}</small></div><div><span>Lost</span><strong>${money(st.lost.value)}</strong><small>${plural(st.lost.count, 'estimate')}</small></div></div>
          <p class="qt-help">Won values are recorded estimate amounts, not collected revenue.</p>`, { action: `<a class="panel-link" href="#results">Follow-up Results ${icon('arrowRight')}</a>` })}
      </div>`;
  },

  estimates() {
    const counts = statusTotals(state.quotes);
    const opt = (value, label, current) => `<option value="${value}" ${value === current ? 'selected' : ''}>${esc(label)}</option>`;
    return `<div class="view-head"><div><p class="qt-eyebrow">Pipeline</p><h1 tabindex="-1">Estimates</h1><p class="sub">Every estimate in one place. Search, filter and open any record.</p></div>
        <div class="view-actions"><a class="qt-btn" href="#import">${icon('import')}Import CSV</a></div></div>
      <section class="qt-panel cards-at-narrow" aria-label="Estimate list">
        <div class="toolbar" role="group" aria-label="Search and filter estimates">
          <div class="search">${icon('search')}<label class="qt-sr" for="est-q">Search estimates</label><input id="est-q" class="qt-field" type="search" placeholder="Search customer, job, street or ID" value="${esc(ui.query)}" autocomplete="off" data-filter="query"></div>
          <div class="qt-seg-ctl" role="group" aria-label="Filter by status">${[['all', 'All', state.quotes.length], ['sent', 'Sent', counts.sent.count], ['draft', 'Draft', counts.draft.count], ['won', 'Won', counts.won.count], ['lost', 'Lost', counts.lost.count]]
            .map(([v, l, n]) => `<button type="button" data-status="${v}" aria-pressed="${ui.status === v}">${l} <span class="qt-muted">${n}</span></button>`).join('')}</div>
          <label class="qt-sr" for="est-fu">Follow-up state</label><select id="est-fu" class="qt-field" data-filter="followup">${[['any', 'Any follow-up'], ['due', 'Due & overdue'], ['overdue', 'Overdue'], ['today', 'Due today'], ['upcoming', 'Upcoming'], ['unscheduled', 'Needs a date'], ['paused', 'Do not contact']].map(([v, l]) => opt(v, l, ui.followup)).join('')}</select>
          <label class="qt-sr" for="est-trade">Trade</label><select id="est-trade" class="qt-field" data-filter="trade">${opt('all', 'All trades', ui.trade)}${TRADES.map(t => opt(t, t, ui.trade)).join('')}</select>
          <label class="qt-sr" for="est-sort">Sort</label><select id="est-sort" class="qt-field" data-filter="sort">${[['followup', 'Sort: follow-up urgency'], ['value', 'Sort: highest value'], ['newest', 'Sort: newest'], ['oldest', 'Sort: oldest']].map(([v, l]) => opt(v, l, ui.sort)).join('')}</select>
        </div>
        <div data-results>${estimateResults()}</div>
      </section>`;
  },

  followups() {
    const q = queues(state.quotes, today);
    const tabs = [['due', 'Due & overdue'], ['upcoming', 'Upcoming'], ['unscheduled', 'Needs a date']];
    return `<div class="view-head"><div><p class="qt-eyebrow">One conversation at a time</p><h1 tabindex="-1">Follow-ups</h1><p class="sub">Review the details, make the message personal, and record your next step.</p></div></div>
      <section class="qt-panel queue-panel">
        <div class="qt-tabs" role="tablist" aria-label="Follow-up queues">${tabs.map(([k, l]) => `<button class="qt-tab" type="button" role="tab" id="tab-${k}" aria-selected="${ui.queue === k}" aria-controls="queue-tabpanel" tabindex="${ui.queue === k ? 0 : -1}" data-queue="${k}">${l} <span class="qt-count">${q[k].length}</span></button>`).join('')}</div>
        <p class="queue-note">${icon('info')}Only sent estimates appear here. Won, lost, draft and opted-out estimates are excluded.</p>
        <div id="queue-tabpanel" role="tabpanel" aria-labelledby="tab-${ui.queue}" tabindex="0">${queueBody(q)}</div>
      </section>`;
  },

  results() {
    const r = resultsForRange(state, ui.range, today);
    return `<div class="view-head"><div><p class="qt-eyebrow">Reporting</p><h1 tabindex="-1">Follow-up Results</h1><p class="sub">What your team recorded from ${esc(shortDate(r.from))} to ${esc(shortDate(r.to))}: contacts, follow-ups and outcomes.</p></div>
        <div class="qt-seg-ctl" role="group" aria-label="Date range">${[7, 30, 90].map(d => `<button type="button" data-range="${d}" aria-pressed="${ui.range === d}">Last ${d} days</button>`).join('')}</div></div>
      <div class="qt-notice qt-notice--gold">${icon('info')}<p><strong>Recorded sequence, not proof of caused revenue.</strong> Contacts are owner-reported. QuoteTend sends nothing and verifies no delivery or payment. Values are estimate amounts, not collected revenue.</p></div>
      <div data-tour="results">${resultCards(r, { selected: ui.group })}</div>
      <div class="results-grid">
        ${panel('Cohort outcomes', `${plural(r.counts.followed, 'estimate')} first followed up in this range, classified as of today`, cohortBar(r))}
        ${panel('Contacts logged per week', 'Last 8 weeks, including repeat contacts', weeklyChart(weeklyContacts(state, 8, today)))}
      </div>
      <section class="qt-panel" aria-label="Supporting estimates"><div class="qt-panel__body" style="padding-top:1.15em" data-supporting>${supportingRows(r, ui.group)}</div></section>
      <details class="calc-notes"><summary>How these numbers are calculated</summary><ul>
        <li>Contacts logged counts every reported contact date in the range, including repeat contacts with the same customer.</li>
        <li>An estimate joins the cohort once, on its earliest reported contact in this reporting period. Its value is the amount stored when that contact was logged.</li>
        <li>A won or lost outcome qualifies only when it was recorded after a logged contact. Closed estimates without that sequence show as uncertain.</li>
        <li>Outcomes show the latest recorded status as of today. Won share keeps open and uncertain estimates in the denominator; it is not a causal conversion rate.</li>
        <li>Current overdue value is a separate snapshot of eligible estimates past their follow-up date. It is not a predicted loss.</li>
      </ul></details>
      <p class="qt-help">Reporting period began ${esc(shortDate(state.startedAt.slice(0, 10)))}.${r.incomplete ? ` ${plural(r.incomplete, 'estimate')} came from an import, so earlier activity before QuoteTend isn’t included.` : ''}</p>`;
  },

  import() {
    const csv = sampleImportCSV(today);
    const p = ui.importPreview;
    const counts = p ? p.rows.reduce((c, r) => ({ ...c, [r.outcome]: (c[r.outcome] || 0) + 1 }), {}) : {};
    return `<div class="view-head"><div><p class="qt-eyebrow">Onboarding</p><h1 tabindex="-1">Import estimates</h1><p class="sub">Bring open estimates in from a spreadsheet or estimating-tool export. Nothing is saved until you choose Import.</p></div></div>
      <section class="qt-panel"><div class="import-hero"><div class="file-card"><span class="file-card__icon">${icon('file')}</span><div><strong>fernbrook-estimates-export.csv</strong><span>Sample spreadsheet export · 5 rows · 8 columns · fictional</span></div></div>
        ${state.importedSample ? `<span class="qt-chip">${icon('checkCircle')} Sample imported</span>` : `<button class="qt-btn qt-btn--primary" type="button" data-action="preview-import">${icon('search')}${p ? 'Preview again' : 'Preview sample import'}</button>`}</div>
        <pre class="csv-raw" tabindex="0" aria-label="Sample CSV contents">${esc(csv)}</pre></section>
      ${p ? `<div class="import-cols">
          ${panel('Column matching', 'Spreadsheet headings matched to QuoteTend fields', mappingTable(p) + `<p class="qt-help">Dates converted from M/D/YYYY. “Sent” mapped to the Sent status. No opt-out column, so existing shared-email opt-outs still apply.</p>`)}
          <section class="qt-panel"><div class="qt-panel__head"><div><h2 class="qt-panel__title">Row preview</h2><p class="qt-panel__desc">${counts.ready || 0} ready · ${(counts.conflict || 0) + (counts.existing || 0)} protected · ${counts.invalid || 0} invalid</p></div></div>
            <div class="qt-panel__body">${importRows(p)}</div>
            <div class="import-actions"><button class="qt-btn qt-btn--primary" type="button" data-action="import-ready" ${p.ready.length ? '' : 'disabled'}>${icon('import')}Import ${plural(p.ready.length, 'ready estimate')}</button><p>Protected and invalid rows are not imported. Existing estimates are never overwritten.</p></div></section>
        </div>` : ''}
      ${state.importedSample ? `<div class="qt-notice">${icon('checkCircle')}<p><strong>Sample imported.</strong> The ready rows were added as fictional estimates; FR-2318 kept its existing record. <a class="qt-link" href="#estimates" data-preset="query:FR-234">View imported estimates</a></p></div>` : ''}
      <div class="qt-notice">${icon('info')}<p>In QuoteTend you choose your own CSV export. This public demo only uses the fictional sample above — nothing is uploaded from your computer.</p></div>`;
  }
};

function estimateResults() {
  const list = filterEstimates(state.quotes, ui, today);
  const open = list.filter(q => q.status === 'sent').reduce((s, q) => s + q.amount_usd, 0);
  const active = ui.query || ui.status !== 'all' || ui.followup !== 'any' || ui.trade !== 'all';
  return `<div class="summary"><span role="status">Showing <strong>${list.length}</strong> of ${state.quotes.length} estimates${ui.query ? ` matching “${esc(ui.query)}”` : ''}</span>
      <span><strong>${money(open)}</strong> open value in view ${active ? `<button class="qt-btn qt-btn--sm qt-btn--ghost" type="button" data-action="clear-filters">${icon('x')}Clear filters</button>` : ''}</span></div>
    ${list.length ? estimateTable(list, today, state.quotes) : empty('search', 'No estimates match', 'Try a different search term or clear the filters.', '<button class="qt-btn" type="button" data-action="clear-filters">Clear filters</button>')}`;
}

function queueBody(q) {
  const list = q[ui.queue];
  if (!list.length) {
    return {
      due: empty('checkCircle', 'All caught up', 'Nothing is due or overdue. Upcoming follow-ups appear here on their date.'),
      upcoming: empty('calendar', 'Nothing scheduled ahead', 'Log a contact or schedule a date to plan the next follow-up.'),
      unscheduled: empty('calendar', 'Every open estimate has a date', 'Sent estimates without a follow-up date appear here.')
    }[ui.queue];
  }
  const rows = items => `<ul class="qt-queue">${items.map(x => queueRow(x, today, state.quotes)).join('')}</ul>`;
  if (ui.queue !== 'due') return rows(list);
  const overdue = list.filter(x => x.next_follow_up_date < today), now = list.filter(x => x.next_follow_up_date === today);
  const group = (label, items) => items.length ? `<div class="qt-queue-group"><span>${label} · ${items.length}</span><span>${money(items.reduce((s, x) => s + x.amount_usd, 0))}</span></div>${rows(items)}` : '';
  return group('Overdue', overdue) + group('Due today', now);
}

// ---------- Rendering ----------
function renderNav() {
  const m = metrics(state.quotes, today);
  $('[data-nav-list]').innerHTML = Object.entries(VIEWS).map(([k, label]) => `<li><a href="#${k}" ${ui.view === k ? 'aria-current="page"' : ''}>${icon(k)}<span>${label}</span>${
    k === 'estimates' ? `<em>${state.quotes.length}</em>` : k === 'followups' ? `<em class="${m.dueCount ? 'is-alert' : ''}">${m.dueCount}<span class="sr-only"> due</span></em>` : ''}</a></li>`).join('');
  $('[data-crumb]').textContent = VIEWS[ui.view];
  document.title = `${VIEWS[ui.view]} · QuoteTend interactive demo`;
}

function render({ focusHeading = false } = {}) {
  renderNav();
  main.innerHTML = views[ui.view]();
  if (ui.drawer) renderDrawer();
  renderTour();
  if (focusHeading) $('h1', main)?.focus();
}

function renderDrawer() {
  const q = state.quotes.find(x => x.estimate_id === ui.drawer);
  if (!q) return closeDrawer({ restoreFocus: false });
  const body = $('.drawer__body', drawer), scroll = body?.scrollTop || 0;
  drawer.innerHTML = `<div class="drawer__head">${detailHeader(q)}</div><div class="drawer__body">${detailBody(q, state.quotes, today, { draftText: ui.drafts[q.estimate_id], draftStatus: ui.draftStatus })}</div>`;
  $('#drawer-title', drawer).tabIndex = -1;
  $('.drawer__body', drawer).scrollTop = scroll;
  const chip = $('[data-section="draft"] .qt-chip', drawer);
  if (chip && ui.drafts[q.estimate_id] !== undefined) chip.textContent = 'Unsaved changes';
  if (ui.draftStatus) $('[data-draft-status]', drawer)?.classList.toggle('is-success', ui.draftStatusOk);
}

function openDrawer(id, { focus = true, trigger = document.activeElement } = {}) {
  if (ui.drawer !== id) ui.draftStatus = '';
  ui.drawer = id;
  lastTrigger = trigger;
  renderDrawer();
  drawer.hidden = false; scrim.hidden = false;
  app.inert = true;
  document.body.classList.add('drawer-open');
  closeNav();
  if (focus) $('#drawer-title', drawer)?.focus();
  updateHighlight();
}

function closeDrawer({ restoreFocus = true } = {}) {
  if (!ui.drawer) return;
  const id = ui.drawer;
  ui.drawer = null; ui.draftStatus = '';
  drawer.hidden = true; scrim.hidden = true; drawer.innerHTML = '';
  app.inert = false;
  document.body.classList.remove('drawer-open');
  if (restoreFocus) (lastTrigger?.isConnected ? lastTrigger : $(`[data-open="${CSS.escape(id)}"]`, main) || $('h1', main))?.focus();
}

function navigate(view, { focusHeading = true } = {}) {
  if (!VIEWS[view]) view = 'overview';
  ui.view = view;
  if (location.hash !== `#${view}`) history.pushState(null, '', `#${view}`);
  if (ui.drawer) closeDrawer({ restoreFocus: false });
  closeNav();
  render({ focusHeading });
  window.scrollTo({ top: 0, behavior: 'auto' });
}

function commit(next, message) {
  state = next;
  save();
  render();
  if (message) toast(message);
}

// ---------- Mobile navigation ----------
const navToggle = $('[data-nav-toggle]'), navScrim = $('[data-nav-scrim]');
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

// ---------- Drafts, contacts, outcomes ----------
const currentQuote = () => state.quotes.find(x => x.estimate_id === ui.drawer);
function setDraftStatus(text, ok = true) {
  ui.draftStatus = text; ui.draftStatusOk = ok;
  const el = $('[data-draft-status]', drawer);
  if (el) { el.textContent = text; el.classList.toggle('is-success', ok); }
}

async function copyDraft() {
  const ta = $('#draft-text', drawer);
  if (!ta) return toast('Open an estimate that can be followed up to copy its draft.', { error: true });
  let ok = false;
  try { await navigator.clipboard.writeText(ta.value); ok = true; } catch { /* fall back below */ }
  if (!ok) { ta.focus(); ta.select(); try { ok = document.execCommand('copy'); } catch { ok = false; } }
  setDraftStatus(ok ? 'Draft copied to your clipboard. Nothing was sent and no contact was recorded — paste it into your own email or text app.'
    : 'Your browser blocked copying. The draft is selected — press Ctrl+C (or ⌘C) to copy it. Nothing was sent.', ok);
  toast(ok ? 'Draft copied. Nothing was sent.' : 'Copy blocked — draft selected instead.', { error: !ok });
}

function submitContact(form) {
  const q = currentQuote(), err = $('[data-form-error]', form), data = Object.fromEntries(new FormData(form).entries());
  $$('input', form).forEach(i => i.removeAttribute('aria-invalid'));
  try {
    const next = recordContact(state, q.estimate_id, { date: data.date, nextDate: data.nextDate, note: data.note || '', channel: data.channel }, today);
    if (ui.tour !== null && q.estimate_id === FOCUS_ID) { ui.loggedExample = true; persistTour(); }
    commit(next, `${data.channel} contact recorded for ${q.customer_name}. Next follow-up ${weekdayDate(data.nextDate)}.`);
    $('#drawer-title', drawer)?.focus();
    return true;
  } catch (e) {
    err.textContent = e.message;
    const field = /next follow-up/i.test(e.message) ? 'nextDate' : /contact date/i.test(e.message) ? 'date' : null;
    if (field) { form.elements[field].setAttribute('aria-invalid', 'true'); form.elements[field].focus(); }
    return false;
  }
}

function submitSchedule(form) {
  const q = currentQuote(), err = $('[data-form-error]', form);
  try {
    commit(setFollowUp(state, q.estimate_id, form.elements.date.value, today), `Next follow-up for ${q.customer_name} set for ${weekdayDate(form.elements.date.value)}.`);
    $('#drawer-title', drawer)?.focus();
  } catch (e) { err.textContent = e.message; form.elements.date.setAttribute('aria-invalid', 'true'); form.elements.date.focus(); }
}

async function outcome(kind) {
  const q = currentQuote();
  const copy = {
    won: { title: 'Mark this estimate won?', body: `This records ${q.customer_name}’s ${money(q.amount_usd)} estimate as won and clears its follow-up date. The activity history is kept.`, confirm: 'Mark won', done: 'Estimate marked won. It has left the follow-up queues.' },
    lost: { title: 'Mark this estimate lost?', body: `This records ${q.customer_name}’s ${money(q.amount_usd)} estimate as lost and clears its follow-up date. The activity history is kept.`, confirm: 'Mark lost', done: 'Estimate marked lost. It has left the follow-up queues.' },
    optout: { title: 'Stop follow-ups for this customer?', body: 'This estimate and any estimates sharing the same email leave every follow-up queue. Their follow-up dates are cleared and drafts are paused.', confirm: 'Do not contact', done: 'Follow-ups stopped for this customer.', tone: 'warn' }
  }[kind];
  if (!await confirmAction({ ...copy, focusCancel: kind === 'optout' })) return;
  try {
    if (ui.tour !== null && q.estimate_id === FOCUS_ID) { ui.loggedExample = true; persistTour(); }
    commit(recordOutcome(state, q.estimate_id, kind, today), copy.done);
    $('#drawer-title', drawer)?.focus();
  }
  catch (e) { toast(e.message, { error: true }); }
}

async function resetDemo() {
  closeNav();
  const ok = await confirmAction({ title: 'Reset the demo?', body: 'This restores the original fictional Fernbrook workspace and removes every change you made in this browser.', confirm: 'Reset demo data', tone: 'warn', focusCancel: true });
  if (!ok) return false;
  const touring = ui.tour !== null;
  closeDrawer({ restoreFocus: false });
  state = createWorkspace(today); save();
  Object.assign(ui, { query: '', status: 'all', followup: 'any', trade: 'all', sort: 'followup', queue: 'due', range: 30, group: 'cohort', drafts: {}, draftStatus: '', importPreview: null, loggedExample: false });
  if (touring) startTour(0);
  else navigate('overview');
  toast('Original fictional workspace restored.');
  return true;
}

// ---------- Guided tour ----------
const queueFor = id => {
  const q = state.quotes.find(x => x.estimate_id === id);
  const s = q ? followupState(q, today, state.quotes) : 'closed';
  return s === 'upcoming' ? 'upcoming' : s === 'unscheduled' ? 'unscheduled' : 'due';
};
function persistTour() {
  if (ui.tour === null) session.remove(TOUR_KEY);
  else session.set(TOUR_KEY, JSON.stringify({ index: ui.tour, min: ui.tourMin, loggedExample: ui.loggedExample }));
}

function renderTour() {
  document.body.classList.toggle('tour-on', ui.tour !== null);
  if (ui.tour === null) { dock.hidden = true; dock.innerHTML = ''; clearHighlight(); return; }
  dock.hidden = false;
  dock.innerHTML = tourCard(ui.tour, tourContext(state, today, { loggedExample: ui.loggedExample }), { minimized: ui.tourMin });
  document.documentElement.style.setProperty('--dock-h', `${dock.offsetHeight + 16}px`);
  updateHighlight();
}

function clearHighlight() { $$('.tour-target').forEach(el => el.classList.remove('tour-target')); }
function updateHighlight() {
  clearHighlight();
  const step = STEPS[ui.tour ?? -1];
  if (!step) return;
  const target = (ui.drawer && $(step.target, drawer)) || $(step.target, main);
  if (!target) return;
  target.classList.add('tour-target');
  if (ui.scrolledStep !== ui.tour) {
    ui.scrolledStep = ui.tour;
    requestAnimationFrame(() => target.scrollIntoView({ block: 'start', behavior: reducedMotion ? 'auto' : 'smooth' }));
  }
}

function startTour(index = 0, { focus = true } = {}) {
  closeNav();
  prefs.welcomeDismissed = true; savePrefs();
  ui.tour = index; ui.tourMin = false; ui.scrolledStep = null;
  applyTourStep({ focus });
}

function applyTourStep({ focus = true } = {}) {
  const step = STEPS[ui.tour];
  if (step) {
    if (step.view === 'followups') ui.queue = queueFor(FOCUS_ID);
    if (step.view === 'results') ui.range = 30;
    if (ui.view !== step.view) { ui.view = step.view; history.replaceState(null, '', `#${step.view}`); }
    if (step.drawer && state.quotes.some(q => q.estimate_id === step.drawer)) {
      if (ui.drawer !== step.drawer) { render(); openDrawer(step.drawer, { focus: false, trigger: $(`[data-open="${step.drawer}"]`, main) }); }
    } else if (ui.drawer) closeDrawer({ restoreFocus: false });
  }
  render();
  persistTour();
  if (focus) $('#tour-title', dock)?.focus();
}

function exitTour() {
  ui.tour = null; ui.scrolledStep = null;
  persistTour();
  renderTour();
  ($('#drawer-title', drawer) || $('h1', main))?.focus();
}

async function tourAction(act) {
  switch (act) {
    case 'next': ui.tour = Math.min(ui.tour + 1, STEPS.length); return applyTourStep();
    case 'back': ui.tour = Math.max(ui.tour - 1, 0); return applyTourStep();
    case 'exit': return exitTour();
    case 'restart': return startTour(0);
    case 'reset-data': return resetDemo();
    case 'minimize': {
      ui.tourMin = !ui.tourMin; persistTour(); renderTour();
      return $('[data-tour-act="minimize"]', dock)?.focus();
    }
    case 'open-focus': ui.tour = 2; return applyTourStep();
    case 'copy-draft': return copyDraft();
    case 'log-example': {
      const values = { date: today, channel: 'Phone', nextDate: addDays(today, 3), note: 'Example call: discussed the ice & water shield upgrade; deciding this week' };
      try {
        ui.loggedExample = true;
        commit(recordContact(state, FOCUS_ID, values, today), `Example phone call recorded. Next follow-up ${weekdayDate(values.nextDate)}.`);
        persistTour();
        $('[data-section="contact"]', drawer)?.scrollIntoView({ block: 'center', behavior: reducedMotion ? 'auto' : 'smooth' });
        $('#tour-title', dock)?.focus();
      } catch (e) { ui.loggedExample = false; toast(e.message, { error: true }); renderTour(); }
      return undefined;
    }
    default: return undefined;
  }
}

// ---------- Events ----------
function applyPreset(preset) {
  const [key, value] = preset.split(':');
  if (key === 'queue') ui.queue = value;
  if (key === 'status') Object.assign(ui, { status: value, query: '', followup: 'any', trade: 'all' });
  if (key === 'query') Object.assign(ui, { query: value, status: 'all', followup: 'any', trade: 'all' });
}

function updateEstimateResults() {
  const box = $('[data-results]', main);
  if (box) box.innerHTML = estimateResults();
}

document.addEventListener('click', async event => {
  const el = event.target;
  try {
    const preset = el.closest('[data-preset]');
    if (preset) {
      applyPreset(preset.dataset.preset);
      const view = preset.getAttribute('href').slice(1);
      event.preventDefault();
      return navigate(view);
    }
    const nav = el.closest('.app-nav a, .view-head a[href^="#"], .panel-link[href^="#"], .qt-empty a[href^="#"], .kpi-link');
    if (nav && nav.getAttribute('href')?.startsWith('#')) { event.preventDefault(); return navigate(nav.getAttribute('href').slice(1)); }

    const opener = el.closest('[data-open]');
    if (opener) return openDrawer(opener.dataset.open, { trigger: opener });

    const tourGo = el.closest('[data-tour-go]');
    if (tourGo) { ui.tour = Number(tourGo.dataset.tourGo); return applyTourStep(); }
    const tourAct = el.closest('[data-tour-act]');
    if (tourAct) return tourAction(tourAct.dataset.tourAct);

    const outcomeBtn = el.closest('[data-outcome]');
    if (outcomeBtn) return outcome(outcomeBtn.dataset.outcome);

    const tab = el.closest('[data-queue]');
    if (tab) { ui.queue = tab.dataset.queue; render(); return $(`[data-queue="${ui.queue}"]`, main)?.focus(); }
    const statusBtn = el.closest('[data-status]');
    if (statusBtn) {
      ui.status = statusBtn.dataset.status;
      $$('[data-status]', main).forEach(b => b.setAttribute('aria-pressed', String(b === statusBtn)));
      return updateEstimateResults();
    }
    const range = el.closest('[data-range]');
    if (range) { ui.range = Number(range.dataset.range); render(); return $(`[data-range="${ui.range}"]`, main)?.focus(); }
    const group = el.closest('[data-group]');
    if (group) { ui.group = group.dataset.group; render(); return $(`[data-group="${ui.group}"]`, main)?.focus(); }

    if (el.closest('[data-drawer-scrim]')) return closeDrawer();

    const action = el.closest('[data-action]')?.dataset.action;
    switch (action) {
      case 'start-tour': return startTour(0);
      case 'reset': return resetDemo();
      case 'dismiss-welcome': prefs.welcomeDismissed = true; savePrefs(); $('[data-welcome]', main)?.remove(); return $('h1', main)?.focus();
      case 'close-drawer': return closeDrawer();
      case 'copy-draft': return copyDraft();
      case 'save-draft': {
        const q = currentQuote(), text = $('#draft-text', drawer).value;
        state = saveDraft(state, q.estimate_id, text); save();
        delete ui.drafts[q.estimate_id];
        renderDrawer();
        setDraftStatus('Draft saved with this estimate. Saving never sends a message or records a contact.');
        $('[data-action="save-draft"]', drawer)?.focus();
        return toast('Draft saved. Nothing was sent.');
      }
      case 'reset-draft': {
        const q = currentQuote(), ta = $('#draft-text', drawer);
        ta.value = draftMessage(q, COMPANY.name, state.quotes);
        ui.drafts[q.estimate_id] = ta.value;
        $('[data-section="draft"] .qt-chip', drawer).textContent = 'Unsaved changes';
        setDraftStatus('Template restored. Save the draft to keep this version.', false);
        return ta.focus();
      }
      case 'clear-filters': {
        Object.assign(ui, { query: '', status: 'all', followup: 'any', trade: 'all' });
        render();
        return $('#est-q', main)?.focus();
      }
      case 'preview-import': {
        ui.importPreview = previewImport(sampleImportCSV(today), state.quotes);
        render();
        return $('.import-cols', main)?.scrollIntoView({ block: 'start', behavior: reducedMotion ? 'auto' : 'smooth' });
      }
      case 'import-ready': {
        const { state: next, imported } = importReady(state, ui.importPreview, today);
        ui.importPreview = null;
        commit(next, `${plural(imported, 'fictional estimate')} imported. Existing records were not changed.`);
        return $('h1', main)?.focus();
      }
      default: return undefined;
    }
  } catch (error) {
    console.error(error);
    toast('Something went wrong in the demo. Reset demo data if it keeps happening.', { error: true });
  }
});

document.addEventListener('submit', event => {
  const form = event.target;
  if (form.matches('[data-form="contact"]')) { event.preventDefault(); submitContact(form); }
  else if (form.matches('[data-form="schedule"]')) { event.preventDefault(); submitSchedule(form); }
  else if (form.matches('[data-global-search]')) {
    event.preventDefault();
    Object.assign(ui, { query: form.elements.q.value.trim(), status: 'all', followup: 'any', trade: 'all' });
    navigate('estimates', { focusHeading: false });
    const input = $('#est-q', main);
    input?.focus(); input?.setSelectionRange(input.value.length, input.value.length);
    form.reset();
  }
});

document.addEventListener('input', event => {
  const el = event.target;
  if (el.id === 'est-q') { ui.query = el.value; updateEstimateResults(); }
  else if (el.id === 'draft-text' && ui.drawer) {
    ui.drafts[ui.drawer] = el.value;
    const chip = $('[data-section="draft"] .qt-chip', drawer);
    if (chip) chip.textContent = 'Unsaved changes';
  }
});

document.addEventListener('change', event => {
  const key = event.target.dataset?.filter;
  if (key && key !== 'query') { ui[key] = event.target.value; updateEstimateResults(); }
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    if (confirmEl.open) return;
    if (app.classList.contains('nav-open')) { closeNav(); return navToggle.focus(); }
    if (ui.drawer) { event.preventDefault(); return closeDrawer(); }
  }
  const tab = event.target.closest?.('[role="tab"]');
  if (tab && ['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) {
    const tabs = $$('[role="tab"]', main), i = tabs.indexOf(tab);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (i + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    event.preventDefault();
    ui.queue = tabs[next].dataset.queue; render();
    $(`[data-queue="${ui.queue}"]`, main)?.focus();
  }
  if (dock.contains(event.target) && ui.tour !== null && !event.target.matches('input, textarea, select')) {
    if (event.key === 'ArrowRight' && ui.tour < STEPS.length) { event.preventDefault(); tourAction('next'); }
    if (event.key === 'ArrowLeft' && ui.tour > 0) { event.preventDefault(); tourAction('back'); }
  }
});

addEventListener('popstate', () => {
  const view = location.hash.slice(1);
  if (VIEWS[view] && view !== ui.view) { ui.view = view; if (ui.drawer) closeDrawer({ restoreFocus: false }); render({ focusHeading: true }); }
});
addEventListener('hashchange', () => {
  const view = location.hash.slice(1);
  if (VIEWS[view] && view !== ui.view) navigate(view);
});
addEventListener('resize', () => { if (ui.tour !== null) document.documentElement.style.setProperty('--dock-h', `${dock.offsetHeight + 16}px`); }, { passive: true });

// ---------- Start ----------
$$('[data-icon]').forEach(el => el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon)));
navToggle.innerHTML = icon('menu');
$('.app-search')?.insertAdjacentHTML('afterbegin', icon('search'));
$$('.app-tour-btn').forEach(el => el.insertAdjacentHTML('afterbegin', icon('tour')));

const params = new URLSearchParams(location.search);
const initialView = location.hash.slice(1);
ui.view = VIEWS[initialView] ? initialView : 'overview';
const savedTour = readJSON(session, TOUR_KEY);
if (params.has('tour')) {
  const n = Number.parseInt(params.get('tour'), 10);
  params.delete('tour');
  const rest = params.toString();
  history.replaceState(null, '', `${location.pathname}${rest ? `?${rest}` : ''}${location.hash}`);
  startTour(Number.isInteger(n) && n >= 1 && n <= STEPS.length ? n - 1 : 0, { focus: false });
} else if (Number.isInteger(savedTour.index)) {
  ui.tour = Math.min(Math.max(savedTour.index, 0), STEPS.length); ui.tourMin = !!savedTour.min; ui.loggedExample = !!savedTour.loggedExample;
  applyTourStep({ focus: false });
} else {
  render();
}
if (!storageOk) toast('Browser storage is unavailable, so changes will reset when you leave this page.', { error: true });
