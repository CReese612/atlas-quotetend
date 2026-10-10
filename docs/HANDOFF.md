# QuoteTend handoff — September 18, 2026

> **Sprint 2 update (October 2026):** the private app was rebuilt on the public demo's design system with optional phone/address/trade fields and schema 3. The legacy browser-only demo was retired. Current status, tests and acceptance steps: [SPRINT2_PRIVATE_APP.md](SPRINT2_PRIVATE_APP.md). The notes below describe the earlier milestone.

**Local first-paid-customer preparation complete; live launch is blocked pending approval and verification.** Begin with [LAUNCH_READINESS](../LAUNCH_READINESS.md), then [START_HERE](../START_HERE.md).

## Changes completed

- Kept the existing private SQLite business accounts, focused atomic commands, ledger, results and separate browser demo.
- Added schema 2 security migration with pre-security copy for existing owners; quote JSON and existing events remain unchanged. Version 0 still passes through the existing ledger migration. No history was invented.
- Added password-change and one-use saved recovery-code flows in Account security and sign-in. bcryptjs handles passwords; Node crypto generates recovery/invitation tokens; express-session remains the session component. Reset/change revokes that owner's sessions and code; other businesses keep access. Credential version checks reject stale sessions even if an in-flight request persisted one.
- Production signup requires a one-use invitation bound to the independently verified owner email, expiring after 48 hours. invite-owner.mjs prepares it locally; no delivery service exists.
- Added reversible administrator suspend-owner/resume-owner commands for manually operated cancellation/access handling. They preserve customer data and do not alter billing.
- Added production HTTPS-origin/Host checks, Secure cookies, HSTS, required secret/storage configuration and one-proxy deployment mode. Local mode remains loopback HTTP. render.yaml and the environment template are prepared, not deployed.
- Added verified online SQLite backups at startup and every six hours. Startup refuses a failed initial backup. /healthz checks DB readability and backup freshness/failure. JSON error logs omit request bodies, identifiers and credentials. Backup CLI verifies and restores only to a new path.
- Added current-period contact correction/void controls, with reason and retained original events. Results exclude voided records and reflect amended dates/methods without double counting. Reinstating a corrected record is possible; next scheduled date is explicitly unchanged. Legacy unknown last-contact summaries are retained as unverified when a prior baseline was not captured.
- Exposed security/recovery in mobile navigation and added empty-workspace onboarding guidance. Hosted account wording no longer promises computer-local storage.
- Drafted the paid offer, cancellation/refund/support proposals, hosting/payment recommendation, manual payment test matrix and deployment/recovery/rollback runbook.

## Actual test results

Final run: **72 automated checks passed, zero failures** (node --test tests/*.test.mjs). Covers the original 65 checks plus production configuration, password change/recovery rotation/single use, tenant session isolation, invitation consumption, secure-cookie/Host/origin checks, safe 5xx logs, schema preservation, online backup during writes, isolated restore CLI and overwrite refusal, contact correction/void/retry/cross-business/old-period guards, and simulated cancellation/resume.

Final headless Edge rehearsal: **10 PASS groups**, zero uncaught page errors. Full signup → estimate → draft → simulated contact → outcome → results; 390×844 mobile; contact void/correction; CSV preview/cancel/commit; conflicting-row opt-out protection; JSON backup/restore and safety copy; stale editor preservation; separate business isolation; password change/sign-out/recovery; demo storage preservation. Corrected test selectors for the additional recovery form and waited for asynchronous restore confirmation. Mobile screenshots inspected: security-mobile.png and contact-correction-mobile.png in test-results.

pnpm audit --prod: **No known vulnerabilities found**, September 18, 2026. No dependency updates were needed. Tests use temp DBs/disposable browser contexts, not the normal database or user browser. One early test runner failed temporary cleanup ordering; that harness was corrected and the abandoned test-only processes were stopped. Final runs exit normally.

## Startup/recovery changes

Use START_HERE's bundled-node PowerShell command in C:\Users\coler\OneDrive\Documents\AI Businesses\QuoteTend. Stop the old server before starting updated code. Default DB remains %LOCALAPPDATA%\QuoteTend\accounts.sqlite; QUOTETEND_DB overrides it. First startup migrates the selected DB, creates its pre-migration copy where applicable, and verifies a full backup. Existing sessions from the old version must sign in again.

Open /security after signing in, generate a recovery code and save it privately. Password change invalidates it; generate a fresh one after signing in again. No email reset is sent. Offline reset-password remains a verified-ownership administrator fallback and logs out all accounts.

Whole-database backup CLI and isolated restore instructions are in [LAUNCH_OPERATIONS](LAUNCH_OPERATIONS.md). Same-disk recovery copies are not disaster protection. Do not overwrite a live DB or roll back a migrated DB without preserving current data and reconciling later opt-outs/credentials. A new port alone does not isolate account data.

## Remaining limits and external gates

No hosting, source repository connection, Stripe connection, billing activation, purchases, subscriptions, messages or public deployment occurred. No real customer data was introduced. quotetend@gmail.com appears only as a draft business/support contact.

The production Linux build and real TLS/proxy/cookie behavior need live testing. Off-service backup retrieval, alert delivery, hosted restart/rollback, Stripe test cases and live payment readiness have not passed. One-process SQLite requires maintenance downtime and daily operator attention. No automatic backup pruning, off-service transfer or billing synchronization. Actual retention/deletion procedures, privacy/terms, support coverage and price require the owner's decision. No physical-device/accessibility sign-off or independent penetration test.

Results remain owner-reported and noncausal; no verified sending or collected revenue. Per-business timezone, historical-period dashboard and extra integrations are intentionally deferred.

## Your next three actions

1. Restart locally, sign in to a fictional account, save a recovery code and try correcting/voiding a fictional contact. Review [LAUNCH_READINESS](../LAUNCH_READINESS.md).
2. Approve or revise the [offer/policies](PAID_PILOT_OFFER_DRAFT.md) and [hosting/payment proposal](HOSTING_AND_PAYMENT_PROPOSAL.md), including budget, assisted activation, daily backup/billing ownership and retention decisions.
3. Once you choose, authorize the specific external setup and test-mode work. Keep live billing/public launch as a separate decision after the hosted customer journey, off-service restore, monitoring and payment gates pass.
