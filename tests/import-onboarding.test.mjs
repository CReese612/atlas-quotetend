// Sprint 4A: onboarding friction found by running synthetic contractor spreadsheets through the import. The rules
// that protect data (required fields, stable IDs, strict opt-out values, never overwriting a saved estimate) are
// unchanged; these tests cover the explanations, suggestions and the optional first follow-up date added on top.
import test from 'node:test';
import assert from 'node:assert/strict';
import { previewImport, exportCSV, importCandidates, recordContact, draftMessage, demoData, addDays, todayISO, FOLLOWUP_FIELDS } from '../domain.js';
import { inspectSpreadsheet, previewSpreadsheet, statusSuggestions } from '../import-mapping.js';

const today = todayISO();
const mdy = iso => { const [y, m, d] = iso.split('-'); return `${m}/${d}/${y}`; };
const sent = addDays(today, -5);
const HEAD = 'Quote ID,Customer,Email,Project,Total,Date,Status,Follow Up,Opt Out,Notes';
const sheetOf = (...rows) => inspectSpreadsheet([HEAD, ...rows].join('\n'));
const base = { dateFormat: 'mdy', statusMap: { Sent: 'sent', Pending: 'sent', Won: 'won', Draft: 'draft' } };
const one = (row, options = base) => { const sheet = sheetOf(row); return previewSpreadsheet(sheet, sheet.mapping, options)[0]; };
const row = (patch = {}) => { const r = { id: 'A-1', name: 'Alex Example', email: 'alex@example.com', job: 'Roof repair', total: '1250', date: mdy(sent), status: 'Sent', next: mdy(addDays(today, 2)), opt: 'no', notes: '', ...patch };
  return [r.id, r.name, r.email, r.job, r.total, r.date, r.status, r.next, r.opt, r.notes].map(v => /[",]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v).join(','); };

test('common contractor headings are suggested; ambiguous ones are left for the owner', () => {
  const sheet = inspectSpreadsheet('Estimate No.,Homeowner,Job Name,Estimate Amount,Date Sent,Stage\nE-1,Alex Example,Roof repair,"$1,250",10/01/2026,Pending');
  for (const [field, i] of [['estimate_id', 0], ['customer_name', 1], ['job_description', 2], ['amount_usd', 3], ['estimate_date', 4], ['status', 5]]) assert.equal(sheet.mapping[field], String(i), field);
  assert.equal(inspectSpreadsheet('ID,Client,Job,Total,Grand Total,Date\nA,B,C,1,1,2026-10-01').mapping.amount_usd, '', 'two amount headings: no guess');
});

test('unambiguous status words are preselected; anything else waits for the owner', () => {
  const sheet = inspectSpreadsheet('ID,Client,Job,Amount,Date,Status\n1,A,J,1,2026-10-01,Pending\n2,A,J,1,2026-10-01,Sold\n3,A,J,1,2026-10-01,Declined\n4,A,J,1,2026-10-01,On Hold\n5,A,J,1,2026-10-01,Lost');
  assert.deepEqual(statusSuggestions(sheet, sheet.mapping), { Pending: 'sent', Sold: 'won', Declined: 'lost', 'On Hold': '', Lost: 'lost' });
});

test('dates: unambiguous separators are read; unreadable dates say why, without a follow-on error', () => {
  const d = sent.split('-');
  assert.equal(one(row({ date: `${d[1]}-${d[2]}-${d[0]}` })).quote.estimate_date, sent, 'dashes with the chosen order');
  assert.equal(one(row({ date: `${d[1]}.${d[2]}.${d[0]}` })).quote.estimate_date, sent, 'dots with the chosen order');
  assert.equal(one(row({ date: `${d[0]}/${d[1]}/${d[2]}` })).quote.estimate_date, sent, 'year first is unambiguous');
  for (const date of ['03/04/2026', '03-04-2026']) {
    assert.equal(one(row({ date }), { ...base, dateFormat: 'dmy' }).quote.estimate_date, '2026-04-03', `${date}: day/month order follows the owner’s choice`);
    assert.equal(one(row({ date }), { ...base, dateFormat: 'mdy' }).quote.estimate_date, '2026-03-04', date);
  }
  const twoDigit = one(row({ date: `${Number(d[1])}/${Number(d[2])}/${d[0].slice(2)}` }));
  assert.deepEqual(twoDigit.errors, [`Estimate date “${Number(d[1])}/${Number(d[2])}/${d[0].slice(2)}” doesn’t match the date format you chose (MM/DD/YYYY, e.g. 10/15/2026). The year has two digits; export four-digit years.`]);
  assert.match(one(row({ date: 'Oct 1, 2026' })).errors.join(' '), /“Oct 1, 2026”.*spelled out/);
  assert.match(one(row({ date: mdy(sent) }), { ...base, dateFormat: 'iso' }).errors.join(' '), /Choose MM\/DD\/YYYY or DD\/MM\/YYYY/);
  assert.match(one(row({ next: 'next week' })).errors.join(' '), /Next follow-up date “next week”/);
});

test('amounts, opt-outs, statuses and blanks are explained with the value from the file; the rules stay strict', () => {
  assert.deepEqual(one(row({ total: '$21k' })).errors, ['Amount “$21k” isn’t a dollar amount QuoteTend can read. Use a number with at most two decimals, such as 1250, 1250.00 or $1,250.00.']);
  assert.deepEqual(one(row({ total: '' })).errors, ['Amount is blank. Every estimate needs its dollar amount.']);
  assert.equal(one(row({ total: '$1,250.50' })).quote.amount_usd, 1250.5);
  assert.deepEqual(one(row({ opt: '' })).errors, ['Opt-out cell is blank. Enter yes or no so a customer’s preference is never guessed.']);
  assert.deepEqual(one(row({ opt: 'Y' })).errors, ['Opt-out value “Y” isn’t recognized. Use yes or no (true/false or 1/0 also work).']);
  assert.match(one(row({ status: 'On Hold' })).errors.join(' '), /Status “On Hold” isn’t matched yet/);
  assert.match(one(row({ job: '' })).errors.join(' '), /Job description is blank/);
});

test('a missing ID column explains how to add stable IDs', () => {
  const sheet = inspectSpreadsheet('Homeowner,Project,Bid,Date\nAlex,Roof,1250,2026-10-01');
  assert.throws(() => previewSpreadsheet(sheet, { ...sheet.mapping, amount_usd: '2' }, { optOutReviewed: true }), /add an ID column there \(E-1001, E-1002 …\) and keep those IDs in later exports/);
});

test('optional first follow-up fills only sent, contactable rows without a date', () => {
  const sheet = sheetOf(row({ id: 'S-1', next: '' }), row({ id: 'S-2' }), row({ id: 'D-1', status: 'Draft', next: '' }), row({ id: 'W-1', status: 'Won', next: '' }),
    row({ id: 'O-1', email: 'optout@example.com', next: '', opt: 'yes' }), row({ id: 'F-1', next: '', date: mdy(addDays(today, 2)) }));
  const first = addDays(today, 1);
  const rows = previewSpreadsheet(sheet, sheet.mapping, { ...base, defaultFollowUp: first });
  const by = id => rows.find(r => r.quote.estimate_id === id).quote;
  assert.equal(by('S-1').next_follow_up_date, first);
  assert.match(rows[0].warnings.join(' '), /first follow-up set to/);
  assert.equal(by('S-2').next_follow_up_date, addDays(today, 2), 'a row with its own date keeps it');
  for (const id of ['D-1', 'W-1', 'O-1']) assert.equal(by(id).next_follow_up_date, '', id);
  assert.equal(by('F-1').next_follow_up_date, '', 'never before the estimate date');
  assert.equal(previewSpreadsheet(sheet, sheet.mapping, base).find(r => r.quote.estimate_id === 'S-1').quote.next_follow_up_date, '', 'blank option keeps Needs a date');
  assert.throws(() => previewSpreadsheet(sheet, sheet.mapping, { ...base, defaultFollowUp: addDays(today, -1) }), /today or a later date/);
});

test('notes that sound like an opt-out are flagged for review but never change the preference', () => {
  const flagged = one(row({ notes: 'Asked us not to call again' }));
  assert.equal(flagged.notesMentionOptOut, true);
  assert.equal(flagged.quote.do_not_contact, false, 'a note is not an opt-out');
  assert.match(flagged.warnings.join(' '), /Notes may describe a contact preference/);
  for (const notes of ['STOP CALLING', 'wants to opt out', 'Pause follow-ups until spring']) assert.equal(one(row({ notes })).notesMentionOptOut, true, notes);
  for (const notes of ['Call after 5pm', 'Prefers text', 'Stop by Tuesday for samples']) assert.equal(one(row({ notes })).notesMentionOptOut, undefined, notes);
  assert.equal(one(row({ notes: 'Do not contact', opt: 'yes' })).notesMentionOptOut, undefined, 'already an opt-out');
});

test('re-import explains protected rows: follow-up activity versus a revised estimate; nothing is overwritten', () => {
  const q = { ...demoData(today)[0], estimate_id: 'R-1', estimate_date: addDays(today, -10), next_follow_up_date: addDays(today, -1) };
  const [saved] = importCandidates(previewImport(exportCSV([q])));
  const worked = recordContact(saved, { date: today, nextDate: addDays(today, 3), note: 'Called', channel: 'Phone' }, today);
  const [behind] = previewImport(exportCSV([q]), [worked]);
  assert.equal(behind.outcome, 'conflict');
  assert.deepEqual(behind.differences.map(d => d.field), ['next_follow_up_date', 'last_contact_date']);
  assert.ok(behind.differences.every(d => FOLLOWUP_FIELDS.includes(d.field)));
  const [revised] = previewImport(exportCSV([{ ...q, amount_usd: 6400 }]), [worked]);
  assert.deepEqual(revised.differences.find(d => d.field === 'amount_usd'), { field: 'amount_usd', file: 6400, saved: worked.amount_usd });
  assert.deepEqual(importCandidates([behind, revised], [worked]), [], 'protected rows never import');
  assert.equal(previewImport(exportCSV([worked]), [worked])[0].differences, undefined, 'exact matches carry no differences');
});

test('draft template reads naturally: whole dollars, names and acronyms kept as typed', () => {
  const q = { ...demoData(today)[0], customer_name: 'Hillcrest Commons HOA', job_description: 'Roof replacement - Building C', amount_usd: 64900 };
  assert.match(draftMessage(q, 'Example Roofing'), /the \$64,900 estimate for roof replacement - Building C\./);
  assert.match(draftMessage({ ...q, amount_usd: 1250.5 }), /\$1,250\.50 estimate/);
  assert.match(draftMessage({ ...q, job_description: 'HOA roof inspection' }), /for HOA roof inspection\./);
});
