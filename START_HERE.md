# Start here: QuoteTend

The separate browser demo and private local business accounts are ready for fictional practice. The Follow-up Results milestone passed automated and browser checks on September 18, 2026. No contractor interviews or customer demand have been validated. Grok is not needed to continue.

For the current paid-customer preparation, read [LAUNCH_READINESS](LAUNCH_READINESS.md). After signing in, open **Account security** and save a recovery code. No email reset is sent. [Offer proposals](docs/PAID_PILOT_OFFER_DRAFT.md) and [operations](docs/LAUNCH_OPERATIONS.md) are prepared; nothing is deployed or connected.

## Start QuoteTend

Open PowerShell in this folder and run:

```powershell
Set-Location -LiteralPath 'C:\Users\coler\OneDrive\Documents\AI Businesses\QuoteTend'
$qtNode = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$env:PORT = '4173'
& $qtNode server.mjs
```

Requires Node.js 24+ and the already-installed dependencies. Stop the previous server with Ctrl+C before restarting; refreshing the browser cannot upgrade an old server. Leave the terminal open.

- [Private local accounts](http://127.0.0.1:4173/signin): choose Create a local business account. Use a fictional business, an example.com owner email and a unique password. Each business starts empty and saves to SQLite on this computer.
- [Existing browser demo](http://127.0.0.1:4173/): your original fictional workspace stays in the same browser storage. No automatic migration or reset occurs. Keep using the exact same address and browser.

For dependency setup, data locations, forgotten passwords and whole-database backup/recovery, use [the local account guide](docs/LOCAL_ACCOUNTS.md).

Before experimenting, use **Import & export → Download full backup**. Save the JSON; if downloading does not work, use **Copy contents** and paste into a text file with the displayed `.json` name. CSV does not preserve drafts or history. Restore replaces the whole workspace; do not restore a test fixture into your normal workspace.

For an isolated rehearsal, follow the separate port **and temporary database** instructions in [the account guide](docs/LOCAL_ACCOUNTS.md). A port change isolates browser demo storage but does not by itself isolate account databases.

## Try Follow-up Results

In a private account, add a fictional Sent estimate, log a simulated contact, then mark it Won. Open **Follow-up Results** to inspect counts, estimate values and supporting records. Reopening the estimate changes its current classification. These are owner-reported outcomes, not proof of caused or collected revenue.

The next account-server startup adds a versioned event ledger and saves a pre-migration SQLite copy for a nonempty old database. Existing estimate data is preserved and earlier history remains unverified. Restores retain opt-outs, create recoverable snapshots and start a new reporting period. See [measurement and recovery details](docs/FOLLOWUP_RESULTS.md).

Use the [pilot baseline worksheet](docs/interviews/PILOT_BASELINE.md) and [results-review template](docs/interviews/RESULTS_REVIEW.md) to prepare honest customer evidence.

## Five-minute demo

Prepare before the conversation: add **Jordan Example**, `jordan.example@example.com`, fictional hallway painting, $1,250, Sent, estimate date today and follow-up today. Use a fresh fictional name/email if already present. Stage the small CSV example from the [import guide](docs/IMPORT_GUIDE.md) if you want to show mapping. Date examples in that guide are fixed; adapt them before the demo.

| Time | Action and explanation |
|---|---|
| 0–1 min | Open Follow-ups → Due & overdue → Jordan. “This lists estimates already created elsewhere that need a next step.” |
| 1–2 min | Edit and save the draft. “This is a local editable template. Saving or copying sends nothing and does not record contact.” |
| 2–3 min | Log a Phone contact with “DEMO ONLY — simulated conversation” and a next date three days ahead. Show Upcoming. |
| 3–4 min | Mark Jordan Won and confirm. Show retained history and cleared follow-up. Explain won totals are recorded outcomes, not revenue caused by QuoteTend. |
| 4–5 min | Show spreadsheet column matching and preview. Explain existing IDs are protected and opt-outs apply across the same email. If a rejected row would lose an opt-out, the batch is blocked until reviewed. |

Use the demo only after asking about the contractor's actual process. Skip import if it is irrelevant or time runs out. Save backup/restore testing for your preparation, not the five-minute presentation. Native file selection was slow in the automated browser rehearsal.

## First three interviews

- [ ] Run the [10-minute self-test](docs/FIRST_USER_TEST.md) once; note confusing steps.
- [ ] Review the [draft invitations](docs/interviews/OUTREACH_DRAFTS.md). Starting candidates: Dave's Painting, TigerStripe Painting and Ai Painting Plus. These are research candidates, not interested customers; verify current public contact details before deciding to contact them manually. Nothing has been sent.
- [ ] Use the [interview kit](docs/interviews/INTERVIEW_KIT.md): ask about the last real estimate, where it lives, who follows up, existing tools and duplicate entry. Ask permission for written notes; avoid customer identifiers.
- [ ] Copy the [notes template](docs/interviews/INTERVIEW_TRACKER.md) for each conversation. Distinguish exact words, reported behavior, observed demo behavior and your interpretation. Record unknowns and contrary evidence.
- [ ] After three conversations, choose one small improvement or follow-up question. Compliments and hypothetical willingness to pay are not purchases.

## What is established and what is not

**Verified in the local rehearsal:** estimate entry, spreadsheet import, draft save, simulated contact, won outcome, shared-email suppression, reload persistence and restoration of all 15 test records with drafts/history unchanged. Current automated suite: 72 passing checks, plus the separate account browser rehearsal. See [verification](docs/VERIFICATION.md).

**Research assumptions:** small painting contractors may need a separate follow-up list; import may reduce duplicate work. Existing prospect details come from supplied research and need rechecking. Pricing is not set.

**Unanswered:** actual follow-up burden, available export fields, willingness to maintain another tool, buyer role and willingness to pay. Private local owner accounts now exist alongside the browser demo. Neither mode provides cloud sync, public access or messaging. Physical-phone behavior and native downloads remain unverified. Use fictional data until the gates in [LAUNCH_READINESS](LAUNCH_READINESS.md) pass. Production configuration and local recovery exist; live hosting and payment verification are still outstanding.

For current limitations and next actions, see [the handoff](docs/HANDOFF.md).
