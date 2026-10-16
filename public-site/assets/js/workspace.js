// Fictional workspace for the public QuoteTend demo and homepage previews.
// Pure data and logic only (no DOM). Field names and rules mirror the private application's
// domain.js, results.js and import-mapping.js; tests/public-site.test.mjs cross-checks the
// results against those modules so the public demo cannot drift from real product semantics.

export const COMPANY = Object.freeze({ name: 'Fernbrook Roofing & Exteriors', short: 'Fernbrook', initials: 'FR' });
export const STORAGE_KEY = 'quotetend.public-demo.v2';
export const STATE_VERSION = 2;
export const TRADES = ['Roofing', 'Siding', 'Windows & doors', 'Gutters', 'Exterior remodel'];
export const CHANNELS = ['Email', 'Phone', 'Text', 'Other'];

// ---------- Dates (local calendar dates, matching domain.js) ----------
export const todayISO = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export function addDays(date, days) { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
export function validDate(value) { if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false; const d = new Date(`${value}T12:00:00Z`); return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value; }
export const daysBetween = (from, to) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000);

// ---------- Fictional seed records ----------
// [id, customer, email, phone, street, trade, job, amount, ageDays, status, nextOffset, doNotContact, notes, contacts, outcome]
// contacts: [daysAgo, channel, note]; outcome: [daysAgo, status]. Phone numbers use the reserved 555-01xx range.
const SEEDS = [
  ['FR-2318', 'Dana Whitfield', 'dana.whitfield@example.com', '555-0142', 'Linden Ave', 'Roofing', 'Roof replacement · 32 sq architectural shingles', 21480, 16, 'sent', -6, false,
    'Wants ice & water shield on all eaves. Collecting two other bids and asked about a two-week install window.', [[13, 'Email', 'Sent estimate PDF and shingle color samples']]],
  ['FR-2321', 'Marcus & Elena Ruiz', 'ruiz.household@example.com', '555-0117', 'Chestnut Ridge Rd', 'Siding', 'Fiber-cement siding · full wrap with trim', 38750, 12, 'sent', -3, false,
    'Comparing Iron Gray and Aged Pewter. Needs HOA design approval before signing.', [[9, 'Phone', 'Walked through both color palettes; HOA meets next week']]],
  ['FR-2314', 'Kevin O’Neill', 'kevin.oneill@example.com', '555-0168', 'Sycamore Ct', 'Roofing', 'Roof replacement · 26 sq with ridge vent upgrade', 16950, 19, 'sent', -2, false,
    'Windstorm claim open after a fallen limb. Adjuster revisit pending; wants the ridge vent upgrade either way.', [[15, 'Text', 'Confirmed he received the estimate'], [8, 'Phone', 'Waiting on the adjuster’s second visit']]],
  ['FR-2325', 'Priya Nandakumar', 'priya.n@example.com', '555-0133', 'Briarwood Ln', 'Windows & doors', 'Window replacement · 14 double-hung, vinyl Low-E', 17960, 9, 'sent', -1, false,
    'Asked about financing options and whether winter installation is possible.', []],
  ['FR-2327', 'Tom Becker', 'tom.becker@example.com', '555-0151', 'Ash Hollow Dr', 'Roofing', 'Storm-damage roof repair · insurance scope', 8240, 7, 'sent', 0, false,
    'Adjuster approved the scope. Reviewing his deductible before scheduling.', [[3, 'Phone', 'Adjuster approved scope; reviewing deductible']]],
  ['FR-2329', 'Grace Okafor', 'grace.okafor@example.com', '555-0186', 'Meadowlark St', 'Gutters', 'Seamless 6" gutters + guards · 180 lf', 4380, 6, 'sent', 0, false,
    'Interested in matching downspouts to new trim color.', []],
  ['FR-2316', 'Jasmine Turner', 'jasmine.turner@example.com', '555-0124', 'Willow Bend', 'Windows & doors', 'Window replacement · 8 fiberglass units', 11480, 18, 'sent', 1, false,
    'Wants to see a sample unit before deciding.', [[11, 'Email', 'Answered questions about lead times'], [4, 'Phone', 'Asked to see a sample unit']]],
  ['FR-2330', 'Hillcrest Commons HOA', 'board@hillcrest-commons.example.com', '555-0109', 'Hillcrest Commons, Bldg C', 'Roofing', 'Roof replacement · Building C, 4 units', 64900, 5, 'sent', 2, false,
    'Board reviews three bids at Thursday’s meeting. Contact: board treasurer.', [[2, 'Email', 'Board meets Thursday to review bids']]],
  ['FR-2331', 'Ben Castillo', 'ben.castillo@example.com', '555-0175', 'Orchard Way', 'Windows & doors', 'Entry door + sidelites · fiberglass', 6150, 4, 'sent', 3, false,
    'Prefers a Saturday install.', []],
  ['FR-2333', 'Hannah Lindqvist', 'hannah.lindqvist@example.com', '555-0193', 'Fox Run', 'Siding', 'Vinyl siding replacement · two elevations', 14620, 3, 'sent', 4, false,
    'Matching existing siding on the garage.', []],
  ['FR-2334', 'Samuel Oyelaran', 'samuel.o@example.com', '555-0138', 'Stonegate Dr', 'Roofing', 'Standing-seam metal roof · 28 sq', 46300, 2, 'sent', 5, false,
    'Comparing metal against architectural shingles. Asked for a color sample board.', []],
  ['FR-2312', 'Rachel Kim', 'rachel.kim@example.com', '555-0161', 'Juniper Pl', 'Roofing', 'Skylight replacement + flashing · 2 units', 3890, 24, 'sent', null, false,
    'Traveling this month. Said she will call back when she returns.', [[20, 'Phone', 'Will call back after vacation']]],
  ['FR-2309', 'Douglas Pratt', 'doug.pratt@example.com', '555-0102', 'Kingsley Ave', 'Exterior remodel', 'Soffit & fascia replacement · aluminum', 7425, 28, 'sent', null, false,
    'Needs a follow-up date after the color decision.', []],
  ['FR-2310', 'Sofia Delgado', 'sofia.delgado@example.com', '555-0129', 'Pinecrest Rd', 'Siding', 'Storm-damage siding repair · north wall', 5870, 21, 'sent', null, true,
    'Asked us to pause follow-ups while she works with her insurer.', [[17, 'Phone', 'Asked us to pause follow-ups']]],
  ['FR-2336', 'Leah Moreno', 'leah.moreno@example.com', '555-0146', 'Cedar Glen', 'Windows & doors', 'Bay window + 6 casements', 22840, 1, 'draft', null, false,
    'Final measurements on Friday before the estimate is shared.', []],
  ['FR-2337', 'Victor Hale', 'victor.hale@example.com', '555-0157', 'Lakeshore Dr', 'Exterior remodel', 'Exterior package · siding, windows and entry door', 71200, 0, 'draft', null, false,
    'Scope review with the owner before sharing.', []],
  ['FR-2301', 'Olivia Grant', 'olivia.grant@example.com', '555-0114', 'Magnolia Ct', 'Roofing', 'Roof replacement · 30 sq architectural shingles', 18900, 34, 'won', null, false,
    'Accepted. Install scheduled separately.', [[30, 'Email', 'Shared warranty details'], [24, 'Phone', 'Approved; wants to start after the 15th']], [23, 'won']],
  ['FR-2304', 'Nathan Brooks', 'nathan.brooks@example.com', '555-0181', 'Elm Terrace', 'Siding', 'Fiber-cement siding · front elevation + trim', 16480, 31, 'won', null, false,
    'Signed on site after reviewing trim samples.', [[26, 'Phone', 'Reviewed trim samples'], [12, 'Phone', 'Signed contract on site']], [12, 'won']],
  ['FR-2306', 'Chloe Ramsey', 'chloe.ramsey@example.com', '555-0122', 'Birch Hollow', 'Windows & doors', 'Window replacement · 9 units', 13275, 29, 'won', null, false,
    'Accepted; deposit arranged directly with the office.', [[22, 'Email', 'Sent revised quote with grilles'], [6, 'Text', 'Accepted revised quote']], [5, 'won']],
  ['FR-2302', 'Ian Fletcher', 'ian.fletcher@example.com', '555-0198', 'Harbor View', 'Roofing', 'Chimney flashing repair', 2640, 33, 'won', null, false,
    'Accepted on the spot during the inspection.', [], [30, 'won']],
  ['FR-2303', 'Megan Walsh', 'megan.walsh@example.com', '555-0165', 'Quarry Rd', 'Gutters', 'Gutter replacement · 140 lf', 3150, 32, 'lost', null, false,
    'Chose another contractor.', [[27, 'Phone', 'Comparing two quotes']], [20, 'lost']],
  ['FR-2307', 'Aaron Patel', 'aaron.patel@example.com', '555-0139', 'Bramble Ln', 'Roofing', 'Roof replacement · 24 sq', 24600, 26, 'lost', null, false,
    'Postponed the project until spring.', [[21, 'Email', 'Sent financing information'], [9, 'Phone', 'Postponing to spring']], [8, 'lost']]
];

// Sample spreadsheet export used by the demo's import screen. Dates are generated relative to
// today in M/D/YYYY format, the way many spreadsheets export them.
const IMPORT_ROWS = [
  ['FR-2340', 'Monica Reyes', 'monica.reyes@example.com', 'Roof replacement · 22 sq', '$15,860.00', -2, 'Sent', 2],
  ['FR-2341', 'Andre Wallace', 'andre.wallace@example.com', 'Seamless gutters · 150 lf', '$3,725.00', -1, 'Sent', 3],
  ['FR-2342', 'Lucy Tran', 'lucy.tran@example.com', 'Window replacement · 6 units', '$9,480.00', -3, 'Sent', null],
  ['FR-2318', 'Dana Whitfield', 'dana.whitfield@example.com', 'Roof replacement · 32 sq', '$21,480.00', -16, 'Sent', 1],
  ['FR-2343', 'Paul Henley', 'paul.henley@example.com', 'Siding repair · east wall', '', -1, 'Sent', 4]
];
const mdy = iso => { const [y, m, d] = iso.split('-'); return `${Number(m)}/${Number(d)}/${y}`; };
export function sampleImportCSV(today = todayISO()) {
  const cell = v => /[",\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v;
  const lines = ['Quote #,Client,Email,Project,Total,Date Issued,Quote Status,Follow Up'];
  for (const [id, name, email, job, total, age, status, next] of IMPORT_ROWS) {
    lines.push([id, name, email, job, total, mdy(addDays(today, age)), status, next === null ? '' : mdy(addDays(today, next))].map(cell).join(','));
  }
  return lines.join('\r\n');
}

// ---------- Workspace creation ----------
const at = (date, time) => `${date}T${time}`;
export function createWorkspace(today = todayISO()) {
  const startedAt = at(addDays(today, -60), '08:00:00');
  const quotes = [], identities = [], pending = [];
  SEEDS.forEach(([estimate_id, customer_name, customer_email, customer_phone, address, trade, job_description, amount_usd, age, status, next, do_not_contact, notes, contacts, outcome], index) => {
    const estimate_date = addDays(today, -age);
    const recordId = `rec-${estimate_id.toLowerCase()}`;
    identities.push({ estimateId: estimate_id, recordId, origin: 'created' });
    pending.push({ date: estimate_date, order: 0, index, type: 'estimate_created', estimate_id, recordId, data: { amount: amount_usd, status: status === 'draft' ? 'draft' : 'sent' } });
    for (const [ago, channel, note] of contacts) pending.push({ date: addDays(today, -ago), order: 1, index, type: 'contact_logged', estimate_id, recordId, data: { channel, amount: amount_usd, note } });
    if (do_not_contact) pending.push({ date: addDays(today, -(contacts.at(-1)?.[0] ?? age) + 3), order: 2, index, type: 'opted_out', estimate_id, recordId, data: {} });
    if (outcome) pending.push({ date: addDays(today, -outcome[0]), order: 2, index, type: 'status_changed', estimate_id, recordId, data: { before: { status: 'sent', amount: amount_usd }, after: { status: outcome[1], amount: amount_usd } } });
    const lastContact = contacts.length ? addDays(today, -Math.min(...contacts.map(c => c[0]))) : '';
    quotes.push({ estimate_id, customer_name, customer_email, customer_phone, address, trade, job_description, amount_usd, estimate_date, status,
      next_follow_up_date: next === null ? '' : addDays(today, next), last_contact_date: lastContact, do_not_contact, notes, saved_draft: '', history: [] });
  });
  pending.sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order || a.index - b.index);
  const events = pending.map((p, i) => ({ id: `evt-${String(i + 1).padStart(4, '0')}`, type: p.type, recordId: p.recordId, estimateId: p.estimate_id,
    epoch: 1, sequence: i + 1, effectiveDate: p.date, recordedAt: at(p.date, `${String(9 + (i % 8)).padStart(2, '0')}:${String((i * 17) % 60).padStart(2, '0')}:00`), data: p.data }));
  for (const e of events) quotes.find(q => q.estimate_id === e.estimateId).history.push(historyFor(e));
  return { version: STATE_VERSION, seededOn: today, startedAt, epoch: 1, sequence: events.length, quotes, events, identities, importedSample: false };
}

function historyFor(e) {
  const text = {
    estimate_created: 'Estimate added',
    contact_logged: `${e.data.channel} contact recorded${e.data.note ? ` — ${e.data.note}` : ''}`,
    status_changed: `Estimate marked ${e.data.after?.status}`,
    opted_out: 'Customer opted out; follow-ups stopped',
    imported: 'Estimate imported from CSV',
    followup_scheduled: `Next follow-up set for ${e.data?.date || 'a new date'}`
  }[e.type] || 'Updated';
  const type = { estimate_created: 'created', contact_logged: 'contact', status_changed: 'outcome', opted_out: 'optout', imported: 'import' }[e.type] || 'update';
  return { type, at: e.recordedAt, date: e.effectiveDate, text };
}

// Validate stored state shape before trusting it; anything unexpected falls back to a fresh seed.
export function restoreWorkspace(raw, today = todayISO()) {
  try {
    const s = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!s || s.version !== STATE_VERSION || !Array.isArray(s.quotes) || !Array.isArray(s.events) || !Array.isArray(s.identities)) return null;
    if (s.quotes.some(q => typeof q?.estimate_id !== 'string' || typeof q.amount_usd !== 'number' || !Array.isArray(q.history))) return null;
    return s;
  } catch { return null; }
}

// ---------- Domain rules (mirror domain.js) ----------
export const emailKey = email => String(email || '').trim().toLowerCase();
export function optOutSources(q, quotes = [q]) {
  const email = emailKey(q.customer_email);
  return quotes.filter(o => o.do_not_contact && (o.estimate_id === q.estimate_id || (email && emailKey(o.customer_email) === email)));
}
export const eligible = (q, quotes = [q]) => q.status === 'sent' && !q.do_not_contact && optOutSources(q, quotes).length === 0;
export const due = (q, today = todayISO(), quotes = [q]) => eligible(q, quotes) && !!q.next_follow_up_date && q.next_follow_up_date <= today;

export function metrics(quotes, today = todayISO()) {
  const open = quotes.filter(q => q.status === 'sent');
  const won = quotes.filter(q => q.status === 'won');
  return { openValue: open.reduce((s, q) => s + q.amount_usd, 0), openCount: open.length, dueCount: quotes.filter(q => due(q, today, quotes)).length,
    wonValue: won.reduce((s, q) => s + q.amount_usd, 0), wonCount: won.length, unscheduled: quotes.filter(q => eligible(q, quotes) && !q.next_follow_up_date).length };
}

// Where an estimate sits in the follow-up workflow.
export function followupState(q, today = todayISO(), quotes = [q]) {
  if (q.status === 'draft') return 'draft';
  if (q.status === 'won' || q.status === 'lost') return 'closed';
  if (!eligible(q, quotes)) return 'paused';
  if (!q.next_follow_up_date) return 'unscheduled';
  if (q.next_follow_up_date < today) return 'overdue';
  if (q.next_follow_up_date === today) return 'today';
  return 'upcoming';
}

// Queues match the private app: Due & overdue, Upcoming, Needs a date. Sent + eligible only.
export function queues(quotes, today = todayISO()) {
  const candidates = quotes.filter(q => eligible(q, quotes));
  const byDate = (a, b) => a.next_follow_up_date.localeCompare(b.next_follow_up_date) || b.amount_usd - a.amount_usd;
  return {
    due: candidates.filter(q => due(q, today, quotes)).sort(byDate),
    upcoming: candidates.filter(q => q.next_follow_up_date > today).sort(byDate),
    unscheduled: candidates.filter(q => !q.next_follow_up_date).sort((a, b) => a.estimate_date.localeCompare(b.estimate_date))
  };
}

// Open (sent) value by follow-up state. Sums to metrics().openValue.
export function pipelineByState(quotes, today = todayISO()) {
  const keys = ['overdue', 'today', 'upcoming', 'unscheduled', 'paused'];
  const out = Object.fromEntries(keys.map(k => [k, { count: 0, value: 0 }]));
  for (const q of quotes.filter(q => q.status === 'sent')) { const s = followupState(q, today, quotes); out[s].count++; out[s].value += q.amount_usd; }
  return out;
}

export function ageBuckets(quotes, today = todayISO()) {
  const buckets = [['0–7 days', 0, 7], ['8–14 days', 8, 14], ['15–30 days', 15, 30], ['31+ days', 31, Infinity]].map(([label, min, max]) => ({ label, min, max, count: 0, value: 0 }));
  for (const q of quotes.filter(q => q.status === 'sent')) {
    const age = daysBetween(q.estimate_date, today);
    const b = buckets.find(b => age >= b.min && age <= b.max); b.count++; b.value += q.amount_usd;
  }
  return buckets;
}

export function statusTotals(quotes) {
  const out = Object.fromEntries(['draft', 'sent', 'won', 'lost'].map(s => [s, { count: 0, value: 0 }]));
  for (const q of quotes) { out[q.status].count++; out[q.status].value += q.amount_usd; }
  return out;
}

// Same template as domain.js draftMessage, signed by the fictional company.
export function draftMessage(q, company = COMPANY.name, quotes = [q]) {
  if (!eligible(q, quotes)) throw new Error('Follow-up drafts are only available for sent estimates without an estimate or shared-email opt-out.');
  const amount = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: Number.isInteger(q.amount_usd) ? 0 : 2, maximumFractionDigits: 2 }).format(q.amount_usd);
  const job = q.job_description.trim().replace(/^[A-Z](?=[a-z])/, c => c.toLowerCase());
  return `Hi ${q.customer_name.split(' ')[0]},\n\nI wanted to check in on the ${amount} estimate for ${job}. Have you had a chance to look it over?\n\nIf you have any questions or would like to discuss next steps, just let me know. Happy to help.\n\nThanks,\n${company}`;
}

// ---------- Commands (return a new workspace; never mutate the input) ----------
const find = (state, id) => {
  const q = state.quotes.find(x => x.estimate_id === id);
  if (!q) throw new Error('That estimate no longer exists in this demo.');
  return q;
};
function append(state, id, type, effectiveDate, data, patch) {
  const q = find(state, id);
  const sequence = state.sequence + 1;
  const event = { id: `evt-${String(sequence).padStart(4, '0')}`, type, recordId: state.identities.find(i => i.estimateId === id)?.recordId || `rec-${id.toLowerCase()}`,
    estimateId: id, epoch: state.epoch, sequence, effectiveDate, recordedAt: new Date().toISOString(), data };
  const next = { ...q, ...patch, history: [...q.history, historyFor(event)] };
  return { ...state, sequence, events: [...state.events, event], quotes: state.quotes.map(x => x.estimate_id === id ? next : x) };
}

export function saveDraft(state, id, text) {
  if (typeof text !== 'string' || text.length > 10000) throw new Error('Drafts must be under 10,000 characters.');
  return { ...state, quotes: state.quotes.map(q => q.estimate_id === id ? { ...q, saved_draft: text } : q) };
}

// Schedule or move the next follow-up without logging a contact (the private app's estimate edit).
export function setFollowUp(state, id, date, today = todayISO()) {
  const q = find(state, id);
  if (!eligible(q, state.quotes)) throw new Error('Follow-up dates are only available for sent estimates without an opt-out.');
  if (!validDate(date) || date < q.estimate_date) throw new Error('Choose a follow-up date on or after the estimate date.');
  if (date < today) throw new Error('Choose today or a future date for the next follow-up.');
  return append(state, id, 'followup_scheduled', today, { date }, { next_follow_up_date: date });
}

// Validation identical to domain.js recordContact.
export function recordContact(state, id, { date, nextDate, note = '', channel }, today = todayISO()) {
  const q = find(state, id);
  if (!eligible(q, state.quotes)) throw new Error('Contact logging is paused for this estimate or shared email.');
  if (!validDate(date) || date > today || date < q.estimate_date) throw new Error('Contact date must fall between the estimate date and today.');
  if (!validDate(nextDate) || nextDate <= date) throw new Error('Choose a next follow-up date after the contact date.');
  if (!CHANNELS.includes(channel)) throw new Error('Choose a contact method.');
  return append(state, id, 'contact_logged', date, { channel, amount: q.amount_usd, note: note.trim() },
    { last_contact_date: [q.last_contact_date || '', date].sort().at(-1), next_follow_up_date: nextDate });
}

// Mark won/lost (clears the follow-up date) or record an opt-out, as the private app does.
export function recordOutcome(state, id, outcome, today = todayISO()) {
  const q = find(state, id);
  if (outcome === 'optout') {
    if (q.do_not_contact) throw new Error('Follow-ups are already stopped for this estimate.');
    const next = append(state, id, 'opted_out', today, {}, { do_not_contact: true, next_follow_up_date: '' });
    // Shared-email estimates leave the queues too, and their dates are cleared.
    const email = emailKey(q.customer_email);
    return email ? { ...next, quotes: next.quotes.map(x => emailKey(x.customer_email) === email ? { ...x, next_follow_up_date: '' } : x) } : next;
  }
  if (!['won', 'lost'].includes(outcome)) throw new Error('Choose won or lost.');
  if (q.status === outcome) throw new Error(`This estimate is already marked ${outcome}.`);
  return append(state, id, 'status_changed', today, { before: { status: q.status, amount: q.amount_usd }, after: { status: outcome, amount: q.amount_usd } },
    { status: outcome, next_follow_up_date: '' });
}

// ---------- Follow-up Results (port of results.js followupResults) ----------
export function contactEvidence(events) {
  const rows = new Map(events.filter(e => e.type === 'contact_logged').map(e => [e.id, { ...e, data: { ...e.data }, voided: false }]));
  for (const e of events.filter(e => e.type === 'contact_corrected')) {
    const row = rows.get(e.data.eventId); if (!row || row.recordId !== e.recordId) continue;
    row.effectiveDate = e.data.after.date; row.data.channel = e.data.after.channel; row.voided = e.data.after.voided; row.correctedAt = e.recordedAt;
  }
  return [...rows.values()];
}

export function followupResults({ quotes, events, identities, startedAt, epoch }, from, to, today) {
  if (!validDate(from) || !validDate(to) || from > to || to > today) throw new Error('Choose a valid date range ending no later than today.');
  const inRange = date => date >= from && date <= to;
  const current = new Map(quotes.map(q => [q.estimate_id.toLowerCase(), q]));
  const active = events.filter(e => e.epoch === epoch);
  const contacts = contactEvidence(active).filter(e => !e.voided);
  const contactRows = contacts.filter(e => inRange(e.effectiveDate)).map(e => ({ estimateId: e.estimateId, eventId: e.id,
    name: current.get(e.estimateId.toLowerCase())?.customer_name || e.estimateId, date: e.effectiveDate, channel: e.data.channel, value: e.data.amount, recordedAt: e.recordedAt }));
  const cohort = [];
  for (const identity of identities) {
    const q = current.get(identity.estimateId.toLowerCase()); if (!q) continue;
    const own = active.filter(e => e.recordId === identity.recordId);
    const ownContacts = contacts.filter(e => e.recordId === identity.recordId).sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate) || a.sequence - b.sequence);
    const first = ownContacts[0]; if (!first || !inRange(first.effectiveDate)) continue;
    const transitions = own.filter(e => ['status_changed', 'outcome_corrected'].includes(e.type));
    const last = transitions.at(-1);
    const qualifying = last && ownContacts.some(c => c.sequence < (last.data.outcomeSequence || last.sequence) && c.effectiveDate <= last.effectiveDate);
    const known = last && last.data.after.status === q.status;
    const outcome = ['won', 'lost'].includes(q.status) ? (known && qualifying ? q.status : 'unknown') : 'open';
    cohort.push({ estimateId: q.estimate_id, recordId: identity.recordId, name: q.customer_name, firstContact: first.effectiveDate,
      followedValue: first.data.amount, outcome, outcomeDate: known ? last.effectiveDate : '', wonValue: outcome === 'won' ? last.data.after.amount : 0, origin: identity.origin });
  }
  const overdue = quotes.filter(q => eligible(q, quotes) && q.next_follow_up_date && q.next_follow_up_date < today)
    .map(q => ({ estimateId: q.estimate_id, name: q.customer_name, date: q.next_follow_up_date, value: q.amount_usd }));
  const sum = (rows, key) => rows.reduce((t, r) => t + Math.round(r[key] * 100), 0) / 100;
  const won = cohort.filter(r => r.outcome === 'won');
  return { from, to, asOf: today, startedAt, epoch, contacts: contactRows, cohort, overdue,
    counts: { contacts: contactRows.length, followed: cohort.length, won: won.length, lost: cohort.filter(r => r.outcome === 'lost').length,
      open: cohort.filter(r => r.outcome === 'open').length, unknown: cohort.filter(r => r.outcome === 'unknown').length },
    values: { followed: sum(cohort, 'followedValue'), won: sum(won, 'wonValue'), overdue: sum(overdue, 'value') },
    incomplete: identities.filter(i => i.origin !== 'created' && current.has(i.estimateId.toLowerCase())).length };
}

export function resultsForRange(state, days, today = todayISO()) {
  const from = [addDays(today, -(days - 1)), state.startedAt.slice(0, 10)].sort().at(-1);
  return followupResults(state, from, today, today);
}

// Contacts per week for the last N weeks (newest last), for the reporting chart.
export function weeklyContacts(state, weeks = 8, today = todayISO()) {
  const contacts = contactEvidence(state.events.filter(e => e.epoch === state.epoch)).filter(e => !e.voided);
  return Array.from({ length: weeks }, (_, i) => {
    const end = addDays(today, -7 * (weeks - 1 - i)), start = addDays(end, -6);
    return { start, end, count: contacts.filter(c => c.effectiveDate >= start && c.effectiveDate <= end).length };
  });
}

// Follow-up activity only (contacts, outcomes, opt-outs, imports, scheduling), newest first.
export function recentActivity(state, limit = 8) {
  const names = new Map(state.quotes.map(q => [q.estimate_id, q]));
  return [...state.events].sort((a, b) => b.sequence - a.sequence).filter(e => names.has(e.estimateId) && e.type !== 'estimate_created').slice(0, limit)
    .map(e => ({ ...historyFor(e), estimateId: e.estimateId, name: names.get(e.estimateId).customer_name, eventType: e.type, data: e.data }));
}

// ---------- Search and filtering ----------
export function filterEstimates(quotes, { query = '', status = 'all', followup = 'any', trade = 'all', sort = 'followup' } = {}, today = todayISO()) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const rank = { overdue: 0, today: 1, upcoming: 2, unscheduled: 3, paused: 4, draft: 5, closed: 6 };
  const list = quotes.filter(q => {
    const hay = `${q.estimate_id} ${q.customer_name} ${q.job_description} ${q.trade} ${q.address} ${q.customer_email}`.toLowerCase();
    if (terms.some(t => !hay.includes(t))) return false;
    if (status !== 'all' && q.status !== status) return false;
    if (trade !== 'all' && q.trade !== trade) return false;
    if (followup === 'due') return due(q, today, quotes);
    if (followup !== 'any' && followupState(q, today, quotes) !== followup) return false;
    return true;
  });
  const sorters = {
    followup: (a, b) => rank[followupState(a, today, quotes)] - rank[followupState(b, today, quotes)] || (a.next_follow_up_date || '9').localeCompare(b.next_follow_up_date || '9') || b.amount_usd - a.amount_usd,
    value: (a, b) => b.amount_usd - a.amount_usd,
    newest: (a, b) => b.estimate_date.localeCompare(a.estimate_date) || b.estimate_id.localeCompare(a.estimate_id),
    oldest: (a, b) => a.estimate_date.localeCompare(b.estimate_date)
  };
  return list.sort(sorters[sort] || sorters.followup);
}

// ---------- CSV onboarding (subset of import-mapping.js for the sample file) ----------
export const FIELD_LABELS = { estimate_id: 'Estimate ID', customer_name: 'Customer name', customer_email: 'Email', job_description: 'Job description', amount_usd: 'Amount (USD)',
  estimate_date: 'Estimate date', status: 'Status', next_follow_up_date: 'Next follow-up date', last_contact_date: 'Last contact date', do_not_contact: 'Do not contact', notes: 'Notes' };
const ALIASES = {
  estimate_id: ['estimate id', 'quote id', 'quote number', 'estimate number', 'estimate invoice #', 'estimate #', 'quote #', 'id'],
  customer_name: ['customer name', 'client name', 'customer', 'client', 'name'],
  customer_email: ['customer email', 'client email', 'client email address', 'email', 'email address'],
  job_description: ['job description', 'job', 'description', 'title', 'project', 'project description'],
  amount_usd: ['amount usd', 'amount', 'total', 'quote total', 'estimate total'],
  estimate_date: ['estimate date', 'quote date', 'date issued', 'date'],
  status: ['status', 'quote status', 'estimate status'],
  next_follow_up_date: ['next follow up date', 'follow up date', 'next follow up', 'follow up'],
  last_contact_date: ['last contact date', 'last contact'],
  do_not_contact: ['do not contact', 'opt out', 'opted out', 'dnc'], notes: ['notes', 'note']
};
const headerKey = s => s.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');

export function parseCSV(text) {
  text = text.replace(/^﻿/, '');
  const rows = []; let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; } else field += c; }
    else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(field); if (row.some(v => v !== '')) rows.push(row); row = []; field = ''; }
    else field += c;
  }
  row.push(field); if (row.some(v => v !== '')) rows.push(row);
  return rows;
}

export function matchColumns(headers) {
  return Object.fromEntries(Object.keys(FIELD_LABELS).map(k => {
    const matches = headers.map((h, i) => ALIASES[k].includes(headerKey(h)) ? i : -1).filter(i => i >= 0);
    return [k, matches.length === 1 ? matches[0] : -1];
  }));
}

const convertDate = v => { const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v); return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : v; };
const convertAmount = v => /^\$?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(v) ? v.replace(/[$,]/g, '') : v;
const STATUS_MAP = { sent: 'sent', draft: 'draft', won: 'won', accepted: 'won', lost: 'lost', declined: 'lost' };

// Preview with the sample's settings: M/D/YYYY dates, "Sent" mapped to sent, no opt-out column (reviewed).
// Outcomes use the private import vocabulary: ready, existing, conflict, held, repeat, invalid.
export function previewImport(csv, existing = []) {
  const [headers, ...rows] = parseCSV(csv);
  const mapping = matchColumns(headers);
  const canonical = ['estimate_id', 'customer_name', 'customer_email', 'job_description', 'amount_usd', 'estimate_date', 'status', 'next_follow_up_date', 'last_contact_date', 'do_not_contact', 'notes'];
  const result = rows.map((r, index) => {
    const get = k => mapping[k] < 0 ? '' : String(r[mapping[k]] ?? '').trim();
    const rawAmount = convertAmount(get('amount_usd'));
    const q = { estimate_id: get('estimate_id'), customer_name: get('customer_name'), customer_email: get('customer_email'), job_description: get('job_description'),
      amount_usd: rawAmount === '' ? NaN : Number(rawAmount), estimate_date: convertDate(get('estimate_date')), status: STATUS_MAP[get('status').toLowerCase()] || get('status'),
      next_follow_up_date: convertDate(get('next_follow_up_date')), last_contact_date: convertDate(get('last_contact_date')), do_not_contact: false, notes: get('notes') };
    const errors = [];
    for (const k of ['estimate_id', 'customer_name', 'job_description']) if (!q[k]) errors.push(`${k.replaceAll('_', ' ')} is required`);
    if (!/^\d+(\.\d{1,2})?$/.test(rawAmount)) errors.push('Amount must be a plain USD number, e.g. 1250.00');
    if (!['draft', 'sent', 'won', 'lost'].includes(q.status)) errors.push('Status must be draft, sent, won, or lost');
    if (!validDate(q.estimate_date)) errors.push('Estimate date must be a valid ISO date (YYYY-MM-DD)');
    if (q.next_follow_up_date && !validDate(q.next_follow_up_date)) errors.push('next follow up date must be a valid ISO date');
    if (validDate(q.next_follow_up_date) && q.next_follow_up_date < q.estimate_date) errors.push('Follow-up date cannot precede the estimate date');
    if (q.status !== 'sent' && q.next_follow_up_date) q.next_follow_up_date = '';
    const warnings = ['No opt-out column provided; existing shared-email blocks still apply'];
    if (q.status === 'sent' && !q.next_follow_up_date) warnings.push('No follow-up date: schedule it from Needs a date');
    return { row: index + 2, quote: q, errors, warnings, outcome: errors.length ? 'invalid' : 'ready' };
  });
  const key = q => q.estimate_id.trim().toLowerCase();
  const signature = q => JSON.stringify(canonical.map(k => k === 'estimate_id' ? key(q) : typeof q[k] === 'string' ? q[k].trim() : q[k]));
  const saved = new Map(existing.map(q => [key(q), q]));
  const groups = new Map();
  for (const r of result.filter(r => !r.errors.length)) { const id = key(r.quote); if (!groups.has(id)) groups.set(id, []); groups.get(id).push(r); }
  for (const [id, group] of groups) {
    const old = saved.get(id);
    const conflict = new Set(group.map(r => signature(r.quote))).size > 1;
    group.forEach((row, i) => {
      if (old) {
        const same = signature(row.quote) === signature({ ...old, next_follow_up_date: old.next_follow_up_date || '' });
        row.outcome = same ? 'existing' : 'conflict';
        row.errors.push(same ? 'Duplicate estimate ID — exact existing match; skipped' : 'Duplicate estimate ID — conflicts with an existing estimate; nothing overwritten');
      } else if (conflict) { row.outcome = 'held'; row.errors.push('Conflicting versions of this estimate ID in this file — all versions held.'); }
      else if (i > 0) { row.outcome = 'repeat'; row.errors.push('Duplicate estimate ID — identical repeated row; only one copy will import'); }
    });
  }
  return { headers, mapping, rows: result, ready: result.filter(r => r.outcome === 'ready') };
}

export function importReady(state, preview, today = todayISO()) {
  const taken = new Set(state.quotes.map(q => q.estimate_id.toLowerCase()));
  const rows = preview.ready.filter(r => !taken.has(r.quote.estimate_id.toLowerCase()));
  let next = { ...state, importedSample: true };
  for (const r of rows) {
    const q = r.quote;
    const trade = /roof/i.test(q.job_description) ? 'Roofing' : /gutter/i.test(q.job_description) ? 'Gutters' : /window|door/i.test(q.job_description) ? 'Windows & doors' : /siding/i.test(q.job_description) ? 'Siding' : 'Exterior remodel';
    const recordId = `rec-${q.estimate_id.toLowerCase()}`;
    next = { ...next, identities: [...next.identities, { estimateId: q.estimate_id, recordId, origin: 'imported' }],
      quotes: [...next.quotes, { ...q, customer_phone: '', address: '', trade, last_contact_date: '', saved_draft: '', history: [] }] };
    next = append(next, q.estimate_id, 'imported', today, { amount: q.amount_usd }, {});
  }
  return { state: next, imported: rows.length };
}
