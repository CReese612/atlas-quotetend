// Sprint 3A: direct-API proof that one contractor cannot read or change another contractor's data.
// Two fictional businesses with different owners, sessions, estimates, contacts, outcomes, opt-outs and
// snapshots. Every attack asserts the response AND that no private string leaked and no row changed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { demoData, addDays } from '../domain.js';
import * as H from './helpers/security-harness.mjs';

async function twoTenants(t) {
  const env = await H.launch(t);
  const a = H.addOwner(env, 'owner-a@example.com', H.markers('A').business), b = H.addOwner(env, 'owner-b@example.com', H.markers('B').business);
  const sa = H.seedTenant(env, a, 'A'), sb = H.seedTenant(env, b, 'B');
  const ca = await H.signIn(env, 'owner-a@example.com'), cb = await H.signIn(env, 'owner-b@example.com');
  const anonymous = H.client(env);
  return { env, a, b, sa, sb, ca, cb, anonymous, A: a.business_id, B: b.business_id };
}
const reads = (id, snapshot) => ['', '/events', '/snapshots', '/snapshots/' + snapshot, `/results?from=${addDays(H.today, -30)}&to=${H.today}`].map(s => `/api/workspaces/${id}${s}`);

test('Business B cannot read any Business A resource, and learns nothing from the refusal', async t => {
  const { env, sa, cb, anonymous, A, B } = await twoTenants(t);
  const before = H.fingerprint(env, A);
  const missing = await cb.get('/api/workspaces/' + randomUUID());
  for (const path of reads(A, sa.snapshotId)) {
    const r = await cb.get(path);
    assert.equal(r.status, 404, path); H.assertNoLeak(assert, r, 'A', path);
    // Same status and body as a business that does not exist: no way to tell valid IDs from invalid ones.
    if (path === `/api/workspaces/${A}`) assert.equal(r.text, missing.text);
    const unauthenticated = await anonymous.get(path);
    assert.equal(unauthenticated.status, 401, path); H.assertNoLeak(assert, unauthenticated, 'A', 'anonymous ' + path);
  }
  // The same route with B's own ID works, proving the 404s above are authorization decisions, not broken routes.
  const own = await cb.get('/api/workspaces/' + B);
  assert.equal(own.status, 200); assert.equal(own.data.businessId, B); H.assertNoLeak(assert, own, 'A', 'own workspace');
  assert.equal(H.fingerprint(env, A), before);
});

test('forged or reshaped business IDs, query strings, headers and traversal never redirect a request to another tenant', async t => {
  const { env, cb, A, B } = await twoTenants(t);
  const before = H.fingerprint(env, A);
  const variants = [A.toUpperCase(), A + '/', A + '%20', '%20' + A, A + '%00', A.replaceAll('-', '%2d'), A + "'%20OR%20'1'='1", '*', '%2e%2e/' + A, A + '%2f..%2f' + B, `${B}/../${A}`, `${B}/%2e%2e/${A}`, `${B}%2f%2e%2e%2f${A}`];
  for (const variant of variants) for (const suffix of ['', '/events', '/snapshots', '/results?from=2020-01-01&to=2020-01-02']) {
    const r = await cb.get(`/api/workspaces/${variant}${suffix}`);
    H.assertNoLeak(assert, r, 'A', variant + suffix);
    // A segment that decodes to exactly A's ID is a (refused) request for A; anything else is an unknown route.
    if (r.status === 200) assert.equal(r.data.businessId ?? B, B, 'a 200 may only ever describe the caller: ' + variant + suffix);
    else assert.ok([400, 404].includes(r.status), `${variant}${suffix} -> ${r.status}`);
  }
  const forged = await cb.get(`/api/workspaces/${B}?businessId=${A}&ownerId=${A}&business_id=${A}`, { 'X-Business-Id': A, 'X-Owner-Id': A, 'X-Forwarded-For': '203.0.113.9' });
  assert.equal(forged.status, 200); assert.equal(forged.data.businessId, B); H.assertNoLeak(assert, forged, 'A', 'forged parameters');
  const body = await cb.post(`/api/workspaces/${B}/commands`, { kind: 'create', businessId: A, business_id: A, ownerId: A, owner_id: A, actorId: A, requestId: randomUUID(), revision: env.store.workspace(B).revision,
    fields: { ...demoData()[0], estimate_id: 'FORGED-1', customer_name: 'Forged Body Customer', business_id: A, history: [], saved_draft: '', last_contact_date: '' } });
  assert.equal(body.status, 200);
  assert.equal(env.store.workspace(A).quotes.some(q => q.estimate_id === 'FORGED-1'), false);
  assert.ok(env.store.events(B).every(e => e.businessId === B), 'no event is attributed to another business');
  assert.ok(env.store.events(B).every(e => e.actorId === env.store.ownerByEmail('owner-b@example.com').id), 'actor is always the authenticated owner, never a body value');
  assert.equal(H.fingerprint(env, A), before, 'A is untouched');
});

test('snapshot and event IDs belong to one business: B cannot use A\'s IDs inside B\'s own routes', async t => {
  const { env, sa, sb, ca, cb, A, B } = await twoTenants(t);
  const before = [H.fingerprint(env, A), H.fingerprint(env, B)];
  const stolen = await cb.get(`/api/workspaces/${B}/snapshots/${sa.snapshotId}`);
  assert.equal(stolen.status, 404); H.assertNoLeak(assert, stolen, 'A', 'stolen snapshot id');
  assert.equal(stolen.text, (await cb.get(`/api/workspaces/${B}/snapshots/${randomUUID()}`)).text, 'a real foreign ID and a random one are indistinguishable');
  for (const hostile of ['%2e%2e', '..%2f' + sa.snapshotId, sa.snapshotId + "'--", sa.snapshotId.toUpperCase().slice(0, 8) + '%25']) assert.ok([400, 404].includes((await cb.get(`/api/workspaces/${B}/snapshots/${hostile}`)).status), hostile);
  const list = await cb.get(`/api/workspaces/${B}/snapshots`);
  assert.deepEqual(list.data.map(s => s.id), [sb.snapshotId]); assert.ok(!list.text.includes(sa.snapshotId));
  const own = await cb.get(`/api/workspaces/${B}/snapshots/${sb.snapshotId}`);
  assert.equal(own.status, 200); H.assertNoLeak(assert, own, 'A', 'own snapshot'); assert.ok(own.text.includes(H.markers('B').name));
  assert.equal((await ca.get(`/api/workspaces/${A}/snapshots/${sb.snapshotId}`)).status, 404, 'and in the other direction');
  // Contact-correction with another business's event ID, from a business that happens to own the same estimate ID.
  const run = H.commander(env, env.store.ownerByEmail('owner-b@example.com'));
  run('create', { fields: { ...demoData()[0], estimate_id: sa.ids[0], customer_name: 'B twin of an A estimate', history: [], saved_draft: '', last_contact_date: '' } });
  const forged = await cb.post(`/api/workspaces/${B}/commands`, { kind: 'correct-contact', requestId: randomUUID(), revision: env.store.workspace(B).revision, estimateId: sa.ids[0], eventId: sa.eventId,
    correction: { date: H.today, channel: 'Email', voided: true, reason: 'attempt to void a stranger\'s contact' } });
  assert.equal(forged.status, 404); H.assertNoLeak(assert, forged, 'A', 'forged event id');
  assert.equal(env.store.events(A).some(e => e.type === 'contact_corrected'), false);
  assert.equal(H.fingerprint(env, A), before[0]);
  assert.notEqual(H.fingerprint(env, B), before[1], 'only the legitimate B-side twin creation changed B');
});

test('every command kind aimed at another tenant is refused with no mutation on either side', async t => {
  const { env, sa, cb, A, B } = await twoTenants(t);
  const before = [H.fingerprint(env, A), H.fingerprint(env, B)];
  const fields = { ...demoData()[0], estimate_id: 'ATTACK-1', customer_name: 'Attacker', history: [], saved_draft: '', last_contact_date: '' };
  const kinds = [
    { kind: 'create', fields }, { kind: 'edit', estimateId: sa.ids[0], fields: { notes: 'overwritten by B', status: 'lost' } },
    { kind: 'outcome', estimateId: sa.ids[0], status: 'lost' }, { kind: 'draft', estimateId: sa.ids[0], text: 'B wrote this' },
    { kind: 'contact', estimateId: sa.ids[0], contact: { date: H.today, nextDate: addDays(H.today, 2), channel: 'Email', note: 'forged contact' } },
    { kind: 'correct-contact', estimateId: sa.ids[0], eventId: sa.eventId, correction: { date: H.today, channel: 'Email', voided: true, reason: 'forged' } },
    { kind: 'import', quotes: [fields] }, { kind: 'restore', quotes: [], confirmReplacement: true }, { kind: 'release-optout', reviewedOptOut: true, preference: 'email:' + H.markers('A').optEmail },
  ];
  for (const command of kinds) {
    const r = await cb.post(`/api/workspaces/${A}/commands`, { ...command, requestId: randomUUID(), revision: env.store.workspace(A).revision });
    assert.equal(r.status, 404, command.kind); H.assertNoLeak(assert, r, 'A', command.kind);
    // Aimed through B's own route, the A-only references still resolve to nothing.
    if (!['create', 'import', 'restore'].includes(command.kind)) {
      const own = await cb.post(`/api/workspaces/${B}/commands`, { ...command, requestId: randomUUID(), revision: env.store.workspace(B).revision });
      assert.ok([400, 404].includes(own.status), `${command.kind} via B -> ${own.status}`); H.assertNoLeak(assert, own, 'A', command.kind + ' via B');
    }
  }
  assert.equal((await cb.send(`/api/workspaces/${A}`, 'PUT', { revision: 0, quotes: [] })).status, 404);
  assert.equal((await cb.send(`/api/workspaces/${A}`, 'DELETE', {})).status, 404);
  assert.equal((await cb.send(`/api/workspaces/${A}`, 'PATCH', { revision: 0 })).status, 404);
  assert.equal(H.fingerprint(env, A), before[0]); assert.equal(H.fingerprint(env, B), before[1]);
});

test('the same estimate ID or request ID in two businesses never collides, replays or leaks', async t => {
  const { env, sa, cb, A, B } = await twoTenants(t);
  const stolenRequest = env.store.db.prepare('SELECT request_id FROM operations WHERE business_id=? ORDER BY revision LIMIT 1').get(A).request_id;
  const beforeA = H.fingerprint(env, A);
  // B reuses an A request ID and an A estimate ID: B's command is judged only against B's own history.
  const twin = await cb.post(`/api/workspaces/${B}/commands`, { kind: 'create', requestId: stolenRequest, revision: env.store.workspace(B).revision,
    fields: { ...demoData()[0], estimate_id: sa.ids[0], customer_name: 'B Customer With A Estimate ID', history: [], saved_draft: '', last_contact_date: '' } });
  assert.equal(twin.status, 200); assert.equal(twin.data.replayed, undefined); assert.equal(twin.data.businessId, B); H.assertNoLeak(assert, twin, 'A', 'shared ids', { except: [H.markers('A').idPrefix] });
  const edit = await cb.post(`/api/workspaces/${B}/commands`, { kind: 'edit', requestId: randomUUID(), revision: twin.data.revision, estimateId: sa.ids[0], fields: { notes: 'B-only change' } });
  assert.equal(edit.status, 200);
  assert.equal(env.store.workspace(A).quotes.find(q => q.estimate_id === sa.ids[0]).notes, H.markers('A').notes, 'A\'s estimate with the same ID is unchanged');
  assert.equal(H.fingerprint(env, A), beforeA);
});

test('imports, restores, exports and opt-outs stay inside the business that performed them', async t => {
  const { env, sa, sb, ca, cb, A, B } = await twoTenants(t);
  const beforeA = H.fingerprint(env, A), snapshotsA = (await ca.get(`/api/workspaces/${A}/snapshots`)).data;
  // B imports a row that has A's estimate ID and A's opted-out e-mail address. A's preference must not follow it into B.
  const imported = await cb.post(`/api/workspaces/${B}/commands`, { kind: 'import', requestId: randomUUID(), revision: env.store.workspace(B).revision,
    quotes: [{ ...demoData()[0], estimate_id: 'IMPORTED-FROM-CSV', customer_email: H.markers('A').optEmail, do_not_contact: false, status: 'sent', next_follow_up_date: H.today, history: [], saved_draft: '', last_contact_date: '' }] });
  assert.equal(imported.status, 200);
  const row = imported.data.quotes.find(q => q.estimate_id === 'IMPORTED-FROM-CSV');
  assert.equal(row.do_not_contact, false, 'another business\'s suppression list does not suppress B\'s customer'); assert.equal(row.next_follow_up_date, H.today);
  assert.ok(imported.data.retainedOptOuts.every(p => !p.includes('a-optout')), 'B\'s retained preferences never list A\'s e-mail addresses');
  assert.equal(env.store.events(B).some(e => e.type === 'opt_out_retained' && JSON.stringify(e.data).includes('a-optout')), false);
  // Release an opt-out that belongs to A through B's route: B has no such retained preference.
  const release = await cb.post(`/api/workspaces/${B}/commands`, { kind: 'release-optout', requestId: randomUUID(), revision: imported.data.revision, reviewedOptOut: true, preference: 'email:' + H.markers('A').optEmail });
  assert.equal(release.status, 400); assert.equal(env.store.workspace(B).retainedOptOuts.some(p => p.includes('a-optout')), false);
  assert.equal(env.store.workspace(A).retainedOptOuts.includes('email:' + H.markers('A').optEmail), true);
  // B restores a workspace export that contains A's own records (as if B had somehow obtained them): it affects only B.
  const exported = env.store.workspace(A).quotes;
  const restored = await cb.post(`/api/workspaces/${B}/commands`, { kind: 'restore', requestId: randomUUID(), revision: env.store.workspace(B).revision, confirmReplacement: true, quotes: exported });
  assert.equal(restored.status, 200); assert.equal(restored.data.businessId, B);
  assert.equal(H.fingerprint(env, A), beforeA, 'A\'s workspace, events, snapshots, operations and suppression list are byte-identical');
  assert.deepEqual((await ca.get(`/api/workspaces/${A}/snapshots`)).data, snapshotsA, 'B\'s restore wrote its safety copy only to B');
  const bSnapshots = (await cb.get(`/api/workspaces/${B}/snapshots`)).data.map(s => s.id);
  assert.equal(bSnapshots.length, 2); assert.ok(!bSnapshots.includes(sa.snapshotId));
});

test('events and results contain only the caller\'s business, with no cross-tenant volume signal', async t => {
  const { env, ca, cb, A, B } = await twoTenants(t);
  const rangeB = await cb.get(`/api/workspaces/${B}/results?from=${addDays(H.today, -30)}&to=${H.today}`), eventsB = await cb.get(`/api/workspaces/${B}/events`), eventsA = await ca.get(`/api/workspaces/${A}/events`);
  for (const response of [rangeB, eventsB]) { assert.equal(response.status, 200); H.assertNoLeak(assert, response, 'A', 'B reads own data'); }
  assert.ok(eventsB.data.length > 0 && eventsB.data.every(e => e.businessId === B));
  assert.ok(rangeB.data.contacts.every(c => c.estimateId.startsWith('B-EST')));
  assert.equal(eventsA.data.length, eventsB.data.length, 'fixtures are symmetric, so any difference below is exposure of the other tenant');
  // Sanity: the correction flow still works with remapped ordinals.
  const correction = await cb.post(`/api/workspaces/${B}/commands`, { kind: 'correct-contact', requestId: randomUUID(), revision: env.store.workspace(B).revision, estimateId: 'B-EST-1',
    eventId: eventsB.data.filter(e => e.type === 'contact_logged').at(-1).id, correction: { date: H.today, channel: 'Phone', voided: false, reason: 'Fictional channel fix' } });
  assert.equal(correction.status, 200);
});

test('event ordinals returned to a business are its own, so gaps cannot reveal another contractor\'s activity', async t => {
  const { env, ca, cb, A, B } = await twoTenants(t);
  const eventsA = (await ca.get(`/api/workspaces/${A}/events`)).data, eventsB = (await cb.get(`/api/workspaces/${B}/events`)).data;
  assert.equal(eventsA.length, eventsB.length, 'symmetric fixtures: any difference in numbering would be exposure of the other tenant');
  // B was seeded after A. The database numbers events globally, but a caller must only ever see 1..n for its own events.
  assert.deepEqual(eventsB.map(e => e.sequence), eventsB.map((_, i) => i + 1));
  assert.deepEqual(eventsA.map(e => e.sequence), eventsA.map((_, i) => i + 1));
  const sequences = new Set(eventsB.map(e => e.sequence));
  const references = eventsB.filter(e => e.data.outcomeSequence !== undefined);
  for (const e of references) assert.ok(sequences.has(e.data.outcomeSequence), 'outcome references point at the same business\'s events');
  // Activity by A after B's last event must not change anything B can observe.
  H.commander(env, env.store.ownerByEmail('owner-a@example.com'))('edit', { estimateId: 'A-EST-3', fields: { notes: 'later A-only activity' } });
  assert.deepEqual((await cb.get(`/api/workspaces/${B}/events`)).data, eventsB);
  // Internal ordering is unchanged: the ledger still reports contacts in the order they happened.
  assert.deepEqual(env.store.events(B).map(e => e.id), eventsB.map(e => e.id));
});
