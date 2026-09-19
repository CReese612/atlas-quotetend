# Grok version 4 review

Reviewed September 16, 2026 against the current local build and handoff. Original uploads and application code were not modified. External contact, vendor and legal assertions were reviewed as supplied research, not independently reverified in this review.

## Useful findings

- Grok now replaces Palmer with Pezley in the proposed first five: Dave's Painting, TigerStripe, Ai Painting Plus, AC PaintingAdvantage, Pezley. Palmer's schema-only contact stays unresolved. This corrects pass 3; our existing outreach draft file still describes the older shortlist and should be reconciled before use.
- Generic greetings avoid unsupported owner/buyer assumptions. Older awards and named website tools do not establish current staffing, CRM use or demand.
- The duplicate-entry interview question now asks about actual past behavior. Use it in discovery. The five-interview decision thresholds are heuristics, not market validation.
- Workflow evidence is mostly vendor material, business-site claims and unread forum titles. It supports interview questions, not prevalence or purchase-interest claims.
- The launch memo is a list of unresolved questions, not clearance. No legal conclusions were independently verified here.

## Actual fixture execution

Executed the uploaded CSVs through current domain/mapping functions in Node memory only. No browser storage changes or new UI tests. Queue date fixed to 2026-09-16.

| Fixture | Observed result |
|---|---|
| seed_existing | 6 ready |
| import_dupes, empty initial state | 3 ready, 3 repeats, 2 held rows |
| import_conflicts, seeded | 1 ready, 1 exact existing match, 3 existing conflicts |
| import_email_optout, seeded | 7 ready, 1 existing conflict; S005 suppressed; blank-email records remain independent |
| import_mapping, explicit positional mappings, ISO dates, no status coercion | 2 ready (M001, M004), 3 invalid |
| enriched synthetic onboarding | First comment line becomes the sole header; mapping fails with missing Estimate ID |

Due IDs after email fixture commit simulated in memory: EST-S004, EST-S006, EST-E002, EST-E004. No claim that all 37 manifest cases ran; most referenced fixtures were absent.

## Corrections needed

1. **Incomplete uploaded pack:** 13 completion-report artifacts are absent locally (12 CSVs and one TXT). They may exist in Grok's environment; this review establishes only that they were not delivered here.
2. **CSV comments:** QuoteTend expects the header as the first record. `# SYNTHETIC` is not a supported comment syntax. Put labels in filename, notes and README. The proposed header-only fixture also must not contain an extra comment record.
3. **C06 invalid-first:** its described rows have different IDs (IF01 and IF02), so it cannot demonstrate that an invalid row fails to poison a later valid row with the same ID. Supply a true same-ID pair in both orders.
4. **C18 closed opt-out:** references do not provide a closed opted-out source plus matching open sibling. Add an explicit pair; the current app already has an automated test for this behavior.
5. **C36 backup:** CSV cannot carry saved drafts or activity history. Add explicit UI setup or a supported JSON fixture before asserting their preservation. Never wipe the user's main workspace for a test.
6. **Copeland phone mismatch:** `5733975042` and `5732424522` are different numbers. The audit's claim they map to the same number is internally inconsistent; leave unresolved until verified.
7. **Stale implementation requests:** conflict holding, shared-email suppression, missing-column Draft default, explicit status/date mapping and YES/NO opt-outs are implemented. A missing status column differs from a blank cell in a mapped status column; the latter is invalid unless the user explicitly maps it.
8. **R9 is a new policy proposal:** retaining an opt-out from an invalid/held row is not implemented. Define behavior for valid emails plus bad amount/status, held duplicate-ID versions, and existing-ID conflicts. Preview/cancel must never save changes. Compare blocking the batch pending repair with separately reviewed suppression at commit. Specify provenance, correction, reload and backup behavior; do not present this as an already agreed defect fix.

## Missing artifacts named by Grok

- onboarding_exercise_SYNTHETIC_joistlike_GrokBot_4.csv
- import_row_order_GrokBot_4.csv
- import_invalid_first_GrokBot_4.csv
- import_mapping_dup_headers_GrokBot_4.csv
- import_mapping_missing_required_GrokBot_4.csv
- import_invalid_GrokBot_4.csv
- import_bom_crlf_multiline_GrokBot_4.csv
- import_empty_GrokBot_4.csv
- import_empty_NOTE_GrokBot_4.txt
- import_header_only_GrokBot_4.csv
- import_status_conversions_GrokBot_4.csv
- import_cancel_before_confirm_GrokBot_4.csv
- backup_roundtrip_source_GrokBot_4.csv

Next Grok assignment: repair delivery and fixture consistency, propose the narrow R9 decision, and resolve specific contact discrepancies. Avoid another broad competitor survey or invented interview findings. See `GROK_V5_PROMPT.md`.
