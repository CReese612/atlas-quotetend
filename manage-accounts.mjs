import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { openAccounts, defaultDatabase } from './account-store.mjs';
import { existsSync } from 'node:fs';

const [command, email] = process.argv.slice(2);
if (!['reset-password', 'logout-all', 'suspend-owner', 'resume-owner'].includes(command) || command !== 'logout-all' && !email) {
  console.error('Stop the server first. Usage: node manage-accounts.mjs reset-password owner@example.com OR node manage-accounts.mjs logout-all'); process.exit(1);
}
if (!existsSync(defaultDatabase())) { console.error('Database not found. Check QUOTETEND_DB before recovery.'); process.exit(1); }
const store = openAccounts();
if(['suspend-owner','resume-owner'].includes(command)){
 try{const owner=store.ownerByEmail(email.trim().toLowerCase());if(!owner)throw new Error('Owner not found.');store.setSuspended(owner.id,command==='suspend-owner');console.log('Account access updated. Sessions revoked. Stored customer data preserved. No billing or messages changed.');}finally{store.close();}
 process.exit(0);
}
if (command === 'logout-all') { store.db.exec('DELETE FROM sessions'); store.close(); console.log('All local account sessions invalidated.'); process.exit(0); }
try {
  const password = randomBytes(24).toString('base64url');
  if (!store.resetPassword(email.trim().toLowerCase(), await bcrypt.hash(password, 12))) {
    console.error('Owner not found. No password was changed.'); process.exitCode = 1;
  } else console.log('Password reset. All sessions invalidated. Store this new password securely:\n' + password);
} finally { store.close(); }
