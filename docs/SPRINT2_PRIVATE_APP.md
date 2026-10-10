# Sprint 2 — Private application rebuild: completion report

Engineering report for the product owner and Atlas. Acceptance of the sprint remains with them; nothing here is a claim that the sprint has been accepted. Nothing was merged or deployed.

## 1. Executive summary

The authenticated QuoteTend application was rebuilt on the public demo's design system and now implements the demo's workflows with real, persisted account data:

- **Same design, one source.** The private app loads the public site's `tokens.css` and `app.css` directly (served at `/shared/…`), uses the same component markup, the vector ꝘuoteTend wordmark, and self-hosted Bricolage Grotesque and Inter, so the strict same-origin Content-Security-Policy stays intact. No public-site file was changed.
- **Real workflows.** Overview, Estimates, Follow-ups, Follow-up Results, Import, Settings & data, an estimate side panel (draft, contact log, scheduling, decisions, timeline, corrections), sign-in and account security all run on the existing Express + SQLite backend and its event ledger.
- **Richer records.** Optional customer phone, project address and trade/service are stored, validated, searchable, filterable, importable and exported. Older records and files keep working unchanged.
- **Verified end to end.** A 24-group browser rehearsal drives the real UI against a real server and database, including a server restart and a second business. 93 of 95 unit and integration tests pass; the 2 failures existed before the sprint and need local fixture files that are not in the repository.

**Status:** operational for local development and owner acceptance testing with fictional data. It is not production-ready until the items in §10 are done.

## 2. Feature-parity matrix

| Demo feature | Demo behaviour | Real app now | Status |
|---|---|---|---|
| App shell | Evergreen sidebar, wordmark, workspace card, nav counts, sticky top bar with breadcrumb and search, off-canvas menu under 1024px | Same layout and CSS; the real business name and owner email; the due count highlighted; Settings & data, Account security and Sign out in the footer; the top-bar action is **Add estimate** | Complete |
| Overview greeting and KPIs | Date, greeting with the due count, and 4 KPI tiles that link to filtered views | Same, computed from server records (open pipeline, due & overdue with overdue value, needs a date, recorded wins) | Complete |
| Welcome banner and guided tour | Five-step tour through fictional records | Getting-started guide built from real account state (recovery code, import, dates, contact, decision, results). It appears as a full panel for empty accounts and a compact banner afterwards, and can be hidden | Complete (tour intentionally replaced) |
| Needs your attention | Due and overdue rows with Review | Same; the first 6 rows, then a link to the full queue | Complete |
| Open pipeline by follow-up state | Segmented bar and legend | Same; the buckets always add up to the open pipeline | Complete |
| Open estimates by age | Bars by days since sent | Same | Complete |
| Recent activity | Contacts and outcomes feed | Built from server-written activity entries, typed (created, contact, schedule, outcome, opt-out, import, correction) with matching icons | Complete |
| Recorded outcomes | Won and lost values | Same, labelled as recorded values rather than revenue | Complete |
| Estimate list | Search; status, follow-up and trade filters; sort; summary; responsive cards | Same, plus a do-not-contact filter, a “no trade recorded” filter, sort by name, matching on phone digits, and pages of 100 rows (+200 at a time) | Complete |
| Trade, street and phone on records | Previewed in the demo as planned features | Real optional fields with validation, search, filters, import mapping and CSV export | Complete |
| Follow-up queues | Due & overdue (grouped), Upcoming, Needs a date | Same, plus **Recently contacted (14 days)**; paginated | Complete |
| Estimate detail drawer | Facts, job card, draft, contact form, schedule, decision buttons, timeline | Same, plus Edit, an optional contact result, the decision date, “correct reported date”, “reopen as sent”, “mark sent” for drafts, opt-out source links, contact void/correct, deep links (`#view/ID`), and Back closes the panel | Complete |
| Draft editing | Editable template; Copy, Save, Use template; “nothing sent” | Same, with a character count, an unsaved-changes chip and guidance when email or phone is missing. Copying records nothing (verified against the ledger) | Complete |
| Follow-up Results | 7/30/90-day ranges, 6 cards with supporting rows, cohort bar, weekly chart, calculation notes | Same server calculation, plus a custom range, a current pipeline snapshot and reporting-period coverage notes | Complete |
| Import | Fictional sample file, mapping table, row preview, import ready rows | Real upload, drag-and-drop or paste; every field mappable; date-format and status-meaning confirmation; opt-out review; per-row results; full validation report; conflict protection; a “done” step | Complete (the sample file is replaced by **Download example CSV**) |
| Toasts and confirmations | Toasts and a confirm dialog | Same components; errors use a distinct style | Complete |
| Reset demo data and stale-demo notice | Restore the fictional seed | Not applicable to real accounts | Intentionally excluded |
| Early-access call to action | Marketing link | Not applicable inside the product | Intentionally excluded |
| Storage-blocked fallback | Demo runs without localStorage | Not applicable (server storage); network, session and stale-data errors are handled instead | Intentionally excluded |
| Automatic sending | None in the demo | None. No Send button exists | Intentionally excluded (product constraint) |

Private-app features kept and restyled: registration (invitation-only in production), sign-in, recovery-code reset, password change, CSV export, workspace export/restore with safety copies, retained opt-outs, contact corrections, opt-out import safeguards and stale-write protection.

## 3. Visual modernization

- **Shared stylesheets.** `public-site/assets/css/tokens.css` (colours, type, radii, shadows, the wordmark) and `app.css` (KPIs, tables, badges, queue rows, drawer sections, results and import components) are served unchanged at `/shared/tokens.css` and `/shared/app.css`. The app adds `app/shell.css`, which mirrors the demo's `demo.css` shell and adds the editor, import stepper, settings, banners and the getting-started guide. Sign-in and security pages use `app/auth.css`.
- **Brand.** The vector Ꝙ is drawn with the approved paths (gold stroke), followed by live text. Accessible names, titles and metadata use “QuoteTend”.
- **Fonts.** Self-hosted variable WOFF2 files (latin and latin-ext) under the SIL OFL 1.1, with licences in `app/fonts/`. Google Fonts would break the private app's same-origin Content-Security-Policy.
- **CSP-safe rendering.** There are no inline styles or scripts. Bar and segment sizes are applied through the CSS object model. The browser rehearsal fails on any Content-Security-Policy violation, and none occur.
- **Responsive design.** Checked at 390, 820, 1440 and 1920px. Fixes found during testing: segmented controls wrap on phones, the drawer header wraps long names, and toasts size to their content. No horizontal page scroll on any view at 390 or 820px (asserted).

Screenshots are in §9.

## 4. Functional modernization: what now uses server data

Every value on screen comes from the authenticated workspace returned by the server. Every change is a server command:

| Workflow | Server command | Ledger evidence |
|---|---|---|
| Add an estimate | `create` (all fields, including phone, address and trade) | `estimate_created`, `status_changed`, `followup_scheduled`, `opt_out_changed` |
| Edit an estimate (changed fields only) | `edit` | `estimate_edited` (with the changed field list), plus status, amount, follow-up and opt-out events |
| Move a follow-up date | `edit {next_follow_up_date}` | `followup_scheduled` (no contact) |
| Save a draft | `draft` | `draft_saved` |
| Copy a draft | *none* (clipboard only) | none (verified) |
| Log a contact | `contact {date, channel, result?, note, nextDate}` | `contact_logged`, `followup_scheduled` |
| Won or lost (with decision date), correct the date, reopen, mark sent | `outcome` / `edit` | `status_changed` / `outcome_corrected` |
| Do not contact | `edit {do_not_contact:true}` | `opt_out_changed`, then normalization of shared emails |
| Correct or void a contact | `correct-contact` | `contact_corrected` (the original is kept) |
| Import | `import` | `estimate_imported` and friends |
| Restore, release a retained opt-out | `restore`, `release-optout` | `workspace_restored`, `retained_optout_released` |

Duplicate submissions are blocked in the UI: one command runs at a time and its button is disabled. A network failure is retried once with the same request ID, and the server's idempotency table applies it at most once (tested with parallel identical requests). If another tab or device saved first, the server answers `409` with `code: "stale_revision"`. The app then keeps the open form and its text, shows a banner, and offers **Load latest data** without a page reload. An expired session shows a sign-in banner and keeps typed text.

## 5. Backend and database changes

- **`domain.js`.** Adds `OPTIONAL_FIELDS` (`customer_phone`, `address`, `trade`), `LEGACY_COLUMNS` and `CSV_COLUMNS` (14 columns; the 3 new ones are appended). It validates the new fields: phone is digits with `+ ( ) - . /`, spaces and an optional extension, at least 3 digits and at most 40 characters; address is at most 300 characters; trade is at most 80. `withOptionalFields`, and `normalize` fills blanks and never invents values. `CHANNELS`, `CONTACT_RESULTS` (`spoke`, `left_message`, `messaged`) and an optional validated `result` on `recordContact` were added. Shared rules mirror the demo: `followupState`, `queues` (adds `contacted`), `pipelineByState`, `ageBuckets`, `statusTotals`, `tradeOptions`, `filterEstimates` and `daysBetween`. `optOutBlocks` makes list-wide opt-out checks linear with identical results.
- **Import.** `previewImport` requires only the 11 original columns, so older CSV files import as before. Exact-duplicate detection treats a missing optional field as blank. `import-mapping.js` adds labels and heading aliases for phone, address and trade.
- **`ledger.mjs`.** `describeEdit()` writes plain-language, typed activity entries, for example “Updated phone, project address”, “Next follow-up set for Oct 17, 2026”, “Estimate marked won”, “Estimate reopened as sent” and “Outcome confirmed: won (reported …)”. The contact result is stored in event data. A revision conflict carries `code: "stale_revision"`. The migration guard accepts schema 3.
- **`account-store.mjs`.** Schema 3: `migrateDetailFields()` saves `<db>.pre-fields-<uuid>.sqlite` for a non-empty database and sets `PRAGMA user_version=3`. It changes no table and rewrites no estimate. The bump stops older builds, which would drop the new fields on their next save, from opening the database. `workspace()` presents older records with blank optional fields without rewriting them.
- **`account-api.mjs`.** `/me` adds `businessName` and `recoveryCodeSaved`. Command errors include `code` when one exists.
- **`results.js`.** Same output; events and contacts are grouped once per record instead of rescanned per estimate. Results at the 5,000-estimate cap dropped from about 4.1s to about 0.6s.
- **`server.mjs`.** An exact-match static allowlist built at startup: `app/*.js|css`, fonts, the three shared domain modules and the shared design CSS. `/` redirects to `/account`. Fonts are cacheable; everything else stays `no-store`. The legacy root `app.js`, `index.html`, `styles.css`, `results-view.js`, `signin.*`, `security.*`, `account-client.js` and `favicon.svg` were removed; `/favicon.svg` is now the brand icon.
- **Backward compatibility.** Covered by tests. Schema 0, 1 and 2 databases migrate in sequence with snapshots, and stored estimate bytes are unchanged until the owner edits. 11-column CSV files and v1 workspace exports without the new fields import and restore normally. A database marked newer than 3 is refused.

## 6. Security and data integrity

- **Authentication, sessions, the origin/header CSRF guard, rate limits and bcrypt** are unchanged. Every workspace route still checks the session owner's business ID (a caller-supplied ID is never trusted).
- **Tenant isolation**, verified in the browser: a second business gets 404 for the first business's workspace, events, snapshots, results and commands. A deep link to the other business's estimate opens nothing, and none of its data appears.
- **XSS.** All user text is escaped before rendering. The rehearsal saves a customer name containing `<img src=x onerror=…>` and confirms it shows as text, creates no element and runs no script. The strict CSP is unchanged and no violations are logged.
- **Opt-outs.** Shared-email blocking, the import blocker, retained opt-outs across restores and explicit review before removing an opt-out are all preserved and exercised in the browser.
- **Ledger.** Corrections append; the original evidence is never deleted (asserted). Copying a draft writes nothing.
- **Inputs.** Server-side validation covers every field (client checks are only for convenience). The 2 MB CSV, 5 MB request, 4.8 MB workspace and 5,000-estimate limits are unchanged. File inputs are read as text and parsed as CSV/JSON only.
- **Static files.** Only allowlisted paths are served. Encoded traversal, server sources, `.env`, `package.json`, licence files and the public demo all return 404 (tested).

## 7. Test report

Environment: Linux cloud container, Node **v22.22.0** (`package.json` asks for 24+; please re-run on Node 24 locally), and Playwright 1.63 driving the preinstalled Chromium build 1194 through `QUOTETEND_BROWSER_PATH`. Edge and installed Chrome were not available, so the default `msedge` channel was not exercised here.

| Command | Executed | Result |
|---|---|---|
| `node --test tests/*.test.mjs` | Yes | **95 tests: 93 passed, 2 failed, 0 skipped.** Both failures (`interview-ready.test.mjs` cases 29–30) read `Grok Bot Research & Product Testing/*.csv`, a local folder that is git-ignored and absent from the repository. They failed the same way at the baseline `683e49a`. |
| — `tests/private-app.test.mjs` (new) | Yes | 10/10 |
| — `accounts` 13/13 · `backup` 5/5 · `domain` 14/14 · `import-optout` 8/8 · `launch` 7/7 · `public-site` 13/13 · `results` 12/12 · `interview-ready` 11/13 | Yes | as listed |
| `node tests/browser-rehearsal.mjs` (rewritten) | Yes | **24/24 groups passed**, with no page errors and no CSP violations |
| `node tests/public-site-browser.mjs` | Yes | **22/22 groups passed**; no request reached the live Formspree form |
| Performance probe at 5,000 estimates (manual script, not in the repository) | Yes | Overview load 0.4s · estimate list 0.2s · ~140ms per search keystroke · follow-ups 0.17s · open drawer 0.1s · save draft round trip 0.9s · Results 0.6s |

Existing tests changed, and why:
- `launch.test.mjs` and `results.test.mjs` now expect schema **3** after migration (previously 2). That is the new schema version; nothing was loosened.
- `domain.test.mjs` finds the notes column by header (optional columns now follow it) and also checks formula neutralization for the 3 new columns.
- `public-site.test.mjs` compares the demo's mapping on the demo's own fields and asserts the 3 new private-only fields stay unmapped for the sample file.
- `domain.demoData()` fixtures now include the blank optional fields, matching the canonical record shape.
- The browser test launchers accept `QUOTETEND_BROWSER_PATH`; the default is still `msedge`.

New coverage includes the optional fields (valid and invalid), legacy CSV and backup compatibility, round trips, mapping aliases, follow-up states across date and DST boundaries under 4 time zones, queue, bucket and filter consistency, contact results, the schema-3 migration on a disposable legacy database (bytes unchanged, snapshot, newer-database refusal), typed ledger history, stale and replay handling, reporting consistency after every operation listed in the brief, and HTTP routes, CSP and 404 coverage.

## 8. End-to-end rehearsal (real app, API and database)

`tests/browser-rehearsal.mjs` runs these groups in order on a temporary SQLite database. Each assertion is checked against the authenticated API, which reads the same database.

1. `/` redirects to sign-in; a business is registered through the real form.
2. The empty overview shows real zeros and the getting-started guide; the database holds no estimates.
3. CSV import: headings auto-matched (phone, job site, trade, project, total); US dates detected; the missing opt-out column must be acknowledged. Preview: 7 ready, 2 held, 1 invalid, 1 duplicate. Nothing is written before confirming; 7 imported with phone, address and trade persisted.
4. Re-import: an exact duplicate is skipped, a changed existing ID is protected, and cancel changes nothing.
5. The overview KPIs, state bar, attention list and nav counts equal `metrics()` on server data ($82,570 open, 2 due, 1 needs a date, $9,800 won). The guide can be hidden and stays hidden.
6. Search by phone digits, address and name; status, trade and sort filters.
7. Open an estimate, edit phone and address, reload: the deep link reopens it and the values persist. The ledger lists exactly those 2 changed fields.
8. Follow-up queue → the overdue estimate → edit and save a draft. Copy: the clipboard holds the text, and **no event and no contact** were recorded.
9. Log a phone contact with the result “Spoke with customer” and a next date: a ledger event with that result, and the history text matches.
10. Reschedule (no contact event) → mark won → the timeline shows import, edit, contact, schedule and won.
11. Dashboard and Results update: wins $31,280; Results counts equal the server results (1 contact, 1 followed, 1 won, $21,480); a custom range reaches zero and back.
12. Void and reinstate a contact: Results recalculate and the original event is kept.
13. A draft estimate is marked sent; do-not-contact pauses drafts and clears the date.
14. Failure paths: required fields, negative, too-precise and blank amounts, an invalid phone; a hostile `<img onerror>` name renders as text; Escape closes the drawer and returns focus; offline save fails, keeps the text and succeeds once back online; an expired session shows a banner and keeps the text.
15. An import that would lose an opt-out is blocked with no writes.
16. CSV export includes phone, address and trade; the workspace export equals the server records.
17. Stale tab: another writer saves first; this tab's save is refused, the text is kept, and **Load latest data** recovers.
18. Two identical requests in parallel are applied once.
19. Restore: cancel changes nothing; the safety copy is downloaded and restored; the reporting period moves to 3; opt-outs survive.
20. 820px and 390px: every view without horizontal scroll; the drawer fits.
21. Sign out → `/me` returns 401 → **the server process is stopped and restarted on the same database** → sign in → the workspace, revision and event count are identical.
22. A second business is empty and gets 404 for every route of the first.
23. Phone-sized account security: recovery code, password change (signs out), recovery-code reset.
24. Signed-out API requests return 401; `/account` returns to sign-in; no page errors or CSP violations anywhere.

## 9. Screenshots

All show fictional data from the rehearsal. Viewport widths are in the file names. Full-resolution originals are regenerated in `test-results/private-app/` by the rehearsal; the copies below are colour-reduced to keep the repository small. Demo screenshots for comparison come from `node tests/public-site-browser.mjs` (in `test-results/public-site/`).

| View | Desktop | Phone |
|---|---|---|
| Sign in | [1440](screenshots/sprint2/login-1440.png) | [390](screenshots/sprint2/login-390.png) |
| Dashboard (empty, guided) | [1440](screenshots/sprint2/dashboard-empty-1440.png) | — |
| Dashboard | [1440](screenshots/sprint2/dashboard-1440.png) · [1920](screenshots/sprint2/dashboard-1920.png) · [820](screenshots/sprint2/dashboard-820.png) | [390](screenshots/sprint2/dashboard-390.png) |
| Estimate list | [1440](screenshots/sprint2/estimate-list-1440.png) | [390](screenshots/sprint2/estimate-list-390.png) |
| Estimate details | [1440](screenshots/sprint2/estimate-detail-1440.png) | [390](screenshots/sprint2/estimate-detail-390.png) |
| Follow-up queue | [1440](screenshots/sprint2/followups-1440.png) | — |
| Draft editor (after copy) | [1440](screenshots/sprint2/draft-editor-1440.png) | — |
| Contact logging | [1440](screenshots/sprint2/contact-logging-1440.png) | [390](screenshots/sprint2/contact-logging-390.png) |
| Results and charts | [1440](screenshots/sprint2/results-1440.png) | [390](screenshots/sprint2/results-390.png) |
| CSV import (matching, review) | [1440 matching](screenshots/sprint2/import-mapping-1440.png) · [1440 review](screenshots/sprint2/import-review-1440.png) | — |
| Settings & data | [1440](screenshots/sprint2/settings-1440.png) | — |
| Account security | — | [390](screenshots/sprint2/account-security-390.png) |

## 10. Known limitations and production readiness

Local development: ready for owner acceptance testing with fictional data.

Before real customers (unchanged from earlier milestones unless noted):
- **Not deployed.** HTTPS, the production configuration and `render.yaml` exist but need a live verification pass. Off-server backup copies are still manual; the scheduled SQLite backups stay on the same disk.
- **Server date.** Command validation (“no later than today”) uses the server's local date. `render.yaml` sets `TZ=America/Chicago`. A contractor far east of that time zone could see a same-day contact refused near midnight. Display logic uses the browser's local date and calendar-date strings, with no UTC shifting (tested).
- **Payload size.** Every command returns the whole workspace, as in the original design. That is about 3 MB and about 0.9s per save at the 5,000-estimate cap; small accounts are instant. Returning only the changes is a future optimization.
- **Browsers.** Tested only in headless Chromium. Not tested: Edge, installed Chrome, Safari or iOS, Firefox, physical phones, or screen readers. The clipboard fallback (select, then Ctrl+C) is implemented but not exercised.
- **Node 24.** Tests ran on Node 22.22; please confirm on Node 24, the `engines` target.
- **Not built:** editing the business name, deleting estimates, team members or roles, multiple message templates, automatic email or SMS sending, billing. All are outside the current scope.
- **Retired demo data.** The legacy browser-only painting demo was retired. Its fictional localStorage data is no longer shown.
- **Pre-existing fixtures.** The 2 failing tests need the local `Grok Bot Research & Product Testing/` folder.

## 11. Run instructions (PowerShell)

```powershell
# 1. Get the branch (use your local clone path)
Set-Location -LiteralPath 'C:\Dev\AI Businesses\QuoteTend'
git fetch origin venture/private-app-v2
git checkout venture/private-app-v2
git pull origin venture/private-app-v2

# 2. Install locked dependencies (Node 24+; see docs/LOCAL_ACCOUNTS.md if node/pnpm are not on PATH)
pnpm install --frozen-lockfile

# 3. Recommended for acceptance testing: a disposable database and port
$env:QUOTETEND_DB = Join-Path $env:TEMP 'quotetend-sprint2\accounts.sqlite'
$env:PORT = '4176'
node server.mjs
# Open http://127.0.0.1:4176/signin and create a fictional business.

# 4. Tests (in a second PowerShell window, same folder)
node --test tests/*.test.mjs
node tests/browser-rehearsal.mjs          # headless Edge; or set $env:QUOTETEND_BROWSER_PATH to a Chromium build
node tests/public-site-browser.mjs
```

Starting without `QUOTETEND_DB` uses your normal database (`%LOCALAPPDATA%\QuoteTend\accounts.sqlite`). The first start upgrades it to schema 3 and leaves `accounts.sqlite.pre-fields-<id>.sqlite` beside it. After that, older QuoteTend builds refuse to open it on purpose. No secrets are needed locally.

## 12. Git details

- Branch: `venture/private-app-v2`. This is both the designated implementation branch and the intended pull-request target, so no pull request exists. Review with `git diff 683e49a..origin/venture/private-app-v2`.
- Base: `683e49a` (Sprint 1.6 website and demo).
- Commits: the implementation checkpoint and the hardening/report commit that contains this file (see `git log 683e49a..`).
- Scope: 50+ files. New: `app/` (frontend, fonts), `tests/private-app.test.mjs`, this report and the screenshots. Changed: `domain.js`, `import-mapping.js`, `ledger.mjs`, `results.js`, `account-store.mjs`, `account-api.mjs`, `server.mjs`, tests and docs. Removed: the old root frontend files. `public-site/` is unchanged.
- No merge, no deployment, no DNS change, no production data, no credentials.

## 13. Usage report

Token and credit usage was not visible from inside this session, so no cost figure is reported.

## 14. Acceptance steps for the owner and Atlas

1. Start with a disposable database (§11). Open `/signin`, create a fictional business, and confirm the empty overview and getting-started guide.
2. **Import:** download the example CSV, or use your own fictional export with your real column headings. Check the matching, the opt-out acknowledgement, the review counts, then import.
3. Compare the Overview numbers with the Estimates list (filter Sent and check the summary value).
4. Search by a customer's phone digits and by street name; filter by trade.
5. Open an overdue estimate. Edit the draft, **Copy** it, and confirm nothing new appears in the activity history.
6. **Log a contact** with a result and a next date; then move the date; then **Mark won** with a decision date. Read the timeline.
7. Open **Follow-up Results**: contacts, cohort, won after follow-up, the weekly chart, and the “How these numbers are calculated” notes.
8. **Settings & data:** export CSV (it should include phone, address and trade) and download a workspace export.
9. Open a second tab, save a change there, then try saving in the first tab. Expect the stale-data banner and **Load latest data**.
10. Sign out, stop the server (Ctrl+C), start it again, sign in, and confirm everything is still there.
11. Create a second business and confirm it sees nothing from the first.
12. Repeat steps 2–7 on a phone or a narrow window (about 390px).
13. Compare side by side with the public demo (`node public-site/serve.mjs` → `/demo.html`) and note any visual differences you want changed.
