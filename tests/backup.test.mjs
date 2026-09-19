import test from 'node:test';
import assert from 'node:assert/strict';
import { demoData, parseBackup, recordContact, validateEstimate } from '../domain.js';
const encode = quotes => JSON.stringify({ version: 1, quotes });
test('full backup round trip preserves contact history, edited draft and opt-outs', () => {
  const quotes = demoData('2026-09-16');
  quotes[0] = recordContact({ ...quotes[0], saved_draft: 'A personal note, with "quotes".\nAnother line.' }, { date: '2026-09-16', nextDate: '2026-09-20', channel: 'Phone', note: 'Fictional contact' }, '2026-09-16');
  assert.deepEqual(parseBackup(encode(quotes)), quotes);
});
test('backup rejects malformed envelope and unsupported versions', () => {
  for (const text of ['broken', 'null', '[]', '{}', '{"version":2,"quotes":[]}', '{"version":1,"quotes":{}}']) assert.throws(() => parseBackup(text));
  assert.deepEqual(parseBackup(encode([])), []);
});
test('backup rejects malformed field types before UI rendering', () => {
  const q = demoData()[0];
  for (const patch of [{ customer_name: 42 }, { customer_email: [] }, { notes: {} }, { estimate_id: 101 }, { next_follow_up_date: null }, { saved_draft: {} }, { history: [null] }, { history: [{ type: 'note', text: 'x', at: 'not-a-date' }] }]) assert.throws(() => parseBackup(encode([{ ...q, ...patch }])));
  assert.ok(validateEstimate(null).length);
});
test('backup rejects duplicates including whitespace and case variations', () => {
  const q = demoData()[0];
  assert.throws(() => parseBackup(encode([q, { ...q, estimate_id: ` ${q.estimate_id.toLowerCase()} ` }])));
});
test('backup normalizes unsafe follow-up dates on closed and opted-out estimates', () => {
  const q = demoData()[0];
  const restored = parseBackup(encode([{ ...q, do_not_contact: true }]));
  assert.equal(restored[0].next_follow_up_date, '');
});
