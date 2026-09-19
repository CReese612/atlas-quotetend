## Latest launch-preparation verification — September 18, 2026

72 automated checks passed; 10 disposable Edge browser groups passed, including 390px contact correction and account recovery. Production dependency audit found no known vulnerabilities. No live hosting, payment, off-service recovery or monitoring provider was verified. See [LAUNCH_READINESS](../LAUNCH_READINESS.md) and [current handoff](HANDOFF.md). Earlier entries below describe historical milestone checks, not additional live evidence.

# Verification

## Follow-up Results — September 18, 2026 (latest)

Node suite: **65 passing checks, 0 failures**. Twelve new cases cover byte-preserving legacy migration and pre-migration copy, no invented historical events, stable ledger IDs, focused commands, idempotent retry/mismatched reuse, stale revision checks, injected transaction failure, repeat-contact cohort counting, amount/outcome corrections, reopened outcomes, backdated uncertainty, imported history, restore rollback/snapshots/retained opt-outs and current overdue eligibility. The final normalization refinement passed the targeted 12-case suite.

The account integration suite also checks all new cross-business result/event/snapshot/command routes and rejection of the old general PUT. Existing authentication, session, backup/recovery and domain/import checks pass.

Isolated headless Edge browser rehearsal passed all eight logged groups, including desktop and 390×844 results with supporting-estimate drill-down; the original estimate/import/draft/contact/outcome flow; unchanged separate demo data; rejected opt-out import; backup/restore/cancel; recovery snapshot download and re-restore; reporting-period reset; stale-save errors and second-business isolation. No uncaught page JavaScript errors. Screenshot inspected at test-results/followup-results-mobile.png. No physical-phone, screen-reader or native-download claim.

All tests used fictional temporary databases/new browser profiles. No normal user database was opened by testing. Automatic migration will happen when the updated server is first started against the normal DB. Whole-database migration backup contains the old schema and is generated before additive migration; original quote JSON remained byte-for-byte identical in the test.


## Local private accounts — September 17, 2026 (earlier)

Commands: `node --test tests/*.test.mjs` → **53 passing, zero failures**. This includes the 40 pre-existing checks plus 12 account integration cases and their parent. `node tests/browser-rehearsal.mjs` → all six logged rehearsal groups passed.

The server suite exercises two fictional owners with separate client details, estimates, drafts and history, including identical estimate IDs. A cannot read, update or delete B's workspace; B cannot read A's. Body/query ID forgery does not change ownership. Anonymous access, wrong/forged/expired sessions, cross-origin writes and untrusted Host headers are rejected. Tests cover bcrypt hashes, duplicate owners, weak/truncated passwords, session rotation/logout, server validation, atomic stale/concurrent save rejection, rate limiting and the existing estimate/import workflow.

Stopped-server SQLite backup/restore and restart preserve both test businesses and their drafts/history. Recovery invalidates existing sessions and preserves estimate data. Temporary database directories are used and removed; default user storage is not touched.

Headless Edge uses a fresh profile and temporary loopback port. Verified registration starts empty while the original demo localStorage text remains byte-for-byte unchanged. Exercised add estimate, personalized business template, save draft, simulated Phone contact, Won outcome, mapped CSV import with a closed opt-out source, preview/cancel without writes, blocked invalid-row opt-out import, full JSON export/restore/cancel, reload, stale save with form content retained, logout and a second empty business. A subsequent demo edit remains separate from the empty account. No uncaught page JavaScript errors.

390×844 checks: CSV preview and empty account overview do not overflow the page. The signed-in business is visible in the mobile header. Screenshots: test-results/account-import-mobile.png and test-results/account-empty-mobile.png. This is browser emulation, not a physical-phone or screen-reader test. Native file download was not exercised; backup text and programmatic file-input restoration were.

Production dependency audit reported no known vulnerabilities. Initial restricted-network attempt could not reach the registry; the subsequent approved registry check completed successfully. Security tests and dependency auditing do not establish production readiness.

Earlier demo-only verification follows as historical evidence; its no-account architecture and test counts describe that earlier version.


## Earlier contractor rehearsal — September 16, 2026

On isolated localhost port 4176: manually added Jordan Rehearsal for $1,250; reviewed and saved a personalized draft; recorded a simulated Phone contact and September 19 next step; marked Won and verified history remained while contact controls disappeared. Imported two mapped fictional rows with case-varied shared email, one opted out; verified the sibling was suppressed and linked to the source.

Captured the 15-record backup displayed by the app, transcribed it to tests/rehearsal-backup.json, reset only disposable data, restored through the file picker and explicit replacement confirmation, reloaded and exported again. Canonicalized comparison of every quote field matched the original browser export exactly, including drafts/history and cleared opt-out dates. Envelope export timestamps were excluded from comparison. Native file download was not tested. File-chooser automation took approximately 16 minutes; its cause was not established, and this does not establish human file-picker latency.

Final automated run: **40 tests passed, 0 failed**. Browser console: no warnings/errors in this rehearsal. No new application fix was required. Main port 4173 user data was untouched. START_HERE.md now provides the concise startup/demo/interview path. The test server was stopped after checks.

## Latest opt-out edge-case and mobile update

- Reproduced the original risk in memory: invalid explicit opt-out rejected, matching valid sibling ready, both existing and new sibling still eligible after a simulated partial import.
- Added a whole-import guard when a rejected/held/conflicting explicit opt-out with valid email would be lost. Already retained email preferences do not block unrelated rows. Guard runs in preview and commit selection; no preference ledger or storage format change.
- **40 automated tests passed (0 failures)**, including eight new cases covering invalid rows, same-ID order reversal, existing conflicts, mutation protection, mapped YES, retained preferences, repair and backup round trip. Earlier 32-test result below is historical.
- Browser at 390×844 on isolated port 4175: reproduced horizontally hidden validation errors; fixed with stacked preview records and visually verified the complete error text. Blocked import disabled its commit button and named the matching IDs. Cancel/reload retained 12 estimates. Repaired source enabled import; commit/reload showed 14 estimates and 3 due, with the existing shared email suppressed. Console warnings/errors: none in the completed check.
- No main-workspace reset or customer data use. The test browser/server needed reopening after the intervening user message; verification then completed. No physical-phone or screen-reader test was performed.

Earlier interview-preparation run: `node --test tests/*.test.mjs` — **32 passing, 0 failing** (superseded by the 40-test run above). Syntax checks passed for app.js, domain.js and import-mapping.js. Covers the original 19 cases plus Grok fixtures, conflict order independence, shared-email suppression across queue/draft/contact/metrics/backup, and spreadsheet mapping/validation.

## Interview-preparation build checks

Browser checks used a separate local origin, http://127.0.0.1:4174/, with fictional data. The main 4173 browser workspace was not reset or used for these mutations.

- Pasted a four-row custom CSV, matched State to Status, mapped Awaiting to Sent, selected US dates and previewed formatted USD. Result: two ready and two conflicting same-ID rows held; $1,250.50 and September dates displayed correctly.
- Preview warned that a new opt-out for MARA.ELLIS@example.com would pause QT-1001. Imported only the two ready rows; estimate count rose from 12 to 14, due count fell from 4 to 3, and conflicting rows were absent.
- Existing Mara Ellis showed shared-email suppression, cleared follow-up, no draft/contact controls, and a working link to the blocking record.
- Removing the blocking flag opened explicit review confirmation. Cancel returned to the editor. Saving the reviewed correction and reloading preserved it; both affected records appeared under Needs a date, without resurrecting old dates.
- A five-column CSV with no status/email/opt-out prompted for missing-opt-out review. Preview was blocked until acknowledged; afterward it showed one ready Draft with missing-field warnings.
- Changing the default status cleared the preview and import action, preventing use of a stale preview.
- Desktop mapping/preview was visually inspected. Console had no warnings or errors during these checks. The new mapping layout was not separately exercised on mobile; earlier base-demo mobile checks are listed below.

Actual Grok fixture runner (`node tests/review-grok-fixtures.mjs`, frozen date September 16): valid file 10 ready; invalid file 0 ready/7 rejected; conflict file 3 ready, 2 held, 3 existing conflicts, 1 exact existing duplicate, 1 within-file repeat. Accepted conflict IDs: EST-C001, EST-C003, EST-C004. Valid-file reimport adds zero. Shared opted-out email is ineligible. Original research files unchanged.

## Earlier base-demo checks

Browser acceptance checks performed earlier against the running local app:

- Created Alex Demo with a fictional job, amount, email, note and follow-up date. Dashboard totals updated.
- Reloaded and verified the estimate persisted.
- Saved an edited message draft, then recorded a fictional phone contact. The saved draft remained intact and the next follow-up moved to September 19.
- Marked that estimate won. Follow-up and draft controls were suppressed, with outcome and contact history retained.
- Imported `tests/import-fixture.csv`. Preview showed two valid rows, one duplicate rejection and one invalid date rejection. Opt-out follow-up date clearing was disclosed.
- Committed valid rows. The due queue included Casey Demo, excluded Optout Demo, and increased by only one.
- Reset to the original twelve fictional estimates after testing.
- Inspected desktop and 390px mobile layouts. Corrected the mobile banner layout after inspection.
- Browser console reported no errors or warnings during workflow checks.

- Verified export preview and copied backup contents: parsed clipboard JSON contained all twelve estimates.
- Restored `tests/backup-fixture.json` through the file picker and explicit replacement confirmation. Verified restored draft, contact history, next follow-up date, and updated due count in the browser. Reset to fresh demo data afterward.

Limitations: no production deployment or real customer data testing. Automatic download detection timed out in the in-app browser with no console errors. Exports now include a visible download link and a tested copy-to-file fallback. Native file downloads remain unverified in this browser. Domain-level CSV round-trip tests pass. Multi-user concurrency and authentication are outside this local demo's scope.
