# Follow-up Results — local milestone

Available in private local accounts through **Follow-up Results**. The separate browser demo is unchanged and does not fabricate ledger-backed analytics. Use fictional data only. There is no sending, delivery tracking or payment integration.

## Reading the page

The date range filters reported contact dates. Contacts logged includes repeat contacts. The cohort consists of distinct current estimates whose earliest reported contact date in the current reporting period falls in the range; ties on a date use server recording order. Backdated contacts can change cohort membership. The estimate value is the amount stored when that contact was logged, not an independently verified past valuation.

Won/lost/open/uncertain classifications are current as of the Oregon business day (America/Los_Angeles), not historical state at the filter end. An outcome qualifies only if a contact was recorded before it and the reported outcome date is on or after that contact's date. Same-day results establish recording sequence only. Outcomes without adequate chronology are uncertain. Reopened estimates are open again. Closed amount corrections update won value while preserving the outcome's original date and order; explicit outcome-date correction is available in the detail dialog.

Won share divides qualifying won estimates by the entire cohort, including open and uncertain records. It is not a causal conversion rate. Current overdue value is a separate snapshot independent of the date filter: sent, eligible estimates with dates before today. It is not predicted loss.

Click a metric to inspect its supporting records, then click an estimate to inspect its details. Definition text explains coverage and calculation choices. Imported/legacy/restored records have incomplete prior history. No historical events are inferred from their activity text or last-contact fields.

## Server operations and evidence

POST /api/workspaces/:businessId/commands accepts create, edit, draft, contact, correct-contact, outcome, import, restore and release-optout operations. Authenticated business ownership is checked before execution. The old general PUT route returns 405 with a reload instruction. Ordinary changes cannot replace history or alter estimate identity through arbitrary fields.

Each command requires the current workspace revision and a unique requestId. A digest prevents reusing the same ID for different content. Successful retries return the current workspace without adding events again. A failed transaction creates neither an event nor a receipt. The browser retries one uncertain network failure with the same request ID, then blocks further edits until reload if the result is still unknown.

Events have stable UUIDs, ordered sequence numbers, business and internal estimate IDs, schema version, server recording time, effective date, actor, source and structured metadata. The database transaction includes the changed state, its events, revision and request receipt. These events record reported actions; they do not prove that a phone call, message delivery, customer acceptance or payment occurred.

The current business JSON state remains the read model. Focused requests replace browser-authored full-workspace writes; the server still persists the internal snapshot atomically. This deliberately avoids a larger per-estimate storage rewrite. Workspace-wide revisions can conflict even on unrelated edits. The existing 5,000-estimate capacity remains, with a 4.8 MB saved-state guard to leave room within the 5 MB request limit. The ledger is separate from that state, but visible per-estimate history still grows.

## Migration and restore

Schema version 0 is the original local account schema. The first updated startup migrates it transactionally to version 1, adds ledger/identity/reporting/receipt/snapshot/preference tables and preserves original quote JSON byte-for-byte. Existing estimates receive origin=legacy identities, not fabricated lifecycle events. Nonempty old databases receive a sibling file named accounts.sqlite.pre-results-<unique-id>.sqlite before migration. Keep it private alongside other database backups. A newer unsupported schema version is rejected.

Tests use disposable copies; the user's normal database is not opened by the rehearsal. On your next normal startup, the automatic migration will apply to your selected database. Startup commands are unchanged. Stop the previous server first and refresh existing tabs after restart; the previous client PUT interface is no longer accepted.

Before every confirmed workspace JSON restore, a safety snapshot is written in the same transaction. Existing opt-outs are retained by email (or estimate ID for blank email) even if their source estimate disappears. Matching restored or newly entered estimates remain blocked. Imported backup opt-outs are retained too. Use the source estimate's reviewed opt-out edit, or the retained-preference review controls in Import & export, only after verifying a correction. Releasing a detached preference does not automatically clear individual estimate flags.

Restore starts a new reporting period. Prior events remain in the database, and a restore event links to the safety snapshot, but the results page intentionally excludes previous periods. This prevents a backup from falsely reinstating complete measurement history. Imported history is still available for human reference.

To recover: **Import & export → Show recovery snapshots → Download safety copy**, then select that file under Restore a full backup and review the confirmation. Recovery itself saves another safety snapshot and starts another reporting period. Safety copies live in the same database and do not protect against disk loss.

Workspace JSON backup remains version 1 and preserves estimates, drafts and display history; it does not transfer trusted ledger evidence or detached opt-outs to a different database. Use the consistent online backup CLI or back up the entire stopped SQLite database to preserve the ledger, receipts, preferences, identities and safety copies. Restoring an old whole-database file rolls back all businesses and may roll back opt-outs; retain the current database and reconcile those preferences before resuming. This remains an offline administrator operation, not protected by the in-app restore safeguard.

## Deliberate limits

- One business calendar, America/Los_Angeles, used by browser and server regardless of the server's TZ or the browser's zone (Sprint 3A.1). Owner-entered dates are civil dates and never shift; recorded timestamps are UTC instants; only instant-to-day conversion (today, the reporting period's start) uses the business zone. No per-business timezone configuration yet.
- No historical “as of” dashboard, payment evidence, provider-confirmed sending, automatic follow-ups or causal attribution.
- Current-period server contacts can now be corrected or voided in estimate details. A reason is required and original evidence remains. Voids leave counts/cohorts; corrected dates may change cohort membership. Reinstatement retains original recording order and amount-at-log. Next follow-up is unchanged. Imported display history is not editable measurement evidence; unknown legacy last-contact summaries remain unverified.
- Prior reporting periods remain queryable in the authenticated event API/database but have no UI selector yet.
- Event/receipt/snapshot retention has no automated pruning. Production storage sizing, monitoring and retention remain separate work.
- Local password change/recovery and production configuration exist; public hosting, automated off-machine backup and live security/operations verification remain outstanding. Schema 2 adds account-security tables after the schema-1 ledger migration; see LAUNCH_OPERATIONS.md.

Use [pilot baseline](interviews/PILOT_BASELINE.md) before any future pilot and [results review](interviews/RESULTS_REVIEW.md) before making customer-facing claims.
