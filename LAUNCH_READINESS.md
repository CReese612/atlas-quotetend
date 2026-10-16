# QuoteTend launch readiness — September 18, 2026

> **Sprint 4A note (October 2026):** this checklist is unchanged and still not passed. Sprint 4A separates four gates: product/demo readiness (ready for discovery calls with fictional data), customer-validation readiness (kit ready, no conversations yet), technical production readiness (not ready, below) and real-data/payment readiness (not ready). See [SPRINT4A_CONTRACTOR_VALUE.md §8](docs/SPRINT4A_CONTRACTOR_VALUE.md#8-paid-pilot-recommendation). Since Sprint 3A the business calendar is Oregon (America/Los_Angeles) regardless of server zone, so the "Central Time pilot limitation" below is historical.

**Local launch preparation is complete. QuoteTend is NOT yet ready to accept a real paying customer.** Required external setup and live checks have not passed. No messages, provider connections, purchases, deployments or payments occurred.

Launch scope: organize estimates, schedule follow-ups, prepare editable drafts, record owner-reported contacts/outcomes and show conservative results. No automatic customer messaging or causal revenue claims.

## Acceptance checklist

“Verified” means the stated LOCAL behavior was tested, not that the hosted service passed.

| Gate | Status | Evidence / remaining requirement |
|---|---|---|
| Accounts and empty business signup | Verified locally | Invitation-only production API, one-use email-bound code, empty workspace; local registration still available |
| Tenant isolation | Verified locally | Server denies other business records, events, results, snapshots and writes |
| Persistence and migrations | Verified locally | SQLite; schema 0/1→2 copies preserve data; restart tests |
| Password change/recovery | Verified locally | Current-password change, saved one-use recovery code, session revocation and independent other-account access |
| Import/draft/contact/outcome onboarding | Verified locally | Desktop and 390px Edge rehearsal, opt-out conflict/cancel safeguards |
| Results and mistaken contacts | Verified locally | Auditable correction/void, original evidence retained, recalculated conservative totals |
| Consistent backup and isolated restore | Verified locally | Online SQLite copy, integrity/FK checks, credentials/events/opt-outs preserved; restore CLI refuses overwrites |
| Public address/TLS/host routing | Externally blocked | Render configuration prepared; actual hosting, certificates and proxy behavior not verified |
| Secure cookies/origins/secrets | Verified locally; live gate blocked | Simulated proxy requests pass; real browser cookie behavior and secret storage need hosted checks |
| Off-service recovery | Externally blocked | Daily encrypted copy owner/process/storage must be approved and retrieval/restore performed |
| Monitoring | Verified locally; live gate blocked | Health and sanitized failure logs work; external alert delivery and disk monitoring unconfigured |
| Payment/renewal | Externally blocked | Stripe proposal only; test-mode and live eligibility checks not run |
| Cancellation/access changes | Verified locally; provider gate blocked | Reversible manual suspension preserves data; no billing synchronization |
| Offer/refunds/support coverage | Incomplete — owner decision | $29/month and policy drafts await approval; actual support availability must be confirmed |
| Privacy/terms/data retention | Incomplete — owner decision | Publish accurate approved terms and establish active-data/log/backup deletion handling before collection |
| Hosted restart/rollback | Externally blocked | Runbook prepared; Linux build, disk persistence and live release rollback untested |

## Actual verification

- **72 automated test checks passed, zero failed** with node --test tests/*.test.mjs.
- **10 browser rehearsal groups passed**, including signup, estimate/draft/contact/outcome, results, mobile contact correction, CSV/opt-outs, restore/recovery copies, isolation, password change/recovery and preserved separate demo.
- Production dependency audit: **No known vulnerabilities found** using pnpm audit --prod on September 18, 2026. This is not a penetration test.
- Screenshots inspected for mobile account security and contact correction. Browser emulation only; no physical-phone or screen-reader sign-off.
- All test accounts/data were fictional and disposable. The normal account database, existing browser profile, Notes and research files were not opened for mutation.

## Concrete proposals to review

1. [Offer and policies](docs/PAID_PILOT_OFFER_DRAFT.md): $29/business/month, assisted setup, monthly only; proposed refund/support terms.
2. [Hosting/payment](docs/HOSTING_AND_PAYMENT_PROPOSAL.md): Render + Stripe; recommended hosting budget $33.25/month before extras, plus payment fees.
3. [Operations and deployment](docs/LAUNCH_OPERATIONS.md), [render.yaml](render.yaml), [payment rehearsal](docs/PAYMENT_REHEARSAL.md).

## Exact approvals/actions still needed

- Approve or change the offer, cancellation/refund/support promises and assisted activation process. Decide retention/deletion responsibilities and finalize business identity/privacy/terms.
- Approve private source hosting and Render setup (recommended Pro workspace, $7 compute and 5 GB disk; no purchased domain needed). Approve region Ohio and Central Time pilot limitation. Review the actual checkout total.
- Approve encrypted off-service backup storage and a named daily operator/monitoring recipient. Verify a retrieved backup and alert delivery before customer data.
- Separately authorize Stripe account setup/connection and TEST-mode subscription, renewal, cancellation and refund rehearsals. No real charges are authorized by that test approval.
- After hosted and test-mode gates pass, separately authorize public launch and billing activation. Confirm actual live checkout/portal settings and operational readiness before taking the first payment.
- During the first assisted sale, independently verify payment status and owner identity, issue an invitation and complete onboarding. Do not claim provider settlement until it is actually confirmed.

Do not tell a buyer “You can buy and start today” until public access, live account behavior, backups/recovery, monitoring, approved terms, payment availability and staffed activation all pass. The first supported launch is assisted, not unattended self-service.

## Deliberate limits

One instance and one owner/business; workspace-wide stale-write conflicts; 5,000 estimates/4.8 MB current-state cap; no per-business timezone; no automatic sending, delivery confirmation, billing webhooks, automatic off-service backup transfer or retention pruning. Daily manual billing/backup operations must be accepted and assigned. Old/imported/restored history remains incomplete. A full DB rollback can revive old credentials/preferences; reconciliation and credential invalidation are mandatory.
