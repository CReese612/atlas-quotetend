// Product UI components rendered as HTML strings. The interactive demo and the homepage
// product visuals both use these, so marketing imagery is the working product UI with the
// same fictional records rather than a separately drawn mockup.
import { COMPANY, daysBetween, eligible, followupState, draftMessage, CHANNELS, addDays } from './workspace.js';

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
export const money = n => usd0.format(n);
export const moneyShort = n => n >= 1e6 ? `$${(n / 1e6).toFixed(2).replace(/\.?0+$/, '')}M` : n >= 1000 ? `$${(n / 1000).toFixed(n >= 1e5 ? 0 : 1).replace(/\.0$/, '')}k` : money(n);
const asDate = iso => new Date(`${iso}T12:00:00`);
export const shortDate = iso => iso ? asDate(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';
export const longDate = iso => asDate(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
export const weekdayDate = iso => asDate(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
export const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;
export function ago(iso, today) {
  const n = daysBetween(iso, today);
  return n <= 0 ? 'Today' : n === 1 ? 'Yesterday' : `${n} days ago`;
}
export const initials = name => name.replace(/&.*$/, '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
export const tone = name => 1 + [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 6;

const ICONS = {
  overview: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.6"/>',
  estimates: '<path d="M7 3.5h7l4.5 4.5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-15.5a1 1 0 0 1 1-1z"/><path d="M14 3.5V8h4.5M9 12.5h6M9 16h4"/>',
  followups: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  results: '<path d="M4 20h16M7 16v-4M12 16V7M17 16v-6"/>',
  import: '<path d="M12 15V4M8 8l4-4 4 4"/><path d="M4 14v4.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V14"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
  Phone: '<path d="M6.5 3.5h2.8l1.6 4.3-2.1 1.4a10.5 10.5 0 0 0 6 6l1.4-2.1 4.3 1.6v2.8a2 2 0 0 1-2 2A16.5 16.5 0 0 1 4.5 5.5a2 2 0 0 1 2-2z"/>',
  Email: '<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="M3.5 7l8.5 6 8.5-6"/>',
  Text: '<path d="M5 5.5h14a1.5 1.5 0 0 1 1.5 1.5v8.5A1.5 1.5 0 0 1 19 17h-9l-4.5 3.5V17H5a1.5 1.5 0 0 1-1.5-1.5V7A1.5 1.5 0 0 1 5 5.5z"/>',
  Other: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 12h.01M12 12h.01M15.5 12h.01"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  checkCircle: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 12.2l2.4 2.4 4.8-5"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  arrowLeft: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  chevronRight: '<path d="M9.5 6l6 6-6 6"/>',
  chevronDown: '<path d="M6 9.5l6 6 6-6"/>',
  chevronUp: '<path d="M6 14.5l6-6 6 6"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6A1.5 1.5 0 0 0 14 4.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/>',
  save: '<path d="M5.5 4.5h10.5l3.5 3.5v11a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1v-13.5a1 1 0 0 1 1-1z"/><path d="M8 4.5v4.5h7V4.5M8 20v-6h8v6"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  flag: '<path d="M5.5 21V4.5"/><path d="M5.5 5h11.5l-2 4 2 4H5.5"/>',
  alert: '<path d="M10.3 4.6L3.2 17.5A2 2 0 0 0 5 20.5h14a2 2 0 0 0 1.8-3L13.7 4.6a2 2 0 0 0-3.4 0z"/><path d="M12 10v4M12 17h.01"/>',
  pause: '<circle cx="12" cy="12" r="8.5"/><path d="M10 9v6M14 9v6"/>',
  tour: '<circle cx="12" cy="12" r="8.5"/><path d="M10.2 8.6l5.2 3.4-5.2 3.4z"/>',
  reset: '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3L4.5 9"/><path d="M4.5 4.5V9H9"/>',
  external: '<path d="M14 4.5h5.5V10M19.5 4.5L11 13"/><path d="M18 14v4.5a1 1 0 0 1-1 1H5.5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1H10"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  pen: '<path d="M4.5 19.5l1-4L15.5 5.5a2.1 2.1 0 0 1 3 3l-10 10z"/><path d="M13.5 7.5l3 3"/>',
  pin: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  user: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>',
  Roofing: '<path d="M2.5 12L12 4.5l9.5 7.5"/><path d="M5.5 10v10h13V10"/><path d="M10 20v-5h4v5"/>',
  Siding: '<path d="M2.5 12L12 4.5l9.5 7.5"/><path d="M5.5 10v10h13V10M5.5 13.5h13M5.5 17h13"/>',
  'Windows & doors': '<rect x="5" y="3.5" width="14" height="17" rx="1.2"/><path d="M12 3.5v17M5 12h14"/>',
  Gutters: '<path d="M3 6.5h18v2.5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 9z"/><path d="M16 11.5V18a2 2 0 0 0 4 0"/>',
  'Exterior remodel': '<path d="M3.5 20.5h17M5.5 20.5V9.5l6.5-5 6.5 5v11"/><path d="M9.5 20.5v-6h5v6"/>',
  file: '<path d="M7 3.5h7l4.5 4.5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-15.5a1 1 0 0 1 1-1z"/><path d="M14 3.5V8h4.5"/>',
  dollar: '<path d="M12 3.5v17M16 7.5c-.6-1.4-2.1-2-4-2-2.3 0-4 1.1-4 3s1.7 2.6 4 3.1 4 1.3 4 3.2-1.8 3.2-4 3.2c-2 0-3.6-.7-4.2-2.2"/>',
  stack: '<path d="M12 4l8.5 4.5L12 13 3.5 8.5z"/><path d="M3.5 12.5L12 17l8.5-4.5M3.5 16.5L12 21l8.5-4.5"/>',
  minus: '<path d="M6 12h12"/>'
};
export function icon(name, cls = '') {
  return `<svg class="qt-icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[name] || ICONS.info}</svg>`;
}
export const brandMark = (cls = '') => `<svg class="qt-mark ${cls}" viewBox="0 0 32 32" aria-hidden="true" focusable="false"><rect width="32" height="32" rx="8.5" fill="currentColor"/><path d="M20.4 20.9A8 8 0 1 1 22.9 13.4" fill="none" stroke="#F8F7F2" stroke-width="3" stroke-linecap="round"/><path d="M14.6 16.4l3.6 3.6 7-8.2" fill="none" stroke="#D9AE5F" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

// ---------- Status and timing ----------
const STATUS_LABEL = { draft: 'Draft', sent: 'Sent', won: 'Won', lost: 'Lost' };
export function badge(q) {
  if (q.status === 'sent' && q.do_not_contact) return `<span class="qt-badge qt-badge--paused"><i></i>Do not contact</span>`;
  return `<span class="qt-badge qt-badge--${q.status}"><i></i>${STATUS_LABEL[q.status]}</span>`;
}
export function timing(q, today, quotes) {
  const state = followupState(q, today, quotes);
  const n = q.next_follow_up_date ? daysBetween(today, q.next_follow_up_date) : 0;
  const label = {
    overdue: `${plural(-n, 'day')} overdue`, today: 'Due today', upcoming: n === 1 ? 'Due tomorrow' : `Due in ${n} days`,
    unscheduled: 'Needs a date', paused: 'Follow-ups paused', draft: 'Not sent yet', closed: q.status === 'won' ? 'Closed · won' : 'Closed · lost'
  }[state];
  return { state, label, n };
}
export function duePill(q, today, quotes) {
  const t = timing(q, today, quotes);
  const ic = { overdue: 'alert', today: 'flag', upcoming: 'calendar', unscheduled: 'calendar', paused: 'pause', draft: 'pen', closed: 'checkCircle' }[t.state];
  return `<span class="qt-due qt-due--${t.state}">${icon(ic)}${esc(t.label)}</span>`;
}
const tradeTag = trade => `<span class="qt-trade">${icon(trade)}${esc(trade)}</span>`;
export const avatar = name => `<span class="qt-avatar qt-avatar--${tone(name)}" aria-hidden="true">${esc(initials(name))}</span>`;
const openAttrs = (q, interactive) => interactive ? `data-open="${esc(q.estimate_id)}"` : 'tabindex="-1"';

// ---------- Overview ----------
export function kpi({ label, value, sub = '', ic = 'dollar', accent = '', id = '' }) {
  return `<article class="qt-kpi ${accent ? `qt-kpi--${accent}` : ''}" ${id ? `data-kpi="${id}"` : ''}><div class="qt-kpi__head"><span>${esc(label)}</span><span class="qt-kpi__icon">${icon(ic)}</span></div><strong class="qt-kpi__value">${value}</strong><p class="qt-kpi__sub">${sub}</p></article>`;
}

export function attentionRow(q, today, quotes, { interactive = true } = {}) {
  const last = q.last_contact_date ? `Last contact ${ago(q.last_contact_date, today).toLowerCase()}` : 'No contact logged yet';
  return `<li class="qt-attn" data-row="${esc(q.estimate_id)}">${avatar(q.customer_name)}<div class="qt-attn__main"><button class="qt-link" type="button" ${openAttrs(q, interactive)}>${esc(q.customer_name)}</button><p>${esc(q.job_description)}</p><div class="qt-attn__meta">${duePill(q, today, quotes)}<span>${esc(last)}</span></div></div><div class="qt-attn__value"><strong>${money(q.amount_usd)}</strong><button class="qt-btn qt-btn--sm" type="button" ${openAttrs(q, interactive)}>Review ${icon('arrowRight')}</button></div></li>`;
}

export const STATE_META = [
  ['overdue', 'Overdue'], ['today', 'Due today'], ['upcoming', 'Upcoming'], ['unscheduled', 'Needs a date'], ['paused', 'Do not contact']
];
export function stateBar(byState, total) {
  const segs = STATE_META.filter(([k]) => byState[k].value > 0).map(([k, label]) => `<span class="qt-seg qt-seg--${k}" style="flex-grow:${byState[k].value}" title="${esc(label)}: ${money(byState[k].value)}"></span>`).join('');
  const legend = STATE_META.map(([k, label]) => `<li><span class="qt-legend"><i class="qt-dot qt-dot--${k}"></i>${esc(label)}<em>${byState[k].count}</em></span><strong>${money(byState[k].value)}</strong></li>`).join('');
  return `<div class="qt-statebar" role="img" aria-label="Open estimate value by follow-up state, total ${money(total)}">${segs}</div><ul class="qt-legend-list">${legend}</ul>`;
}

export function ageChart(buckets) {
  const max = Math.max(...buckets.map(b => b.value), 1);
  return `<ul class="qt-bars">${buckets.map(b => `<li><span class="qt-bars__label">${esc(b.label)}</span><span class="qt-bars__track"><span class="qt-bars__fill" style="width:${Math.max(2, b.value / max * 100)}%"></span></span><span class="qt-bars__value">${moneyShort(b.value)}<em>${b.count}</em></span></li>`).join('')}</ul>`;
}

const ACTIVITY_ICON = { created: 'file', contact: 'Phone', outcome: 'checkCircle', optout: 'pause', import: 'import', update: 'pen' };
export function activityItem(a, today, { interactive = true } = {}) {
  const ic = a.type === 'contact' ? (a.data?.channel || 'Phone') : ACTIVITY_ICON[a.type];
  const kind = a.type === 'outcome' ? `qt-act--${a.data?.after?.status}` : `qt-act--${a.type}`;
  return `<li class="qt-act ${kind}"><span class="qt-act__icon">${icon(ic)}</span><div><p><button class="qt-link" type="button" ${interactive ? `data-open="${esc(a.estimateId)}"` : 'tabindex="-1"'}>${esc(a.name)}</button> <span>${esc(a.text)}</span></p><time datetime="${esc(a.date)}">${esc(ago(a.date, today))}</time></div></li>`;
}

// ---------- Estimates ----------
export function estimateRow(q, today, quotes, { interactive = true, highlight = '' } = {}) {
  const last = q.last_contact_date ? shortDate(q.last_contact_date) : '—';
  return `<tr class="qt-row ${highlight === q.estimate_id ? 'is-highlight' : ''}" data-row="${esc(q.estimate_id)}">
    <td data-label="Customer"><div class="qt-cust">${avatar(q.customer_name)}<div><button class="qt-link" type="button" ${openAttrs(q, interactive)}>${esc(q.customer_name)}</button><small>${esc(q.estimate_id)} · ${q.status === 'draft' ? 'Created' : 'Sent'} ${esc(shortDate(q.estimate_date))}</small></div></div></td>
    <td data-label="Job"><span class="qt-job">${esc(q.job_description)}</span>${tradeTag(q.trade)}</td>
    <td data-label="Value" class="qt-num">${money(q.amount_usd)}</td>
    <td data-label="Status">${badge(q)}</td>
    <td data-label="Follow-up">${duePill(q, today, quotes)}${q.next_follow_up_date ? `<small class="qt-sub">${esc(weekdayDate(q.next_follow_up_date))}</small>` : ''}</td>
    <td data-label="Last contact" class="qt-muted">${esc(last)}</td>
    <td class="qt-go">${interactive ? `<button class="qt-icon-btn" type="button" data-open="${esc(q.estimate_id)}" aria-label="Open ${esc(q.customer_name)}">${icon('chevronRight')}</button>` : icon('chevronRight')}</td></tr>`;
}
export function estimateTable(list, today, quotes, opts = {}) {
  return `<div class="qt-table-wrap"><table class="qt-table"><thead><tr><th scope="col">Customer</th><th scope="col">Job</th><th scope="col" class="qt-num">Value</th><th scope="col">Status</th><th scope="col">Follow-up</th><th scope="col">Last contact</th><th scope="col"><span class="qt-sr">Open</span></th></tr></thead><tbody>${list.map(q => estimateRow(q, today, quotes, opts)).join('')}</tbody></table></div>`;
}

export function queueRow(q, today, quotes, { interactive = true, highlight = '' } = {}) {
  const t = timing(q, today, quotes);
  const last = q.last_contact_date ? `${ago(q.last_contact_date, today)}` : 'None logged';
  return `<li class="qt-queue__row qt-queue__row--${t.state} ${highlight === q.estimate_id ? 'is-highlight' : ''}" data-row="${esc(q.estimate_id)}">
    <span class="qt-queue__flag" aria-hidden="true"></span>${avatar(q.customer_name)}
    <div class="qt-queue__main"><button class="qt-link" type="button" ${openAttrs(q, interactive)}>${esc(q.customer_name)}</button><p>${esc(q.job_description)}</p><div class="qt-queue__meta">${tradeTag(q.trade)}<span>${esc(q.estimate_id)}</span></div></div>
    <dl class="qt-queue__facts"><div><dt>Value</dt><dd class="qt-num">${money(q.amount_usd)}</dd></div><div><dt>Follow-up</dt><dd>${duePill(q, today, quotes)}</dd></div><div><dt>Last contact</dt><dd>${esc(last)}</dd></div></dl>
    <button class="qt-btn ${t.state === 'overdue' ? 'qt-btn--primary' : ''}" type="button" ${openAttrs(q, interactive)}>Review ${icon('arrowRight')}</button></li>`;
}

// ---------- Drafts, contact form and history ----------
export function draftPanel(q, quotes, { text, interactive = true, status = '' } = {}) {
  const value = text ?? (q.saved_draft || draftMessage(q, COMPANY.name, quotes));
  return `<section class="qt-section" data-section="draft" aria-labelledby="draft-h"><div class="qt-section__head"><h3 id="draft-h">${icon('pen')}Follow-up draft</h3><span class="qt-chip">${q.saved_draft ? 'Saved draft' : 'From template'}</span></div>
    <label class="qt-sr" for="draft-text">Editable follow-up draft for ${esc(q.customer_name)}</label>
    <textarea id="draft-text" class="qt-textarea" rows="9" ${interactive ? '' : 'readonly tabindex="-1"'} maxlength="10000">${esc(value)}</textarea>
    <div class="qt-draft-actions"><button class="qt-btn qt-btn--primary" type="button" data-action="copy-draft" ${interactive ? '' : 'tabindex="-1"'}>${icon('copy')}Copy draft</button><button class="qt-btn" type="button" data-action="save-draft" ${interactive ? '' : 'tabindex="-1"'}>${icon('save')}Save draft</button><button class="qt-btn qt-btn--ghost" type="button" data-action="reset-draft" ${interactive ? '' : 'tabindex="-1"'}>Use template</button></div>
    <p class="qt-help" data-draft-status role="status">${status || 'Copying or saving never sends a message and does not record contact. Paste it into your own email or text app.'}</p></section>`;
}

export function contactForm(q, today, { interactive = true, values = {} } = {}) {
  const v = { date: today, channel: 'Phone', nextDate: addDays(today, 3), note: '', ...values };
  const dis = interactive ? '' : 'tabindex="-1"';
  return `<section class="qt-section" data-section="contact" aria-labelledby="contact-h"><div class="qt-section__head"><h3 id="contact-h">${icon('Phone')}Log a contact</h3></div>
    <p class="qt-help qt-help--top">Record a conversation that already happened outside QuoteTend, and when to check in next.</p>
    <form class="qt-form" data-form="contact" novalidate><div class="qt-form__grid">
      <label>Contact date<input type="date" name="date" required min="${esc(q.estimate_date)}" max="${esc(today)}" value="${esc(v.date)}" ${dis}></label>
      <label>Method<select name="channel" ${dis}>${CHANNELS.map(c => `<option ${c === v.channel ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
      <label>Next follow-up<input type="date" name="nextDate" required value="${esc(v.nextDate)}" ${dis}></label>
      <label class="qt-form__full">Note <span class="qt-optional">optional</span><input name="note" maxlength="2000" placeholder="What did you discuss?" value="${esc(v.note)}" ${dis}></label>
    </div><p class="qt-form__error" data-form-error role="alert"></p>
    <button class="qt-btn qt-btn--primary" type="submit" ${dis}>${icon('check')}Record contact &amp; next step</button></form></section>`;
}

export function scheduleSection(q, today, { interactive = true } = {}) {
  const dis = interactive ? '' : 'disabled';
  return `<section class="qt-section qt-section--inline" data-section="schedule" aria-labelledby="schedule-h"><form class="qt-form qt-schedule" data-form="schedule" novalidate>
    <div><h3 id="schedule-h">${icon('calendar')}${q.next_follow_up_date ? 'Move the next follow-up' : 'Schedule a follow-up'}</h3><p class="qt-help">${q.next_follow_up_date ? 'Changing the date does not record a contact.' : 'This estimate needs a date to enter the follow-up queue.'}</p></div>
    <label class="qt-sr" for="schedule-date">Next follow-up date</label><input id="schedule-date" type="date" name="date" min="${esc(today)}" value="${esc(q.next_follow_up_date && q.next_follow_up_date >= today ? q.next_follow_up_date : addDays(today, 2))}" ${dis}>
    <button class="qt-btn" type="submit" ${dis}>Save date</button><p class="qt-form__error" data-form-error role="alert"></p></form></section>`;
}

export function outcomeSection(q, { interactive = true } = {}) {
  const dis = interactive ? '' : 'tabindex="-1"';
  return `<section class="qt-section" data-section="outcome" aria-labelledby="outcome-h"><div class="qt-section__head"><h3 id="outcome-h">${icon('flag')}Record the decision</h3></div>
    <p class="qt-help qt-help--top">When the homeowner decides, record it. The follow-up date is cleared and the estimate leaves every queue.</p>
    <div class="qt-outcomes"><button class="qt-btn qt-btn--won" type="button" data-outcome="won" ${dis}>${icon('checkCircle')}Mark won</button><button class="qt-btn qt-btn--lost" type="button" data-outcome="lost" ${dis}>${icon('x')}Mark lost</button><button class="qt-btn qt-btn--ghost qt-btn--danger" type="button" data-outcome="optout" ${dis}>${icon('pause')}Do not contact</button></div></section>`;
}

export function timeline(q, today) {
  const items = [...q.history].reverse();
  if (!items.length) return '<p class="qt-help">No activity recorded yet.</p>';
  return `<ol class="qt-timeline">${items.map(h => {
    const ic = h.type === 'contact' ? (/^(\w+) contact/.exec(h.text)?.[1] || 'Phone') : ACTIVITY_ICON[h.type] || 'pen';
    const outcomeTone = h.type === 'outcome' ? (/won/.test(h.text) ? 'won' : 'lost') : h.type;
    return `<li class="qt-timeline__item qt-timeline__item--${outcomeTone}"><span class="qt-timeline__icon">${icon(ic)}</span><div><p>${esc(h.text)}</p><time datetime="${esc(h.date || h.at.slice(0, 10))}">${esc(weekdayDate(h.date || h.at.slice(0, 10)))} · ${esc(ago(h.date || h.at.slice(0, 10), today))}</time></div></li>`;
  }).join('')}</ol>`;
}

// Full opportunity record. In previews (interactive=false) controls are inert decoration.
export function detailBody(q, quotes, today, { interactive = true, draftText, draftStatus, contactValues } = {}) {
  const t = timing(q, today, quotes);
  const age = daysBetween(q.estimate_date, today);
  const canFollow = eligible(q, quotes);
  const blocked = q.do_not_contact || (q.status === 'sent' && !canFollow)
    ? 'An opt-out blocks follow-ups and drafts for this estimate. Its history is kept.'
    : q.status === 'draft' ? 'This estimate is a draft. Mark it Sent after sharing it outside QuoteTend to start follow-ups.'
      : 'This estimate is closed. It is excluded from all follow-up queues, and its history is kept.';
  return `<div class="qt-detail">
    <dl class="qt-facts">
      <div><dt>Estimate value</dt><dd class="qt-facts__big">${money(q.amount_usd)}</dd></div>
      <div><dt>Sent</dt><dd>${esc(shortDate(q.estimate_date))}<small>${plural(age, 'day')} ago</small></dd></div>
      <div><dt>Next follow-up</dt><dd>${duePill(q, today, quotes)}${q.next_follow_up_date ? `<small>${esc(weekdayDate(q.next_follow_up_date))}</small>` : ''}</dd></div>
      <div><dt>Last contact</dt><dd>${q.last_contact_date ? esc(shortDate(q.last_contact_date)) : 'None'}<small>${q.last_contact_date ? esc(ago(q.last_contact_date, today)) : 'Not logged yet'}</small></dd></div>
    </dl>
    <div class="qt-job-card"><div class="qt-job-card__row">${tradeTag(q.trade)}${q.address ? `<span class="qt-meta">${icon('pin')}${esc(q.address)}</span>` : ''}</div>
      <p class="qt-job-card__title">${esc(q.job_description)}</p>${q.notes ? `<p class="qt-job-card__notes">${esc(q.notes)}</p>` : ''}
      <div class="qt-job-card__row qt-job-card__contact">${q.customer_email ? `<span class="qt-meta">${icon('Email')}${esc(q.customer_email)}</span>` : ''}${q.customer_phone ? `<span class="qt-meta">${icon('Phone')}${esc(q.customer_phone)}</span>` : ''}</div></div>
    ${canFollow ? draftPanel(q, quotes, { text: draftText, interactive, status: draftStatus }) + contactForm(q, today, { interactive, values: contactValues }) + scheduleSection(q, today, { interactive }) + outcomeSection(q, { interactive })
      : `<div class="qt-notice">${icon('info')}<p>${esc(blocked)}</p></div>`}
    <section class="qt-section" aria-labelledby="history-h"><div class="qt-section__head"><h3 id="history-h">${icon('followups')}Activity history</h3><span class="qt-chip">${plural(q.history.length, 'entry', 'entries')}</span></div>${timeline(q, today)}</section>
  </div>`;
}
export const detailHeader = (q, { closable = true } = {}) => `<div class="qt-drawer__head"><div class="qt-drawer__title">${avatar(q.customer_name)}<div><p class="qt-eyebrow">${esc(q.estimate_id)} · Fictional estimate</p><h2 id="drawer-title">${esc(q.customer_name)}</h2></div></div><div class="qt-drawer__tools">${badge(q)}${closable ? `<button class="qt-icon-btn" type="button" data-action="close-drawer" aria-label="Close estimate">${icon('x')}</button>` : ''}</div></div>`;

// ---------- Results ----------
export const RESULT_CARDS = [
  ['contacts', 'Contacts logged', r => r.counts.contacts, 'Every reported contact in the range, including repeats.'],
  ['cohort', 'Estimates followed up', r => r.counts.followed, 'Distinct estimates whose first reported contact falls in the range.'],
  ['cohort-value', 'Value followed up', r => money(r.values.followed), 'Estimate amounts when first contacted. Not revenue.'],
  ['won', 'Won after a recorded follow-up', r => r.counts.won, 'Outcome recorded after a logged contact.'],
  ['won-value', 'Value won after follow-up', r => money(r.values.won), 'Recorded estimate value, not collected or caused revenue.'],
  ['overdue', 'Current overdue value', r => money(r.values.overdue), 'Snapshot of eligible estimates past their date. Not a predicted loss.']
];
export function resultCards(r, { interactive = true, selected = 'cohort' } = {}) {
  return `<div class="qt-results">${RESULT_CARDS.map(([key, label, value, help]) => `<button class="qt-result ${selected === key ? 'is-selected' : ''} qt-result--${key}" type="button" ${interactive ? `data-group="${key}" aria-pressed="${selected === key}"` : 'tabindex="-1"'}><span class="qt-result__label">${esc(label)}</span><strong>${value(r)}</strong><small>${esc(help)}</small></button>`).join('')}</div>`;
}
export function cohortBar(r) {
  const parts = [['won', 'Won', r.counts.won], ['lost', 'Lost', r.counts.lost], ['open', 'Still open', r.counts.open], ['unknown', 'Uncertain', r.counts.unknown]];
  const total = r.counts.followed || 1;
  return `<div class="qt-cohort"><div class="qt-cohort__bar" role="img" aria-label="Cohort outcomes: ${parts.map(p => `${p[2]} ${p[1].toLowerCase()}`).join(', ')}">${parts.filter(p => p[2]).map(([k, , n]) => `<span class="qt-seg qt-seg--${k}" style="flex-grow:${n}"></span>`).join('') || '<span class="qt-seg qt-seg--empty" style="flex-grow:1"></span>'}</div>
    <ul class="qt-cohort__legend">${parts.map(([k, label, n]) => `<li><i class="qt-dot qt-dot--${k}"></i>${label}<strong>${n}</strong></li>`).join('')}</ul>
    <p class="qt-help">Won share of this cohort: <strong>${r.counts.followed ? Math.round(r.counts.won / total * 100) + '%' : 'not available'}</strong>. Open and uncertain estimates stay in the denominator. This is not a causal conversion rate.</p></div>`;
}
export function weeklyChart(weeks) {
  const max = Math.max(...weeks.map(w => w.count), 1);
  return `<div class="qt-cols" role="img" aria-label="Contacts logged per week: ${weeks.map(w => `${shortDate(w.start)} ${w.count}`).join(', ')}">${weeks.map((w, i) => `<div class="qt-cols__col ${i === weeks.length - 1 ? 'is-current' : ''}"><span class="qt-cols__n">${w.count}</span><span class="qt-cols__bar" style="height:${Math.max(4, w.count / max * 100)}%"></span><span class="qt-cols__label">${esc(shortDate(w.start))}</span></div>`).join('')}</div>`;
}
export function supportingRows(r, group, { interactive = true } = {}) {
  const base = group.replace('-value', '');
  const rows = base === 'contacts' ? r.contacts : base === 'overdue' ? r.overdue : base === 'won' ? r.cohort.filter(q => q.outcome === 'won') : r.cohort;
  const title = { contacts: 'Contacts logged', overdue: 'Currently overdue', won: 'Won after a recorded follow-up', cohort: 'Followed-up estimates' }[base];
  if (!rows.length) return `<h3 class="qt-panel__title">${title}</h3><div class="qt-empty qt-empty--sm">${icon('info')}<p>No supporting records in this range. Missing history is not treated as zero past activity.</p></div>`;
  return `<h3 class="qt-panel__title">${title} <span class="qt-count">${rows.length}</span></h3><div class="qt-table-wrap"><table class="qt-table qt-table--compact"><thead><tr><th scope="col">Estimate</th><th scope="col">${base === 'overdue' ? 'Follow-up date' : base === 'contacts' ? 'Contact date' : 'First contact'}</th><th scope="col" class="qt-num">Value</th><th scope="col">${base === 'contacts' ? 'Method' : base === 'overdue' ? 'State' : 'Outcome'}</th></tr></thead><tbody>${rows.map(x => `<tr><td><button class="qt-link" type="button" ${interactive ? `data-open="${esc(x.estimateId)}"` : 'tabindex="-1"'}>${esc(x.name)}</button><small>${esc(x.estimateId)}</small></td><td>${esc(shortDate(x.firstContact || x.date))}</td><td class="qt-num">${money(base === 'won' ? x.wonValue : x.followedValue ?? x.value)}</td><td>${base === 'contacts' ? `<span class="qt-meta">${icon(x.channel)}${esc(x.channel)}</span>` : base === 'overdue' ? '<span class="qt-due qt-due--overdue">Overdue</span>' : `<span class="qt-outcome qt-outcome--${x.outcome}">${esc({ won: 'Won', lost: 'Lost', open: 'Open', unknown: 'Uncertain' }[x.outcome])}</span>${x.outcomeDate ? `<small>${esc(shortDate(x.outcomeDate))}</small>` : ''}`}</td></tr>`).join('')}</tbody></table></div>`;
}

// ---------- Import preview ----------
const OUTCOME_LABEL = { ready: 'Ready', existing: 'Duplicate · skipped', conflict: 'Existing ID · protected', held: 'Held · conflicting versions', repeat: 'Repeat · skipped', invalid: 'Invalid' };
export function mappingTable(preview) {
  const fields = Object.entries(preview.mapping).filter(([, i]) => i >= 0);
  return `<ul class="qt-map">${fields.map(([field, i]) => `<li><span class="qt-map__src">${esc(preview.headers[i])}</span><span class="qt-map__arrow">${icon('arrowRight')}</span><span class="qt-map__dst">${esc(({ estimate_id: 'Estimate ID', customer_name: 'Customer name', customer_email: 'Email', job_description: 'Job description', amount_usd: 'Amount (USD)', estimate_date: 'Estimate date', status: 'Status', next_follow_up_date: 'Next follow-up date' })[field] || field)}</span><span class="qt-map__ok">${icon('check')}</span></li>`).join('')}</ul>`;
}
export function importRows(preview) {
  return `<ul class="qt-import-rows">${preview.rows.map(r => `<li class="qt-import-row qt-import-row--${r.outcome}"><span class="qt-import-row__status">${icon(r.outcome === 'ready' ? 'checkCircle' : r.outcome === 'invalid' ? 'alert' : 'pause')}${esc(OUTCOME_LABEL[r.outcome])}</span><div><strong>${esc(r.quote.customer_name || '(no name)')}</strong><span>${esc(r.quote.estimate_id)} · ${esc(r.quote.job_description)}</span>${r.errors.length ? `<small>${esc(r.errors[0])}</small>` : r.warnings.length > 1 ? `<small>${esc(r.warnings[1])}</small>` : ''}</div><span class="qt-num">${Number.isFinite(r.quote.amount_usd) ? money(r.quote.amount_usd) : '—'}</span></li>`).join('')}</ul>`;
}

// ---------- App chrome for static previews ----------
export function previewSidebar(active, counts) {
  const items = [['overview', 'Overview'], ['estimates', 'Estimates', counts.estimates], ['followups', 'Follow-ups', counts.due], ['results', 'Follow-up Results'], ['import', 'Import']];
  return `<aside class="qt-side"><div class="qt-side__brand">${brandMark()}<span>QuoteTend</span></div><div class="qt-side__ws"><span class="qt-side__ws-mark">${COMPANY.initials}</span><div><strong>${esc(COMPANY.name)}</strong><small>Fictional demo workspace</small></div></div><nav class="qt-side__nav" aria-label="Preview navigation">${items.map(([k, label, n]) => `<span class="qt-nav ${k === active ? 'is-active' : ''}">${icon(k)}<span>${label}</span>${n ? `<em>${n}</em>` : ''}</span>`).join('')}</nav></aside>`;
}
