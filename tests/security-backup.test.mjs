// Sprint 3A: backups hold password hashes, recovery-code hashes and live session IDs. A restored copy must keep the
// customer data and credentials but must not bring back anyone's signed-in sessions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { makeBackup, verifyBackup } from '../backups.mjs';
import * as H from './helpers/security-harness.mjs';

test('restore-copy keeps data and credentials but drops every session', async t => {
  const env = await H.launch(t);
  const a = H.addOwner(env, 'owner-a@example.com', H.markers('A').business), b = H.addOwner(env, 'owner-b@example.com', H.markers('B').business);
  H.seedTenant(env, a, 'A'); H.seedTenant(env, b, 'B');
  const session = await H.signIn(env, 'owner-a@example.com'), other = await H.signIn(env, 'owner-b@example.com');
  assert.equal(env.store.db.prepare('SELECT COUNT(*) n FROM sessions').get().n, 2);
  const file = await makeBackup(env.store.db, join(env.dir, 'backups-test'));
  assert.equal(verifyBackup(file).businesses, 2);
  const restoredPath = join(env.dir, 'restored.sqlite');
  execFileSync(process.execPath, ['backup-accounts.mjs', 'restore-copy', file, restoredPath], { stdio: 'pipe' });
  const restored = new DatabaseSync(restoredPath, { readOnly: true });
  try {
    assert.equal(restored.prepare('SELECT COUNT(*) n FROM sessions').get().n, 0, 'no session survives a restore');
    assert.equal(restored.prepare('SELECT COUNT(*) n FROM businesses').get().n, 2);
    assert.equal(restored.prepare('SELECT password_hash FROM owners WHERE email=?').get('owner-a@example.com').password_hash, env.store.ownerByEmail('owner-a@example.com').password_hash);
    assert.equal(restored.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  } finally { restored.close(); }
  assert.equal((await session.get('/api/me')).status, 200, 'the live server is not affected by restoring a copy elsewhere');
  assert.equal((await other.get('/api/me')).status, 200);
});
