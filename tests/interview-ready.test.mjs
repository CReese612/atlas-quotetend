import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { previewImport, exportCSV, eligible, due, metrics, demoData, normalizeWorkspace, draftMessage, recordContact, parseBackup, optOutSources } from '../domain.js';
import { inspectSpreadsheet, previewSpreadsheet } from '../import-mapping.js';
const fixture = name => readFile(new URL(`../Grok Bot Research & Product Testing/${name}`, import.meta.url), 'utf8');
const valid = rows => rows.filter(r => !r.errors.length).map(r => r.quote);
const today = '2026-09-16';

test('Grok conflicts: all inconsistent rows held, repeats distinguished, existing closed/opted-out untouched', async () => {
  const seed = valid(previewImport(await fixture('seed-existing_GrokBot_2.csv')));
  const before = JSON.stringify(seed);
  const preview = previewImport(await fixture('estimates-conflicts_GrokBot_2.csv'), seed);
  assert.deepEqual(valid(preview).map(q => q.estimate_id), ['EST-C001', 'EST-C003', 'EST-C004']);
  assert.deepEqual(Object.fromEntries(['ready', 'held', 'repeat', 'conflict', 'existing'].map(s => [s, preview.filter(r => r.outcome === s).length])), { ready: 3, held: 2, repeat: 1, conflict: 3, existing: 1 });
  assert.equal(JSON.stringify(seed), before);
  const workspace = normalizeWorkspace([...seed, ...valid(preview)]);
  const sibling = workspace.find(q => q.estimate_id === 'EST-S005');
  assert.equal(eligible(sibling, workspace), false);
  assert.equal(sibling.next_follow_up_date, '');
  assert.equal(workspace.find(q => q.estimate_id === 'EST-S001').status, 'won');
  assert.equal(workspace.find(q => q.estimate_id === 'EST-S002').status, 'lost');
  assert.equal(workspace.find(q => q.estimate_id === 'EST-S003').do_not_contact, true);
});
test('Grok valid and invalid files meet exact counts and frozen-date queue rules', async () => {
  const rows = previewImport(await fixture('estimates-valid_GrokBot_2.csv'));
  const quotes = valid(rows);
  assert.equal(quotes.length, 10);
  assert.deepEqual(quotes.filter(q => due(q, today, quotes)).map(q => q.estimate_id), ['EST-V001', 'EST-V003', 'EST-V007']);
  assert.equal(previewImport(await fixture('estimates-valid_GrokBot_2.csv'), quotes).filter(r => r.outcome === 'existing').length, 10);
  const invalid = previewImport(await fixture('estimates-invalid_GrokBot_2.csv'));
  assert.equal(invalid.filter(r => r.outcome === 'invalid').length, 7);
  assert.equal(valid(invalid).length, 0);
});
test('within-file conflicts are order-independent, including different opt-out flags', () => {
  const q = demoData(today)[0], changed = { ...q, do_not_contact: true };
  for (const records of [[q, changed], [changed, q]]) {
    const rows = previewImport(exportCSV(records));
    assert.equal(valid(rows).length, 0); assert.ok(rows.every(r => r.outcome === 'held'));
  }
});
test('same email blocks draft/contact/queue/metrics even when the opt-out source is closed', () => {
  const a = demoData(today)[0], b = { ...a, estimate_id: 'SECOND', customer_email: '  MARA.ELLIS@example.com ', status: 'won', do_not_contact: true };
  const workspace = [a, b];
  assert.equal(due(a, today, workspace), false);
  assert.equal(metrics(workspace, today).dueCount, 0);
  assert.equal(metrics(workspace, today).unscheduled, 0);
  assert.throws(() => draftMessage(a, undefined, workspace));
  assert.throws(() => recordContact(a, { date: today, nextDate: '2026-09-20', note: '', channel: 'Phone' }, today, workspace));
  assert.deepEqual(optOutSources(a, workspace).map(q => q.estimate_id), ['SECOND']);
});
test('blank email, shared name, and similar email never create false cross-record blocks', () => {
  const a = { ...demoData(today)[0], customer_email: '' };
  const b = { ...a, estimate_id: 'SECOND', do_not_contact: true };
  assert.equal(eligible(a, [a, b]), true);
  assert.equal(eligible(a, [a, { ...b, customer_email: 'different@example.com' }]), true);
});
test('backup restores shared suppression and lifting last block never restores old dates', () => {
  const a = demoData(today)[0], b = { ...a, estimate_id: 'SECOND', do_not_contact: true };
  const restored = parseBackup(JSON.stringify({ version: 1, quotes: [a, b] }));
  assert.equal(restored[0].next_follow_up_date, '');
  const lifted = normalizeWorkspace(restored.map(q => ({ ...q, do_not_contact: false })));
  assert.equal(eligible(lifted[0], lifted), true); assert.equal(lifted[0].next_follow_up_date, '');
});
test('new rows matching an existing email opt-out get an explicit preview warning', () => {
  const a = demoData(today)[0], old = { ...a, estimate_id: 'OLD', do_not_contact: true };
  const rows = previewImport(exportCSV([a]), [old]);
  assert.match(rows[0].warnings.join(' '), /Shared-email opt-out from OLD/);
});
const simpleCSV = 'Quote ID,Customer,Email,Project,Total,Date,State,Follow Up,Opt Out\nM-1,Jamie Demo,jamie@example.com,Hallway,"$1,250.50",09/16/2026,Awaiting,09/19/2026,no';
test('mapping handles familiar headers, explicit status, US dates and formatted USD', () => {
  const sheet = inspectSpreadsheet(simpleCSV), mapping = { ...sheet.mapping, status: '6' };
  const rows = previewSpreadsheet(sheet, mapping, { dateFormat: 'mdy', statusMap: { Awaiting: 'sent' } });
  assert.equal(valid(rows).length, 1);
  assert.equal(rows[0].quote.amount_usd, 1250.50); assert.equal(rows[0].quote.estimate_date, today);
  assert.equal(rows[0].quote.next_follow_up_date, '2026-09-19'); assert.equal(rows[0].quote.do_not_contact, false);
});
test('missing optional fields use draft/blank defaults and require missing-opt-out review', () => {
  const sheet = inspectSpreadsheet('ID,Client,Job,Amount,Date\nA-1,Alex Demo,Kitchen,800,2026-09-16');
  assert.throws(() => previewSpreadsheet(sheet, sheet.mapping), /opt-out/);
  const rows = previewSpreadsheet(sheet, sheet.mapping, { optOutReviewed: true });
  assert.equal(valid(rows).length, 1); assert.equal(rows[0].quote.status, 'draft'); assert.equal(rows[0].quote.customer_email, '');
});
test('missing required columns and reused mapping columns fail before import', () => {
  const sheet = inspectSpreadsheet(simpleCSV);
  assert.throws(() => previewSpreadsheet(sheet, { ...sheet.mapping, estimate_id: '' }), /Estimate ID/);
  assert.throws(() => previewSpreadsheet(sheet, { ...sheet.mapping, customer_name: sheet.mapping.estimate_id }), /only once/);
});
test('date format is explicit: EU parsing differs from US; invalid dates still fail', () => {
  const sheet = inspectSpreadsheet('ID,Client,Job,Amount,Date\nA-1,Alex Demo,Kitchen,800,03/04/2026');
  const opts = { optOutReviewed: true };
  assert.equal(previewSpreadsheet(sheet, sheet.mapping, { ...opts, dateFormat: 'mdy' })[0].quote.estimate_date, '2026-03-04');
  assert.equal(previewSpreadsheet(sheet, sheet.mapping, { ...opts, dateFormat: 'dmy' })[0].quote.estimate_date, '2026-04-03');
  assert.ok(previewSpreadsheet(sheet, sheet.mapping, opts)[0].errors.length);
});
test('malformed column counts and duplicate normalized headings cannot import silently', () => {
  assert.throws(() => inspectSpreadsheet('ID,id\n1,2'), /unique/);
  const sheet = inspectSpreadsheet('ID,Client,Job,Amount,Date\nA-1,Alex Demo,Kitchen,800,2026-09-16,extra');
  assert.throws(() => previewSpreadsheet(sheet, sheet.mapping, { optOutReviewed: true }), /fields/);
});
test('mapped import rejects unknown statuses/opt-out values and ambiguous amounts', () => {
  const sheet = inspectSpreadsheet(simpleCSV), mapping = { ...sheet.mapping, status: '6' };
  assert.ok(previewSpreadsheet(sheet, mapping, { dateFormat: 'mdy' })[0].errors.length);
  for (const csv of [simpleCSV.replace(',no', ',maybe'), simpleCSV.replace('$1,250.50', '1,25.50')]) {
    const changed = inspectSpreadsheet(csv);
    assert.ok(previewSpreadsheet(changed, { ...changed.mapping, status: '6' }, { dateFormat: 'mdy', statusMap: { Awaiting: 'sent' } })[0].errors.length);
  }
});
