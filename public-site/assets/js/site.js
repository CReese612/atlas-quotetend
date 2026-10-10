// QuoteTend public website. Static by design: no private APIs, accounts or analytics.
// Product visuals are rendered from the same components and fictional records as the demo.
import { SITE_CONFIG } from './site-config.js';
import { resolveContactConfig, mountEarlyAccess } from './early-access.js';
import { COMPANY, createWorkspace, todayISO, addDays, metrics, queues, pipelineByState, filterEstimates, recordContact, resultsForRange,
  previewImport, sampleImportCSV, statusTotals, TRADES } from './workspace.js';
import { esc, money, moneyShort, icon, kpi, attentionRow, stateBar, estimateTable, queueRow, draftPanel, contactForm, timeline,
  resultCards, cohortBar, mappingTable, importRows, previewSidebar, duePill, longDate, shortDate, weekdayDate, detailHeader, detailBody, plural, badge, avatar } from './components.js';
import { tourCard, tourContext, FOCUS_ID } from './tour.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

// Subtle reveal on scroll. Enabled first, and only when supported, so content can never stay
// hidden if something later in this module fails.
if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  document.documentElement.classList.add('js');
  const io = new IntersectionObserver(entries => entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  $$('.reveal').forEach(el => io.observe(el));
}

const today = todayISO();
const state = createWorkspace(today);
const { quotes } = state;
const m = metrics(quotes, today);
const q = queues(quotes, today);
const byState = pipelineByState(quotes, today);
const focus = quotes.find(x => x.estimate_id === FOCUS_ID);

// ---------- Header and mobile menu ----------
const header = $('[data-header]');
const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 8);
addEventListener('scroll', onScroll, { passive: true }); onScroll();

const menuBtn = $('[data-menu-btn]'), menu = $('#mobile-menu');
function setMenu(open) {
  menu.hidden = !open; menuBtn.setAttribute('aria-expanded', String(open));
  menuBtn.querySelector('span').textContent = open ? 'Close' : 'Menu';
  if (open) menu.querySelector('a')?.focus();
}
menuBtn.addEventListener('click', () => setMenu(menu.hidden));
menu.addEventListener('click', e => { if (e.target.closest('a')) setMenu(false); });
addEventListener('keydown', e => { if (e.key === 'Escape' && !menu.hidden) { setMenu(false); menuBtn.focus(); } });
matchMedia('(min-width: 901px)').addEventListener('change', e => { if (e.matches) setMenu(false); });

// In-page links: move focus to the target section for keyboard and screen-reader users.
document.addEventListener('click', e => {
  const a = e.target.closest('a[href^="#"]');
  if (!a || a.getAttribute('href').length < 2) return;
  const target = document.getElementById(a.getAttribute('href').slice(1));
  if (!target) return;
  requestAnimationFrame(() => { target.setAttribute('tabindex', '-1'); target.focus({ preventScroll: true }); });
});

// ---------- Dynamic figures (always derived from the demo records) ----------
const fills = {
  openValue: money(m.openValue), overdueValue: money(byState.overdue.value), estimateCount: String(quotes.length),
  focusValue: money(focus.amount_usd)
};
for (const el of $$('[data-fill]')) if (fills[el.dataset.fill]) el.textContent = fills[el.dataset.fill];
$$('[data-year]').forEach(el => { el.textContent = String(new Date().getFullYear()); });
$$('[data-truth="now"] li').forEach(li => li.insertAdjacentHTML('afterbegin', icon('checkCircle')));
$$('[data-truth="next"] li').forEach(li => li.insertAdjacentHTML('afterbegin', icon('followups')));
$$('[data-truth="info"] li').forEach(li => li.insertAdjacentHTML('afterbegin', icon('info')));
const tradesList = $('[data-trades]');
if (tradesList) tradesList.innerHTML = TRADES.map(t => `<li>${icon(t)}${esc(t === 'Exterior remodel' ? 'Exterior remodeling' : t)}</li>`).join('');

// ---------- Product visuals ----------
const counts = { estimates: quotes.length, due: m.dueCount };
const windowBar = title => `<div class="window-bar"><span class="dots"><i></i><i></i><i></i></span><span class="window-title">${esc(title)}</span><span class="window-tag">Fictional demo data</span></div>`;
const greet = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };

// Previews marked data-core (the Features page) show only what the customer app has today, so they
// leave out the demo's planned-feature extras: trade tags, the trade and follow-up filters and the
// pipeline-by-state chart.
const overviewWindow = core => {
  const overdue = q.due.filter(x => x.next_follow_up_date < today).length;
  return `<div class="window qt">${windowBar(`Overview · ${COMPANY.name}`)}<div class="window-body">${previewSidebar('overview', counts)}
      <div class="pv-main"><div class="pv-head"><div><p class="qt-eyebrow">${esc(longDate(today))}</p><h3 class="pv-title">${greet()}. ${plural(m.dueCount, 'follow-up')} need${m.dueCount === 1 ? 's' : ''} attention.</h3></div></div>
        <div class="qt-kpis qt-kpis--3">
          ${kpi({ label: 'Open pipeline', value: money(m.openValue), sub: `${m.openCount} sent estimates awaiting a decision`, ic: 'dollar' })}
          ${kpi({ label: 'Due & overdue', value: String(m.dueCount), sub: `<strong class="qt-tone-overdue">${overdue} overdue</strong> · ${m.dueCount - overdue} due today`, ic: 'alert', accent: 'alert' })}
          ${kpi({ label: 'Recorded wins', value: money(m.wonValue), sub: `${m.wonCount} estimates marked won`, ic: 'checkCircle', accent: 'won' })}
        </div>
        <div class="pv-grid${core ? ' pv-grid--single' : ''}">
          <section class="qt-panel"><div class="qt-panel__head"><div><h4 class="qt-panel__title">Needs your attention <span class="qt-count">${q.due.length}</span></h4><p class="qt-panel__desc">Oldest follow-up promises first</p></div></div><ul class="qt-attn-list">${q.due.map(x => attentionRow(x, today, quotes, { interactive: false })).join('')}</ul></section>
          ${core ? '' : `<section class="qt-panel"><div class="qt-panel__head"><div><h4 class="qt-panel__title">Open pipeline</h4><p class="qt-panel__desc">By follow-up state</p></div></div><div class="qt-panel__body">${stateBar(byState, m.openValue)}</div></section>`}
        </div></div></div></div>`;
};

const shots = {
  hero() {
    return `${overviewWindow(false)}
      <div class="float float--draft"><div class="float-head"><strong>${icon('pen')}Follow-up draft · ${esc(focus.customer_name)}</strong><span class="qt-chip">Editable</span></div>
        <p>Hi Dana, I wanted to check in on the ${esc(money(focus.amount_usd))} estimate for your roof replacement. Have you had a chance to look it over?</p>
        <div class="float-actions"><span class="qt-btn qt-btn--primary qt-btn--sm">${icon('copy')}Copy draft</span><span class="float-note">Nothing is sent automatically</span></div></div>
      <div class="float float--toast"><span class="ic">${icon('check')}</span><div><strong>Phone call recorded</strong><span>Next follow-up ${esc(weekdayDate(addDays(today, 3)))}</span></div></div>`;
  },

  scatter() {
    const [a, b, c] = [q.due[0], q.due[1], q.due[2]];
    return `<div class="sticky"><b>Call ${esc(a.customer_name.split(' ')[0])} W. re: roof??</b>ice &amp; water shield?<br>2 other bids… Tues?</div>
      <div class="sheet"><div class="sheet-bar">estimates_FINAL_v3.xlsx</div><table><thead><tr><th>Customer</th><th>Amount</th><th>Follow up</th></tr></thead><tbody>
        <tr><td>Ruiz</td><td>${money(b.amount_usd)}</td><td class="q">???</td></tr><tr><td>K. O’Neill</td><td>${money(c.amount_usd)}</td><td></td></tr>
        <tr><td>Nandakumar</td><td>${money(q.due[3].amount_usd)}</td><td class="q">next wk?</td></tr><tr><td>Hillcrest HOA</td><td>$64,900</td><td>after board mtg</td></tr></tbody></table></div>
      <div class="bubble">Hi Priya! Just checking if you had a chance to look at the window quote…<small>Draft · never sent</small></div>
      <div class="mail"><b>RE: Estimate ${esc(b.estimate_id)} — siding colors</b><span>Unread · ${esc(b.customer_name)}</span></div>
      <div class="voicemail"><span class="vm-icon">${icon('Phone')}</span><div><b>Missed call · 555-0168</b><span>Voicemail: “Any update on the roof price?”</span></div></div>`;
  },

  sorted() {
    const groups = [['overdue', q.due.filter(x => x.next_follow_up_date < today)], ['today', q.due.filter(x => x.next_follow_up_date === today)], ['upcoming', q.upcoming], ['unscheduled', q.unscheduled]];
    const label = { overdue: 'Overdue', today: 'Due today', upcoming: 'Upcoming', unscheduled: 'Needs a date' };
    const ic = { overdue: 'alert', today: 'flag', upcoming: 'calendar', unscheduled: 'calendar' };
    return `<div class="sorted qt">${groups.map(([k, list]) => `<section class="sorted-group sorted-group--${k}"><header><span class="qt-due qt-due--${k}">${icon(ic[k])}${label[k]}</span><span><em>${plural(list.length, 'estimate')}</em><strong>${money(list.reduce((s, x) => s + x.amount_usd, 0))}</strong></span></header>
      <ul>${list.slice(0, k === 'overdue' ? 3 : 2).map(x => `<li><span><b>${esc(x.customer_name)}</b> · ${esc(x.trade)}</span><span>${money(x.amount_usd)}</span></li>`).join('')}</ul></section>`).join('')}</div>`;
  },

  overview() { return overviewWindow(true); },

  estimates(core) {
    // The customer app searches customer, job, estimate ID and email; the demo also searches its planned fields.
    const list = filterEstimates(quotes, { query: 'roof', sort: 'followup' }, today)
      .filter(x => !core || `${x.customer_name} ${x.job_description} ${x.estimate_id} ${x.customer_email}`.toLowerCase().includes('roof'));
    const value = list.filter(x => x.status === 'sent').reduce((s, x) => s + x.amount_usd, 0);
    return `<div class="card-ui qt cards-at-narrow"><div class="card-ui__bar"><div><h4>Estimates</h4><p>${quotes.length} estimates · ${money(m.openValue)} open</p></div><span class="qt-btn qt-btn--sm">${icon('import')}Import CSV</span></div>
      <div class="toolbar-pv"><span class="search-pv">${icon('search')}roof<span class="caret"></span></span><span class="select-pv">All statuses ${icon('chevronDown')}</span>${core ? '' : `<span class="select-pv">Any follow-up ${icon('chevronDown')}</span><span class="select-pv">All trades ${icon('chevronDown')}</span>`}</div>
      <div class="summary-pv"><span>Showing <strong>${list.length}</strong> of ${quotes.length} estimates matching “roof”</span><span><strong>${money(value)}</strong> open in this view</span></div>
      ${estimateTable(list.slice(0, 6), today, quotes, { interactive: false })}</div>`;
  },

  queue() {
    const rows = q.due.slice(0, 4);
    return `<div class="card-ui qt"><div class="card-ui__bar"><div><h4>Follow-ups</h4><p>Sent estimates only · drafts, closed and opted-out estimates excluded</p></div></div>
      <div class="qt-tabs" role="presentation"><span class="qt-tab" aria-selected="true">Due &amp; overdue <span class="qt-count">${q.due.length}</span></span><span class="qt-tab">Upcoming <span class="qt-count">${q.upcoming.length}</span></span><span class="qt-tab">Needs a date <span class="qt-count">${q.unscheduled.length}</span></span></div>
      <div class="qt-queue-group"><span>Overdue</span><span>${money(byState.overdue.value)}</span></div><ul class="qt-queue">${rows.map(x => queueRow(x, today, quotes, { interactive: false })).join('')}</ul></div>`;
  },

  draft() {
    return `<div class="stack-pv qt">${draftPanel(focus, quotes, { interactive: false })}<div class="toast-pv offset-toast">${icon('checkCircle')}Draft copied. Nothing was sent.</div></div>`;
  },

  contact() {
    let s = recordContact(state, FOCUS_ID, { date: today, nextDate: addDays(today, 3), channel: 'Phone', note: 'Discussed ice & water shield; deciding this week' }, today);
    const after = s.quotes.find(x => x.estimate_id === FOCUS_ID);
    return `<div class="split-pv qt">${contactForm(focus, today, { interactive: false, values: { note: 'Discussed ice & water shield; deciding this week' } })}
      <section class="qt-section"><div class="qt-section__head"><h3>${icon('followups')}Activity history</h3>${badge(after)}</div>${timeline(after, today)}<p class="qt-help">${duePill(after, today, s.quotes)} · next follow-up ${esc(weekdayDate(after.next_follow_up_date))}</p></section></div>`;
  },

  results() {
    const r = resultsForRange(state, 30, today);
    return `<div class="card-ui qt"><div class="card-ui__bar"><div><h4>Follow-up Results</h4><p>Last 30 days · recorded activity</p></div><span class="qt-chip">Fictional data</span></div>
      <div style="padding:1.1em 1.3em 1.3em;display:grid;gap:1.1em">${resultCards(r, { interactive: false, selected: 'won-value' }).replace('qt-results', 'qt-results qt-results--pv')}${cohortBar(r)}</div></div>`;
  },

  // Customer and project details: only fields the customer app stores today.
  record() {
    const x = focus, last = x.history.at(-1);
    return `<div class="record-pv qt"><div class="record-pv__head"><div class="record-pv__who">${avatar(x.customer_name)}<div><strong>${esc(x.customer_name)}</strong><small>${esc(x.estimate_id)} · Fictional estimate</small></div></div>${badge(x)}</div>
      <dl class="record-pv__facts">
        <div><dt>Email</dt><dd>${esc(x.customer_email)}</dd></div>
        <div><dt>Estimate amount</dt><dd>${money(x.amount_usd)}</dd></div>
        <div class="full"><dt>Job</dt><dd>${esc(x.job_description)}</dd></div>
        <div><dt>Estimate date</dt><dd>${esc(shortDate(x.estimate_date))}</dd></div>
        <div><dt>Next follow-up</dt><dd>${duePill(x, today, quotes)}</dd></div>
        <div class="full"><dt>Notes</dt><dd>${esc(x.notes)}</dd></div>
        <div class="full"><dt>Activity history</dt><dd>${plural(x.history.length, 'entry', 'entries')}${last ? `<small>Latest: ${esc(last.text)}</small>` : ''}</dd></div>
      </dl></div>`;
  },

  import() {
    const p = previewImport(sampleImportCSV(today), quotes);
    return `<div class="card-ui qt"><div class="card-ui__bar"><div><h4>Import preview</h4><p>Nothing is saved until you choose Import</p></div><span class="qt-chip">${icon('file')} estimates-export.csv</span></div>
      <div style="padding:1.1em 1.3em 1.3em;display:grid;gap:1em">${mappingTable({ ...p, mapping: Object.fromEntries(Object.entries(p.mapping).slice(0, 5)) })}${importRows(p)}</div></div>`;
  },

  showcase() {
    const ctx = tourContext(state, today);
    return `<div class="window qt">${windowBar(`Follow-ups · ${COMPANY.name}`)}<div class="demo-pv">
        <div class="demo-pv__list"><div class="qt-tabs" role="presentation"><span class="qt-tab" aria-selected="true">Due &amp; overdue <span class="qt-count">${q.due.length}</span></span><span class="qt-tab">Upcoming <span class="qt-count">${q.upcoming.length}</span></span></div>
          <ul class="qt-queue qt-panel">${q.due.slice(0, 5).map(x => queueRow(x, today, quotes, { interactive: false, highlight: FOCUS_ID })).join('')}</ul></div>
        <div class="demo-pv__drawer">${detailHeader(focus, { closable: false })}${detailBody(focus, quotes, today, { interactive: false })}</div></div></div>
      <div class="tour-pv">${tourCard(2, ctx, { interactive: false })}</div>`;
  }
};

const minis = {
  import: () => `<div class="file">${icon('file')}<div><b>estimates-export.csv</b><span>5 rows · columns matched</span></div></div>
    <div class="mini-row"><span>Quote # → Estimate ID</span>${icon('check')}</div><div class="mini-row"><span>Total → Amount</span>${icon('check')}</div><div class="mini-row"><span>Date Issued → Estimate date</span>${icon('check')}</div>`,
  prioritize: () => [['overdue', 'Overdue'], ['today', 'Due today'], ['upcoming', 'Upcoming'], ['unscheduled', 'Needs a date']]
    .map(([k, l]) => `<div class="mini-row"><span class="qt-due qt-due--${k}">${icon(k === 'overdue' ? 'alert' : k === 'today' ? 'flag' : 'calendar')}${l} · ${byState[k].count}</span><b>${moneyShort(byState[k].value)}</b></div>`).join(''),
  follow: () => `<div class="mini-draft">Hi Dana, I wanted to check in on the estimate for your roof replacement…</div><span class="qt-btn qt-btn--primary">${icon('copy')}Copy draft</span>`,
  track: () => `<div class="mini-row"><span class="qt-meta">${icon('Phone')}Phone contact recorded</span><span>Today</span></div>
    <div class="mini-row"><span>Next follow-up</span><b>${esc(weekdayDate(addDays(today, 3)))}</b></div>
    <div class="mini-row"><span>Activity history</span><b>${plural(focus.history.length + 1, 'entry', 'entries')}</b></div><div class="mini-row"><span class="qt-badge qt-badge--won"><i></i>Won</span><b>${money(statusTotals(quotes).won.value)}</b></div>`,
  organize: () => {
    const pick = [...quotes.filter(x => x.status === 'sent').sort((a, b) => b.amount_usd - a.amount_usd).slice(0, 2), quotes.find(x => x.status === 'won')].filter(Boolean);
    return `<div class="mini-row mini-head"><span>${plural(m.openCount, 'sent estimate')} open</span><b>${money(m.openValue)}</b></div>
      ${pick.map(x => `<div class="mini-row"><span>${esc(x.customer_name)}</span><span class="mini-end"><b>${moneyShort(x.amount_usd)}</b>${badge(x)}</span></div>`).join('')}`;
  },
  log: () => `<div class="mini-row mini-head"><span class="qt-meta">${icon('Phone')}Log a contact</span><span>${esc(focus.customer_name.split(' ')[0])}</span></div>
    <div class="mini-row"><span>Contact date</span><b>Today</b></div><div class="mini-row"><span>Method</span><b>Phone</b></div>
    <div class="mini-row"><span>Next follow-up</span><b>${esc(weekdayDate(addDays(today, 3)))}</b></div>`,
  results: () => {
    const r = resultsForRange(state, 30, today);
    return `<div class="mini-row mini-head"><span class="qt-meta">${icon('results')}Follow-up Results</span><span>30 days</span></div>
      <div class="mini-row"><span>Contacts logged</span><b>${r.counts.contacts}</b></div><div class="mini-row"><span>Estimates followed up</span><b>${r.counts.followed}</b></div>
      <div class="mini-row"><span>Won after a follow-up</span><b>${r.counts.won}</b></div>`;
  }
};

for (const el of $$('[data-shot]')) {
  try {
    const core = el.hasAttribute('data-core');
    el.innerHTML = shots[el.dataset.shot](core);
    if (core) el.querySelectorAll('.qt-trade').forEach(n => n.remove());
    // Previews are decorative copies of product UI: keep them out of the tab order and ID space.
    el.setAttribute('inert', '');
    el.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
    el.querySelectorAll('[for], [aria-labelledby], [aria-controls]').forEach(n => { n.removeAttribute('for'); n.removeAttribute('aria-labelledby'); n.removeAttribute('aria-controls'); });
  }
  catch (error) { console.error(`Could not render ${el.dataset.shot} preview`, error); }
}
for (const el of $$('[data-mini]')) el.innerHTML = minis[el.dataset.mini]();

// ---------- Estimate value calculator ----------
const calcInputs = $$('[data-calc]');
function updateCalc() {
  const v = Object.fromEntries(calcInputs.map(i => [i.dataset.calc, Number(i.value)]));
  const undecided = Math.round(v.count * v.share / 100);
  const set = (k, text) => $$(`[data-out="${k}"]`).forEach(el => { el.textContent = text; });
  set('count', String(v.count)); set('avg', money(v.avg)); set('share', `${v.share}%`);
  set('total', money(undecided * v.avg)); set('open', String(undecided)); set('avg2', money(v.avg));
  for (const i of calcInputs) i.style.setProperty('--pct', `${(i.value - i.min) / (i.max - i.min) * 100}%`);
}
calcInputs.forEach(i => i.addEventListener('input', updateCalc)); if (calcInputs.length) updateCalc();

// ---------- Early access ----------
// The homepage holds the only form; every other page links to it at #early-access.
const contact = resolveContactConfig(SITE_CONFIG, location);
const earlyCard = $('[data-early]');
if (earlyCard) mountEarlyAccess(earlyCard, contact);
if (earlyCard && contact.mode === 'preview') console.warn('QuoteTend: early-access form is not connected (set formEndpoint in assets/js/site-config.js).');
if (contact.email) $('[data-footer-contact]')?.insertAdjacentHTML('beforeend', `<li><a href="mailto:${esc(contact.email)}">Contact</a></li>`);

// Arriving from another page at a section (for example ./#early-access from a Features call to
// action): once the previews above it have rendered, settle the position and move focus there,
// the same as an in-page link does.
let arrival = null;
try { arrival = location.hash.length > 1 ? document.getElementById(decodeURIComponent(location.hash.slice(1))) : null; } catch { arrival = null; }
if (arrival) requestAnimationFrame(() => { arrival.setAttribute('tabindex', '-1'); arrival.scrollIntoView({ block: 'start', behavior: 'instant' }); arrival.focus({ preventScroll: true }); });
