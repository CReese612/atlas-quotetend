import test from 'node:test';
import assert from 'node:assert/strict';
import { demoData, exportCSV, previewImport, importCandidates, importOptOutBlockers, normalizeWorkspace, eligible, parseBackup } from '../domain.js';
import { inspectSpreadsheet, previewSpreadsheet } from '../import-mapping.js';
const base = demoData('2026-09-16')[0];
const row = overrides => ({ ...base, ...overrides });

test('invalid opt-out blocks valid sibling and unrelated rows without mutating saved data', () => {
  const existing = [row({ saved_draft: 'Keep this', history: [{type:'note',at:'2026-09-16T12:00:00Z',text:'Keep history'}] })];
  const before = JSON.stringify(existing);
  const rows = previewImport(exportCSV([row({estimate_id:'BAD',amount_usd:-1,do_not_contact:true}), row({estimate_id:'NEW'}), row({estimate_id:'OTHER',customer_email:'other@example.com'})]), existing);
  assert.deepEqual(importOptOutBlockers(rows, existing)[0].affectedIds, [base.estimate_id, 'NEW']);
  assert.throws(() => importCandidates(rows, existing), /Import blocked/);
  assert.equal(JSON.stringify(existing), before);
  // Discarding the preview (cancel) leaves the same backup payload.
  assert.deepEqual(parseBackup(JSON.stringify({version:1,quotes:existing})), existing);
});
test('held opt-out conflicts block in either row order', () => {
  const a=row({estimate_id:'CLASH',do_not_contact:true}), b=row({estimate_id:'CLASH'});
  for (const pair of [[a,b],[b,a]]) {
    const rows=previewImport(exportCSV([...pair,row({estimate_id:'SIBLING'})]));
    assert.equal(importOptOutBlockers(rows).length,1);
    assert.throws(()=>importCandidates(rows),/Import blocked/);
  }
});
test('existing-ID conflict cannot discard a new opt-out or overwrite the estimate', () => {
  const existing=[base], before=JSON.stringify(existing);
  const rows=previewImport(exportCSV([row({do_not_contact:true}),row({estimate_id:'NEW'})]),existing);
  assert.equal(rows[0].outcome,'conflict');
  assert.throws(()=>importCandidates(rows,existing),/Import blocked/);
  assert.equal(JSON.stringify(existing),before);
});
test('same-ID invalid first opt-out remains blocking when valid second can otherwise import', () => {
  const bad=row({estimate_id:'SAME',status:'unknown',do_not_contact:true}), good=row({estimate_id:'SAME'});
  for(const pair of [[bad,good],[good,bad]]) assert.throws(()=>importCandidates(previewImport(exportCSV(pair))),/Import blocked/);
});
test('repair retains opt-out, suppresses siblings and survives backup without restoring dates', () => {
  const repaired=row({estimate_id:'FIXED',do_not_contact:true});
  const rows=previewImport(exportCSV([repaired,row({estimate_id:'NEW'})]),[base]);
  const saved=normalizeWorkspace([base,...importCandidates(rows,[base])]);
  assert.ok(saved.every(q=>!eligible(q,saved) && q.next_follow_up_date===''));
  assert.deepEqual(parseBackup(JSON.stringify({version:1,quotes:saved})),saved);
});
test('already retained preferences allow unrelated imports, including closed sources and exact repeats', () => {
  const existing=[row({do_not_contact:true,status:'won',customer_email:' MARA.ELLIS@example.com '})];
  const bad=row({estimate_id:'BAD',amount_usd:-1,do_not_contact:true});
  assert.equal(importCandidates(previewImport(exportCSV([bad,row({estimate_id:'NEW'})]),existing),existing).length,1);
  const good=row({estimate_id:'GOOD',do_not_contact:true});
  const rows=previewImport(exportCSV([bad,good,good]));
  assert.equal(importCandidates(rows).length,1);
  assert.equal(importOptOutBlockers(rows).length,0);
});
test('blank/invalid email and invalid boolean do not invent email suppression', () => {
  for(const overrides of [{customer_email:''},{customer_email:'bad-email'},{do_not_contact:false}]) {
    const rows=previewImport(exportCSV([row({estimate_id:'BAD',amount_usd:-1,do_not_contact:true,...overrides}),row({estimate_id:'NEW'})]));
    assert.equal(importOptOutBlockers(rows).length,0);
    assert.equal(importCandidates(rows).length,1);
  }
});
test('mapped YES on invalid amount blocks, including when no sibling exists yet', () => {
  const sheet=inspectSpreadsheet('ID,Customer,Email,Job,Amount,Date,Status,Opt Out\nBAD,Demo,mara.ellis@example.com,Room,broken,2026-09-16,sent,YES');
  const rows=previewSpreadsheet(sheet,sheet.mapping);
  assert.equal(importOptOutBlockers(rows)[0].email,'mara.ellis@example.com');
  assert.throws(()=>importCandidates(rows),/Import blocked/);
});
