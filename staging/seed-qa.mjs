// Provision the fictional QA business in an ISOLATED STAGING database. Run from the hosted service's shell:
//   QUOTETEND_STAGING=1 QA_OWNER_EMAIL=qa-owner@example.test node staging/seed-qa.mjs
// The owner's password is never generated, printed or stored here: the script prints a one-use recovery code,
// and the owner chooses their own password at /signin -> "Forgot your password?".
// Re-running never overwrites QA work. Wiping is explicit: add --reset and QUOTETEND_STAGING_RESET=reset-qa-data.
import bcrypt from 'bcryptjs';
import { randomBytes, randomUUID } from 'node:crypto';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openAccounts } from '../account-store.mjs';
import { issueRecovery } from '../account-security.mjs';
import { todayISO } from '../domain.js';
import { QA_BUSINESS_NAME, qaEstimates } from './qa-data.mjs';

const STAGING_DB = /^quotetend-staging[A-Za-z0-9_.-]*\.sqlite$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Refuses anything that is not unmistakably a staging database. QUOTETEND_DB must be set explicitly so the
// local default database (or a production file such as accounts.sqlite) can never be targeted by accident.
export function assertStagingTarget(env, { reset = false } = {}) {
  if (env.QUOTETEND_STAGING !== '1') throw new Error('Refusing to run: set QUOTETEND_STAGING=1 (staging environments only).');
  if (!env.QUOTETEND_DB) throw new Error('Refusing to run: QUOTETEND_DB must be set explicitly.');
  const file = basename(resolve(env.QUOTETEND_DB));
  if (!STAGING_DB.test(file)) throw new Error(`Refusing to run: the database file name must look like quotetend-staging*.sqlite, not "${file}".`);
  const email = String(env.QA_OWNER_EMAIL || '').trim().toLowerCase();
  if (!EMAIL.test(email) || email.length > 254) throw new Error('Set QA_OWNER_EMAIL to the QA owner’s email address.');
  if (reset && env.QUOTETEND_STAGING_RESET !== 'reset-qa-data') throw new Error('Reset requires QUOTETEND_STAGING_RESET=reset-qa-data.');
  return { email };
}

function wipeQaBusiness(db, businessId) {
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const table of ['events', 'operations', 'safety_snapshots', 'retained_optouts', 'estimate_identity'])
      db.prepare(`DELETE FROM ${table} WHERE business_id=?`).run(businessId);
    db.prepare("UPDATE businesses SET quotes='[]', revision=0 WHERE id=?").run(businessId);
    db.prepare('UPDATE measurement SET started_at=?, epoch=1 WHERE business_id=?').run(new Date().toISOString(), businessId);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}

// Writes through the same ledger commands the app uses, so activity, events and Follow-up Results are genuine.
export async function seedStaging(store, { email, reset = false, today = todayISO() }) {
  let owner = store.ownerByEmail(email), recoveryCode = null;
  if (owner) {
    if (!reset) throw new Error('The QA owner already exists. Nothing was changed. Use --reset to restore the seed data (this discards QA edits).');
    if (store.workspace(owner.business_id).businessName !== QA_BUSINESS_NAME) throw new Error('Refusing to reset: that owner’s business is not the QA seed business.');
    wipeQaBusiness(store.db, owner.business_id);
  } else {
    if (reset) throw new Error('Nothing to reset: the QA owner does not exist.');
    if (store.db.prepare('SELECT COUNT(*) n FROM owners').get().n) throw new Error('This database already has accounts. Seed only runs against a brand-new staging database.');
    // The password is random and discarded: the owner sets their own through the recovery code.
    owner = store.createOwner(email, await bcrypt.hash(randomBytes(48).toString('base64url').slice(0, 64), 12), QA_BUSINESS_NAME);
    recoveryCode = issueRecovery(store.db, owner.id);
  }
  let revision = store.workspace(owner.business_id).revision;
  const run = command => { revision = store.command(owner, { requestId: 'seed-' + randomUUID(), revision, ...command }).revision; };
  for (const e of qaEstimates(today)) {
    run({ kind: 'create', fields: e.fields });
    for (const contact of e.contacts) run({ kind: 'contact', estimateId: e.fields.estimate_id, contact });
    if (e.close) run({ kind: 'outcome', estimateId: e.fields.estimate_id, status: e.close.status, effectiveDate: e.close.effectiveDate });
  }
  return { businessId: owner.business_id, recoveryCode, estimates: store.workspace(owner.business_id).quotes.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const reset = process.argv.includes('--reset');
  let store;
  try {
    const { email } = assertStagingTarget(process.env, { reset });
    store = openAccounts();
    const result = await seedStaging(store, { email, reset });
    console.log(`Seeded ${result.estimates} fictional estimates for "${QA_BUSINESS_NAME}".`);
    if (result.recoveryCode) console.log([
      '', 'One-use recovery code for the QA owner. It is shown once, not logged, and not stored in plain text.',
      'Give it only to the owner, who then opens /signin -> "Forgot your password?" and chooses their own password:',
      '', result.recoveryCode, ''].join('\n'));
    else console.log('Existing owner and password kept; estimates restored to the seed data.');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
  finally { store?.close(); }
}
