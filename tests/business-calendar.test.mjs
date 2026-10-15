// Sprint 3A.1: one explicit business calendar (America/Los_Angeles) for the whole product.
// Every instant below is frozen, so results never depend on the real clock, and the file is run under four process time
// zones by business-calendar-matrix.test.mjs. The same fictional Oregon business must get the same business day,
// reporting start, due/overdue state, effective dates and report ranges whatever zone the server or browser runs in.
import './helpers/set-timezone.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import * as D from '../domain.js';
import { contactsPerWeek, weeklyCoverage } from '../results.js';
import { openAccounts } from '../account-store.mjs';
import * as H from './helpers/security-harness.mjs';

if (process.env.QUOTETEND_TEST_TZ) test(`the process really runs in ${process.env.QUOTETEND_TEST_TZ} (the matrix is real)`, () => {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  assert.ok(zone === process.env.QUOTETEND_TEST_TZ || process.env.QUOTETEND_TEST_TZ === 'UTC', zone);
  // Offsets prove it independently of the zone name: Los Angeles -420, Chicago -300 (both PDT/CDT in October), UTC 0, Kiritimati +840.
  const expected = { 'America/Los_Angeles': 420, 'America/Chicago': 300, UTC: 0, 'Pacific/Kiritimati': -840 }[process.env.QUOTETEND_TEST_TZ];
  if (expected !== undefined) assert.equal(new Date('2026-10-14T05:30:00Z').getTimezoneOffset(), expected);
});

// [label, UTC instant, Oregon business day]
const INSTANTS = [
  ['Pacific winter evening', '2026-12-15T03:30:00.000Z', '2026-12-14'],
  ['Pacific summer evening', '2026-07-15T05:30:00.000Z', '2026-07-14'],
  ['one millisecond before Pacific midnight (PDT)', '2026-10-14T06:59:59.999Z', '2026-10-13'],
  ['Pacific midnight (PDT)', '2026-10-14T07:00:00.000Z', '2026-10-14'],
  ['one millisecond before Pacific midnight (PST)', '2026-12-15T07:59:59.999Z', '2026-12-14'],
  ['Pacific midnight (PST)', '2026-12-15T08:00:00.000Z', '2026-12-15'],
  ['Chicago is already tomorrow, Oregon is still today', '2026-10-14T05:30:00.000Z', '2026-10-13'],
  ['UTC midnight (summer)', '2026-07-15T00:00:00.000Z', '2026-07-14'],
  ['UTC midnight (winter)', '2026-12-15T00:00:00.000Z', '2026-12-14'],
  ['spring forward: last millisecond of Mar 7 (PST)', '2026-03-08T07:59:59.999Z', '2026-03-07'],
  ['spring forward: midnight Mar 8 (PST)', '2026-03-08T08:00:00.000Z', '2026-03-08'],
  ['spring forward: 01:59:59 PST', '2026-03-08T09:59:59.000Z', '2026-03-08'],
  ['spring forward: 03:00 PDT (02:00 never happens)', '2026-03-08T10:00:00.000Z', '2026-03-08'],
  ['spring forward: last millisecond of the 23-hour Mar 8', '2026-03-09T06:59:59.999Z', '2026-03-08'],
  ['spring forward: midnight Mar 9 (PDT)', '2026-03-09T07:00:00.000Z', '2026-03-09'],
  ['fall back: last millisecond of Oct 31 (PDT)', '2026-11-01T06:59:59.999Z', '2026-10-31'],
  ['fall back: midnight Nov 1 (PDT)', '2026-11-01T07:00:00.000Z', '2026-11-01'],
  ['fall back: 01:30 PDT (first pass)', '2026-11-01T08:30:00.000Z', '2026-11-01'],
  ['fall back: 01:30 PST (repeated hour)', '2026-11-01T09:30:00.000Z', '2026-11-01'],
  ['fall back: last millisecond of the 25-hour Nov 1', '2026-11-02T07:59:59.999Z', '2026-11-01'],
  ['fall back: midnight Nov 2 (PST)', '2026-11-02T08:00:00.000Z', '2026-11-02'],
];
const freeze = (t, iso) => t.mock.timers.enable({ apis: ['Date'], now: Date.parse(iso) });

test('the business calendar is America/Los_Angeles and an instant maps to its Oregon day', () => {
  assert.equal(D.BUSINESS_TIME_ZONE, 'America/Los_Angeles');
  for (const [label, iso, day] of INSTANTS) {
    assert.equal(D.businessDateOf(iso), day, label);
    assert.equal(D.businessDateOf(new Date(iso)), day, label + ' (Date)');
    assert.equal(D.businessDateOf(Date.parse(iso)), day, label + ' (epoch ms)');
  }
  assert.equal(D.businessDateOf('2026-10-14T05:30:00.000Z', 'America/Chicago'), '2026-10-14', 'other IANA zones remain possible later');
  assert.equal(D.businessDateOf('2026-10-14T05:30:00.000Z', 'Pacific/Kiritimati'), '2026-10-14');
  for (const bad of ['', 'not a date', NaN, null, undefined, {}, [], Infinity]) assert.throws(() => D.businessDateOf(bad), /instant|date/i, String(bad));
});

test('owner-entered civil dates pass through untouched, in every zone', () => {
  for (const civil of ['2026-03-08', '2026-11-01', '2026-12-31', '2028-02-29']) assert.equal(D.businessDateOf(civil), civil);
  assert.equal(weeklyCoverage([{ start: '2026-10-01', end: '2026-10-07', count: 1 }, { start: '2026-10-08', end: '2026-10-14', count: 0 }], '2026-10-13', d => '<' + d + '>').text.match(/began (<[^>]+>)/)[1], '<2026-10-13>');
});

test('todayISO is the Oregon business day at every frozen instant', t => {
  for (const [label, iso, day] of INSTANTS) { freeze(t, iso); assert.equal(D.todayISO(), day, label); t.mock.timers.reset(); }
});

test('date arithmetic on civil dates never shifts across daylight-saving changes', () => {
  assert.deepEqual([D.addDays('2026-03-07', 1), D.addDays('2026-03-07', 2), D.addDays('2026-03-08', 1), D.addDays('2026-03-09', -2)], ['2026-03-08', '2026-03-09', '2026-03-09', '2026-03-07']);
  assert.deepEqual([D.addDays('2026-10-31', 1), D.addDays('2026-11-01', 1), D.addDays('2026-11-02', -2)], ['2026-11-01', '2026-11-02', '2026-10-31']);
  assert.equal(D.daysBetween('2026-03-07', '2026-03-09'), 2); assert.equal(D.daysBetween('2026-10-31', '2026-11-02'), 2); assert.equal(D.daysBetween('2026-01-01', '2027-01-01'), 365);
  for (const d of ['2026-03-08', '2026-11-01']) assert.ok(D.validDate(d));
  assert.equal(D.validDate('2026-02-29'), false);
});

test('due, overdue and queues use the Oregon day when Chicago and UTC are already tomorrow', t => {
  freeze(t, '2026-10-14T05:30:00.000Z'); // 22:30 Oct 13 in Oregon, 00:30 Oct 14 in Chicago, 05:30 Oct 14 UTC
  const q = (id, next) => ({ ...D.demoData()[0], estimate_id: id, status: 'sent', do_not_contact: false, estimate_date: '2026-09-01', next_follow_up_date: next, customer_email: id.toLowerCase() + '@example.com' });
  const quotes = [q('YESTERDAY', '2026-10-12'), q('TODAY', '2026-10-13'), q('TOMORROW', '2026-10-14'), q('NONE', '')];
  assert.deepEqual(quotes.map(x => D.followupState(x, undefined, quotes)), ['overdue', 'today', 'upcoming', 'unscheduled'], 'default "today" is the Oregon day');
  const queue = D.queues(quotes);
  assert.deepEqual(queue.due.map(x => x.estimate_id), ['YESTERDAY', 'TODAY']);
  assert.deepEqual(queue.upcoming.map(x => x.estimate_id), ['TOMORROW']);
  assert.equal(D.metrics(quotes).dueCount, 2);
  assert.deepEqual(D.pipelineByState(quotes).overdue.count, 1);
});

test('the reporting period start is shown as the Oregon day it began on', t => {
  for (const [label, iso, day] of INSTANTS) {
    const weeks = contactsPerWeek([{ date: D.addDays(day, -30) }], day), note = weeklyCoverage(weeks, iso, d => '<' + d + '>');
    assert.match(note.text, new RegExp(`began <${day}>`), label);
  }
  // Nothing was recorded before the period began: a period that began on the 13th (Oregon) must not call today's contact backdated.
  const day = '2026-10-13', weeks = contactsPerWeek([{ date: day }, { date: D.addDays(day, -30) }], day);
  const note = weeklyCoverage(weeks, '2026-10-14T05:30:00.000Z');
  assert.equal(note.kind, 'backdated'); assert.match(note.text, /show only the 1 contact you entered with earlier dates/, 'only the 30-day-old contact is backdated; today\'s is inside the period');
});

function ledgerFixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'quotetend-calendar-test-')), store = openAccounts(join(dir, 'accounts.sqlite'));
  t.after(() => { store.close(); if (dirname(dir) === tmpdir() && basename(dir).startsWith('quotetend-calendar-test-')) rmSync(dir, { recursive: true, force: true }); });
  const owner = store.createOwner('oregon-owner@example.com', 'not-a-login-fixture', 'Fictional Oregon Roofing');
  const command = (kind, args = {}) => store.command(owner, { kind, requestId: crypto.randomUUID(), revision: store.workspace(owner.business_id).revision, ...args });
  return { store, owner, command };
}

test('ledger defaults, effective-date limits, reporting ranges and asOf all use the Oregon day', t => {
  freeze(t, '2026-10-14T05:30:00.000Z');
  const { store, owner, command } = ledgerFixture(t), today = '2026-10-13', tomorrow = '2026-10-14';
  assert.equal(D.todayISO(), today);
  const fields = id => ({ ...D.demoData()[0], estimate_id: id, status: 'sent', do_not_contact: false, estimate_date: '2026-09-01', next_follow_up_date: today, history: [], saved_draft: '', last_contact_date: '' });
  command('create', { fields: fields('OR-1') });
  command('create', { fields: fields('OR-2') });
  // The period began at the frozen instant; reporting shows the Oregon day, not the UTC day.
  const workspace = store.workspace(owner.business_id);
  assert.equal(workspace.measurement.startedAt, '2026-10-14T05:30:00.000Z');
  assert.equal(D.businessDateOf(workspace.measurement.startedAt), today);
  // Contacts dated with the Oregon day are accepted; the UTC/Chicago "tomorrow" is a future date and is refused.
  command('contact', { estimateId: 'OR-1', contact: { date: today, nextDate: tomorrow, channel: 'Phone', note: 'SIMULATED' } });
  assert.throws(() => command('contact', { estimateId: 'OR-1', contact: { date: tomorrow, nextDate: '2026-10-15', channel: 'Phone', note: 'SIMULATED' } }), e => /between the estimate date and today/.test(e.message));
  // Default effective dates are the Oregon day.
  command('outcome', { estimateId: 'OR-1', status: 'won' });
  assert.equal(store.events(owner.business_id).filter(e => e.type === 'status_changed').at(-1).effectiveDate, today);
  assert.throws(() => command('outcome', { estimateId: 'OR-2', status: 'lost', effectiveDate: tomorrow }), e => e.status === 400 && /no later than today/.test(e.message));
  command('outcome', { estimateId: 'OR-2', status: 'lost', effectiveDate: today });
  // Report ranges: ending today (Oregon) is valid and asOf is the Oregon day; ending on the UTC date is a future range.
  const report = store.results(owner.business_id, '2026-09-14', today);
  assert.equal(report.asOf, today); assert.equal(report.counts.contacts, 1); assert.equal(report.contacts[0].date, today);
  assert.throws(() => store.results(owner.business_id, '2026-09-14', tomorrow), /valid date range ending no later than today/);
  assert.equal(report.overdue.length, 0, 'follow-ups dated today are not overdue');
  // The weekly chart and its caption agree with the report window.
  const weeks = contactsPerWeek(report.contacts, report.asOf);
  assert.equal(weeks[7].end, today); assert.equal(weeks[7].count, 1);
  assert.equal(weeklyCoverage(weeks, report.startedAt, d => '<' + d + '>').text.match(/began (<[^>]+>)/)[1], '<2026-10-13>');
});

test('over HTTP, effective dates, asOf and the 401/400 behaviour follow the Oregon day', async t => {
  freeze(t, '2026-10-14T05:30:00.000Z');
  const env = await H.launch(t);
  const owner = H.addOwner(env, 'oregon-owner@example.com', 'Fictional Oregon Roofing');
  const session = await H.signIn(env, 'oregon-owner@example.com'), url = `/api/workspaces/${owner.business_id}`;
  const q = { ...D.demoData()[0], estimate_id: 'OR-HTTP', status: 'sent', do_not_contact: false, estimate_date: '2026-09-01', next_follow_up_date: '2026-10-13', history: [], saved_draft: '', last_contact_date: '' };
  const send = (body) => session.post(url + '/commands', { requestId: crypto.randomUUID(), revision: env.store.workspace(owner.business_id).revision, ...body });
  assert.equal((await send({ kind: 'create', fields: q })).status, 200);
  assert.equal((await send({ kind: 'outcome', estimateId: 'OR-HTTP', status: 'won' })).status, 200);
  assert.equal((await send({ kind: 'outcome', estimateId: 'OR-HTTP', status: 'lost', effectiveDate: '2026-10-14' })).status, 400, 'the UTC/Chicago "tomorrow" is a future date for Oregon');
  const ok = await session.get(url + '/results?from=2026-10-01&to=2026-10-13'), future = await session.get(url + '/results?from=2026-10-01&to=2026-10-14');
  assert.equal(ok.status, 200); assert.equal(ok.data.asOf, '2026-10-13'); assert.equal(future.status, 400);
  const events = (await session.get(url + '/events')).data;
  assert.ok(events.filter(e => ['estimate_created', 'status_changed'].includes(e.type)).every(e => e.effectiveDate === '2026-10-13'));
  assert.ok(events.every(e => e.recordedAt === '2026-10-14T05:30:00.000Z'), 'recorded timestamps stay UTC instants');
});

// Activity history written by older versions or imported from an export: `at` is whatever parseBackup accepted
// (a valid date prefix that Date.parse can read), `date` is an optional explicit civil date.
const quoteWith = history => ({ ...D.demoData()[0], estimate_id: 'HIST-1', history, saved_draft: '' });
const HISTORY_DAYS = [
  [{ at: '2030-07-10T12:00:00' }, '2030-07-10', 'zone-less timestamp: the written date, no zone invented'],
  [{ at: '2030-07-08T23:59:59.999' }, '2030-07-08', 'zone-less with milliseconds, late evening: not shifted'],
  [{ at: '2030-07-07T00:00:00' }, '2030-07-07', 'zone-less midnight: not shifted'],
  [{ at: '2030-07-07 08:30:00' }, '2030-07-07', 'space-separated, zone-less'],
  [{ at: '2030-07-09' }, '2030-07-09', 'date-only'],
  [{ at: '2030-07-10T12:00:00 GMT' }, '2030-07-10', 'a non-ISO zone suffix is not interpreted'],
  [{ at: '2030-07-10Tbad+05:30' }, '2030-07-10', 'an unreadable time part falls back to the written date'],
  [{ at: '2030-07-12T05:30:00.000Z' }, '2030-07-11', 'UTC instant, Oregon evening'],
  [{ at: '2030-07-12T09:00:00+05:30' }, '2030-07-11', 'offset instant'],
  [{ at: '2030-07-12T09:00:00-07:00' }, '2030-07-12', 'offset instant already on the Oregon day'],
  [{ at: '2030-12-15T07:59:59.999Z' }, '2030-12-14', 'one millisecond before Pacific midnight (PST)'],
  [{ at: '2030-12-15T08:00:00.000Z' }, '2030-12-15', 'Pacific midnight (PST)'],
  [{ at: '2030-07-12T05:30:00.000Z', date: '2030-07-12' }, '2030-07-12', 'an explicit civil date always wins'],
  [{ at: 'unreadable', date: '2030-07-12' }, '2030-07-12', 'explicit civil date does not depend on `at`'],
];
test('activity history days: written date for zone-less values, Oregon day for instants, never an exception', () => {
  for (const [entry, day, label] of HISTORY_DAYS) assert.equal(D.historyDay(entry), day, label);
  // Unusable entries render a blank date instead of throwing, so one bad record can never blank the whole screen.
  for (const bad of [{}, { at: '' }, { at: 'garbage' }, { at: 12345 }, { at: '2030-02-30T10:00:00Z' }, { date: '2030-02-30', at: '2030-02-30' }, null, undefined, 'text'])
    assert.equal(D.historyDay(bad), '', JSON.stringify(bad));
});

test('every history value the importer accepts has a day, and unsupported values are still refused', () => {
  // Three table rows document fallback behaviour for values the importer itself refuses; they are not part of an accepted export.
  const accepted = HISTORY_DAYS.filter(([entry]) => !['unreadable', '2030-07-10Tbad+05:30', '2030-07-10T12:00:00 GMT'].includes(entry.at)).map(([entry]) => ({ type: 'update', text: 'Fictional entry', ...entry }));
  const restored = D.parseBackup(JSON.stringify({ version: 1, quotes: [quoteWith(accepted)] }));
  assert.deepEqual(restored[0].history, accepted, 'accepted history is kept exactly: nothing dropped or rewritten');
  for (const entry of restored[0].history) assert.ok(D.validDate(D.historyDay(entry)), JSON.stringify(entry));
  for (const at of ['', 'garbage', '12:00:00', '2030-13-01T00:00:00Z', '2030-02-30', '2030-07-10Tbad', 5, null])
    assert.throws(() => D.parseBackup(JSON.stringify({ version: 1, quotes: [quoteWith([{ type: 'update', text: 'x', at }])] })), /invalid activity history/, 'at: ' + JSON.stringify(at));
  assert.throws(() => D.parseBackup(JSON.stringify({ version: 1, quotes: [quoteWith([{ type: 'update', text: 'x', at: '2030-07-10', date: '2030-02-30' }])] })), /invalid activity history/);
});
