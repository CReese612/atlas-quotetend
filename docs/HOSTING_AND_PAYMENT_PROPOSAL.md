# Hosting and payment proposal — approval required

Official sources checked September 18, 2026. No purchases, resources, accounts or connections were made.

Recommend **Render native Node service with a persistent disk, plus Stripe Payment Links/Billing and its hosted customer portal**. Keep SQLite and one application instance for the first few owner accounts; avoid a premature database rewrite. Use assisted activation while together with the buyer. No automatic sending is included.

## Costs and location

Proposed budget: Render Pro workspace $25/month + 512 MB/0.5 CPU service $7/month + 5 GB disk $1.25/month = **$33.25/month**, before metered overages/taxes. Hobby has a $0 workspace fee (same compute/disk would be $8.25/month), but the recommended budget includes the production-oriented Pro plan; this is a business choice, not a code requirement. Review the actual checkout total before approving. [Render pricing](https://render.com/pricing).

Choose Ohio, USA, for the application and its disk. This does not assert that all provider metadata or backups stay exclusively in that state. Stripe handles payment information separately under its own processing arrangements; QuoteTend stores no card data. [Render regions](https://render.com/docs/regions).

Render supplies an onrender.com address and managed TLS, so a purchased domain is not necessary. [TLS documentation](https://render.com/docs/tls).

US standard domestic cards: 2.9% + $0.30 per successful payment. Recurring Stripe Billing adds 0.7% of billing volume on pay-as-you-go. At the proposed $29 monthly price, those headline fees total approximately $1.34 per payment, leaving $27.66 before hosting, support, tax, refunds and other fees. Country/payment method, international cards, conversion and disputes can change costs. [Payments pricing](https://stripe.com/pricing), [Billing pricing](https://stripe.com/billing/pricing). Do not activate the separate annual Billing commitment plan.

## How the first purchase would work

1. Owner approves the offer and operating policies. Prepare the service, private source repository and Stripe account only after explicit permission.
2. Verify hosting, isolated account boundaries, off-service backup recovery and alert delivery. Then complete Stripe TEST-mode purchase/renewal/failure/cancellation/refund cases. Nothing in the local simulation proves those provider cases.
3. During assisted onboarding, confirm fit and disclose the manual follow-up scope, price and cancellation terms. Verify the owner's contact channel.
4. After billing activation is separately approved, the buyer uses a Stripe-hosted recurring Payment Link. Verify successful paid status and the correct product/amount/currency in the Stripe Dashboard; a redirect or screenshot is insufficient.
5. Issue the email-bound invitation, help the buyer sign in to their empty workspace, save recovery credentials and add their first estimate. Keep a private mapping of business ID to Stripe customer/subscription ID; do not store it in the repository. If the payment email differs, verify the intended owner.
6. Give the approved Stripe hosted portal link for payment-method changes and cancellation. Operator checks cancellations/failed payments daily, confirms the paid-through date, and schedules the manual access change under the approved policy. Access does not automatically synchronize with Stripe.
7. Suspend access at the agreed date with the administrator command; preserve data and provide agreed export support. Process refunds through Stripe only after authorization. Reconcile any reversal before restoring access.

Payment Links support recurring purchases; the hosted portal supports billing management without embedding card handling in this app. [Payment Links](https://docs.stripe.com/payment-links), [customer portal](https://docs.stripe.com/customer-management/activate-no-code-customer-portal).

This supervised process can support immediate activation during an arranged onboarding session once live gates pass. It is not unattended instant signup. Do not publish an unsupervised buy link until the operator coverage and activation promise are honest.

## Responsibilities and tradeoffs

Render's persistent disk is required: normal filesystem changes are ephemeral. Disks are encrypted at rest, but a disk permits only one instance and entails deployment downtime. Render warns against relying on volume restoration for custom database recovery. Use the app's verified SQLite copies and verify an off-service daily copy. [Persistent disk documentation](https://render.com/docs/disks).

QuoteTend's operator owns backup retrieval, restore drills, patching, disk monitoring, access invitations, billing reconciliation, cancellation dates, support and privacy requests. Render is not a managed SQLite database administrator. No automatic off-service backup transfer or payment webhook exists.

Required approvals/accounts: private source-code hosting (e.g. GitHub), Render, Stripe business verification and payout details, operator-controlled encrypted backup storage, and a monitoring recipient/process. Only publish an audited source allowlist; never upload local account databases, backups, Notes, research, test screenshots or secrets. The repository has not been connected or uploaded.

Start with this setup if the owner accepts the operational workload and brief maintenance outages. Revisit managed Postgres and automated entitlement synchronization when multiple instances or billing workload become necessary—not as a prerequisite for a handful of supervised customers.
