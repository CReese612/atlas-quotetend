# Sprint 3A — Authentication and tenant-isolation hardening

Branch `security/tenant-isolation-hardening`, created from `origin/venture/development` at
`dbf9242295e5c52b8dd9f87c45e655b2a4fe1d3e` (Sprint 2.1, PR #1). All test data is fictional. Nothing was deployed, no
hosted system was contacted, no pull request was opened, and `main` / `venture/staging-qa` were not touched.

**Outcome in one paragraph.** The tenant boundary held: after an independent code review and 38 new direct-API
tests, no route allowed one business to read or change another business's data. The review did find seven smaller
defects (one cross-tenant metadata leak, five input-validation or hardening gaps, one session-revival gap on restore).
Each was reproduced by a failing test, fixed minimally, and re-verified. No P0 is known. Remaining P1 items are
operational (audit log, per-account throttling, off-host backups, hosted verification), listed in section 8.

> **Update — Sprint 3A.1 (independent QA remediation).** Codex QA confirmed D1–D7 corrected and found two more code
> issues, both now fixed on this branch: a residual 500 from a coercion-hostile stored `session.started` (D8) and
> incorrect Pacific business-date behaviour (the timezone issue first documented in section 6). Section 11 has the
> details, tests and results. **This branch is a review candidate, not production-ready**; the remaining gates are in
> sections 8, 9 and 11. **Sprint 3A.2** then fixed two further Codex re-audit findings (an accepted restore that left the app
> unable to render, and a calendar browser fixture that aged into a sign-in failure); see section 12.

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
without a code change. Sprint 3A.1 adds **D8** (residual session-start 500) — see section 11.

## 5. Tests executed and exact results

*This section records the original Sprint 3A run at `57989c8`. Sprint 3A.1 results, which supersede it, are in section 11.*

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
* **Was open; fixed in Sprint 3A.1 (`78e5e13`, see section 11).** `results.js` (`weeklyCoverage`, line 69) and
  `app/views.js` (line 155) took `startedAt.slice(0, 10)`, the **UTC** calendar date of an ISO timestamp, and compared
  it with `todayISO()` / week boundaries, which were **local** dates. After about 19:00 US Central the page said "This
  reporting period began *tomorrow*" and counted today's contact as backdated. The original proposal here (a
  server-local `localDateOf`) was superseded by an explicit Pacific business calendar, because Codex also showed the
  server's own `TZ` (Chicago) disagrees with the Oregon customers' day.

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
* ~~Results "began" date is off by one in US evenings~~ — fixed in Sprint 3A.1 (section 11).
* Bounded graceful shutdown (raised by Codex QA; not part of 3A.1): `server.close()` waits for idle keep-alive
  connections, so a deploy or restart can stall until the platform kills the process (`tests/browser-rehearsal.mjs`
  already has to force-close sockets to stop its test server). Needs a drain timeout and a matching platform setting.

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
4. ~~Results timezone fix~~ — done in Sprint 3A.1. Follow-up for the platform owner: remove or align the inert
   `TZ=America/Chicago` entry in the hosting configuration (`render.yaml` / `.env.production.example`, untouched here).
5. Session management UX: idle timeout, list and revoke sessions, sign out everywhere.
6. Command Center design review against section 7 before any admin code is written.
7. Add `npm run test:security:browser` and `npm test` under `TZ=UTC` to whatever CI is chosen.

## 11. Sprint 3A.1 — Independent QA remediation (pre-merge)

Draft PR #2 stays unmerged. Starting point `57989c8d72238da2c252ecd13053d797293c98e6`; base unchanged at `dbf9242`.

### Independent Codex QA findings

* **Confirmed:** all seven original defects D1–D7 are corrected.
* **P1 — Pacific business date.** `startedAt.slice(0, 10)` (in `results.js` and `app/views.js`) used the UTC date of a UTC
  timestamp, and `todayISO()` used the process's zone. Render runs `America/Chicago`, our first customers are in Oregon,
  so server due/overdue decisions, default effective dates, the "no later than today" limits and report `asOf`
  disagreed with the Oregon day.
* **P2 — residual session 500 (D8).** The session guard computed `Date.now() - started` before checking the type, so a
  stored `{"toString":null,"valueOf":null}` threw (HTTP 500) instead of returning the generic 401.
* **Not authorized in 3A.1 (still open):** bounded graceful shutdown, authentication audit log, per-account
  throttling, encrypted off-service backups, hosted proxy/cookie verification.

### D8 — session start validated before arithmetic (`251839b`)

`Number.isFinite(started)` (no coercion) now gates the subtraction; `ownerId` must be a string before lookup. Rejected with
the unchanged generic 401: `null`, arrays, ordinary and coercion-hostile objects, strings (including numeric strings),
booleans, `NaN`/`null`, `±Infinity`, future times and negatives. The exact 8-hour boundary and valid sessions are
unchanged (existing frozen-clock boundary test still passes). New regression test failed (HTTP 500) before the fix.

### Pacific MVP business-date policy (`78e5e13`)

One calendar for the whole product, `America/Los_Angeles` (`BUSINESS_TIME_ZONE` in `domain.js`), applied identically in the
browser and on the server and independent of the server's `TZ` and the browser's zone.

| Kind of value | Rule |
| --- | --- |
| Owner-entered `YYYY-MM-DD` (estimate, follow-up, contact, outcome, report range) | civil date; stored, compared and shown as written; never shifted, including across daylight-saving changes |
| Recorded timestamps (events `recorded_at`, measurement start, sessions, backups) | UTC instants, unchanged |
| Instant → day (`todayISO()`, the reporting period's start, history entries lacking a date) | `businessDateOf(instant)` via `Intl.DateTimeFormat.formatToParts` in the IANA zone; no fixed offsets; instants must carry an offset |
| Display of a restore time | formatted in the business zone |

Consequences: `todayISO()` drives queues, due/overdue, metrics, default contact/effective dates, the future-date limits,
`input[type=date]` limits, report ranges and `asOf` the same way everywhere. No schema, API shape or per-business setting
changed; a later per-business zone only passes its IANA name to `businessDateOf`. `render.yaml` was **not** edited (Blueprint
settings are out of scope): its `TZ=America/Chicago` is now inert for QuoteTend and should be removed or aligned by the
platform owner. The greeting ("Good morning") still uses the visitor's own clock; it is cosmetic.

### New regressions

| File | Tests | What it proves |
| --- | --- | --- |
| `tests/security-sessions.test.mjs` (added test) | +1 | 14 hostile `started` values → generic 401 on two routes, no `request_failed` log, no state change; genuine session still works |
| `tests/business-calendar.test.mjs` | 8 (9 when a zone is forced) | 21 frozen instants (Pacific winter and summer evenings, both sides of Pacific midnight in PDT and PST, Chicago-already-tomorrow, UTC midnight, spring-forward and fall-back boundaries incl. the 23- and 25-hour days); `businessDateOf`, `todayISO`, DST-safe civil arithmetic, due/overdue/queues, reporting start and weekly caption, ledger defaults, effective-date and range limits, `asOf`, and the HTTP API |
| `tests/business-calendar-matrix.test.mjs` | 4 | the file above in separate processes set to `America/Los_Angeles`, `America/Chicago`, `UTC`, `Pacific/Kiritimati` with identical expected values |
| `tests/business-calendar-browser.mjs` | 3 scenarios | real server process (own zone, frozen clock) + browser (own zone, frozen clock): 22:30 Oregon while Chicago/UTC are tomorrow (server Chicago, browser Kiritimati); one second before Pacific midnight (server Kiritimati, browser UTC); 2027 spring-forward (server UTC, browser Chicago). Signs in via the UI; checks due count, contact-form default and maximum, stored effective date and UTC `recordedAt`, `asOf`, range refusal, and "period began" text |

Failing before the fixes: session test 1 (500); calendar unit file 7 of 8; calendar browser 2 of 3 (the third, a DST
morning on which all zones agree, is a sanity scenario). The previously failing Pacific Results test now passes in every
zone with no dependence on the current clock.

Test technique notes: `tests/helpers/set-timezone.mjs` assigns `process.env.TZ` at start-up from `QUOTETEND_TEST_TZ`, which works
identically in every shell; browser zone comes from `QUOTETEND_BROWSER_TZ` (Playwright `timezoneId`). *Correction (3A.2):* this
section originally said Windows ignores shell `TZ=<IANA name>`. Independent QA could not reproduce that and re-measurement
showed it is specific to **Git Bash** (which left the machine zone in place); PowerShell, cmd, macOS and Linux honour a shell
`TZ`. *Superseded (3A.2):* the browser calendar test's fixed "real future" instants were themselves a latent defect; see section 12.

### Results (this machine, Node v24.19.0, Edge via Playwright)

| Run | Result |
| --- | --- |
| `npm test`, default environment (US Central) | **149 tests, 149 pass, 0 fail**, 14.4 s, exits by itself |
| Unit suite with `QUOTETEND_TEST_TZ` = `America/Los_Angeles`, `America/Chicago`, `UTC`, `Pacific/Kiritimati` | **150 / 150 pass in each** (149 + the zone self-check) |
| `npm run test:browser` default, then server = browser zone in each of the four zones | **24 / 24 groups** every time |
| Mixed zones (server / browser): Chicago/Los Angeles, Los Angeles/Kiritimati, UTC/Chicago, Kiritimati/UTC | **24 / 24** every time |
| `npm run test:security:browser` default and in each of the four zones | all pass (16 checks) |
| `npm run test:public:browser` default and in each of the four zones | **27 / 27** every time |
| `npm run test:calendar:browser` | **3 / 3 scenarios** |
| Security regressions D1–D7 | `tests/security-*.test.mjs` 39 / 39 pass (38 original + D8 test) |

### Remaining gates (not production-ready)

Section 8's P1 items are unchanged and unauthorized for this assignment: authentication audit log, per-account
throttling, encrypted off-service backups with a restore drill, bounded graceful shutdown, and hosted verification of
the proxy hop count, `Secure` cookies and HSTS (section 9). Also pending: the platform owner aligning the inert `TZ` entry,
and Codex re-audit of this branch.

### Sprint 3A.1 commits

| Commit | Summary |
| --- | --- |
| `251839b9ca99cbccea27e371ae2dedbc60c4193b` | fix(session): validate stored start before arithmetic |
| `78e5e130071847602a148a1a97b3af77a620b116` | fix(dates): align reporting with Pacific business day |
| `425e4b33b242a0985ba21933aa7095cb7b118f94` | test(dates): add frozen-clock browser calendar test and zone controls |
| *(this documentation commit)* | docs(security): record Sprint 3A.1 QA remediation — the branch head is the new candidate; its SHA is in the handoff |

## 12. Sprint 3A.2 — Restore rendering and browser-test reliability

Independent Codex re-audit of `98e19b3` accepted D8 and D1–D7 and the core Pacific day calculation, and returned **NO-GO
for merge, staging and production** on two new findings. This section records both, the fixes and the evidence. PR #2
remains an unmerged draft; this is still not production-ready.

### R1 — an accepted restore could leave the app unable to render (P1) — fixed in `1ff2479`

* **Reproduction (my own, in a real browser through the Settings restore dialog, synthetic data):** restore an export whose
  history entries include `at: "2030-07-10T12:00:00"` (no zone). The restore returns success; after it, the overview and the
  estimate details never render ("Loading your workspace…") and the page logs
  `Expected a valid instant (Date, epoch milliseconds or an ISO timestamp with an offset) or a YYYY-MM-DD date.` — the same
  error Codex recorded. Follow-ups, Results and Settings still rendered because they do not draw history.
* **Cause (confirmed, and the only one found):** `parseBackup` accepts any history `at` that starts with a valid date and that
  `Date.parse` can read, including zone-less, date-only and space-separated values. Sprint 3A.1 changed `historyDate` in
  `app/ui.js` to `businessDateOf(h.at)`, which correctly refuses zone-less strings, so rendering threw while validation said
  yes. Sprint 3A.1 assumed every history `at` was an offset-bearing instant; that assumption was wrong. A scan of every other consumer of history
  `at` found only `app/views.js` (recent-activity sort by raw string; cannot throw and unchanged behaviour).
* **Policy (one function, `historyDay` in `domain.js`, never throws):** (1) an explicit civil `date` on the entry wins;
  (2) an ISO timestamp that carries an offset is a real instant and shows its **Oregon business day**; (3) anything else —
  zone-less, date-only, space-separated — shows **the date as written**. No zone is invented, nothing is rewritten, dropped or
  assigned a UTC meaning; an unusable entry yields a blank date instead of blanking the screen. Validation, storage, API
  and schema 3 are unchanged, and the importer still refuses unsupported values (`garbage`, `12:00:00`, impossible dates, a
  non-string `at`, an invalid explicit `date`).
* **Before the fix:** `restore-history-browser.mjs` failed 3 of 8 steps (overview, estimate details with history, sign-out and
  sign-in again), each with the page error above; both new unit tests failed.
* **Tests added:** `tests/restore-history-browser.mjs` (8 steps) — pre-restore workspace; restore through the real dialog of an
  accepted export (zone-less, date-only, space-separated, UTC, offset and explicit-date history; an opted-out customer; a
  saved draft); overview after reload; estimate details with each entry's documented date; follow-ups; Results; Settings and the
  safety-copy list (holds exactly the pre-restore workspace); reload, sign out and sign in again; and stored records, history
  byte-for-byte, notes, draft, retained opt-out, `workspace_restored` actor, new epoch and no logged server fault. Two unit tests
  in `business-calendar.test.mjs` (13 policy cases incl. DST-adjacent instants; every value the importer accepts has a day,
  accepted history is kept unchanged, unsupported values still refused) run in all four zones via the matrix. Note: the
  Settings **estimate** export (`Export JSON`) and CSV paths were not changed.

### R2 — frozen calendar browser suite aged into an authentication failure (P2) — fixed in `4bd69c7`

* **Reproduction (October 15, 2026, real clock `2026-10-15T05:51Z`):** `npm run test:calendar:browser` → scenario 1 fixed at
  `2026-10-14T05:30:00Z` never leaves `/signin`; 2 pass / 1 fail, exit 1. The server stamps the session cookie
  "frozen instant + 8 h" = `2026-10-14T13:30Z`, already past on Chromium's real clock, so the browser discards it. Not a
  product login failure; the application's Pacific maths is unaffected.
* **Fix:** the browser scenarios are derived from the moment the test runs (`tests/helpers/future-scenarios.mjs`): the nearest
  upcoming occurrence, at least 36 h ahead, of (1) Oregon 22:30 while Chicago and UTC are already tomorrow, (2) one second
  before Pacific midnight (PST), (3) the spring-forward 03:00 PDT morning, (4) the fall-back repeated 01:30 hour (new; nothing
  skipped or weakened). The expected Oregon day comes from an **independent oracle** — the published US daylight-saving rules
  with fixed offsets and plain arithmetic, no `Intl`, no application code. Historical fixed boundary instants remain in the unit
  suite, where no browser cookie is involved. Cookie security is untouched: after sign-in the test asserts a real, unexpired,
  HttpOnly, SameSite=Strict session cookie and a 200 from the protected API.
* **Safeguards:** an up-front `FIXTURE CLOCK ERROR` if any frozen instant would give an expired cookie; and if sign-in fails and
  the browser kept no session cookie, the failure is labelled a fixture problem (demonstrated with the stale October 14 instant
  in a throwaway copy). `tests/browser-fixture-clock.test.mjs` (3 unit tests) simulates the suite being run on every 6th hour
  from 2026-10-15 through 2032 and checks that every scenario stays in the future, still shows its named condition
  (Chicago and UTC a day ahead; second Sunday of March; first Sunday of November), matches an `Intl` cross-check, and that the
  old instant is reported as a fixture error — so a decaying fixture now fails in the fast unit suite, not mysteriously in a browser.

### Results (Node v24.19.0, Edge/Chromium via Playwright; US Central machine; zones set per process and per browser)

| Run | Result |
| --- | --- |
| `npm test` (default env) | **154 / 154 pass**, 0 fail, 0 skipped, exit 0, ~15 s, exits by itself |
| Unit suite, process zone forced to Los Angeles, Chicago, UTC, Kiritimati (PowerShell) | **155 / 155 pass in each** (154 + zone self-check), 0 skipped / cancelled |
| `npm run test:browser` default | 24 / 24 groups |
| Private browser, server = browser zone in each of the four zones | 24 / 24 in each |
| Private browser, mixed server / browser: Chicago / Los Angeles; Los Angeles / Kiritimati; UTC / Chicago; Kiritimati / UTC | 24 / 24 in each |
| `npm run test:restore:browser` default, then the same eight zone pairs | **8 / 8 checks** in each of the nine runs |
| `npm run test:security:browser` default and in each of the four zones | all checks pass |
| `npm run test:public:browser` default and in each of the four zones | 27 / 27 in each |
| `npm run test:calendar:browser` (default, derived scenarios) | **4 / 4** (was 2 / 3, exit 1) |
| D1–D8 security regressions (`tests/security-*.test.mjs`, inside `npm test`) | 39 / 39 |

Every command exited by itself with exit code 0; nothing was skipped and no group was unreached.

### Remaining gates (unchanged, not authorized here)

Authentication/security audit trail, per-account throttling, encrypted off-service backups with a restore drill, bounded
graceful shutdown (`server.close()` still waits on idle sockets), hosted proxy/cookie/HSTS verification and Render/Blueprint
review, plus aligning the inert `TZ=America/Chicago` hosting entry. Open P2: the dashboard's recent-activity list orders by
raw `at` strings, so entries mixing zone-less and `Z` timestamps can be ordered approximately (display only).

### Sprint 3A.2 commits

| Commit | Summary |
| --- | --- |
| `1ff2479e201243355064f7b0c5d2ba192174276e` | fix(history): render restored legacy activity safely |
| `4bd69c72ec6f5f13e93bf8e8fbde6751b32021db` | test(calendar): prevent frozen cookie expiry failures |
| *(this documentation commit)* | docs(security): record Sprint 3A.2 restore and browser-test remediation — the branch head is the candidate; its SHA is in the handoff |

## Reproducing this branch

```bash
git fetch origin
git switch security/tenant-isolation-hardening
npm test                         # node:test, 154 tests (155 with a forced zone); includes the four-zone calendar matrix
npm run test:browser             # private app, 24 groups (needs Edge/Chromium; QUOTETEND_BROWSER_PATH for another build)
npm run test:security:browser
npm run test:public:browser
npm run test:calendar:browser    # 4 scenarios derived from the real clock (never ages out)
npm run test:restore:browser     # accepted legacy export -> restore -> every screen, reload, sign out/in
# Any suite under another machine zone (works in any shell, including Git Bash, where a shell TZ is not honoured):
QUOTETEND_TEST_TZ=Pacific/Kiritimati node --import ./tests/helpers/set-timezone.mjs --test tests/*.test.mjs
QUOTETEND_TEST_TZ=America/Chicago QUOTETEND_BROWSER_TZ=UTC node --import ./tests/helpers/set-timezone.mjs tests/browser-rehearsal.mjs
# PowerShell: $env:QUOTETEND_TEST_TZ='Pacific/Kiritimati'; node --import ./tests/helpers/set-timezone.mjs --test (Get-ChildItem tests/*.test.mjs)
git log --reverse --stat dbf9242..HEAD
```
