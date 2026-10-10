import test from 'node:test';
import assert from 'node:assert/strict';
import { demoData, due, eligible, metrics, normalize, validateEstimate, draftMessage, recordContact, parseCSV, previewImport, exportCSV, CSV_COLUMNS, validDate, addDays } from '../domain.js';

const today = '2026-09-16';
const seed = () => demoData(today);
test('demo has 12 valid fictional estimates, due counts and consistent pipeline totals', () => {
  const quotes = seed();
  assert.equal(quotes.length, 12);
  for (const q of quotes) { assert.deepEqual(validateEstimate(q), []); assert.ok(!q.customer_email || q.customer_email.endsWith('@example.com')); }
  assert.deepEqual(metrics(quotes, today), { openValue: 57650, openCount: 8, dueCount: 4, wonValue: 6850, wonCount: 2, unscheduled: 1 });
});
test('won, lost, draft and opted-out estimates never enter the due queue or draft workflow', () => {
  for (const status of ['won', 'lost', 'draft']) {
    const q = { ...seed()[0], status };
    assert.equal(due(q, today), false); assert.equal(normalize(q).next_follow_up_date, ''); assert.throws(() => draftMessage(q));
  }
  const q = { ...seed()[0], do_not_contact: true };
  assert.equal(eligible(q), false); assert.equal(due(q, today), false); assert.throws(() => draftMessage(q));
});
test('missing email is visible work, not automatically disqualified from phone follow-up', () => { assert.equal(due(seed()[3], today), true); assert.equal(seed()[3].customer_email, ''); });
test('contact records history, schedules next step, and exits the due queue', () => {
  const q = seed()[0];
  const changed = recordContact(q, { date: today, nextDate: '2026-09-19', note: 'Asked about prep', channel: 'Phone' }, today);
  assert.equal(changed.history.length, 2); assert.equal(changed.last_contact_date, today); assert.equal(due(changed, today), false); assert.equal(q.history.length, 1);
});
test('contact rejects impossible chronology and opted-out records', () => {
  const q = seed()[0], contact = { date: today, nextDate: '2026-09-19', note: '', channel: 'Email' };
  for (const date of ['2026-09-17', '2026-08-01', 'bad']) assert.throws(() => recordContact(q, { ...contact, date }, today));
  assert.throws(() => recordContact(q, { ...contact, nextDate: today }, today));
  assert.throws(() => recordContact({ ...q, do_not_contact: true }, contact, today));
});
test('CSV round trips commas, quotes, CRLF and multiline notes', () => {
  const q = { ...seed()[0], notes: 'Owner said, "Blue, please."\r\nSecond line' };
  const rows = previewImport(exportCSV([q]));
  assert.deepEqual(rows[0].errors, []); assert.equal(rows[0].quote.notes, q.notes); assert.equal(rows[0].quote.amount_usd, q.amount_usd);
});
test('import skips duplicate IDs within file and against existing data, case-insensitively', () => {
  const [a, b] = seed();
  const rows = previewImport(exportCSV([a, { ...a, estimate_id: a.estimate_id.toLowerCase() }, b]), [b]);
  assert.equal(rows.filter(r => !r.errors.length).length, 1);
  assert.match(rows[1].errors.join(), /Duplicate/); assert.match(rows[2].errors.join(), /Duplicate/);
});
test('invalid row cannot poison a later valid row with the same ID', () => {
  const q = seed()[0];
  const rows = previewImport(exportCSV([{ ...q, customer_name: '' }, q]));
  assert.ok(rows[0].errors.length); assert.deepEqual(rows[1].errors, []);
});
test('CSV import rejects invalid dates, money, status, email and booleans', () => {
  for (const patch of [{ estimate_date: '2026-02-30' }, { amount_usd: '' }, { amount_usd: -1 }, { amount_usd: '1e3' }, { amount_usd: '5.123' }, { status: 'pending' }, { customer_email: 'not-email' }, { do_not_contact: 'perhaps' }]) {
    assert.ok(previewImport(exportCSV([{ ...seed()[0], ...patch }]))[0].errors.length, JSON.stringify(patch));
  }
});
test('CSV fails safely on malformed quotes, header duplicates and missing columns', () => {
  assert.throws(() => parseCSV('a,b\n"unclosed'));
  assert.throws(() => parseCSV('a,b\n"hi"junk,b'));
  assert.throws(() => previewImport('customer_name\nTest'));
  assert.throws(() => previewImport([...CSV_COLUMNS, 'notes'].join(',')));
  assert.throws(() => previewImport(''));
});
test('closed and opted-out CSV rows have dates cleared with a warning', () => {
  const rows = previewImport(exportCSV([{ ...seed()[0], status: 'won' }]));
  assert.equal(rows[0].quote.next_follow_up_date, ''); assert.equal(rows[0].warnings.length, 1);
});
test('CSV neutralizes spreadsheet formula cells', () => {
  // Locate columns by header: optional detail columns follow notes in schema 3 exports.
  const column = name => CSV_COLUMNS.indexOf(name);
  for (const notes of ['=HYPERLINK("bad")', '+cmd', '-cmd', '@SUM(A1)', ' \t=1+1']) {
    assert.ok(parseCSV(exportCSV([{ ...seed()[0], notes }]))[1][column('notes')].startsWith("'"));
    for (const field of ['customer_phone', 'address', 'trade']) assert.ok(parseCSV(exportCSV([{ ...seed()[0], [field]: notes }]))[1][column(field)].startsWith("'"), field);
  }
});
test('draft generation never mutates estimate or contact history', () => {
  const q = seed()[0], before = JSON.stringify(q); const draft = draftMessage(q);
  assert.match(draft, /Mara/); assert.match(draft, /6,800/); assert.equal(JSON.stringify(q), before);
});
test('calendar math crosses month/year boundaries without UTC local-date drift', () => {
  assert.equal(addDays('2026-12-31', 1), '2027-01-01'); assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(validDate('2026-02-29'), false); assert.equal(validDate('2028-02-29'), true);
});
