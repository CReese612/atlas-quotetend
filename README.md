# QuoteTend

**Keep every estimate moving.** A working, local-first demo for small painting contractors.

For startup, a five-minute demo and your first three interviews, open [START_HERE](START_HERE.md).

## Run

Requires Node.js 24+ and the locked dependencies (pnpm install --frozen-lockfile on a fresh checkout). No API keys, external account connections or purchases. START_HERE includes a copy/paste command for this computer when node is not on PATH.

```sh
node server.mjs
```

Open http://127.0.0.1:4173 for the existing browser demo, or http://127.0.0.1:4173/signin for separate private local accounts. Keep the terminal running while using the app. `PORT` can override 4173, but browser storage is separate for each origin/port.

```sh
node --test tests/*.test.mjs
```

## Try the complete workflow

1. Open **All estimates → Add estimate**. Enter a fictional customer and painting job. Use an `example.com` address, status **Sent**, and today's follow-up date.
2. Open **Follow-ups → Due & overdue** and review the new estimate.
3. Edit and save a message draft, or copy it. Nothing is sent and no contact is recorded by these actions.
4. Simulate a conversation using **Log a contact**, and schedule a next step. The estimate moves into **Upcoming**.
5. Mark it **Won**, **Lost**, or **Do not contact**. Its follow-up date is cleared and it leaves all follow-up queues.
6. Open **Import & export** to preview CSV rows, export estimates, or save/restore a full backup.

## Follow-up Results

Private accounts now record server-owned events and provide a date-filtered results page with supporting estimates. Focused commands replace ordinary whole-workspace API writes. Versioned migration preserves existing data without inventing history. Account restores retain opt-outs, create recovery snapshots and start a new reporting period. See [definitions, architecture and limits](docs/FOLLOWUP_RESULTS.md).

## What works

- Twelve clearly fictional demo estimates, with dates relative to first launch/reset.
- Dashboard with open pipeline, due follow-ups, won totals and recent activity.
- Manual entry and editing, search, status filters, due/upcoming/unscheduled queues.
- Editable template drafts and separate human-recorded contact history.
- Opt-outs shared across matching nonblank email addresses, with source links and explicit review before changing an opt-out. Closed estimates also stay out of follow-up queues.
- Spreadsheet column matching, explicit date/status conversion, missing-field guidance, and a downloadable validation report.
- CSV preview holds all conflicting versions of a new ID, skips exact repeats, protects existing records, and handles quoted/multiline fields and spreadsheet formula neutralization.
- Full JSON backup/restore preserves history and saved drafts; CSV transfers the agreed estimate fields only.
- Export previews include a download link and a copy-to-file fallback for browsers that do not support downloads.
- Browser persistence, responsive layouts, keyboard-accessible forms/dialogs.

## Storage and scope

Two separate local modes are available. The original demo stays in localStorage under `quotetend.demo.v1`; clearing that browser data removes demo work. Private owner accounts use SQLite at %LOCALAPPDATA%\QuoteTend\accounts.sqlite by default, with bcrypt passwords and server-enforced business isolation. New accounts start empty. No existing data is automatically migrated. Client details remain attached to estimates. Neither mode offers encryption at rest, team sharing, cloud backup or cross-device sync. Use fictional data and make full backups. See [local accounts and recovery](docs/LOCAL_ACCOUNTS.md).

The Node/Express server binds only to loopback. It serves allowlisted static files and authenticated workspace APIs with server-side ownership validation and atomic revision checks. It has no messaging endpoints. The app makes no external network requests, uses no analytics, and contains no purchase flow. Drafts come from local templates, not an AI API. Sending is deliberately outside the application.

Open pipeline includes all sent estimates, including opted-out estimates still awaiting a business outcome. Follow-up queues exclude opted-out, draft, won, and lost records. Won amounts are recorded outcomes, not measured incremental revenue or proof of QuoteTend's impact.

## CSV contract

Canonical export/template headers (order can vary):

```csv
estimate_id,customer_name,customer_email,job_description,amount_usd,estimate_date,status,next_follow_up_date,last_contact_date,do_not_contact,notes
```

Canonical dates use `YYYY-MM-DD`; optional dates and email may be blank. Amounts are nonnegative USD numbers with at most two decimals. Status is `draft`, `sent`, `won`, or `lost`; canonical opt-outs use `true` or `false`.

The import screen also matches other spreadsheet headings. Required mappings: stable estimate ID, customer name, job, amount and estimate date. Choose the source date format and explicitly map unfamiliar statuses. Formatted USD amounts and yes/no or 1/0 opt-outs are supported. Missing status defaults to Draft; a missing opt-out column requires review. Blank opt-out cells in a mapped column are rejected. XLSX must first be exported as comma-separated CSV. See `docs/IMPORT_GUIDE.md`.

IDs are unique case-insensitively. Existing IDs are never overwritten. All differing valid versions of a new ID are held; identical repeats are skipped. Invalid rows are rejected separately. Only ready rows are imported on click. Shared-email opt-outs are compared after trimming and lowercasing; blank emails are never grouped. Suppressed follow-up dates are cleared and do not return automatically if an opt-out is removed. Full history and drafts require JSON backup.

## Next milestone

Run `docs/FIRST_USER_TEST.md`, then use `docs/interviews/INTERVIEW_KIT.md` for contractor conversations. Current results and next actions are in `docs/HANDOFF.md`. Local durable storage, owner authentication and stale-write protection are implemented. Before real customer use: production security review, HTTPS/access decisions, identity verification/recovery, operational retention/backup controls and customer validation. Messaging, billing, integrations, and paid services remain deferred.
