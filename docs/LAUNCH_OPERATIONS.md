# Launch operations — prepared locally, not deployed

The supported first-customer shape is one application process, one persistent SQLite database, one owner per business, invitation-only production registration, and manually supervised billing. No accounts or providers have been connected. See [launch gates](../LAUNCH_READINESS.md).

## Startup and configuration

Local startup remains in [START_HERE](../START_HERE.md). /signin is the private account entry, /security is account security, and / is the separate fictional browser demo. Account operations do not migrate or overwrite browser storage. Tests always use temporary databases and disposable browser profiles.

Schema 2 adds recovery-code hashes and invitations. A nonempty prior owner database receives a sibling .pre-security-UUID.sqlite before migration. Version-0 ledger migration also keeps its earlier safety copy. Existing quotes and events are preserved; no historical contacts are invented. Existing sessions without a credential version must sign in again. Never downgrade an upgraded database by changing PRAGMA user_version.

[render.yaml](../render.yaml) prepares a single Node 24.19.0 native service, persistent /var/data disk, /healthz, and manual deployments. It is not applied. [.env.production.example](../.env.production.example) lists required settings; the app does not read this file automatically. The build uses the committed pnpm lockfile. The hosted Linux build itself remains unverified.

Production refuses to start without an HTTPS PUBLIC_ORIGIN, a SESSION_SECRET at least 48 characters, explicit database/backup paths and TRUST_PROXY_HOPS=1. Set the actual assigned onrender.com address as PUBLIC_ORIGIN, without a path. Keep one canonical hostname. Render must be the only public ingress and must overwrite forwarding headers; verify its live Host, X-Forwarded-Proto and client-IP behavior before launch. Never expose the application's plain HTTP port directly. Do not reuse this proxy setting on an arbitrary hosting topology.

Use a randomly generated secret (e.g. node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))") in private administrator tooling. Store it in the hosting secret field/password manager, never a repository or ticket. Verify a provider-generated value meets the length requirement. Production cookies are Secure, HttpOnly, SameSite=Strict, scoped to /api; HSTS and same-origin write checks are enabled. No cross-origin API is supported. No API keys for Stripe or mail providers are needed.

Business dates use one fixed calendar, America/Los_Angeles (Pacific Time), set in code (BUSINESS_TIME_ZONE in domain.js). The service's TZ variable no longer affects any business date, so the existing `TZ=America/Chicago` value in the hosting configuration is inert for QuoteTend and should be removed or aligned by whoever next edits that configuration. There is no per-business timezone yet; tell owners outside Pacific Time before selling across timezones.

## Owner access and recovery

New local accounts can register directly. Production requires a random, email-bound, one-use invitation expiring after 48 hours. Verify the prospective owner's email through an independently established contact channel before issuing it. This is operator verification, not automated email verification. No invitations are sent by QuoteTend.

On the intended server, after explicit external authorization:
- node invite-owner.mjs verified-owner@example.com creates a code and invalidates previous invitations for that email.
- Hand the code privately to that verified owner during assisted onboarding; never put it in a URL or public log.
- The owner chooses their password, creates an empty workspace, opens Account security and stores a recovery code privately.
- Recovery codes are random 256-bit bearer secrets, stored as SHA-256 hashes, replaceable and one-use. Unlike short-lived email reset links, an offline saved recovery code stays valid until used, replaced or invalidated by a password change. Password hashing remains bcryptjs; sessions remain express-session/SQLite.
- Change password requires the current password. It invalidates that owner's sessions and recovery code. Sign in and issue a new code afterward.
- /signin → Forgot your password accepts owner email, saved code and a new password. No email service is required or connected. Both other sessions and the used code become invalid.
- If both password and recovery code are lost, do not reset on the strength of an email address, invoice screenshot or request alone. Independently verify business ownership using the contact channel established at onboarding. If uncertain, keep access blocked and escalate to the owner; do not guess.

The existing offline command node manage-accounts.mjs reset-password owner@example.com is an administrator fallback. Stop the server first, check QUOTETEND_DB, verify ownership, and keep its generated password private. It invalidates ALL account sessions and that owner's recovery code. It never sends the password.

For cancellation or a verified access problem:
- node manage-accounts.mjs suspend-owner owner@example.com blocks the owner and revokes their sessions without deleting business records or changing billing.
- node manage-accounts.mjs resume-owner owner@example.com restores access, again revoking sessions.
- These commands do not cancel a Stripe subscription, refund payment, send notices or automatically execute at a future date. Operator action is required at the agreed paid-through date. Unrelated businesses stay available.
- Export and deletion requests require separately verified ownership. Do not offer a retention/deletion deadline until the operating policy, including backup retention, is approved and executable.

## Consistent backups and isolated recovery

Startup creates a verified whole-database SQLite backup. Further backups run every six hours. The online SQLite backup API gives a consistent copy; integrity and foreign-key checks run before the final filename is published. Temporary .partial files are not recovery sources. Startup fails if its first backup fails. Later failures emit backup_failed and make /healthz unhealthy.

Default backup directory: backups beside the selected database. Production: /var/data/backups. These include ALL businesses, password hashes, sessions, ledger, opt-outs, recovery hashes and invitation hashes. Treat them as private credentials/customer data. They are not the in-app JSON backup, and must never be served by the app.

PowerShell (from the project, using the qtNode variable in START_HERE):
```powershell
# Creates another consistent backup of the selected QUOTETEND_DB (or default local DB).
& $qtNode backup-accounts.mjs create 'C:\PrivateQuoteTendBackups'
# Replace the source below with an actual generated filename.
& $qtNode backup-accounts.mjs verify 'C:\PrivateQuoteTendBackups\ACTUAL-BACKUP.sqlite'
# Destination must be new. This never overwrites an existing database.
& $qtNode backup-accounts.mjs restore-copy 'C:\PrivateQuoteTendBackups\ACTUAL-BACKUP.sqlite' 'C:\PrivateQuoteTendBackups\isolated-recovery.sqlite'
```

For fictional rehearsal, use a new directory under TEMP instead of these illustrative paths. To open the isolated restored database, set QUOTETEND_DB to its absolute filename, PORT to an unused port, and start the server. Stop it afterward and remove those environment overrides before starting the normal app. A new port alone does not isolate account data.

Live recovery runbook:
1. Put the service in maintenance; preserve the current database and latest consistent backup. Record the incident time. Do not overwrite the current file.
2. Retrieve a complete backup to a new isolated path; verify it and open it with the matching application release. Check owners, record counts, event sequence, latest contact/outcome, retained opt-outs, drafts and sample sign-in.
3. Reconcile opt-outs and transactions newer than the backup before reopening any workspace. Whole-database rollback affects all businesses and bypasses in-app opt-out retention. Lost recovery-code consumption, invites and passwords can also be rolled back: invalidate invitations/recovery codes and sessions in the recovered copy, and arrange verified password re-establishment if credentials changed after the backup.
4. After explicit recovery approval, point the stopped application at the verified replacement path. Keep the previous files for investigation; do not delete them. Start, check /healthz and rehearse a fictional workspace before removing maintenance.
5. Document the actual loss window and notify affected owners only with authorization. Never claim zero data loss.

Same-disk backups do not protect against disk/account loss. Before accepting customers, verify a DAILY off-service copy to encrypted owner-controlled storage, including retrieval and isolated restore. For the first few customers, an explicitly assigned operator can perform this; it is not automated by the app. Target worst-case off-service loss window: 24 hours if that daily process succeeds. Six-hour backups only cover failures where the disk survives. Recovery-time target is not measured yet.

No backups, old research or user files are automatically pruned. Check disk usage daily; review growth weekly. Seven days of six-hour backups means about 28 copies plus restarts/migration copies. Budget capacity from actual DB size, and approve retention only after off-service copies are verified. Do not treat volume snapshots as the database recovery procedure.

## Shutdown and restart

`node server.mjs` handles SIGTERM (what Render and containers send) and SIGINT (Ctrl+C) the same way: one bounded shutdown. Calling `close()` on a started server runs the same shutdown in code, without the process exit and watchdog (steps 1–6). The sequence:

1. Stop accepting connections. New connection attempts are refused at once.
2. Close every connection with no request in progress. That covers idle keep-alive connections and connections that have not sent a complete request: browser pre-connections and stalled clients. Before Sprint 3B.1 the second kind could hold shutdown open forever (see [SPRINT3B1_SHUTDOWN](SPRINT3B1_SHUTDOWN.md)).
3. Let requests already in progress finish, for up to **10 seconds** (`SHUTDOWN_GRACE_MS` in server.mjs). Responses sent during shutdown carry `Connection: close`, so each connection ends with its response. A request that arrives on an already-open connection in this window is still answered, and then that connection closes.
4. If a request is still running when the 10 seconds end, its connection is destroyed. This is a **forced** shutdown. The client gets no response; the app's existing "No success was confirmed. Reload to check saved data." handling applies.
5. The six-hourly backup schedule is cancelled at step 1. A backup already running is allowed to finish, so its verified file is published or its `.partial` file removed as usual.
6. SQLite is closed, exactly once, after steps 1–5.
7. The process exits with **0** after a clean shutdown and **1** after a forced or failed one. As a last resort, a watchdog exits with 1 after **15 seconds** (`SHUTDOWN_WATCHDOG_MS`) if a later stage never finishes (for example a backup stuck on a stalled disk), so the reason is logged before the platform's SIGKILL.

A second SIGTERM or SIGINT during shutdown is logged and ignored; it does not cut the drain short. Stopping faster means the platform's SIGKILL, which drops in-flight requests. A signal that arrives before startup has finished (migrations, the verified startup backup) is not intercepted and ends the process immediately, as before.

**Why data stays consistent.** Every write is a single synchronous SQLite transaction; none spans an `await`. The database is never closed mid-transaction, so any request, including one cut off at the deadline or by SIGKILL, either committed completely or not at all. A request whose connection was destroyed at the deadline can still be running (password hashing, for instance). It then finds the database closed and fails without writing. Completed saves survive a restart; the tests listed in SPRINT3B1_SHUTDOWN check this.

**Logs.** Shutdown events are JSON on the same stream as the other app logs. They contain event names, counts, durations and stage names only. They never contain paths, request data or error text.

| Event | Meaning |
| --- | --- |
| `shutdown_signal` / `shutdown_signal_repeated` | `signal` received; repeats are ignored |
| `shutdown_started` | `graceMs`, open `connections` |
| `shutdown_deadline` | the grace period ran out with `connections` still open |
| `shutdown_complete` | `forced` (false = clean), `durationMs` |
| `shutdown_failed` | `stages` that failed (`http`, `database`), `forced`, `durationMs` |
| `shutdown_watchdog_expired` | the 15 s ceiling was reached |
| `shutdown_exit` | exit `code` |

**Why 10 seconds.** Render's documentation (Deploys; Disks; "How Render handles zero-downtime deploys", read 2026-10-15) says:

* Render sends SIGTERM, waits a shutdown delay (30 s by default, `maxShutdownDelaySeconds` up to 300 s), then sends SIGKILL.
* A service with a persistent disk is stopped *before* its replacement starts, so every second spent draining is user-visible downtime.

QuoteTend's slowest requests are bcrypt password hashing and a save of up to 5 MB. Ten seconds is ample for those and short enough not to stretch a deploy. The 15 s watchdog still fits inside the documented 30 s default even if no longer delay is applied.

**Deployment implications.**

* A routine restart or deploy should log `shutdown_complete` with `forced: false` and exit 0, normally within milliseconds.
* Treat exit 1, `shutdown_deadline`, `shutdown_failed` or `shutdown_watchdog_expired` as an incident. Find which requests were in flight, then check the next `/healthz` and the latest backup.
* With the persistent disk, downtime is roughly this shutdown (usually under a second, at most 15 s) plus startup (migrations, the verified startup backup, listen). Keep the maintenance window.
* No new configuration is required, and render.yaml is unchanged.

**Not verified on Render.** All evidence is local. Check these on staging with disposable data before relying on them:

1. That SIGTERM reaches the Node process. If the start command runs under a shell that does not forward signals, there will be no `shutdown_signal` log and the process is SIGKILLed after the delay. A staging restart should log `shutdown_signal` through `shutdown_exit`.
2. The real shutdown delay for a disk-backed service. render.yaml sets `maxShutdownDelaySeconds: 60`. A Render community forum report (not confirmed, and not addressed in the official docs) says the API refuses that setting for services with a disk. The app does not depend on it: its 15 s ceiling is inside the documented 30 s default.
3. How Render's proxy handles connections the app closes during shutdown (retries or 502s), and whether it keeps idle upstream connections longer than Node's 5 s keep-alive timeout. The second is a pre-existing risk not changed here.
4. Whether manual restarts, suspensions and instance replacements follow the same SIGTERM → delay → SIGKILL sequence as deploys.
5. How long the slowest requests take on the starter plan's CPU.

## Monitoring and release rollback

/healthz returns only ok/unhealthy, with 200/503, based on database readability and a successful backup within eight hours without a later failure. It is not proof of off-service copies or complete business correctness. Configure a live external monitor and an actionable notification recipient after approval; verify an alert by causing an isolated health failure. There is no connected alert provider today.

App logs are JSON: timestamp, backup success/failure, shutdown events (see Shutdown and restart), or 5xx request ID/status/method. No bodies, email addresses, passwords, recovery codes, query strings, draft text or raw exception messages are logged. X-Request-Id links a user's failed request with the error log. Generic logging limits diagnostic depth deliberately. Monitor 5xx frequency, health, memory/CPU, backup age and disk space in hosting operations. Provider access-log retention and permissions need review too.

Before each deploy: save the current release identifier, export a consistent DB copy off-service, test a copy against the new migration, and run the suites. Manual deployments only. Persistent disks mean brief downtime; arrange a maintenance window.

Rollback application code only to a release that supports the current schema. An older schema-1 build deliberately refuses schema 2. Prefer a forward fix; a DB rollback requires the recovery procedure above and reconciliation of later opt-outs. No automatic DB downgrade or overwrite is provided. Live rollback has not been rehearsed.
