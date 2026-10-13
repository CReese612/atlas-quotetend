# Sprint 3A — Authentication and tenant-isolation hardening

Branch `security/tenant-isolation-hardening`, created from `origin/venture/development` at
`dbf9242295e5c52b8dd9f87c45e655b2a4fe1d3e` (Sprint 2.1, PR #1). All test data is fictional. Nothing was deployed, no
hosted system was contacted, no pull request was opened, and `main` / `venture/staging-qa` were not touched.

**Outcome in one paragraph.** The tenant boundary held: after an independent code review and 38 new direct-API
tests, no route allowed one business to read or change another business's data. The review did find seven smaller
defects (one cross-tenant metadata leak, five input-validation or hardening gaps, one session-revival gap on restore).
Each was reproduced by a failing test, fixed minimally, and re-verified. No P0 is known. Remaining P1 items are
operational (audit log, per-account throttling, off-host backups, hosted verification), listed in section 8.

## 1. Architecture and threat model

### How a request is authenticated (as built)

1. `server.mjs` rejects any `Host` that is not the configured origin (production) or loopback on the server's own
   port (local), forces HTTPS in production, and sets `no-store`, `nosniff`, `Referrer-Policy: no-referrer` and a
   strict CSP (`default-src 'self'`, no inline script or style, `frame-ancestors 'none'`).
2. `account-api.mjs` blocks every non-GET request unless `Origin` equals the configured origin, `X-QuoteTend-Request: 1`
   is present and the body is `application/json`. Cookies are `HttpOnly`, `SameSite=Strict`, `Path=/api`, `Secure` in
   production, 8 hours.
3. Sessions live in SQLite (`sessions`), cookie-signed by `express-session`. A session records `ownerId`,
   `credentialVersion` (SHA-256 of the owner's bcrypt hash) and `started`. A request is accepted only if the owner
   exists, is not suspended, the credential version still matches, and the session is under 8 hours old.
   Sign-in and registration regenerate the session ID.
4. **The business is never taken from the request.** `/workspaces/:businessId` is compared with `req.owner.business_id`
   (mismatch → 404, identical to an unknown ID). Every handler then calls the store with `req.owner.business_id`, never
   with the URL value. Every tenant table query in `ledger.mjs` / `account-store.mjs` is keyed by `business_id`
   (`businesses`, `measurement`, `estimate_identity`, `events`, `operations`, `safety_snapshots`, `retained_optouts`).
5. All writes are one `POST /commands` transaction (`BEGIN IMMEDIATE`) guarded by a per-business revision and a
   per-business request ID (idempotent replay, stale-revision refusal). Whole-workspace `PUT` returns 405.

### Assets, actors and boundaries

| Asset | Held in | Actors considered |
| --- | --- | --- |
| Estimates, customer phone/address/e-mail, notes, drafts | `businesses.quotes` | other contractors; anonymous internet; XSS via stored text |
| Contact/outcome evidence, opt-outs, snapshots | `events`, `retained_optouts`, `safety_snapshots` | other contractors |
| Credentials, recovery code, invitations, sessions | `owners`, `recovery_codes`, `invitations`, `sessions` | anonymous attackers; stolen cookie; stolen backup |
| Operator tools | `manage-accounts.mjs`, `invite-owner.mjs`, `backup-accounts.mjs` | local shell only; no network route exists |

### Classification of findings

| Class | Meaning | Items |
| --- | --- | --- |
| **Verified defect** | reproduced by a test that failed before the fix | D1–D7 (section 4) |
| **Verified secure** | attacked directly, held, kept as a regression test | everything in section 3 |
| **Hypothetical / not testable here** | depends on hosted configuration or future features | section 9 |
| **Missing coverage (now closed)** | behaviour was correct but unproven | boundary, replay, fixation, CSRF, exposure tests |

## 2. Inspected tenant-facing surface

Every route in `account-api.mjs` and `server.mjs`, plus the three operator CLIs. "Scoped by" is how tenancy is derived.

| Route | Auth | Scoped by | Result of review |
| --- | --- | --- | --- |
| `GET /healthz` | none | – | returns only `{status}` |
| `GET /api/configuration` | none | – | two booleans only |
| `GET /account`, `/signin`, `/security`, shared assets | none | exact allow-list, no path joining | no source, DB, docs or `.git` reachable |
| `POST /api/register` | none (+ invitation in production) | creates a new business | invitation: hashed, email-bound, one-use, expiry exclusive |
| `POST /api/login` | none | email lookup | uniform 401 for wrong password, unknown email, suspension; session regenerated |
| `POST /api/recover` | none | email + recovery code | uniform 400; one-use; revokes that owner's sessions only; does not sign in |
| `POST /api/logout` | session optional | current session | CSRF-protected; row deleted server-side |
| `GET /api/me`, `POST /api/password`, `POST /api/recovery-code` | session | `req.owner` | password change revokes all that owner's sessions |
| `GET /api/workspaces/:id` | session | session owner's business | other ID → 404 |
| `PUT /api/workspaces/:id` | session | – | 405 by design |
| `POST /api/workspaces/:id/commands` | session | session owner's business | create, edit, outcome, draft, contact, correct-contact, import, restore, release-optout all scoped; revision + request-ID checked |
| `GET …/results`, `…/events` | session | session owner's business | scoped; D1 fixed |
| `GET …/snapshots`, `…/snapshots/:snapshotId` | session | `business_id AND id` | foreign snapshot ID → 404 |
| unknown `/api/*` | – | – | 401 anonymous, 404 signed-in; no admin, export, backup, debug or metrics route exists |
| `manage-accounts.mjs`, `invite-owner.mjs`, `backup-accounts.mjs` | shell access | explicit email/path | not network reachable |

## 3. Security tests added (38 node tests + 1 browser script)

Run with `npm test` (node:test) and `npm run test:security:browser`. Two fictional businesses with different owners,
sessions, estimates, contacts, outcomes, opt-outs and snapshots are attacked over real HTTP. Each attack asserts the
status, that no private marker string appears in the response, and (where it matters) that a full-database
fingerprint of the target tenant is byte-identical afterwards. Disabling the tenant check, un-scoping the snapshot
query, or disabling the HTML escaper makes the corresponding tests fail.

| File | Tests | Covers |
| --- | --- | --- |
| `tests/security-tenant-isolation.test.mjs` | 8 | B vs A workspace, estimates, phone/address, queues, results, events, snapshots and IDs, every command kind, forged/reshaped business IDs (case, encoding, traversal, query, headers, body), shared estimate/request IDs, cross-tenant import/restore/export, opt-out list separation, per-business event ordinals |
| `tests/security-sessions.test.mjs` | 10 | missing/garbage/tampered/wrongly-signed/unknown-sid cookies on 10 routes; wrong-password uniformity; fixation and rotation; cookie flags; logout and revocation; password change; suspension (incl. recovery and planted rows); frozen-clock 8-hour and store-expiry boundaries; inconsistent session records; concurrent sessions |
| `tests/security-invitations-recovery.test.mjs` | 9 | missing/wrong/other-email/expired/used/double-submitted invitations; no account takeover; hashed storage; `invite-owner` CLI; recovery code issue/consume/reuse/replace/cross-owner; uniform failures; racing recovery; throttle precedes code check |
| `tests/security-requests.test.mjs` | 10 | CSRF matrix on all mutating routes; production origin/HTTPS/Host; local DNS-rebinding guard; static allow-list and traversal; no admin/debug/export routes; error and log hygiene with injected DB fault; pre-auth body limits; stale/replay/racing/malformed commands; forged identity, history and evidence; opt-out integrity |
| `tests/security-backup.test.mjs` | 1 | restored copy keeps data and credentials, drops sessions |
| `tests/security-xss-browser.mjs` | 16 checks | hostile payloads in every text field, business name, notes, drafts, corrections, CSV import; all private views |
| `tests/helpers/security-harness.mjs` | – | per-test temp DB/port/rate-limit state, raw HTTP client, tenant seeding, DB fingerprint, cookie forging |

## 4. Demonstrated vulnerabilities and corrections

Severity is for the product as hosted for first customers. None allowed cross-tenant data access.

| ID | Defect (reproduced first) | Severity | Fix commit |
| --- | --- | --- | --- |
| D1 | `GET /events` returned the database-wide event counter. The second business seeded in the test started at sequence 21, so a contractor could infer how much other contractors were doing. | P2 cross-tenant metadata leak | `f3f251b` — API renumbers the caller's events 1..n (and `outcomeSequence`); storage and ordering unchanged |
| D2 | Session guard computed `Date.now() - started`; a non-numeric `started` gave `NaN` and skipped the 8-hour limit, a future value extended it, and a non-string `ownerId` caused a 500. Needs write access to the session table, so defense in depth. | P2 | `d01299d` |
| D3 | `tokenHash` used `String(value)`, so `{"code":["<code>"]}` or `{"invitation":["<invite>"]}` matched the real secret. The secret was still required. | P2 validation | `2b9b1dd` — only strings are hashed |
| D4 | Every API route parsed up to 5 MB of JSON before the caller was identified; only auth routes were rate limited. | P2 resource exhaustion | `35fa106` — 16 KB parser for auth routes; the 5 MB parser runs only for the authenticated owner's own business |
| D5 | A malformed `%`-escape in the URL (e.g. `/api/workspaces/%E0%A4%A`) was reported as a 500 and logged as `request_failed`. No data leaked. | P3 | `f6a7564` — returns 400 |
| D6 | Command `requestId` was regex-tested without a type check, so a JSON number or one-element array passed and was stored as text. | P3 | `e51070a` |
| D7 | `backup-accounts.mjs restore-copy` carried the backup's live sessions into the restored database (valid up to 8 h), reviving a hijacked session after an incident. | P2 | `e1e6816` — sessions deleted in the new copy |

Each fix commit contains its regression test. The commit history has the test-only commit first where the test passed
without a code change.

## 5. Tests executed and exact results

Environment: Node v24.19.0, Windows 11, local machine, fictional data. Commands from the repository root.

| Run | Command | Result |
| --- | --- | --- |
| Baseline (`dbf9242`, before any change) | `node --test tests/*.test.mjs` | 98 tests, 95 pass, **3 fail** (2 missing external Grok files, 1 timezone), exit 1 |
| This branch, fresh `git clone` of the branch, default timezone (evening US Central) | `node --test tests/*.test.mjs` | **136 tests, 135 pass, 1 fail**, 14.3 s, process exits on its own |
| Same fresh clone, `TZ=UTC` | `TZ=UTC node --test tests/*.test.mjs` | **136 tests, 136 pass, 0 fail**, 14.5 s, exit 0 |
| Security tests only | `node --test tests/security-*.test.mjs` | 38 / 38 pass |
| XSS browser | `node tests/security-xss-browser.mjs` | 16 checks pass, exit 0 |
| Public site browser | `node tests/public-site-browser.mjs` | 27 / 27 groups pass, exit 0 |
| Private app browser, as shipped, evening Central | `node tests/browser-rehearsal.mjs` | stops at group 11 on the timezone issue in section 6 (**identical failure on baseline `dbf9242`**) |
| Private app browser, server and browser pinned to UTC (scratch copy adding `timezoneId: 'UTC'`, not committed) | `TZ=UTC node tests/_tzrun.mjs` | **24 / 24 groups pass**, exit 0; same result on baseline |

The single remaining failure is `results.test.mjs › backdated owner-entered contacts…`, explained next. It is not
related to security and passes whenever the local calendar date equals the UTC date (until about 18:00–19:00 US Central, depending on daylight saving).

## 6. Clean-checkout fixture status

* **Resolved (`f4ce9a8`).** `tests/interview-ready.test.mjs` read four CSVs from an untracked, gitignored
  `Grok Bot Research & Product Testing/` folder (2 tests failed with `ENOENT` on any clean checkout). They now read four
  new fictional fixtures in `tests/fixtures/import/` that reproduce the same relationships (identical pair, same-ID
  conflict, exact match, attempted reopen of won/lost, attempted opt-out clear, shared e-mail with an opted-out sibling,
  frozen-date due rules, invalid rows). Reserved `example.com` addresses and "Fictional Customer" names only; nothing
  was copied from the research folder. No assertion was edited, removed or skipped.
* **Left alone, documented.** `tests/review-grok-fixtures.mjs` is a manual script (not run by `npm test`) that still reads
  the external folder, including `estimates-test_GrokBot` (first-pass research file). It needs no change for CI.
* **Open, proposed as a separate commit (not security).** `results.js` (`weeklyCoverage`, line 69) and `app/views.js`
  (line 155) take `startedAt.slice(0, 10)`, the **UTC** calendar date of an ISO timestamp, and compare it with
  `todayISO()` / week boundaries, which are **local** dates. After about 19:00 US Central the page says "This reporting
  period began *tomorrow*" and counts today's contact as backdated. Production sets `TZ=America/Chicago`, so a Chicago
  contractor sees this every evening. Proposed patch: add `localDateOf(iso)` to `domain.js` (bare `YYYY-MM-DD` input
  returned unchanged, otherwise the local-calendar date using the same getters as `todayISO`) and use it in those two
  places; verify the existing results and browser tests with `TZ=UTC`, `America/Chicago` and `Pacific/Kiritimati`.

## 7. Implications for the future founder Command Center

Not built and no privileged route was added. Findings that constrain the design:

* There is currently **no** privileged identity. Operator power is shell access to the host. A Command Center must not
  be a flag on `owners`; it needs its own identity store and cookie name/path, separate from the tenant session, with
  **mandatory MFA**, short idle and absolute lifetimes, and re-authentication for destructive actions.
* Authorization must be explicit and server-side per action (read tenant metadata, suspend, resume, issue invitation).
  Today every handler derives tenancy from `req.owner`; admin handlers must instead take a target business ID, check the
  admin's permission, and **never reuse the tenant handlers** (they would silently scope to the admin's own, empty business).
* Default to **metadata-only** access. Customer content (estimates, phone, address, notes) should need a logged,
  time-boxed, reason-recorded break-glass action, because the tenant isolation tests prove those fields are otherwise
  unreachable and a support tool would be the first deliberate hole.
* There is **no audit log** for authentication or administration (sign-ins, password changes, recovery use, suspensions,
  invitations exist only as side effects). An append-only audit table written in the same transaction as each admin
  action is a prerequisite, and tenant-visible events must not expose other tenants (see D1).
* Impersonation should not exist. If ever needed it must be a visibly marked, read-only, audited session distinct from a
  normal owner session.
* Reuse the existing patterns that tested well: uniform failure responses, hashed one-use tokens, `credentialVersion`
  session invalidation, suspension that revokes sessions, and the CSRF header/origin gate.
* Keep the admin surface off the public origin or behind an additional network allow-list, and add its own CSP, rate
  limit and security tests before shipping.

## 8. Remaining risks

**P0 — none known.**

**P1 — before the first paying customer**

1. **No authentication audit trail.** Sign-in, failure, password change, recovery use, suspension and invitation events
   are not recorded, so an incident cannot be reconstructed. (Logs deliberately contain no identifiers.)
2. **Throttling is per IP only** (40 requests / 15 min shared across register, login, recover, password, recovery-code).
   There is no per-account lockout or slow-down, so a distributed guess against one owner is unmitigated beyond bcrypt
   cost 12 and the 12-character minimum.
3. **Backups are on the same persistent disk** as the database (`/var/data/backups`) and are not encrypted or copied
   off-host. Disk loss loses both. A restore drill from an off-host copy has not been rehearsed (D7 now makes restores
   session-safe).
4. **Hosted behaviour is unverified** (section 9): proxy hop count, `Secure` cookies, HSTS and per-client rate limiting
   behind Render's proxy.

**P2 — backlog**

* Recovery codes never expire (single use, 256-bit, replaced on reissue).
* No idle timeout, no "sign out other devices" button, no session list. Absolute lifetime is 8 hours.
* No general rate limit on authenticated routes; any one owner can issue many large commands (bounded by 5 MB, 5,000
  estimates, 4.8 MB workspace cap).
* Local (non-production) registration reveals existing e-mails (409). Production requires an invitation first.
* Backup files contain password hashes and (until restored) session IDs unencrypted; protect the directory.
* `manage-accounts.mjs reset-password` prints the new password to stdout.
* Passwords are length-checked only (no breached-password check).
* Operator CLIs assume the server is stopped; concurrent use is documented but not enforced.
* Results "began" date is off by one in US evenings (section 6; correctness, not security).

## 9. Hosted-testing limitations

All evidence is from local runs. Per sprint rules nothing was run against Render staging, no real accounts exist, and no
network service other than loopback was used. Not verified, and must be checked by Atlas/Codex on staging with
disposable data before a customer relies on it:

* `TRUST_PROXY_HOPS=1` matches Render's real topology (otherwise client IPs, rate limiting and `req.secure` are wrong).
* `Secure`, `HttpOnly`, `SameSite=Strict` cookies and HSTS actually arrive through the proxy; HTTP is refused.
* `PUBLIC_ORIGIN` equals the browser's origin exactly (a mismatch makes every write a 403).
* The persistent disk, backup directory permissions and the scheduled backup run in the hosted instance.
* Render dashboard settings (Auto Deploy off, PR previews off, no Blueprint syncing from this branch) could not be read
  from here. Repository-side there is no CI workflow, `.github`, Blueprint trigger or other automation on any remote
  branch; `render.yaml` has `autoDeployTrigger: off` and is marked "prepared only".
* Real e-mail delivery, payments and the production domain are out of scope and untested.

## 10. Recommended next engineering work

1. Authentication and administration audit log (append-only table, same transaction), then per-account throttling.
2. Off-host encrypted backups plus a documented, timed restore drill (including the session purge).
3. Hosted staging verification of section 9 using synthetic accounts; add a read-only smoke script for it.
4. Separate small commit for the Results timezone fix in section 6, with tests under three timezones.
5. Session management UX: idle timeout, list and revoke sessions, sign out everywhere.
6. Command Center design review against section 7 before any admin code is written.
7. Add `npm run test:security:browser` and `npm test` under `TZ=UTC` to whatever CI is chosen.

## Reproducing this branch

```bash
git fetch origin
git switch security/tenant-isolation-hardening
npm test                         # node:test, 136 tests
TZ=UTC npm test                  # all pass at any time of day
npm run test:security:browser    # needs Edge/Chromium (set QUOTETEND_BROWSER_PATH for another build)
npm run test:public:browser
git log --reverse --stat dbf9242..HEAD
```
