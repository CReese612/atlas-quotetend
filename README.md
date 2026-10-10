# QuoteTend

**Keep every estimate moving.** Estimate follow-up for contractors: a private business application (this server) and a separate public website with a fictional interactive demo (`public-site/`).

For startup, a five-minute demo and your first three interviews, open [START_HERE](START_HERE.md).

## Run

Requires Node.js 24+ and the locked dependencies (pnpm install --frozen-lockfile on a fresh checkout). No API keys, external account connections or purchases. START_HERE includes a copy/paste command for this computer when node is not on PATH.

```sh
node server.mjs
```

Open http://127.0.0.1:4173/signin, create a business account (fictional data only in local preview) and you land in the app at http://127.0.0.1:4173/account. `/` redirects there. Keep the terminal running while using the app. `PORT` can override 4173.

The public website and its fictional Fernbrook demo are served separately: `node public-site/serve.mjs` (see [docs/PUBLIC_SITE.md](docs/PUBLIC_SITE.md)). Sprint 2 details, test evidence and screenshots: [docs/SPRINT2_PRIVATE_APP.md](docs/SPRINT2_PRIVATE_APP.md).

```sh
node --test tests/*.test.mjs
node tests/browser-rehearsal.mjs        # private app end-to-end (headless Edge by default)
node tests/public-site-browser.mjs      # public website and demo
```

Set `QUOTETEND_BROWSER_PATH` to a Chromium executable to run the browser tests without Edge.

## Try the complete workflow

1. Open **Import** and bring in a CSV, or use **Add estimate**. Use fictional customers, `example.com` emails and 555-01xx phone numbers.
2. Open **Follow-ups → Due & overdue** and choose an estimate. The record opens in a side panel.
3. Edit and save the message draft, or copy it. Nothing is sent and no contact is recorded by these actions.
4. Record a conversation that happened with **Log a contact** (method, optional result, note, next follow-up). Move the date with **Schedule** without logging a contact.
5. **Mark won**, **Mark lost** or **Do not contact**. The follow-up date is cleared and the estimate leaves every queue; the history is kept.
6. Read **Follow-up Results**, and use **Settings & data** for CSV export, workspace export/restore and safety copies.

## Follow-up Results

Private accounts now record server-owned events and provide a date-filtered results page with supporting estimates. Focused commands replace ordinary whole-workspace API writes. Versioned migration preserves existing data without inventing history. Account restores retain opt-outs, create recovery snapshots and start a new reporting period. See [definitions, architecture and limits](docs/FOLLOWUP_RESULTS.md).

## What works

- The design of the public interactive demo (shared `tokens.css`/`app.css`), with real account data.
- Overview: open pipeline, due/overdue, needs-a-date, recorded wins, pipeline by follow-up state, estimates by age, recent activity and a getting-started guide.
- Estimates: search (name, job, address, phone digits, email, notes, ID), status/follow-up/trade filters, sorting, paging; optional phone, project address and trade on every estimate.
- Follow-ups: due & overdue, upcoming, needs a date and recently contacted queues.
- Editable template drafts and separate human-recorded contact history.
- Opt-outs shared across matching nonblank email addresses, with source links and explicit review before changing an opt-out. Closed estimates also stay out of follow-up queues.
- Spreadsheet column matching, explicit date/status conversion, missing-field guidance, and a downloadable validation report.
- CSV preview holds all conflicting versions of a new ID, skips exact repeats, protects existing records, and handles quoted/multiline fields and spreadsheet formula neutralization.
- Full JSON backup/restore preserves history and saved drafts; CSV transfers the agreed estimate fields only.
- Export previews include a download link and a copy-to-file fallback for browsers that do not support downloads.
- Responsive layouts (390px phones to 1920px desktops), keyboard-accessible drawer, dialogs and tabs.

## Storage and scope

The earlier browser-only painting demo (localStorage `quotetend.demo.v1`) was retired in Sprint 2; the public website's demo replaces it. Private owner accounts use SQLite at %LOCALAPPDATA%\QuoteTend\accounts.sqlite by default, with bcrypt passwords and server-enforced business isolation. New accounts start empty. No existing data is automatically migrated. Client details remain attached to estimates. The app does not offer encryption at rest, team sharing, cloud backup or cross-device sync. Use fictional data and make full backups. See [local accounts and recovery](docs/LOCAL_ACCOUNTS.md).

The Node/Express server binds only to loopback. It serves allowlisted static files and authenticated workspace APIs with server-side ownership validation and atomic revision checks. It has no messaging endpoints. The app makes no external network requests, uses no analytics, and contains no purchase flow. Drafts come from local templates, not an AI API. Sending is deliberately outside the application.

Open pipeline includes all sent estimates, including opted-out estimates still awaiting a business outcome. Follow-up queues exclude opted-out, draft, won, and lost records. Won amounts are recorded outcomes, not measured incremental revenue or proof of QuoteTend's impact.

## CSV contract

Canonical export/template headers (order can vary):

```csv
estimate_id,customer_name,customer_email,job_description,amount_usd,estimate_date,status,next_follow_up_date,last_contact_date,do_not_contact,notes,customer_phone,address,trade
```

The last three columns (phone, project address, trade or service) are optional and were added in Sprint 2; files without them still import, and those values stay blank.

Canonical dates use `YYYY-MM-DD`; optional dates and email may be blank. Amounts are nonnegative USD numbers with at most two decimals. Status is `draft`, `sent`, `won`, or `lost`; canonical opt-outs use `true` or `false`.

The import screen also matches other spreadsheet headings. Required mappings: stable estimate ID, customer name, job, amount and estimate date. Choose the source date format and explicitly map unfamiliar statuses. Formatted USD amounts and yes/no or 1/0 opt-outs are supported. With no status column you choose one status for every row (Sent is preselected); a missing opt-out column requires review. Blank opt-out cells in a mapped column are rejected. XLSX must first be exported as comma-separated CSV. See `docs/IMPORT_GUIDE.md`.

IDs are unique case-insensitively. Existing IDs are never overwritten. All differing valid versions of a new ID are held; identical repeats are skipped. Invalid rows are rejected separately. Only ready rows are imported on click. Shared-email opt-outs are compared after trimming and lowercasing; blank emails are never grouped. Suppressed follow-up dates are cleared and do not return automatically if an opt-out is removed. Full history and drafts require JSON backup.

## Next milestone

Run `docs/FIRST_USER_TEST.md`, then use `docs/interviews/INTERVIEW_KIT.md` for contractor conversations. Current results and next actions are in `docs/HANDOFF.md`. Local durable storage, owner authentication and stale-write protection are implemented. Before real customer use: production security review, HTTPS/access decisions, identity verification/recovery, operational retention/backup controls and customer validation. Messaging, billing, integrations, and paid services remain deferred.
