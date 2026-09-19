# Local private business accounts

This is a local milestone for fictional data. It does not connect to an authentication provider or send email. One owner email belongs to one business. No invites, staff roles, billing or public hosting are enabled.

## Start on this computer

If an old QuoteTend server is running, press Ctrl+C in its PowerShell window first. A browser refresh alone cannot upgrade that running server. Open a fresh PowerShell window and paste:

```powershell
Set-Location -LiteralPath 'C:\Users\coler\OneDrive\Documents\AI Businesses\QuoteTend'
$qtNode = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$env:PORT = '4173'
& $qtNode server.mjs
```

Leave PowerShell open. Open [private accounts](http://127.0.0.1:4173/signin), choose **Create a local business account**, and use a fictional business and owner email such as `owner@example.com`. Choose and keep a unique password. Accounts start empty; add a fictional estimate or deliberately import a fictional CSV. The email is an identifier, not verified ownership of an inbox.

The [existing browser demo](http://127.0.0.1:4173/) still uses its original `quotetend.demo.v1` browser storage. Keep using the same browser and exact address for that data. Signing in, signing out and creating accounts never copy, clear or migrate it. Account workspaces have no demo-reset button. Account drafts use the signed-in business name.

Node **24+** is required (verified with 24.19.0). Dependencies are installed in this project. If rebuilding dependencies, run these from the project folder; this downloads public packages, without connecting any business account:

```powershell
$qtPnpm = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\pnpm\bin\pnpm.cjs'
& $qtNode $qtPnpm install --frozen-lockfile
```

On a different computer, Node 24+ and pnpm are needed; use `pnpm install --frozen-lockfile` then `node server.mjs`. The bundled runtime path above is specific to this computer. An SQLite experimental warning on some Node 24 releases is expected.

## Follow-up Results update

The next startup migrates the original schema additively and saves a sibling pre-results SQLite copy for a nonempty old database. Estimate JSON is preserved. Reload tabs after restart: the old full-workspace PUT API is disabled. Private accounts now have focused operations and a server-owned event ledger. See [Follow-up Results](FOLLOWUP_RESULTS.md) for reporting definitions.

Account restore now saves a safety snapshot, retains opt-outs and starts a new reporting period. Use Import & export → Show recovery snapshots to download the pre-restore workspace. These same-database copies are not protection against disk loss. A workspace JSON file does not transfer trusted event history; preserve the whole database for that.

## Where data lives

- Demo: browser localStorage per origin. Its full JSON backup preserves estimates, drafts and history.
- Accounts: `%LOCALAPPDATA%\QuoteTend\accounts.sqlite` by default, outside the OneDrive project. SQLite stores owners, password hashes, businesses, workspace revisions and sessions. Customer/client details remain attached to estimates; there is no independent client address book yet.
- Each business's estimates, client details, saved drafts and history are a separate workspace. SQL reads/writes use the authenticated owner's business; a supplied business ID must match that owner. Email opt-outs apply only within that workspace.
- Account JSON export/restore covers only the signed-in business's estimate data. It excludes passwords and sessions. Restore is an explicit replacement and names the business; cancelling saves nothing. It does not affect other accounts or the demo. There is no automatic import of demo backups.
- `QUOTETEND_DB` overrides the database path. **Changing the port alone does not isolate account data.** If you previously used an override, open a fresh PowerShell window or deliberately remove only the override with `Remove-Item Env:QUOTETEND_DB -ErrorAction SilentlyContinue` before starting the normal database.

For a disposable rehearsal, in a separate fresh PowerShell window set both overrides before starting:

```powershell
Set-Location -LiteralPath 'C:\Users\coler\OneDrive\Documents\AI Businesses\QuoteTend'
$qtNode = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$env:PORT = '4176'
$env:QUOTETEND_DB = Join-Path $env:TEMP ('quotetend-practice-' + [guid]::NewGuid().ToString() + '.sqlite')
& $qtNode server.mjs
```

Use http://127.0.0.1:4176/signin. The server prints the selected database location. The original browser demo on port 4176 may still contain earlier fictional rehearsal records, but the new account database starts empty.

## Backup and recovery

For a single workspace, sign in and use **Import & export → Download full backup**. The copy-contents fallback remains available. CSV does not include drafts/history. Save before replacing account data through **Restore a full backup**.

The updated server also creates consistent full-database backups at startup and every six hours. For verification and restoration into a new isolated file, use [LAUNCH_OPERATIONS](LAUNCH_OPERATIONS.md). These same-disk copies still need off-service protection.

For all local accounts, stop every server using that database with Ctrl+C. A stopped-database copy preserves accounts and workspace data consistently. In a PowerShell window configured for the normal database:

```powershell
$qtDb = Join-Path $env:LOCALAPPDATA 'QuoteTend\accounts.sqlite'
$qtBackup = Join-Path $env:LOCALAPPDATA ('QuoteTend\accounts-backup-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.sqlite')
Copy-Item -LiteralPath $qtDb -Destination $qtBackup
$qtBackup
```

If using a custom database, substitute its exact path. Keep database backups private: they include password hashes and session secrets. They are not encrypted. Losing the database and every backup means losing those accounts; browser demo storage cannot recover them.

Preferred recovery: use backup-accounts.mjs restore-copy to a NEW isolated path, verify and reconcile opt-outs/credentials, then switch the stopped service to that path. See [the current recovery runbook](LAUNCH_OPERATIONS.md). The following older copy-over procedure is only a manual administrator fallback after those checks. To restore all accounts, stop all servers first. Keep the current database as a separate timestamped safety copy. Copy the chosen `.sqlite` backup over the intended database only after checking both paths. Then, from the project folder and with the matching `QUOTETEND_DB` setting, invalidate restored sessions before restarting:

```powershell
& $qtNode manage-accounts.mjs logout-all
& $qtNode server.mjs
```

Do not restore over a running database. Whole-database restore rolls back **all businesses**, unlike a signed-in workspace JSON restore. If the database is damaged, keep the damaged file and recover a known-good copy; do not delete it or create empty tables as a repair.

Forgotten password: the local computer owner can stop the server and run:

```powershell
& $qtNode manage-accounts.mjs reset-password owner@example.com
```

Replace the fictional email with the exact local owner account. This prints a new random password once, preserves workspace records and signs out all owners. Save the password securely, close the terminal containing it when finished, and restart. No reset email is sent. Account security now provides password change and a saved one-use recovery code. See [launch operations](LAUNCH_OPERATIONS.md) for recovery, invitation and access controls. Someone with access to this Windows user's database files already has administrator-level access to this local preview.

If a save reports a conflicting tab or uncertain network failure, keep any unsaved text, reload, and review the saved workspace before retrying. A successful server save is required before the form closes. Revisions prevent stale replacement. Offline edits are not queued.

## Implementation and limits

Authentication uses [bcryptjs](https://github.com/dcodeIO/bcrypt.js) at cost 12 and [express-session](https://expressjs.com/en/resources/middleware/session/) with a SQLite session store. Passwords require 12 characters and reject inputs beyond bcrypt's 72-byte limit. Sessions rotate on sign-in, expire after eight hours, and are invalidated on sign-out. Cookies are HttpOnly and SameSite=Strict. Mutations require an exact same-origin request, JSON and a custom request header; untrusted Host headers are denied. Sign-in/registration share a limit of 40 attempts per 15 minutes per IP; this in-memory limiter resets on server restart.

[Node SQLite](https://nodejs.org/docs/latest-v24.x/api/sqlite.html) supplies persistent transactions. Each workspace allows up to 5,000 estimates, a 4.8 MB saved-state guard and a 5 MB API payload. Unknown estimate fields are discarded. Updates use an atomic revision comparison. Local account data is stored in SQLite rather than localStorage; session credentials never enter browser localStorage.

Default local mode binds only to 127.0.0.1 and uses HTTP cookies. Production configuration now requires HTTPS, Secure cookies, a canonical origin, secrets and persistent paths; see [launch operations](LAUNCH_OPERATIONS.md). Live hosting/security/backup checks are still required. Do not expose local mode through a tunnel. This milestone does not establish production security, encryption at rest, cross-device access or protection from another program running as the same Windows user. No external authentication service is required or connected.

## Re-run verification

From the project folder, with `$qtNode` set as above:

```powershell
& $qtNode --test tests/*.test.mjs
& $qtNode tests/browser-rehearsal.mjs
```

The browser rehearsal uses installed Edge in a fresh headless profile, temporary database and temporary port. It never attaches to your browser. Chrome can be selected with `$env:QUOTETEND_BROWSER='chrome'`. Screenshots are written to `test-results`. Temporary test databases are removed at completion. Physical-phone and screen-reader behavior are not verified.
