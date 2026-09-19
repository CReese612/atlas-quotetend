# Purchase and cancellation rehearsal

## Local simulation actually available

The launch test suite uses fictional businesses and local access controls. It verifies invitation validation/consumption under simulated production headers, signup to an empty workspace, account suspension, rejected old sessions/sign-in, unaffected other businesses, data preservation and resumed access. No Stripe SDK, API call, webhook or billing state is implemented. “Paid” in a fixture name is a scenario label, not evidence of payment.

The manual decision sequence is: operator verifies provider payment → issues invitation → owner signs in → operator records paid-through date → cancellation prevents renewal at provider → operator suspends access at the approved date. Repeat commands do not delete account records. This is an operating rehearsal, not a provider integration test.

## Required provider tests after explicit connection approval

Record date, mode, evidence and result for each; all are **NOT RUN**:
- Test-mode recurring checkout: correct $29/USD/month disclosure, receipt and subscription linked to the intended business.
- Duplicate checkout: prevent accidental duplicate subscription during manual reconciliation; do not provision duplicate businesses.
- Abandoned/failed payment: do not issue a paid invitation; no customer charge assumed.
- Renewal success/failure and recovery: identify the actual paid-through date and apply the approved grace/access policy.
- Portal sign-in and end-of-period cancellation: verify no future renewal, expected access until period end, and operator reminder.
- Refund: verify authorized amount/currency and provider status; do not equate requested with settled.
- Account email differs from payment email: independently verify ownership before linking.
- Resubscription: reuse the verified business; preserve estimates and opt-outs.
- Customer data export/support request: verify identity, deliver only that business's records through an approved channel.

Before accepting the first real charge, confirm live account eligibility, HTTPS checkout/portal links, published approved terms, payout setup and operational support coverage. Any real charge/refund requires separate authorization. Test-mode behavior alone does not prove live settlement. Record unavailable live evidence honestly.
