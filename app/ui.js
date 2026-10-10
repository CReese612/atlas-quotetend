// Product UI components for the private application, rendered as HTML strings. They follow the
// interactive demo's components (public-site/assets/js/components.js) and use the same shared CSS
// classes, but render authenticated records. Every user-supplied value passes through esc().
// Bar and segment sizes are emitted as data attributes and applied with applySizes(), because the
// Content-Security-Policy does not allow inline style attributes.
import { daysBetween, followupState, optOutSources, eligible, CHANNELS, CONTACT_RESULTS, TRADES, addDays } from '/domain.js';

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const usd2 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const money = n => Number.isFinite(n) ? (Number.isInteger(Math.round(n * 100) / 100) ? usd0 : usd2).format(n) : '—';
export const moneyShort = n => n >= 1e6 ? `$${(n / 1e6).toFixed(2).replace(/\.?0+$/, '')}M` : n >= 1000 ? `$${(n / 1000).toFixed(n >= 1e5 ? 0 : 1).replace(/\.0$/, '')}k` : money(n);
const asDate = iso => new Date(`${iso}T12:00:00`);
const thisYear = () => new Date().getFullYear();
export const shortDate = iso => iso ? asDate(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(asDate(iso).getFullYear() !== thisYear() ? { year: 'numeric' } : {}) }) : '—';
export const longDate = iso => asDate(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
export const weekdayDate = iso => asDate(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', ...(asDate(iso).getFullYear() !== thisYear() ? { year: 'numeric' } : {}) });
export const plural = (n, word, many = `${word}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? word : many}`;
export function ago(iso, today) {
  const n = daysBetween(iso, today);
  return n < 0 ? `In ${plural(-n, 'day')}` : n === 0 ? 'Today' : n === 1 ? 'Yesterday' : `${n} days ago`;
}
export const initials = name => String(name || '?').replace(/&.*$/, '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => [...w][0]).join('').toUpperCase() || '?';
export const tone = name => 1 + [...String(name || '')].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 6;

const ICONS = {
  overview: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.6"/>',
  estimates: '<path d="M7 3.5h7l4.5 4.5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-15.5a1 1 0 0 1 1-1z"/><path d="M14 3.5V8h4.5M9 12.5h6M9 16h4"/>',
  followups: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  results: '<path d="M4 20h16M7 16v-4M12 16V7M17 16v-6"/>',
  import: '<path d="M12 15V4M8 8l4-4 4 4"/><path d="M4 14v4.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V14"/>',
  download: '<path d="M12 4v11M8 11l4 4 4-4"/><path d="M4 14v4.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V14"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
  Phone: '<path d="M6.5 3.5h2.8l1.6 4.3-2.1 1.4a10.5 10.5 0 0 0 6 6l1.4-2.1 4.3 1.6v2.8a2 2 0 0 1-2 2A16.5 16.5 0 0 1 4.5 5.5a2 2 0 0 1 2-2z"/>',
  Email: '<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="M3.5 7l8.5 6 8.5-6"/>',
  Text: '<path d="M5 5.5h14a1.5 1.5 0 0 1 1.5 1.5v8.5A1.5 1.5 0 0 1 19 17h-9l-4.5 3.5V17H5a1.5 1.5 0 0 1-1.5-1.5V7A1.5 1.5 0 0 1 5 5.5z"/>',
  Other: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 12h.01M12 12h.01M15.5 12h.01"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  checkCircle: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 12.2l2.4 2.4 4.8-5"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  arrowLeft: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  chevronRight: '<path d="M9.5 6l6 6-6 6"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6A1.5 1.5 0 0 0 14 4.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/>',
  save: '<path d="M5.5 4.5h10.5l3.5 3.5v11a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1v-13.5a1 1 0 0 1 1-1z"/><path d="M8 4.5v4.5h7V4.5M8 20v-6h8v6"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  flag: '<path d="M5.5 21V4.5"/><path d="M5.5 5h11.5l-2 4 2 4H5.5"/>',
  alert: '<path d="M10.3 4.6L3.2 17.5A2 2 0 0 0 5 20.5h14a2 2 0 0 0 1.8-3L13.7 4.6a2 2 0 0 0-3.4 0z"/><path d="M12 10v4M12 17h.01"/>',
  pause: '<circle cx="12" cy="12" r="8.5"/><path d="M10 9v6M14 9v6"/>',
  reset: '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3L4.5 9"/><path d="M4.5 4.5V9H9"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  pen: '<path d="M4.5 19.5l1-4L15.5 5.5a2.1 2.1 0 0 1 3 3l-10 10z"/><path d="M13.5 7.5l3 3"/>',
  pin: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  user: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>',
  shield: '<path d="M12 3.5l7 2.8v5.2c0 4.4-3 7.9-7 9-4-1.1-7-4.6-7-9V6.3z"/><path d="M9 12l2.2 2.2L15.5 10"/>',
  logout: '<path d="M14 4.5h4a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5h-4"/><path d="M10 16l-4-4 4-4M6 12h9.5"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2.1-1.2L14 3.5h-4l-.5 2.1a7 7 0 0 0-2.1 1.2l-2.3-.9-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-.9a7 7 0 0 0 2.1 1.2l.5 2.1h4l.5-2.1a7 7 0 0 0 2.1-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z"/>',
  refresh: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3L19.5 9"/><path d="M19.5 4.5V9H15"/>',
  database: '<ellipse cx="12" cy="6" rx="7.5" ry="2.8"/><path d="M4.5 6v12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8V6M4.5 12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8"/>',
  tag: '<path d="M3.5 12.5V5a1.5 1.5 0 0 1 1.5-1.5h7.5l8 8a1.5 1.5 0 0 1 0 2.1l-6.4 6.4a1.5 1.5 0 0 1-2.1 0z"/><circle cx="8" cy="8" r="1.4"/>',
  sparkle: '<path d="M12 3.5l1.8 5.2 5.2 1.8-5.2 1.8L12 17.5l-1.8-5.2L5 10.5l5.2-1.8z"/><path d="M18.5 16v4M16.5 18h4"/>',
  Roofing: '<path d="M2.5 12L12 4.5l9.5 7.5"/><path d="M5.5 10v10h13V10"/><path d="M10 20v-5h4v5"/>',
  Siding: '<path d="M2.5 12L12 4.5l9.5 7.5"/><path d="M5.5 10v10h13V10M5.5 13.5h13M5.5 17h13"/>',
  'Windows & doors': '<rect x="5" y="3.5" width="14" height="17" rx="1.2"/><path d="M12 3.5v17M5 12h14"/>',
  Gutters: '<path d="M3 6.5h18v2.5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 9z"/><path d="M16 11.5V18a2 2 0 0 0 4 0"/>',
  'Exterior remodel': '<path d="M3.5 20.5h17M5.5 20.5V9.5l6.5-5 6.5 5v11"/><path d="M9.5 20.5v-6h5v6"/>',
  file: '<path d="M7 3.5h7l4.5 4.5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-15.5a1 1 0 0 1 1-1z"/><path d="M14 3.5V8h4.5"/>',
  dollar: '<path d="M12 3.5v17M16 7.5c-.6-1.4-2.1-2-4-2-2.3 0-4 1.1-4 3s1.7 2.6 4 3.1 4 1.3 4 3.2-1.8 3.2-4 3.2c-2 0-3.6-.7-4.2-2.2"/>'
};
export function icon(name, cls = '') {
  return `<svg class="qt-icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[name] || ICONS.info}</svg>`;
}

// Brand wordmark "ꝘuoteTend": the Ꝙ is the approved vector glyph (same paths as the public site);
// the rest is CSS-generated display text. The accessible name is always the ordinary "QuoteTend".
const Q = {
  viewBox: '0 -1 87 95',
  bowl: 'M32 -1C50 -1 62 13.4 62 35C62 56.6 50 71 32 71C14 71 2 56.6 2 35C2 13.4 14 -1 32 -1ZM32 9.4C42.2 9.4 49 19.64 49 35C49 50.36 42.2 60.6 32 60.6C21.8 60.6 15 50.36 15 35C15 19.64 21.8 9.4 32 9.4Z',
  tail: 'M44.6 58.6L52.4 51.6L69 76.2L61.2 83.2Z',
  stroke: 'M66 24C71 18.5 80.5 19.5 80.5 28C80.5 32.5 78.5 36.5 76 40.5L53 86'
};
export const wordmark = (cls = '') => `<span class="wordmark ${cls}" aria-hidden="true"><svg class="wordmark__q" viewBox="${Q.viewBox}" width="18" height="19" aria-hidden="true" focusable="false"><path fill="currentColor" fill-rule="evenodd" d="${Q.bowl}"/><path fill="currentColor" d="${Q.tail}"/><path class="wordmark__stroke" fill="none" stroke-width="10" stroke-linecap="round" d="${Q.stroke}"/></svg></span><span class="sr-only">QuoteTend</span>`;

// Apply data-driven sizes after rendering (CSP-safe alternative to inline style attributes).
export function applySizes(root) {
  for (const el of root.querySelectorAll('[data-grow]')) { el.style.flexGrow = el.dataset.grow; el.removeAttribute('data-grow'); }
  for (const el of root.querySelectorAll('[data-w]')) { el.style.width = el.dataset.w + '%'; el.removeAttribute('data-w'); }
  for (const el of root.querySelectorAll('[data-h]')) { el.style.height = el.dataset.h + '%'; el.removeAttribute('data-h'); }
}

// ---------- Status and timing ----------
const STATUS_LABEL = { draft: 'Draft', sent: 'Sent', won: 'Won', lost: 'Lost' };
export function badge(q, quotes) {
  if (q.do_not_contact) return `<span class="qt-badge qt-badge--paused"><i></i>Do not contact</span>`;
  if (q.status === 'sent' && optOutSources(q, quotes).length) return `<span class="qt-badge qt-badge--paused"><i></i>Shared-email opt-out</span>`;
  return `<span class="qt-badge qt-badge--${esc(q.status)}"><i></i>${STATUS_LABEL[q.status] || esc(q.status)}</span>`;
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
export const tradeTag = trade => trade ? `<span class="qt-trade">${icon(TRADES.includes(trade) ? trade : 'tag')}${esc(trade)}</span>` : '';
export const avatar = name => `<span class="qt-avatar qt-avatar--${tone(name)}" aria-hidden="true">${esc(initials(name))}</span>`;
const open = q => `data-open="${esc(q.estimate_id)}"`;

// ---------- Overview ----------
export function kpi({ label, value, sub = '', ic = 'dollar', accent = '', id = '' }) {
  return `<article class="qt-kpi ${accent ? `qt-kpi--${accent}` : ''}" ${id ? `data-kpi="${id}"` : ''}><div class="qt-kpi__head"><span>${esc(label)}</span><span class="qt-kpi__icon">${icon(ic)}</span></div><strong class="qt-kpi__value">${value}</strong><p class="qt-kpi__sub">${sub}</p></article>`;
}
export function attentionRow(q, today, quotes) {
  const last = q.last_contact_date ? `Last contact ${ago(q.last_contact_date, today).toLowerCase()}` : 'No contact logged yet';
  return `<li class="qt-attn" data-row="${esc(q.estimate_id)}">${avatar(q.customer_name)}<div class="qt-attn__main"><button class="qt-link" type="button" ${open(q)}>${esc(q.customer_name)}</button><p>${esc(q.job_description)}</p><div class="qt-attn__meta">${duePill(q, today, quotes)}<span>${esc(last)}</span></div></div><div class="qt-attn__value"><strong>${money(q.amount_usd)}</strong><button class="qt-btn qt-btn--sm" type="button" ${open(q)} aria-label="Review ${esc(q.customer_name)}">Review ${icon('arrowRight')}</button></div></li>`;
}
export const STATE_META = [['overdue', 'Overdue'], ['today', 'Due today'], ['upcoming', 'Upcoming'], ['unscheduled', 'Needs a date'], ['paused', 'Do not contact']];
export function stateBar(byState, total) {
  const segs = STATE_META.filter(([k]) => byState[k].value > 0).map(([k, label]) => `<span class="qt-seg qt-seg--${k}" data-grow="${byState[k].value}" title="${esc(label)}: ${money(byState[k].value)}"></span>`).join('');
  const legend = STATE_META.map(([k, label]) => `<li><span class="qt-legend"><i class="qt-dot qt-dot--${k}"></i>${esc(label)}<em>${byState[k].count}</em></span><strong>${money(byState[k].value)}</strong></li>`).join('');
  return `<div class="qt-statebar" role="img" aria-label="Open estimate value by follow-up state, total ${money(total)}">${segs || '<span class="qt-seg qt-seg--empty" data-grow="1"></span>'}</div><ul class="qt-legend-list">${legend}</ul>`;
}
export function ageChart(buckets) {
  const max = Math.max(...buckets.map(b => b.value), 1);
  return `<ul class="qt-bars">${buckets.map(b => `<li><span class="qt-bars__label">${esc(b.label)}</span><span class="qt-bars__track"><span class="qt-bars__fill" data-w="${b.value ? Math.max(2, b.value / max * 100) : 0}"></span></span><span class="qt-bars__value">${moneyShort(b.value)}<em>${b.count}</em></span></li>`).join('')}</ul>`;
}
const HISTORY_ICON = { created: 'file', contact: 'Phone', outcome: 'checkCircle', optout: 'pause', import: 'import', update: 'pen', schedule: 'calendar', correction: 'reset' };
const historyTone = h => h.type === 'outcome' ? (/\bwon\b/.test(h.text) ? 'won' : /\blost\b/.test(h.text) ? 'lost' : 'outcome') : h.type;
const historyIcon = h => h.type === 'contact' ? (CHANNELS.find(c => h.text.startsWith(c + ' ')) || 'Phone') : HISTORY_ICON[h.type] || (/opted out/i.test(h.text) ? 'pause' : 'pen');
const historyDate = h => h.date || h.at.slice(0, 10);
export function activityItem(a, today) {
  return `<li class="qt-act qt-act--${historyTone(a)}"><span class="qt-act__icon">${icon(historyIcon(a))}</span><div class="qt-act__body"><p><button class="qt-link" type="button" data-open="${esc(a.estimateId)}">${esc(a.name)}</button> <span>${esc(a.text)}</span></p><time datetime="${esc(historyDate(a))}">${esc(ago(historyDate(a), today))}</time></div></li>`;
}

// ---------- Estimates ----------
export function estimateRow(q, today, quotes) {
  const last = q.last_contact_date ? shortDate(q.last_contact_date) : '—';
  return `<tr class="qt-row" data-row="${esc(q.estimate_id)}">
    <td data-label="Customer"><div class="qt-cust">${avatar(q.customer_name)}<div><button class="qt-link" type="button" ${open(q)}>${esc(q.customer_name)}</button><small>${esc(q.estimate_id)} · ${q.status === 'draft' ? 'Created' : 'Sent'} ${esc(shortDate(q.estimate_date))}</small></div></div></td>
    <td data-label="Job"><span class="qt-job">${esc(q.job_description)}</span>${tradeTag(q.trade)}</td>
    <td data-label="Value" class="qt-num">${money(q.amount_usd)}</td>
    <td data-label="Status">${badge(q, quotes)}</td>
    <td data-label="Follow-up">${duePill(q, today, quotes)}${q.next_follow_up_date ? `<small class="qt-sub">${esc(weekdayDate(q.next_follow_up_date))}</small>` : ''}</td>
    <td data-label="Last contact" class="qt-muted">${esc(last)}</td>
    <td class="qt-go"><button class="qt-icon-btn" type="button" ${open(q)} aria-label="Open ${esc(q.customer_name)}">${icon('chevronRight')}</button></td></tr>`;
}
export function estimateTable(list, today, quotes) {
  return `<div class="qt-table-wrap"><table class="qt-table"><thead><tr><th scope="col">Customer</th><th scope="col">Job</th><th scope="col" class="qt-num">Value</th><th scope="col">Status</th><th scope="col">Follow-up</th><th scope="col">Last contact</th><th scope="col"><span class="qt-sr">Open</span></th></tr></thead><tbody>${list.map(q => estimateRow(q, today, quotes)).join('')}</tbody></table></div>`;
}
export function queueRow(q, today, quotes) {
  const t = timing(q, today, quotes);
  const last = q.last_contact_date ? ago(q.last_contact_date, today) : 'None logged';
  return `<li class="qt-queue__row qt-queue__row--${t.state}" data-row="${esc(q.estimate_id)}">
    <span class="qt-queue__flag" aria-hidden="true"></span>${avatar(q.customer_name)}
    <div class="qt-queue__main"><button class="qt-link" type="button" ${open(q)}>${esc(q.customer_name)}</button><p>${esc(q.job_description)}</p><div class="qt-queue__meta">${tradeTag(q.trade)}<span>${esc(q.estimate_id)}</span>${!q.customer_email && !q.customer_phone ? '<span>No email or phone</span>' : ''}</div></div>
    <dl class="qt-queue__facts"><div><dt>Value</dt><dd class="qt-num">${money(q.amount_usd)}</dd></div><div><dt>Follow-up</dt><dd>${duePill(q, today, quotes)}</dd></div><div><dt>Last contact</dt><dd>${esc(last)}</dd></div></dl>
    <button class="qt-btn ${t.state === 'overdue' ? 'qt-btn--primary' : ''}" type="button" ${open(q)} aria-label="Review ${esc(q.customer_name)}">Review ${icon('arrowRight')}</button></li>`;
}

// ---------- Estimate detail (drawer) ----------
export const detailHeader = (q, quotes, origin) => `<div class="qt-drawer__head"><div class="qt-drawer__title">${avatar(q.customer_name)}<div><p class="qt-eyebrow">${esc(q.estimate_id)}${origin && origin !== 'created' ? ` · ${esc({ imported: 'Imported', restored: 'Restored', legacy: 'Earlier record' }[origin] || origin)}` : ''}</p><h2 id="drawer-title" tabindex="-1">${esc(q.customer_name)}</h2></div></div><div class="qt-drawer__tools">${badge(q, quotes)}<button class="qt-btn qt-btn--sm" type="button" data-action="edit" data-id="${esc(q.estimate_id)}">${icon('pen')}Edit</button><button class="qt-icon-btn" type="button" data-action="close-drawer" aria-label="Close estimate">${icon('x')}</button></div></div>`;

export function factsAndJob(q, today, quotes) {
  const age = Math.max(0, daysBetween(q.estimate_date, today));
  return `<dl class="qt-facts">
      <div><dt>Estimate value</dt><dd class="qt-facts__big">${money(q.amount_usd)}</dd></div>
      <div><dt>${q.status === 'draft' ? 'Created' : 'Sent'}</dt><dd>${esc(shortDate(q.estimate_date))}<small>${age === 0 ? 'Today' : `${plural(age, 'day')} ago`}</small></dd></div>
      <div><dt>Next follow-up</dt><dd>${duePill(q, today, quotes)}${q.next_follow_up_date ? `<small>${esc(weekdayDate(q.next_follow_up_date))}</small>` : ''}</dd></div>
      <div><dt>Last contact</dt><dd>${q.last_contact_date ? esc(shortDate(q.last_contact_date)) : 'None'}<small>${q.last_contact_date ? esc(ago(q.last_contact_date, today)) : 'Not logged yet'}</small></dd></div>
    </dl>
    <div class="qt-job-card">${q.trade || q.address ? `<div class="qt-job-card__row">${tradeTag(q.trade)}${q.address ? `<span class="qt-meta">${icon('pin')}${esc(q.address)}</span>` : ''}</div>` : ''}
      <p class="qt-job-card__title">${esc(q.job_description)}</p>${q.notes ? `<p class="qt-job-card__notes">${esc(q.notes)}</p>` : ''}
      <div class="qt-job-card__row qt-job-card__contact">${q.customer_email ? `<span class="qt-meta">${icon('Email')}<a href="mailto:${esc(q.customer_email)}">${esc(q.customer_email)}</a></span>` : '<span class="qt-meta qt-muted">' + icon('Email') + 'No email on file</span>'}${q.customer_phone ? `<span class="qt-meta">${icon('Phone')}<a href="tel:${esc(q.customer_phone.replace(/[^\d+]/g, ''))}">${esc(q.customer_phone)}</a></span>` : '<span class="qt-meta qt-muted">' + icon('Phone') + 'No phone on file</span>'}</div></div>`;
}

export function draftPanel(q, { text, template, status = '', statusOk = false }) {
  const chip = text !== undefined && text !== (q.saved_draft || template) ? 'Unsaved changes' : q.saved_draft ? 'Saved draft' : 'From template';
  const value = text ?? (q.saved_draft || template);
  return `<section class="qt-section" data-section="draft" aria-labelledby="draft-h"><div class="qt-section__head"><h3 id="draft-h">${icon('pen')}Follow-up draft</h3><span class="qt-chip" data-draft-chip>${chip}</span></div>
    ${!q.customer_email && !q.customer_phone ? `<p class="qt-notice qt-notice--gold qt-help--top">${icon('info')}<span>No email or phone on file. Add one with Edit, or use this draft as notes for an in-person conversation.</span></p>` : !q.customer_email ? `<p class="qt-help qt-help--top">No email on file — use this as a text message or phone script.</p>` : ''}
    <label class="qt-sr" for="draft-text">Editable follow-up draft for ${esc(q.customer_name)}</label>
    <textarea id="draft-text" class="qt-textarea" rows="9" maxlength="10000">${esc(value)}</textarea>
    <div class="draft-meta"><span data-draft-count>${value.length.toLocaleString('en-US')} / 10,000 characters</span><span>Template uses the customer’s first name, amount and job.</span></div>
    <div class="qt-draft-actions"><button class="qt-btn qt-btn--primary" type="button" data-action="copy-draft">${icon('copy')}Copy draft</button><button class="qt-btn" type="button" data-action="save-draft">${icon('save')}Save draft</button><button class="qt-btn qt-btn--ghost" type="button" data-action="reset-draft">Use template</button></div>
    <p class="qt-help ${statusOk ? 'is-success' : ''}" data-draft-status role="status">${esc(status || 'QuoteTend never sends messages. Copying or saving a draft does not record a contact — paste it into your own email or text app, then log the contact below once it has happened.')}</p></section>`;
}

export function contactForm(q, today, values = {}) {
  const v = { date: today, channel: 'Phone', result: '', nextDate: addDays(today, 3), note: '', ...values };
  return `<section class="qt-section" data-section="contact" aria-labelledby="contact-h"><div class="qt-section__head"><h3 id="contact-h">${icon('Phone')}Log a contact</h3></div>
    <p class="qt-help qt-help--top">Record a conversation or message that already happened outside QuoteTend, and when to check in next.</p>
    <form class="qt-form" data-form="contact" novalidate><div class="qt-form__grid">
      <label>Contact date<input type="date" name="date" required min="${esc(q.estimate_date)}" max="${esc(today)}" value="${esc(v.date)}"></label>
      <label>Method<select name="channel">${CHANNELS.map(c => `<option ${c === v.channel ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
      <label>Next follow-up<input type="date" name="nextDate" required min="${esc(q.estimate_date)}" value="${esc(v.nextDate)}"></label>
      <label class="qt-form__full"><span>Result <span class="qt-optional">optional</span></span><select name="result"><option value="">Not specified</option>${Object.entries(CONTACT_RESULTS).map(([k, l]) => `<option value="${k}" ${k === v.result ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
      <label class="qt-form__full"><span>Note <span class="qt-optional">optional</span></span><input name="note" maxlength="2000" placeholder="What did you discuss?" value="${esc(v.note)}"></label>
    </div><p class="qt-form__error" data-form-error role="alert"></p>
    <button class="qt-btn qt-btn--primary" type="submit">${icon('check')}Record contact &amp; next step</button></form></section>`;
}

export function scheduleSection(q, today) {
  const value = q.next_follow_up_date && q.next_follow_up_date >= today ? q.next_follow_up_date : addDays(today, 2);
  return `<section class="qt-section qt-section--inline" data-section="schedule" aria-labelledby="schedule-h"><form class="qt-form qt-schedule" data-form="schedule" novalidate>
    <div><h3 id="schedule-h">${icon('calendar')}${q.next_follow_up_date ? 'Move the next follow-up' : 'Schedule a follow-up'}</h3><p class="qt-help">${q.next_follow_up_date ? 'Changing the date does not record a contact.' : 'This estimate needs a date to enter the follow-up queue.'}</p></div>
    <label class="qt-sr" for="schedule-date">Next follow-up date</label><input id="schedule-date" type="date" name="date" min="${esc(today < q.estimate_date ? q.estimate_date : today)}" value="${esc(value)}" required>
    <button class="qt-btn" type="submit">Save date</button><p class="qt-form__error" data-form-error role="alert"></p></form></section>`;
}

export function outcomeSection(q, today) {
  const closed = ['won', 'lost'].includes(q.status);
  const help = q.status === 'draft' ? 'This estimate is a draft. Mark it sent once you have shared it with the customer outside QuoteTend; it then enters the follow-up queues.'
    : closed ? `Recorded as ${q.status}. You can correct the reported date or the outcome. Corrections are added to the history; nothing is erased.`
      : 'When the homeowner decides, record it. The follow-up date is cleared and the estimate leaves every queue. QuoteTend does not verify payment.';
  return `<section class="qt-section" data-section="outcome" aria-labelledby="outcome-h"><div class="qt-section__head"><h3 id="outcome-h">${icon('flag')}${q.status === 'draft' ? 'Estimate status' : 'Record the decision'}</h3></div>
    <p class="qt-help qt-help--top">${esc(help)}</p>
    ${q.status !== 'draft' ? `<label class="outcome-date">Decision reported on<input type="date" data-outcome-date min="${esc(q.estimate_date)}" max="${esc(today)}" value="${esc(today)}"></label>` : ''}
    <div class="qt-outcomes">${q.status === 'draft' ? `<button class="qt-btn qt-btn--primary" type="button" data-outcome="sent">${icon('arrowRight')}Mark sent</button>` : ''}
      ${q.status !== 'won' && q.status !== 'draft' ? `<button class="qt-btn qt-btn--won" type="button" data-outcome="won">${icon('checkCircle')}Mark won</button>` : ''}
      ${q.status !== 'lost' && q.status !== 'draft' ? `<button class="qt-btn qt-btn--lost" type="button" data-outcome="lost">${icon('x')}Mark lost</button>` : ''}
      ${closed ? `<button class="qt-btn" type="button" data-outcome="confirm">${icon('calendar')}Correct reported date</button><button class="qt-btn" type="button" data-outcome="reopen">${icon('reset')}Reopen as sent</button>` : ''}
      ${!q.do_not_contact ? `<button class="qt-btn qt-btn--ghost qt-btn--danger" type="button" data-outcome="optout">${icon('pause')}Do not contact</button>` : ''}</div></section>`;
}

export function timeline(q, today) {
  const items = [...q.history].reverse();
  if (!items.length) return '<p class="qt-help">No activity recorded yet.</p>';
  return `<ol class="qt-timeline">${items.map(h => `<li class="qt-timeline__item qt-timeline__item--${historyTone(h)}"><span class="qt-timeline__icon">${icon(historyIcon(h))}</span><div><p>${esc(h.text)}</p><time datetime="${esc(historyDate(h))}">${esc(weekdayDate(historyDate(h)))} · ${esc(ago(historyDate(h), today))}</time></div></li>`).join('')}</ol>`;
}

export function blockedNotice(q, quotes) {
  const sources = optOutSources(q, quotes);
  if (sources.length) {
    const others = sources.filter(s => s.estimate_id !== q.estimate_id);
    return `<div class="qt-notice">${icon('pause')}<p>${q.do_not_contact ? 'This customer asked not to be contacted.' : 'Another estimate with this email is marked do-not-contact.'} Follow-ups and drafts are paused${q.customer_email ? ' for every estimate with this email' : ''}. Its history is kept.${others.length ? ` Opt-out recorded on: ${others.map(s => `<button class="qt-link" type="button" data-open="${esc(s.estimate_id)}">${esc(s.estimate_id)}</button>`).join(', ')}.` : ''} To change an opt-out, edit the estimate where it was recorded after confirming the customer’s preference.</p></div>`;
  }
  if (q.status === 'draft') return '';
  if (!eligible(q, quotes)) return `<div class="qt-notice">${icon('info')}<p>This estimate is closed. It is excluded from all follow-up queues, and its history is kept.</p></div>`;
  return '';
}

// ---------- Results ----------
export const RESULT_CARDS = [
  ['contacts', 'Contacts logged', r => r.counts.contacts.toLocaleString('en-US'), 'Every reported contact in the range, including repeats.'],
  ['cohort', 'Estimates followed up', r => r.counts.followed.toLocaleString('en-US'), 'Distinct estimates whose first reported contact falls in the range.'],
  ['cohort-value', 'Value followed up', r => money(r.values.followed), 'Estimate amounts when first contacted. Not revenue.'],
  ['won', 'Won after a recorded follow-up', r => r.counts.won.toLocaleString('en-US'), 'Outcome recorded after a logged contact.'],
  ['won-value', 'Value won after follow-up', r => money(r.values.won), 'Recorded estimate value, not collected or caused revenue.'],
  ['overdue', 'Current overdue value', r => money(r.values.overdue), 'Snapshot of eligible estimates past their date. Not a predicted loss.']
];
export function resultCards(r, selected) {
  return `<div class="qt-results">${RESULT_CARDS.map(([key, label, value, help]) => `<button class="qt-result ${selected === key ? 'is-selected' : ''} qt-result--${key}" type="button" data-group="${key}" aria-pressed="${selected === key}"><span class="qt-result__label">${esc(label)}</span><strong>${value(r)}</strong><small>${esc(help)}</small></button>`).join('')}</div>`;
}
export function cohortBar(r) {
  const parts = [['won', 'Won', r.counts.won], ['lost', 'Lost', r.counts.lost], ['open', 'Still open', r.counts.open], ['unknown', 'Uncertain', r.counts.unknown]];
  return `<div class="qt-cohort"><div class="qt-cohort__bar" role="img" aria-label="Cohort outcomes: ${parts.map(p => `${p[2]} ${p[1].toLowerCase()}`).join(', ')}">${parts.filter(p => p[2]).map(([k, , n]) => `<span class="qt-seg qt-seg--${k}" data-grow="${n}"></span>`).join('') || '<span class="qt-seg qt-seg--empty" data-grow="1"></span>'}</div>
    <ul class="qt-cohort__legend">${parts.map(([k, label, n]) => `<li><i class="qt-dot qt-dot--${k}"></i>${label}<strong>${n}</strong></li>`).join('')}</ul>
    <p class="qt-help">Won share of this cohort: <strong>${r.counts.followed ? Math.round(r.counts.won / r.counts.followed * 100) + '%' : 'not available (no estimates followed up in this range)'}</strong>. Open and uncertain estimates stay in the denominator. This is not a causal conversion rate.</p></div>`;
}
export function weeklyChart(weeks) {
  const max = Math.max(...weeks.map(w => w.count), 1);
  return `<div class="qt-cols" role="img" aria-label="Contacts logged per week: ${weeks.map(w => `week of ${shortDate(w.start)} ${w.count}`).join(', ')}">${weeks.map((w, i) => `<div class="qt-cols__col ${i === weeks.length - 1 ? 'is-current' : ''}"><span class="qt-cols__n">${w.count}</span><span class="qt-cols__bar" data-h="${w.count ? Math.max(4, w.count / max * 100) : 2}"></span><span class="qt-cols__label">${esc(shortDate(w.start))}</span></div>`).join('')}</div>`;
}
export function supportingRows(r, group) {
  const base = group.replace('-value', '');
  const rows = base === 'contacts' ? r.contacts : base === 'overdue' ? r.overdue : base === 'won' ? r.cohort.filter(q => q.outcome === 'won') : r.cohort;
  const title = { contacts: 'Contacts logged', overdue: 'Currently overdue', won: 'Won after a recorded follow-up', cohort: 'Followed-up estimates' }[base];
  if (!rows.length) return `<h3 class="qt-panel__title">${title}</h3><div class="qt-empty qt-empty--sm">${icon('info')}<p>No supporting records in this range. Missing history is not treated as zero past activity.</p></div>`;
  return `<h3 class="qt-panel__title">${title} <span class="qt-count">${rows.length}</span></h3><div class="qt-table-wrap"><table class="qt-table qt-table--compact"><thead><tr><th scope="col">Estimate</th><th scope="col">${base === 'overdue' ? 'Follow-up date' : base === 'contacts' ? 'Contact date' : 'First contact'}</th><th scope="col" class="qt-num">Value</th><th scope="col">${base === 'contacts' ? 'Method' : base === 'overdue' ? 'State' : 'Outcome'}</th></tr></thead><tbody>${rows.map(x => `<tr><td><button class="qt-link" type="button" data-open="${esc(x.estimateId)}">${esc(x.name)}</button><small>${esc(x.estimateId)}${x.origin && x.origin !== 'created' ? ` · ${esc(x.origin)} history` : ''}</small></td><td>${esc(shortDate(x.firstContact || x.date))}</td><td class="qt-num">${money(base === 'won' ? x.wonValue : x.followedValue ?? x.value)}</td><td>${base === 'contacts' ? `<span class="qt-meta">${icon(x.channel)}${esc(x.channel)}</span>` : base === 'overdue' ? '<span class="qt-due qt-due--overdue">Overdue</span>' : `<span class="qt-outcome qt-outcome--${esc(x.outcome)}">${esc({ won: 'Won', lost: 'Lost', open: 'Open', unknown: 'Uncertain' }[x.outcome])}</span>${x.outcomeDate ? `<small>${esc(shortDate(x.outcomeDate))}</small>` : ''}`}</td></tr>`).join('')}</tbody></table></div>`;
}

// ---------- Import preview ----------
const OUTCOME_LABEL = { ready: 'Ready', existing: 'Duplicate · skipped', conflict: 'Existing ID · protected', held: 'Held · conflicting versions', repeat: 'Repeat · skipped', invalid: 'Invalid' };
// `shared` lists warnings that apply to every row; they are shown once in the summary instead.
export function importRowsList(rows, shared = []) {
  return `<ul class="qt-import-rows">${rows.map(r => { const warnings = r.warnings.filter(w => !shared.includes(w));
    return `<li class="qt-import-row qt-import-row--${r.outcome}"><span class="qt-import-row__status">${icon(r.outcome === 'ready' ? 'checkCircle' : r.outcome === 'invalid' ? 'alert' : 'pause')}${esc(OUTCOME_LABEL[r.outcome])}</span><div><strong>${esc(r.quote.customer_name || '(no name)')}</strong><span>Row ${r.row} · ${esc(r.quote.estimate_id || '(no ID)')} · ${esc(r.quote.job_description)}</span>${r.errors.length ? `<small>${esc(r.errors.join('; '))}</small>` : warnings.length ? `<small class="is-warning">${esc(warnings.join('; '))}</small>` : ''}</div><span class="qt-num">${Number.isFinite(r.quote.amount_usd) ? money(r.quote.amount_usd) : '—'}</span></li>`; }).join('')}</ul>`;
}

export const panel = (title, desc, body, { action = '', cls = '', bodyCls = 'qt-panel__body', label = '' } = {}) =>
  `<section class="qt-panel ${cls}" ${label ? `aria-label="${esc(label)}"` : ''}><div class="qt-panel__head"><div><h2 class="qt-panel__title">${title}</h2>${desc ? `<p class="qt-panel__desc">${desc}</p>` : ''}</div>${action}</div>${bodyCls ? `<div class="${bodyCls}">${body}</div>` : body}</section>`;
export const empty = (ic, title, text, action = '') => `<div class="qt-empty">${icon(ic)}<h3>${esc(title)}</h3><p>${esc(text)}</p>${action}</div>`;
