export const STATUSES = ['draft', 'sent', 'won', 'lost'];
export const CSV_COLUMNS = ['estimate_id', 'customer_name', 'customer_email', 'job_description', 'amount_usd', 'estimate_date', 'status', 'next_follow_up_date', 'last_contact_date', 'do_not_contact', 'notes'];
export const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export function addDays(date, days) { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
export function validDate(value) { if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false; const d = new Date(`${value}T12:00:00Z`); return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value; }
export const emailKey = email => String(email || '').trim().toLowerCase();
export function optOutSources(q, quotes = [q]) {
  const email = emailKey(q.customer_email);
  return quotes.filter(other => other.do_not_contact && (other.estimate_id === q.estimate_id || email && emailKey(other.customer_email) === email));
}
export const eligible = (q, quotes = [q]) => q.status === 'sent' && !q.do_not_contact && optOutSources(q, quotes).length === 0;
export const due = (q, today = todayISO(), quotes = [q]) => eligible(q, quotes) && !!q.next_follow_up_date && q.next_follow_up_date <= today;
export function normalizeWorkspace(quotes) {
  return quotes.map(q => ({ ...normalize(q), next_follow_up_date: eligible(q, quotes) ? q.next_follow_up_date || '' : '' }));
}
export function validateEstimate(q) {
  const errors = [];
  if (!q || typeof q !== 'object' || Array.isArray(q)) return ['Estimate must be an object'];
  for (const key of CSV_COLUMNS.filter(k => !['amount_usd', 'do_not_contact'].includes(k))) {
    if (typeof q[key] !== 'string') errors.push(`${key.replaceAll('_', ' ')} must be text`);
  }
  for (const key of ['estimate_id', 'customer_name', 'job_description']) if (!String(q[key] || '').trim()) errors.push(`${key.replaceAll('_', ' ')} is required`);
  if (!Number.isFinite(q.amount_usd) || q.amount_usd < 0 || q.amount_usd > 999999999.99 || Math.abs(q.amount_usd * 100 - Math.round(q.amount_usd * 100)) > 0.00001) errors.push('Amount must be between 0 and 999,999,999.99 with at most two decimal places');
  if (!STATUSES.includes(q.status)) errors.push('Status must be draft, sent, won, or lost');
  if (!validDate(q.estimate_date)) errors.push('Estimate date must be a valid ISO date (YYYY-MM-DD)');
  for (const k of ['next_follow_up_date', 'last_contact_date']) if (q[k] && !validDate(q[k])) errors.push(`${k.replaceAll('_', ' ')} must be a valid ISO date`);
  if (validDate(q.next_follow_up_date) && q.next_follow_up_date < q.estimate_date) errors.push('Follow-up date cannot precede the estimate date');
  if (validDate(q.last_contact_date) && q.last_contact_date < q.estimate_date) errors.push('Last contact date cannot precede the estimate date');
  if (q.customer_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(q.customer_email)) errors.push('Email address is invalid');
  if (typeof q.do_not_contact !== 'boolean') errors.push('Do not contact must be true or false');
  for (const k of CSV_COLUMNS) if (typeof q[k] === 'string' && q[k].length > 10000) errors.push(`${k} is too long`);
  return errors;
}
export function normalize(q) { return { ...q, next_follow_up_date: eligible(q) ? q.next_follow_up_date || '' : '', history: q.history || [], saved_draft: q.saved_draft || '' }; }
export function parseBackup(text) {
  if (typeof text !== 'string' || text.length > 5_000_000) throw new Error('Backup must be smaller than 5 MB.');
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('The backup is not valid JSON.'); }
  if (!data || data.version !== 1 || !Array.isArray(data.quotes)) throw new Error('Choose a QuoteTend v1 backup.');
  const seen = new Set();
  for (const [index, q] of data.quotes.entries()) {
    const errors = validateEstimate(q);
    if (errors.length) throw new Error(`Estimate ${index + 1}: ${errors.join('; ')}.`);
    if (typeof q.saved_draft !== 'string' || q.saved_draft.length > 10000) throw new Error(`Estimate ${index + 1}: invalid saved draft.`);
    if (!Array.isArray(q.history) || q.history.some(h => !h || typeof h.text !== 'string' || h.text.length > 10000 || typeof h.type !== 'string' || typeof h.at !== 'string' || !validDate(h.at.slice(0, 10)) || !Number.isFinite(Date.parse(h.at)) || h.date !== undefined && !validDate(h.date))) throw new Error(`Estimate ${index + 1}: invalid activity history.`);
    const id = q.estimate_id.trim().toLowerCase();
    if (seen.has(id)) throw new Error(`Duplicate estimate ID: ${q.estimate_id}.`);
    seen.add(id);
  }
  return normalizeWorkspace(data.quotes.map(q => ({ ...q, estimate_id: q.estimate_id.trim() })));
}
export function metrics(quotes, today = todayISO()) {
  const open = quotes.filter(q => q.status === 'sent');
  const won = quotes.filter(q => q.status === 'won');
  return { openValue: open.reduce((s, q) => s + q.amount_usd, 0), openCount: open.length, dueCount: quotes.filter(q => due(q, today, quotes)).length, wonValue: won.reduce((s, q) => s + q.amount_usd, 0), wonCount: won.length, unscheduled: quotes.filter(q => eligible(q, quotes) && !q.next_follow_up_date).length };
}
export function draftMessage(q, company = 'Brush & Pine Painting', quotes = [q]) {
  if (!eligible(q, quotes)) throw new Error('Follow-up drafts are only available for sent estimates without an estimate or shared-email opt-out.');
  const amount = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(q.amount_usd);
  return `Hi ${q.customer_name.split(' ')[0]},\n\nI wanted to check in on the ${amount} estimate for ${q.job_description.toLowerCase()}. Have you had a chance to look it over?\n\nIf you have any questions or would like to discuss next steps, just let me know. Happy to help.\n\nThanks,\n${company}`;
}
export function recordContact(q, { date, nextDate, note, channel }, today = todayISO(), quotes = [q]) {
  if (!eligible(q, quotes)) throw new Error('Contact logging is paused for this estimate or shared email.');
  if (!validDate(date) || date > today || date < q.estimate_date) throw new Error('Contact date must fall between the estimate date and today.');
  if (!validDate(nextDate) || nextDate <= date) throw new Error('Choose a next follow-up date after the contact date.');
  if (!['Email', 'Phone', 'Text', 'Other'].includes(channel)) throw new Error('Choose a contact method.');
  return { ...q, last_contact_date: [q.last_contact_date || '', date].sort().at(-1), next_follow_up_date: nextDate, history: [...q.history, { type: 'contact', at: new Date().toISOString(), date, text: `${channel} contact recorded${note.trim() ? ` — ${note.trim()}` : ''}` }] };
}
// RFC 4180-style parser: handles quoted commas, escaped quotes, CRLF and multiline notes.
export function parseCSV(text) {
  text = text.replace(/^\uFEFF/, '');
  if (text.length > 2_000_000) throw new Error('Use a CSV smaller than 2 MB.');
  const rows = []; let row = [], field = '', quoted = false, closed = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else { quoted = false; closed = true; } } else field += c; }
    else if (c === '"') { if (field || closed) throw new Error('Unexpected quote in CSV. Wrap the whole field in quotes.'); quoted = true; }
    else if (c === ',') { row.push(field); field = ''; closed = false; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(field); if (row.some(v => v !== '')) rows.push(row); row = []; field = ''; closed = false; }
    else { if (closed) throw new Error('Unexpected text after a closing CSV quote.'); field += c; }
  }
  if (quoted) throw new Error('Unclosed quoted field in CSV.');
  row.push(field); if (row.some(v => v !== '')) rows.push(row);
  if (!rows.length) throw new Error('The CSV is empty.');
  if (rows.length > 5001) throw new Error('Import up to 5,000 estimates at a time.');
  return rows;
}
export function previewImport(text, existing = []) {
  const [header, ...rows] = parseCSV(text); const columns = header.map(h => h.trim());
  if (new Set(columns).size !== columns.length) throw new Error('CSV contains duplicate column names.');
  const missing = CSV_COLUMNS.filter(c => !columns.includes(c));
  if (missing.length) throw new Error(`Missing columns: ${missing.join(', ')}.`);
  const result = rows.map((r, index) => {
    const raw = Object.fromEntries(columns.map((c, i) => [c, (r[i] || '').trim()]));
    const bool = raw.do_not_contact.toLowerCase();
    const q = { ...Object.fromEntries(CSV_COLUMNS.map(k => [k, raw[k]])), amount_usd: raw.amount_usd === '' ? NaN : Number(raw.amount_usd), do_not_contact: bool === 'true' ? true : bool === 'false' ? false : null, history: [] };
    const errors = validateEstimate(q);
    if (r.length !== columns.length) errors.push('Column count does not match header');
    if (!/^\d+(\.\d{1,2})?$/.test(raw.amount_usd)) errors.push('Amount must be a plain USD number, e.g. 1250.00');
    const warnings = [];
    if (!q.customer_email) warnings.push('No email address');
    if (!eligible(q) && q.next_follow_up_date) warnings.push('Follow-up date will be cleared for draft, closed, or opted-out estimate');
    return { row: index + 2, quote: normalize(q), original: q, errors, warnings, outcome: errors.length ? 'invalid' : 'ready' };
  });
  const signature = q => JSON.stringify(CSV_COLUMNS.map(k => k === 'estimate_id' ? q[k].trim().toLowerCase() : typeof q[k] === 'string' ? q[k].trim() : q[k]));
  const key = q => q.estimate_id.trim().toLowerCase();
  const groups = new Map();
  for (const r of result.filter(r => !r.errors.length)) { const id = key(r.quote); if (!groups.has(id)) groups.set(id, []); groups.get(id).push(r); }
  const saved = new Map(existing.map(q => [key(q), q]));
  for (const [id, group] of groups) {
    const old = saved.get(id);
    const hasConflict = new Set(group.map(r => signature(r.original))).size > 1;
    for (const [index, row] of group.entries()) {
      if (old) {
        const same = signature(normalize(row.original)) === signature(normalize(old));
        row.outcome = same ? 'existing' : 'conflict';
        row.errors.push(same ? 'Duplicate estimate ID — exact existing match; skipped' : 'Duplicate estimate ID — conflicts with an existing estimate; nothing overwritten');
      } else if (hasConflict) {
        row.outcome = 'held'; row.errors.push('Conflicting versions of this estimate ID in this file — all versions held. Correct the source file and preview again.');
      } else if (index > 0) {
        row.outcome = 'repeat'; row.errors.push('Duplicate estimate ID — identical repeated row; only one copy will import');
      }
    }
  }
  const future = [...existing, ...result.filter(r => !r.errors.length).map(r => r.quote)];
  for (const row of result.filter(r => !r.errors.length)) {
    const sources = optOutSources(row.quote, future);
    if (sources.length && !row.quote.do_not_contact) row.warnings.push(`Shared-email opt-out from ${sources.map(q => q.estimate_id).join(', ')}: follow-ups and drafts will be paused`);
  }
  return result;
}
// A rejected preference must not disappear while other rows are committed.
// Existing or accepted opt-outs already preserve the preference for that email.
export function importOptOutBlockers(rows, existing = []) {
  const future = [...existing, ...rows.filter(r => !r.errors.length).map(r => r.quote)];
  const retained = new Set(future.filter(q => q.do_not_contact).map(q => emailKey(q.customer_email)));
  return rows.filter(r => {
    const q = r.original || r.quote, email = emailKey(q.customer_email);
    return r.errors.length && q.do_not_contact === true && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !retained.has(email);
  }).map(r => {
    const email = emailKey((r.original || r.quote).customer_email);
    return { row: r.row, email, estimate_id: r.quote.estimate_id,
      affectedIds: future.filter(q => emailKey(q.customer_email) === email).map(q => q.estimate_id) };
  });
}
export function importCandidates(rows, existing = []) {
  if (importOptOutBlockers(rows, existing).length) throw new Error('Import blocked: review opt-outs on rejected or conflicting rows before importing. No data has changed.');
  const seen = new Set(existing.map(q => q.estimate_id.trim().toLowerCase()));
  return rows.filter(r => !r.errors.length && !seen.has(r.quote.estimate_id.trim().toLowerCase())).map(r => r.quote);
}
const safeCell = value => {
  let s = String(value ?? '');
  // Prefix spreadsheet formulas with a literal apostrophe. CSV is for transfer, not execution.
  if (/^[\s]*[=+@-]/.test(s) || /^[\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replaceAll('"', '""')}"`;
};
export const exportCSV = quotes => '\uFEFF' + [CSV_COLUMNS.join(','), ...quotes.map(q => CSV_COLUMNS.map(k => safeCell(q[k])).join(','))].join('\r\n');
export function demoData(today = todayISO()) {
  const seeds = [
    ['QT-1001', 'Mara Ellis', 'mara.ellis@example.com', 'Exterior repaint · two-story home', 6800, -18, 'sent', -4, false, 'Warm white siding with sage trim. Asked about the prep process.'],
    ['QT-1002', 'Theo Bennett', 'theo.bennett@example.com', 'Kitchen cabinet refinishing', 4250, -12, 'sent', -2, false, 'Considering a satin finish.'],
    ['QT-1003', 'Nina Parker', 'nina.parker@example.com', 'Living room & hallway refresh', 2350, -8, 'sent', 0, false, 'Walls and ceilings; customer will move furniture.'],
    ['QT-1004', 'Owen Brooks', '', 'Deck staining & sealing', 1800, -7, 'sent', 0, false, 'No email on file. Use the demo phone conversation workflow.'],
    ['QT-1005', 'Lena Foster', 'lena.foster@example.com', 'Full interior · three-bedroom home', 9400, -5, 'sent', 2, false, 'Prefers low-odor paint.'],
    ['QT-1006', 'Eli Sutton', 'eli.sutton@example.com', 'Garage & workshop repaint', 3100, -4, 'sent', 4, false, 'Two colors, including a durable workshop finish.'],
    ['QT-1007', 'Iris Lane', 'iris.lane@example.com', 'Front door & entryway', 950, -3, 'draft', null, false, 'Confirm final color before sharing the estimate.'],
    ['QT-1008', 'Caleb Reed', 'caleb.reed@example.com', 'Bedroom repaint', 1650, -21, 'won', null, false, 'Customer accepted. Schedule agreed separately.'],
    ['QT-1009', 'Ada Morgan', 'ada.morgan@example.com', 'Exterior trim restoration', 5200, -24, 'won', null, false, 'Accepted after discussing surface preparation.'],
    ['QT-1010', 'Finn Avery', 'finn.avery@example.com', 'Fence staining', 2200, -20, 'lost', null, false, 'Customer decided to postpone the project.'],
    ['QT-1011', 'June Rowan', 'june.rowan@example.com', 'Home office repaint', 1450, -15, 'sent', null, true, 'Customer requested no more follow-ups.'],
    ['QT-1012', 'Maple House Studio', 'studio@example.com', 'Commercial studio repaint', 28500, -6, 'sent', null, false, 'Owner said, "Let’s review the timeline, then the colors."']
  ];
  return seeds.map(([estimate_id, customer_name, customer_email, job_description, amount_usd, age, status, next, do_not_contact, notes]) => ({ estimate_id, customer_name, customer_email, job_description, amount_usd, estimate_date: addDays(today, age), status, next_follow_up_date: next === null ? '' : addDays(today, next), last_contact_date: '', do_not_contact, notes, saved_draft: '', history: [{ type: 'created', at: `${addDays(today, age)}T12:00:00`, text: 'Fictional demo estimate added' }] }));
}
