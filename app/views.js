// Page renderers for the private application. Each view is a pure function of the authenticated
// workspace (ctx.ws), the current date and UI state; main.js owns state, commands and events.
// All figures are computed from server-provided records with the shared domain rules in domain.js.
import * as D from '/domain.js';
import { weeklyCoverage } from '/results.js';
import { FIELD_LABELS, REQUIRED_FIELDS, statusesFor } from '/import-mapping.js';
import { esc, money, icon, kpi, attentionRow, stateBar, ageChart, activityItem, estimateTable, queueRow, resultCards, cohortBar, weeklyChart,
  supportingRows, importRowsList, longDate, shortDate, plural, panel, empty } from '/app/ui.js';

const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };
const head = (eyebrow, title, sub, actions = '') => `<div class="view-head"><div><p class="qt-eyebrow">${eyebrow}</p><h1 tabindex="-1">${title}</h1>${sub ? `<p class="sub">${sub}</p>` : ''}</div>${actions ? `<div class="view-actions">${actions}</div>` : ''}</div>`;
const addButton = `<button class="qt-btn qt-btn--primary" type="button" data-action="add">${icon('plus')}Add estimate</button>`;

// ---------- Getting started (computed from real account state; nothing fictional is inserted) ----------
export function guideSteps(ctx) {
  const { quotes } = ctx.ws, m = D.metrics(quotes, ctx.today);
  return [
    { done: !!ctx.me.recoveryCodeSaved, title: 'Save a recovery code', text: 'Your way back in if you forget your password. No reset emails are sent.', action: '<a href="/security">Open account security</a>', cta: `<a class="qt-btn qt-btn--primary" href="/security">${icon('shield')}Save a recovery code</a>` },
    { done: quotes.length > 0, title: 'Add or import your estimates', text: 'Bring in a CSV from your spreadsheet or estimating tool, or add one estimate at a time.', action: `<button class="qt-link" type="button" data-nav="import">Import a CSV</button> · <button class="qt-link" type="button" data-action="add">Add an estimate</button>`, cta: `<button class="qt-btn qt-btn--primary" type="button" data-nav="import">${icon('import')}Import estimates</button>` },
    { done: quotes.some(q => q.status === 'sent') && m.unscheduled === 0, title: 'Give each open estimate a follow-up date', text: 'Sent estimates without a date wait in “Needs a date”.', action: `<button class="qt-link" type="button" data-nav="followups" data-preset="queue:unscheduled">Open “Needs a date”</button>`, cta: `<button class="qt-btn qt-btn--primary" type="button" data-nav="followups" data-preset="queue:unscheduled">${icon('calendar')}Open “Needs a date”</button>` },
    { done: quotes.some(q => q.last_contact_date), title: 'Follow up, then log the contact', text: 'Copy a draft into your own email or text app. Log the contact only after it happens.', action: `<button class="qt-link" type="button" data-nav="followups" data-preset="queue:due">Open the follow-up queue</button>`, cta: `<button class="qt-btn qt-btn--primary" type="button" data-nav="followups" data-preset="queue:due">${icon('followups')}Open follow-up queue</button>` },
    { done: quotes.some(q => q.status === 'won' || q.status === 'lost'), title: 'Record each decision', text: 'Mark estimates won or lost when the homeowner decides.', action: '', cta: `<button class="qt-btn qt-btn--primary" type="button" data-nav="estimates" data-preset="status:sent">${icon('estimates')}Open sent estimates</button>` },
    { done: !!ctx.prefs.visitedResults, title: 'Read your Follow-up Results', text: 'See contacts, follow-ups and recorded outcomes — never claimed as caused revenue.', action: `<button class="qt-link" type="button" data-nav="results">Open Follow-up Results</button>`, cta: `<button class="qt-btn qt-btn--primary" type="button" data-nav="results">${icon('results')}Open Follow-up Results</button>` }
  ];
}
function guide(ctx) {
  const steps = guideSteps(ctx), done = steps.filter(s => s.done).length;
  if (ctx.prefs.guideDismissed || done === steps.length) return '';
  const fresh = !ctx.ws.quotes.length;
  if (!fresh) {
    // Once estimates exist, a compact banner (the demo's welcome style) keeps the dashboard in view.
    const next = steps.find(s => !s.done);
    return `<section class="welcome" data-guide aria-label="Getting started"><span class="welcome__icon">${icon('sparkle')}</span><div><strong>Getting started · ${done} of ${steps.length} done</strong><p>Next: ${esc(next.title)}. ${esc(next.text)}</p></div><div class="welcome__actions">${next.cta}<button class="qt-btn qt-btn--ghost" type="button" data-action="dismiss-guide">Hide guide</button></div></section>`;
  }
  return `<section class="onboard" aria-labelledby="guide-title" data-guide><div><p class="qt-eyebrow">Getting started</p>
      <h2 id="guide-title">${fresh ? `Set up ${esc(ctx.ws.businessName)} in a few minutes.` : 'Finish setting up your follow-up routine.'}</h2>
      <p>${fresh ? 'Your workspace starts empty and private to your business. Bring in your open estimates, then work the follow-up queue one conversation at a time.' : 'Each step uses your real estimates. QuoteTend never sends messages for you.'}</p>
      <div class="onboard__progress" role="progressbar" aria-label="Setup progress" aria-valuemin="0" aria-valuemax="${steps.length}" aria-valuenow="${done}"><span data-w="${Math.round(done / steps.length * 100)}"></span></div>
      <p class="onboard__meta">${done} of ${steps.length} done</p>
      <div class="onboard__actions">${fresh ? `<button class="qt-btn qt-btn--primary" type="button" data-nav="import">${icon('import')}Import estimates</button><button class="qt-btn" type="button" data-action="add">${icon('plus')}Add an estimate</button>` : `<button class="qt-btn qt-btn--primary" type="button" data-nav="followups" data-preset="queue:due">${icon('followups')}Open follow-up queue</button>`}<button class="qt-btn" type="button" data-action="dismiss-guide">Hide this guide</button></div></div>
    <ol class="onboard__steps">${steps.map((s, i) => `<li class="${s.done ? 'is-done' : ''}"><span>${s.done ? icon('check') : i + 1}</span><div><strong>${esc(s.title)}${s.done ? '<span class="sr-only"> (done)</span>' : ''}</strong><small>${esc(s.text)}${!s.done && s.action ? ` ${s.action}` : ''}</small></div></li>`).join('')}</ol></section>`;
}

// ---------- Overview ----------
export function overview(ctx) {
  const { quotes, businessName } = ctx.ws, today = ctx.today;
  const m = D.metrics(quotes, today), q = D.queues(quotes, today), bs = D.pipelineByState(quotes, today), st = D.statusTotals(quotes);
  const overdue = q.due.filter(x => x.next_follow_up_date < today);
  const recent = quotes.flatMap(x => x.history.map(h => ({ ...h, estimateId: x.estimate_id, name: x.customer_name }))).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 7);
  const title = !quotes.length ? `Welcome to QuoteTend.` : m.dueCount ? `${greeting()}. ${plural(m.dueCount, 'follow-up')} need${m.dueCount === 1 ? 's' : ''} attention.` : `${greeting()}. Your follow-up queue is clear.`;
  const shown = q.due.slice(0, 6);
  return head(esc(longDate(today)), title, `${esc(businessName)} · private to your business. QuoteTend never sends messages for you.`,
      `<button class="qt-btn" type="button" data-nav="estimates">${icon('estimates')}All estimates</button><button class="qt-btn qt-btn--primary" type="button" data-nav="followups" data-preset="queue:due">${icon('followups')}Open follow-up queue</button>`) +
    guide(ctx) +
    `<div class="qt-kpis">
      <button class="kpi-link" type="button" data-nav="estimates" data-preset="status:sent" aria-label="Open pipeline: ${money(m.openValue)}. Show sent estimates">${kpi({ label: 'Open pipeline', value: money(m.openValue), sub: `${plural(m.openCount, 'sent estimate')} awaiting a decision`, ic: 'dollar', id: 'open' })}</button>
      <button class="kpi-link" type="button" data-nav="followups" data-preset="queue:due" aria-label="Due and overdue: ${m.dueCount}. Open the follow-up queue">${kpi({ label: 'Due & overdue', value: String(m.dueCount), sub: `<strong class="qt-tone-overdue">${overdue.length} overdue · ${money(overdue.reduce((s, x) => s + x.amount_usd, 0))}</strong>`, ic: 'alert', accent: 'alert', id: 'due' })}</button>
      <button class="kpi-link" type="button" data-nav="followups" data-preset="queue:unscheduled" aria-label="Needs a date: ${m.unscheduled}. Open estimates without a follow-up date">${kpi({ label: 'Needs a date', value: String(m.unscheduled), sub: `${money(bs.unscheduled.value)} with no follow-up scheduled`, ic: 'calendar', accent: 'gold', id: 'unscheduled' })}</button>
      <button class="kpi-link" type="button" data-nav="estimates" data-preset="status:won" aria-label="Recorded wins: ${money(m.wonValue)}. Show won estimates">${kpi({ label: 'Recorded wins', value: money(m.wonValue), sub: `${plural(m.wonCount, 'estimate')} marked won · owner-recorded`, ic: 'checkCircle', accent: 'won', id: 'won' })}</button>
    </div>
    <div class="grid-2">
      ${panel(`Needs your attention <span class="qt-count">${q.due.length}</span>`, 'Due and overdue follow-ups, oldest promise first',
        shown.length ? `<ul class="qt-attn-list">${shown.map(x => attentionRow(x, today, D.optOutBlocks(quotes))).join('')}</ul>${q.due.length > shown.length ? `<div class="more-row"><button class="qt-btn qt-btn--sm" type="button" data-nav="followups" data-preset="queue:due">View all ${q.due.length} in the queue ${icon('arrowRight')}</button></div>` : ''}`
          : !quotes.length ? empty('estimates', 'No estimates yet', 'Import a CSV or add your first estimate. Follow-ups appear here on their due date.', `<div class="view-actions"><button class="qt-btn qt-btn--primary" type="button" data-nav="import">${icon('import')}Import CSV</button>${addButton.replace('qt-btn--primary', '')}</div>`)
            : empty('checkCircle', 'All caught up', 'No follow-ups are due today. Upcoming check-ins appear here on their date.', `<button class="qt-btn" type="button" data-nav="followups" data-preset="queue:upcoming">View upcoming</button>`),
        { action: `<button class="panel-link" type="button" data-nav="followups" data-preset="queue:due">Follow-up queue ${icon('arrowRight')}</button>`, bodyCls: '', label: 'Needs your attention' })}
      <div class="stack">
        ${panel('Open pipeline', `${money(m.openValue)} across ${plural(m.openCount, 'sent estimate')}`, stateBar(bs, m.openValue), { label: 'Open pipeline by follow-up state' })}
        ${panel('Open estimates by age', 'Days since the estimate date, sent estimates only', ageChart(D.ageBuckets(quotes, today)), { label: 'Open estimates by age' })}
      </div>
    </div>
    <div class="grid-2">
      ${panel('Recent activity', 'The latest changes, contacts and outcomes recorded in this workspace', recent.length ? `<ol class="qt-feed">${recent.map(a => activityItem(a, today)).join('')}</ol>` : `<div class="qt-panel__body">${empty('followups', 'No activity yet', 'Adding estimates, logging contacts and recording outcomes appear here.')}</div>`, { bodyCls: '', label: 'Recent activity' })}
      ${panel('Recorded outcomes', 'All won and lost estimates in this workspace', `<div class="outcome-split"><div class="won"><span>Won</span><strong>${money(st.won.value)}</strong><small>${plural(st.won.count, 'estimate')}</small></div><div><span>Lost</span><strong>${money(st.lost.value)}</strong><small>${plural(st.lost.count, 'estimate')}</small></div></div>
        <p class="qt-help">Won values are estimate amounts you recorded, not collected revenue, and not proof that a follow-up caused the decision.</p>`, { action: `<button class="panel-link" type="button" data-nav="results">Follow-up Results ${icon('arrowRight')}</button>`, label: 'Recorded outcomes' })}
    </div>`;
}

// ---------- Estimates ----------
export function estimates(ctx) {
  const { quotes } = ctx.ws, ui = ctx.ui, counts = D.statusTotals(quotes), trades = D.tradeOptions(quotes);
  const opt = (value, label, current) => `<option value="${esc(value)}" ${value === current ? 'selected' : ''}>${esc(label)}</option>`;
  const blocks = D.optOutBlocks(quotes), optedOut = quotes.filter(q => D.optOutSources(q, blocks).length).length;
  return head('Pipeline', 'Estimates', 'Every estimate in one place. Search, filter and open any record.',
      `<button class="qt-btn" type="button" data-action="export-csv">${icon('download')}Export CSV</button><button class="qt-btn" type="button" data-nav="import">${icon('import')}Import CSV</button>${addButton}`) +
    `<section class="qt-panel cards-at-narrow" aria-label="Estimate list">
      <div class="toolbar" role="group" aria-label="Search and filter estimates">
        <div class="search">${icon('search')}<label class="qt-sr" for="est-q">Search estimates</label><input id="est-q" class="qt-field" type="search" placeholder="Search customer, job, address, phone or ID" value="${esc(ui.query)}" autocomplete="off" maxlength="200"></div>
        <div class="qt-seg-ctl" role="group" aria-label="Filter by status">${[['all', 'All', quotes.length], ['sent', 'Sent', counts.sent.count], ['draft', 'Draft', counts.draft.count], ['won', 'Won', counts.won.count], ['lost', 'Lost', counts.lost.count], ...(optedOut ? [['optout', 'Do not contact', optedOut]] : [])]
          .map(([v, l, n]) => `<button type="button" data-status="${v}" aria-pressed="${ui.status === v}">${l} <span class="qt-muted">${n}</span></button>`).join('')}</div>
        <label class="qt-sr" for="est-fu">Follow-up state</label><select id="est-fu" class="qt-field" data-filter="followup">${[['any', 'Any follow-up'], ['due', 'Due & overdue'], ['overdue', 'Overdue'], ['today', 'Due today'], ['upcoming', 'Upcoming'], ['unscheduled', 'Needs a date'], ['paused', 'Follow-ups paused']].map(([v, l]) => opt(v, l, ui.followup)).join('')}</select>
        <label class="qt-sr" for="est-trade">Trade or service</label><select id="est-trade" class="qt-field" data-filter="trade">${opt('all', 'All trades', ui.trade)}${trades.used.map(t => opt(t, t, ui.trade)).join('')}${opt('__none', 'No trade recorded', ui.trade)}</select>
        <label class="qt-sr" for="est-sort">Sort</label><select id="est-sort" class="qt-field" data-filter="sort">${[['followup', 'Sort: follow-up urgency'], ['value', 'Sort: highest value'], ['newest', 'Sort: newest'], ['oldest', 'Sort: oldest'], ['name', 'Sort: customer name']].map(([v, l]) => opt(v, l, ui.sort)).join('')}</select>
      </div>
      <div data-results>${estimateResults(ctx)}</div>
    </section>`;
}
export function estimateResults(ctx) {
  const { quotes } = ctx.ws, ui = ctx.ui;
  if (!quotes.length) return empty('estimates', 'No estimates yet', 'Import a CSV from your spreadsheet or estimating tool, or add your first estimate.', `<div class="view-actions"><button class="qt-btn qt-btn--primary" type="button" data-nav="import">${icon('import')}Import CSV</button>${addButton.replace('qt-btn--primary', '')}</div>`);
  const list = D.filterEstimates(quotes, ui, ctx.today);
  const open = list.filter(q => q.status === 'sent').reduce((s, q) => s + q.amount_usd, 0);
  const active = ui.query || ui.status !== 'all' || ui.followup !== 'any' || ui.trade !== 'all';
  const shown = list.slice(0, ui.limit);
  return `<div class="summary"><span role="status">Showing <strong>${list.length.toLocaleString('en-US')}</strong> of ${quotes.length.toLocaleString('en-US')} estimates${ui.query ? ` matching “${esc(ui.query)}”` : ''}</span>
      <span><strong>${money(open)}</strong> open value in view ${active ? `<button class="qt-btn qt-btn--sm qt-btn--ghost" type="button" data-action="clear-filters">${icon('x')}Clear filters</button>` : ''}</span></div>
    ${list.length ? estimateTable(shown, ctx.today, D.optOutBlocks(quotes)) + (list.length > shown.length ? `<div class="more-row"><button class="qt-btn" type="button" data-action="more">Show ${Math.min(200, list.length - shown.length)} more of ${(list.length - shown.length).toLocaleString('en-US')}</button></div>` : '')
      : empty('search', 'No estimates match', 'Try a different search term or clear the filters.', '<button class="qt-btn" type="button" data-action="clear-filters">Clear filters</button>')}`;
}

// ---------- Follow-ups ----------
const QUEUE_TABS = [['due', 'Due & overdue'], ['upcoming', 'Upcoming'], ['unscheduled', 'Needs a date'], ['contacted', 'Recently contacted']];
export function followups(ctx) {
  const q = D.queues(ctx.ws.quotes, ctx.today), ui = ctx.ui;
  return head('One conversation at a time', 'Follow-ups', 'Review the details, make the message personal, and record your next step.', addButton) +
    `<section class="qt-panel queue-panel">
      <div class="qt-tabs" role="tablist" aria-label="Follow-up queues">${QUEUE_TABS.map(([k, l]) => `<button class="qt-tab" type="button" role="tab" id="tab-${k}" aria-selected="${ui.queue === k}" aria-controls="queue-tabpanel" tabindex="${ui.queue === k ? 0 : -1}" data-queue="${k}">${l} <span class="qt-count">${q[k].length}</span></button>`).join('')}</div>
      <p class="queue-note">${icon('info')}${ui.queue === 'contacted' ? 'Estimates with a contact logged in the last 14 days, any status. Logging a contact is the only way an estimate appears here.' : 'Only sent estimates appear here. Won, lost, draft and opted-out estimates are excluded.'}</p>
      <div id="queue-tabpanel" role="tabpanel" aria-labelledby="tab-${ui.queue}" tabindex="0">${queueBody(ctx, q)}</div>
    </section>`;
}
function queueBody(ctx, q) {
  const { quotes } = ctx.ws, today = ctx.today, list = q[ctx.ui.queue], blocks = D.optOutBlocks(quotes);
  if (!list.length) {
    return {
      due: empty('checkCircle', quotes.length ? 'All caught up' : 'No estimates yet', quotes.length ? 'Nothing is due or overdue. Upcoming follow-ups appear here on their date.' : 'Import or add estimates to build your follow-up queue.'),
      upcoming: empty('calendar', 'Nothing scheduled ahead', 'Log a contact or schedule a date to plan the next follow-up.'),
      unscheduled: empty('calendar', 'Every open estimate has a date', 'Sent estimates without a follow-up date appear here.'),
      contacted: empty('Phone', 'No contacts logged in the last 14 days', 'After you follow up outside QuoteTend, log the contact on the estimate.')
    }[ctx.ui.queue];
  }
  // Long queues render in pages; group headings always show the full count and value.
  const shown = new Set(list.slice(0, ctx.ui.queueLimit));
  const rows = items => items.some(x => shown.has(x)) ? `<ul class="qt-queue">${items.filter(x => shown.has(x)).map(x => queueRow(x, today, blocks)).join('')}</ul>` : '';
  const more = list.length > shown.size ? `<div class="more-row"><button class="qt-btn" type="button" data-action="more-queue">Show ${Math.min(200, list.length - shown.size)} more of ${(list.length - shown.size).toLocaleString('en-US')}</button></div>` : '';
  if (ctx.ui.queue !== 'due') return rows(list) + more;
  const overdue = list.filter(x => x.next_follow_up_date < today), now = list.filter(x => x.next_follow_up_date === today);
  const group = (label, items) => items.length ? `<div class="qt-queue-group"><span>${label} · ${items.length}</span><span>${money(items.reduce((s, x) => s + x.amount_usd, 0))}</span></div>${rows(items)}` : '';
  return group('Overdue', overdue) + group('Due today', now) + more;
}

// ---------- Follow-up Results ----------
export function resultsView(ctx) {
  const ui = ctx.ui, r = ctx.results;
  const ranges = [[7, 'Last 7 days'], [30, 'Last 30 days'], [90, 'Last 90 days'], ['custom', 'Custom']];
  const tools = `<div class="range-tools"><div class="qt-seg-ctl" role="group" aria-label="Date range">${ranges.map(([d, l]) => `<button type="button" data-range="${d}" aria-pressed="${ui.range === d}">${l}</button>`).join('')}</div>
    ${ui.range === 'custom' ? `<form class="range-custom" data-form="range"><label>From<input class="qt-field" type="date" name="from" required max="${esc(ctx.today)}" value="${esc(ui.from)}"></label><label>Through<input class="qt-field" type="date" name="to" required max="${esc(ctx.today)}" value="${esc(ui.to)}"></label><button class="qt-btn qt-btn--primary" type="submit">Apply</button></form>` : ''}</div>`;
  return `<div class="view-head"><div><p class="qt-eyebrow">Reporting</p><h1 tabindex="-1">Follow-up Results</h1><p class="sub">What you recorded from ${esc(shortDate(ui.from))} to ${esc(shortDate(ui.to))}: contacts, follow-ups and outcomes.</p></div>${tools}</div>
    <div class="qt-notice qt-notice--gold">${icon('info')}<p><strong>Recorded sequence, not proof of caused revenue.</strong> Contacts and outcomes are owner-reported. QuoteTend sends nothing and verifies no delivery or payment. Values are estimate amounts, not collected revenue.</p></div>
    <div data-results-body aria-live="polite">${r.error ? `<div class="qt-notice qt-notice--gold">${icon('alert')}<p>${esc(r.error)} <button class="qt-link" type="button" data-action="reload-results">Try again</button></p></div>` : r.data ? resultsBody(ctx) : '<div class="loading-line"><span class="spinner" aria-hidden="true"></span>Loading recorded results…</div>'}</div>`;
}
const weeklyNote = (weeks, started) => { const note = weeklyCoverage(weeks, started, shortDate); return note ? `<p class="qt-help" data-weekly-coverage="${note.kind}">${esc(note.text)}</p>` : ''; };
function resultsBody(ctx) {
  const r = ctx.results.data, ui = ctx.ui, { quotes } = ctx.ws, m = D.metrics(quotes, ctx.today), st = D.statusTotals(quotes), bs = D.pipelineByState(quotes, ctx.today);
  const started = r.startedAt.slice(0, 10);
  return `${resultCards(r, ui.group)}
    <div class="results-grid">
      ${panel('Cohort outcomes', `${plural(r.counts.followed, 'estimate')} first followed up in this range, classified as of today`, cohortBar(r), { label: 'Cohort outcomes' })}
      ${panel('Contacts logged per week', 'Last 8 weeks, including repeat contacts', ctx.results.weekly ? weeklyChart(ctx.results.weekly) + weeklyNote(ctx.results.weekly, started) : '<div class="loading-line"><span class="spinner" aria-hidden="true"></span>Loading…</div>', { label: 'Contacts per week' })}
    </div>
    <section class="qt-panel" aria-label="Supporting estimates"><div class="qt-panel__body qt-panel__body--top" data-supporting>${supportingRows(r, ui.group)}</div></section>
    ${panel('Current pipeline snapshot', `As of ${esc(shortDate(ctx.today))}. Not filtered by the date range above.`, `<div class="outcome-split"><div><span>Remaining open pipeline</span><strong>${money(m.openValue)}</strong><small>${plural(m.openCount, 'sent estimate')} awaiting a decision</small></div><div><span>Overdue estimate value</span><strong>${money(bs.overdue.value)}</strong><small>${plural(bs.overdue.count, 'estimate')} past the follow-up date</small></div><div class="won"><span>All recorded wins</span><strong>${money(st.won.value)}</strong><small>${plural(st.won.count, 'estimate')}, with or without a logged follow-up</small></div><div><span>All recorded losses</span><strong>${money(st.lost.value)}</strong><small>${plural(st.lost.count, 'estimate')}</small></div></div>`, { label: 'Current pipeline snapshot' })}
    <details class="calc-notes"><summary>How these numbers are calculated</summary><ul>
      <li><strong>Contacts logged</strong> counts every reported contact date in the range, including repeat contacts with the same customer. A contact you enter with an earlier date counts on that date, even before this reporting period began. Voided contacts are excluded; corrected contacts use the corrected date.</li>
      <li><strong>Estimates followed up</strong> counts each estimate once, on its earliest reported contact in this reporting period. Backdated entries can move it between ranges. Its value is the amount stored when that contact was logged.</li>
      <li>A won or lost outcome <strong>qualifies</strong> only when it was recorded after a logged contact, with a reported decision date on or after that contact. Closed estimates without that sequence show as uncertain.</li>
      <li>Outcomes show the latest recorded status as of today, including decisions after the selected end date. Reopened estimates count as open. Won share keeps open and uncertain estimates in the denominator; it is not a causal conversion rate.</li>
      <li><strong>Current overdue value</strong> is a separate snapshot of eligible sent estimates past their follow-up date. It ignores the date range and is not a predicted loss.</li>
      <li>Restoring a workspace export starts a new reporting period. Earlier ledger entries remain in the database but are excluded here.</li>
    </ul></details>
    <p class="qt-help">Reporting period ${esc(r.epoch)} began ${esc(shortDate(started))}.${r.from < started ? ' The selected range starts before this period, so coverage is partial.' : ''}${r.incomplete ? ` ${plural(r.incomplete, 'current estimate')} came from an import, restore or earlier version, so activity before QuoteTend recorded it isn’t included.` : ''}</p>`;
}

// ---------- Import ----------
const STEP_NAMES = [['choose', 'Choose file'], ['map', 'Match columns'], ['preview', 'Review'], ['done', 'Imported']];
const steps = current => `<ol class="import-steps" aria-label="Import progress">${STEP_NAMES.map(([k, l], i) => { const at = STEP_NAMES.findIndex(s => s[0] === current); return `<li ${k === current ? 'aria-current="step"' : ''} class="${i < at ? 'is-done' : ''}"><span>${i < at ? icon('check') : i + 1}</span>${l}</li>`; }).join('')}</ol>`;
export function importView(ctx) {
  const imp = ctx.ui.imp;
  const intro = head('Onboarding', 'Import estimates', 'Bring open estimates in from a spreadsheet or estimating-tool export. Nothing is saved until you choose Import.') + steps(imp.step);
  if (imp.step === 'map') return intro + mappingStep(ctx);
  if (imp.step === 'preview') return intro + previewStep(ctx);
  if (imp.step === 'done') return intro + `<section class="qt-panel"><div class="qt-panel__body qt-panel__body--top">${empty('checkCircle', `${plural(imp.done.count, 'estimate')} imported`, `${imp.done.skipped ? `${plural(imp.done.skipped, 'row')} were protected, invalid or duplicates and were not imported. ` : ''}Existing estimates were not changed. Imported estimates start with no verified earlier activity.`, `<div class="view-actions"><button class="qt-btn qt-btn--primary" type="button" data-action="view-imported">${icon('estimates')}View imported estimates</button><button class="qt-btn" type="button" data-nav="followups" data-preset="queue:due">${icon('followups')}Open follow-up queue</button><button class="qt-btn" type="button" data-action="import-restart">Import another file</button></div>`)}</div></section>`;
  return intro + `<section class="qt-panel">
      <div class="import-hero"><div class="file-card"><span class="file-card__icon">${icon('file')}</span><div><strong>Start with a CSV file</strong><span>Up to 2 MB and 5,000 estimates. Export XLSX or Google Sheets files as CSV first.</span></div></div>
      <button class="qt-btn" type="button" data-action="example-csv">${icon('download')}Download example CSV</button></div>
      <label class="dropzone" data-dropzone>${icon('import')}<strong>Choose a CSV file or drop it here</strong><span>Your file is read in this browser and previewed before anything is saved.</span><input id="csv-file" type="file" accept=".csv,text/csv"></label>
      <details class="paste-box" ${imp.pasted ? 'open' : ''}><summary>Or paste CSV text</summary><label class="qt-sr" for="paste-csv">CSV text including the header row</label><textarea id="paste-csv" class="qt-field" rows="6" maxlength="2000000" placeholder="Quote #,Client,Email,Project,Total,Date Issued,Quote Status,Follow Up">${esc(imp.pasted)}</textarea><button class="qt-btn" type="button" data-action="inspect-paste">Match pasted columns</button></details>
      <p class="qt-form__error" data-import-error role="alert">${esc(imp.error)}</p>
    </section>
    <div class="qt-notice">${icon('info')}<p><strong>Required:</strong> a stable estimate ID, customer name, job description, amount and estimate date. <strong>Optional:</strong> email, phone, project address, trade or service, status, follow-up and last-contact dates, opt-out and notes. Keep IDs unchanged when you import again: existing estimates are never overwritten, and conflicting versions are held for you to review.</p></div>`;
}
function mappingStep(ctx) {
  const imp = ctx.ui.imp, sheet = imp.sheet, map = imp.mapping, o = imp.options;
  const statuses = statusesFor(sheet, map);
  const sample = i => (sheet.rows.find(r => (r[i] || '').trim())?.[i] || '').slice(0, 40);
  const field = key => `<label><span>${esc(FIELD_LABELS[key])} ${REQUIRED_FIELDS.includes(key) ? '<em class="is-required">required</em>' : '<em>optional</em>'}</span><select data-map="${key}"><option value="">${REQUIRED_FIELDS.includes(key) ? 'Choose a column' : key === 'status' ? 'No column — use a default status' : key === 'do_not_contact' ? 'No opt-out column — review below' : 'Not in this file'}</option>${sheet.headers.map((h, i) => `<option value="${i}" ${map[key] === String(i) ? 'selected' : ''}>${esc(h)}${sample(i) ? ` · e.g. ${esc(sample(i))}` : ''}</option>`).join('')}</select></label>`;
  return `<section class="qt-panel">
      <div class="import-hero"><div class="file-card"><span class="file-card__icon">${icon('file')}</span><div><strong>${esc(imp.name)}</strong><span>${plural(sheet.rows.length, 'row')} · ${plural(sheet.headers.length, 'column')} · nothing imported yet</span></div></div>
      <button class="qt-btn qt-btn--ghost" type="button" data-action="import-restart">Choose a different file</button></div>
      <div class="qt-panel__body">
        <p class="qt-help qt-help--top">Suggested matches come from your column headings. Confirm each one. Unmatched optional fields stay blank — QuoteTend never guesses values.</p>
        <h3 class="map-subhead">Required</h3><div class="map-grid">${REQUIRED_FIELDS.map(field).join('')}</div>
        <h3 class="map-subhead">Optional details</h3><div class="map-grid">${['customer_email', 'customer_phone', 'address', 'trade', 'status', 'next_follow_up_date', 'last_contact_date', 'do_not_contact', 'notes'].map(field).join('')}</div>
        <h3 class="map-subhead">How to read this file</h3><div class="map-grid">
          <label>Date format<select data-import-option="dateFormat">${[['iso', 'YYYY-MM-DD (ISO)'], ['mdy', 'MM/DD/YYYY (US)'], ['dmy', 'DD/MM/YYYY']].map(([v, l]) => `<option value="${v}" ${o.dateFormat === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          ${map.status === '' ? `<label>Status for every row<select data-import-option="defaultStatus">${D.STATUSES.map(s => `<option value="${s}" ${o.defaultStatus === s ? 'selected' : ''}>${{ draft: 'Draft — not yet shared', sent: 'Sent — awaiting a decision', won: 'Won', lost: 'Lost' }[s]}</option>`).join('')}</select></label>` : ''}
        </div>
        ${statuses.length ? `<h3 class="map-subhead">Confirm what each status means</h3><div class="map-grid">${statuses.map((st, i) => `<label>${esc(st || '(blank)')}<select data-status-map="${i}"><option value="">Keep as written (unknown values are rejected)</option>${D.STATUSES.map(s => `<option value="${s}" ${(o.statusMap[st] || (D.STATUSES.includes(st.toLowerCase()) ? st.toLowerCase() : '')) === s ? 'selected' : ''}>${{ draft: 'Draft', sent: 'Sent', won: 'Won', lost: 'Lost' }[s]}</option>`).join('')}</select></label>`).join('')}</div><p class="qt-help">Draft = not yet shared · Sent = awaiting a decision · Won = accepted · Lost = declined.</p>` : ''}
        ${map.do_not_contact === '' ? `<label class="consent"><input type="checkbox" data-import-option="optOutReviewed" ${o.optOutReviewed ? 'checked' : ''}><span>This file has no opt-out column. I checked the source for customers who asked not to be contacted, and understand every row will be imported as contactable. Existing opt-outs in QuoteTend still apply.</span></label>` : ''}
        <p class="qt-form__error" data-import-error role="alert">${esc(imp.error)}</p>
      </div>
      <div class="import-actions"><button class="qt-btn qt-btn--primary" type="button" data-action="import-preview">${icon('search')}Preview import</button><p>Amounts accept 1250, 1250.00 or $1,250.00. Opt-out values accept true/false, yes/no or 1/0.</p></div>
    </section>`;
}
function previewStep(ctx) {
  const imp = ctx.ui.imp, rows = imp.rows, quotes = ctx.ws.quotes;
  const valid = rows.filter(r => !r.errors.length), blocks = D.importOptOutBlockers(rows, quotes);
  const n = k => rows.filter(r => r.outcome === k).length;
  const future = [...quotes, ...valid.map(r => r.quote)];
  const paused = quotes.filter(q => D.eligible(q, quotes) && !D.eligible(q, future));
  const shown = rows.slice(0, 100);
  const shared = rows.length > 1 ? rows[0].warnings.filter(w => rows.every(r => r.warnings.includes(w))) : [];
  return `<div class="import-cols">
      ${panel('What will happen', `${plural(rows.length, 'row')} checked against your ${plural(quotes.length, 'existing estimate')}`, `<div class="count-chips"><span class="qt-chip is-ready">${n('ready')} ready</span><span class="qt-chip is-warn">${n('conflict')} protected existing IDs</span><span class="qt-chip is-warn">${n('held')} held conflicts</span><span class="qt-chip">${n('existing') + n('repeat')} duplicates skipped</span><span class="qt-chip is-bad">${n('invalid')} invalid</span></div>
        <p class="qt-help">Only “Ready” rows are added. Existing estimates are never overwritten. Held rows share an ID with different details inside this file — correct the source and preview again.</p>
        ${shared.length ? `<div class="qt-notice qt-notice--gold">${icon('info')}<p><strong>Applies to every row:</strong> ${shared.map(esc).join('; ')}.</p></div>` : ''}
        ${blocks.length ? `<div class="qt-notice qt-notice--gold import-block" role="alert">${icon('alert')}<div><strong>Import blocked: an opt-out would be lost.</strong><p>A row that cannot be imported says the customer asked not to be contacted. Nothing has changed. Fix those rows in the source file and preview again, or record the opt-out on the existing estimate first. Never remove an opt-out just to get past this check.</p><ul>${blocks.map(b => `<li>Row ${b.row}: ${esc(b.email)}${b.affectedIds.length ? ` — matching estimates: ${b.affectedIds.map(esc).join(', ')}` : ''}</li>`).join('')}</ul></div></div>` : ''}
        ${paused.length ? `<div class="qt-notice">${icon('pause')}<p>New opt-outs in this file will pause ${plural(paused.length, 'existing estimate')} that share an email and clear their follow-up dates: ${paused.map(q => esc(q.estimate_id)).join(', ')}.</p></div>` : ''}
        <div class="button-row"><button class="qt-btn qt-btn--ghost" type="button" data-action="import-report">${icon('download')}Download full validation report</button></div>`, { label: 'Import summary' })}
      <section class="qt-panel" aria-label="Row preview"><div class="qt-panel__head"><div><h2 class="qt-panel__title">Row preview</h2><p class="qt-panel__desc">${rows.length > shown.length ? `First ${shown.length} of ${rows.length} rows. The report lists every row.` : 'Every row in the file'}</p></div></div>
        <div class="qt-panel__body">${importRowsList(shown, shared)}</div>
        <div class="import-actions"><button class="qt-btn qt-btn--primary" type="button" data-action="import-commit" ${!valid.length || blocks.length ? 'disabled' : ''}>${icon('import')}Import ${plural(valid.length, 'ready estimate')}</button><button class="qt-btn" type="button" data-action="import-back">Back to matching</button><button class="qt-btn qt-btn--ghost" type="button" data-action="import-restart">Cancel</button><p>Nothing is saved until you choose Import.</p></div></section>
    </div>`;
}

// ---------- Settings & data ----------
export function settings(ctx) {
  const { ws, me, configuration } = ctx;
  const production = !!configuration.production;
  return head('Account', 'Settings & data', 'Your business account, security and copies of your data.') +
    `<div class="settings-grid">
      ${panel('Business account', 'One owner per business. Your records are private to this workspace.', `<dl class="settings-list">
          <div><dt>Business</dt><dd>${esc(ws.businessName)}</dd></div><div><dt>Owner email</dt><dd>${esc(me.email)}</dd></div>
          <div><dt>Storage</dt><dd>${production ? 'QuoteTend server database' : 'Local preview database on this computer'}</dd></div>
          <div><dt>Estimates</dt><dd>${ws.quotes.length.toLocaleString('en-US')} of 5,000</dd></div>
          <div><dt>Messages sent by QuoteTend</dt><dd>None — follow-ups are sent by you</dd></div></dl>
        <div class="button-row"><a class="qt-btn" href="/security">${icon('shield')}Account security</a><button class="qt-btn" type="button" data-action="sign-out">${icon('logout')}Sign out</button></div>`, { label: 'Business account' })}
      ${panel('Account security', me.recoveryCodeSaved ? 'A recovery code is saved for this account.' : 'No recovery code saved yet.', `<p class="qt-help qt-help--top">${me.recoveryCodeSaved ? 'Keep it somewhere private, such as a password manager. Generating a new code replaces it; changing your password invalidates it.' : 'Without a recovery code, a forgotten password needs administrator verification. Save one now — it takes a minute.'}</p><div class="button-row"><a class="qt-btn ${me.recoveryCodeSaved ? '' : 'qt-btn--primary'}" href="/security">${icon('shield')}${me.recoveryCodeSaved ? 'Manage password & recovery code' : 'Save a recovery code'}</a></div>`, { label: 'Account security' })}
      ${panel('Export your data', 'Copies you can keep. Neither is a complete database backup.', `<dl class="settings-list">
          <div><dt>CSV export</dt><dd>Estimate fields for spreadsheets</dd></div>
          <div><dt>Workspace export (JSON)</dt><dd>Estimates, activity notes and saved drafts — can be restored here</dd></div></dl>
        <p class="qt-help">The reporting ledger, account credentials and session data are not included in either file.</p>
        <div class="button-row"><button class="qt-btn" type="button" data-action="export-csv">${icon('download')}Export ${plural(ws.quotes.length, 'estimate')} as CSV</button><button class="qt-btn" type="button" data-action="export-json">${icon('download')}Download workspace export</button></div>`, { label: 'Export your data' })}
      ${panel('Database backups', 'Operational backups of the whole QuoteTend database', `<p class="qt-help qt-help--top">${production ? 'The QuoteTend server saves and verifies a complete SQLite database backup every six hours on its persistent disk. Those backups are restored by the operator, not from this page.' : 'This local preview saves and verifies a complete SQLite database backup every six hours in a <code>backups</code> folder next to the local database. Restore those copies with <code>node backup-accounts.mjs restore-copy</code>.'} Copies stored off the server are not yet automated.</p>`, { label: 'Database backups' })}
      ${panel('Restore from a workspace export', 'Replaces every estimate in this workspace', `<p class="qt-help qt-help--top">Restoring replaces all current estimates, activity notes and drafts with the file’s contents. A safety copy of the current workspace is saved first, opt-outs are kept, and Follow-up Results start a new reporting period. Activity in the file is not treated as verified evidence.</p>
        <div class="button-row"><label class="qt-btn file-button">${icon('reset')}Choose workspace export…<input id="restore-file" type="file" accept=".json,application/json"></label><button class="qt-btn" type="button" data-action="snapshots">Show safety copies</button></div><div data-snapshots></div>`, { cls: 'danger-zone', label: 'Restore' })}
      ${panel('Retained opt-outs', 'Do-not-contact preferences kept across restores', (ws.retainedOptOuts || []).length ? `<ul class="snapshot-list">${ws.retainedOptOuts.map(p => `<li><span>${esc(p.replace(/^email:/, '').replace(/^id:/, 'Estimate '))}</span><button class="qt-btn qt-btn--sm" type="button" data-action="release-retained" data-preference="${esc(p)}">Review &amp; release</button></li>`).join('')}</ul><p class="qt-help">These apply even when the original estimate is gone. Release one only after confirming the customer’s current preference.</p>` : '<p class="qt-help qt-help--top">No detached preferences retained. Opt-outs on individual estimates are managed on each estimate.</p>', { label: 'Retained opt-outs' })}
    </div>`;
}
