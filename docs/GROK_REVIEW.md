# Review of Grok findings — September 16, 2026

## Implementation update after passes 2 and 3

The current build resolves the two reproduced safety gaps below: all conflicting new-ID versions are held, and nonblank shared-email opt-outs suppress drafts, logging and queues. Spreadsheet mapping and explicit missing-field review are implemented. See `VERIFICATION.md` for current 32-test results and isolated browser checks; fixture observations later in this document describe the earlier build, not current behavior.

Pass-3 prospect list, interview briefs and source list have been read. The first five remain Dave's Painting, TigerStripe, Ai Painting Plus, Palmer & Son's, and AC PaintingAdvantage, in Grok's updated order. Palmer's new schema-only email remains medium confidence and requires verification before use. No contact or customer interest was established. Draft invitations and interview procedure are in `interviews/`; the original Grok files are preserved.

Reviewed the two research reports, source lists, prospect shortlist, walkthrough, acceptance criteria and CSV fixtures in `Grok Bot Research & Product Testing`. Original research files remain unchanged. Review scope: product implications, fixture execution, and selected primary-source checks; not a complete audit of every competitor price or all fifteen businesses.

## Research assessment

The useful product hypothesis is a simple follow-up queue for painters who already create estimates elsewhere. It is not yet evidence of demand or willingness to pay. Pass 2's $19/month is a price hypothesis, not an approved launch price in this project.

Joist's official basic monthly export lists accounting fields, not customer email or line items. This supports concern about manual onboarding; it does not prove that every other Joist report/export lacks email. Do not promise plug-and-play Joist integration.

Source checked: https://support.joistapp.com/en/articles/9213013-how-do-i-export-my-joist-data-for-tax-and-accounting-purposes

The five shortlisted websites support local painting-service relevance. Treat these as interview candidates, not qualified buyers. Staff size, software, estimate volume, pain, interest and budget remain unknown. Website statements alone do not independently verify licensing, ratings or current operations.

- Dave's Painting: https://davekoprivapainting.com/ — residential painting in Columbia/Boone County and public business contact details.
- TigerStripe Painting: https://tigerstripepainting.com/ — Columbia painting services and same-day written-estimate process.
- AC PaintingAdvantage: https://acpaintingadvantagellc.com/ — Columbia residential/commercial services and public phone.
- Ai Painting Plus: https://aipaintingplus.com/ — Columbia and Mid-Missouri residential/commercial services.
- Palmer & Son's Painting: https://palmerandsonspainting.com/ — family-owned positioning and text → phone → quote process. Its form references Topline Pro; this is evidence of form/SMS tooling, not proof of an estimate-follow-up CRM.

Grok's language about no customers and no guaranteed revenue is honest but unnecessarily cumbersome for every invitation. Lead with a brief research purpose and one neutral question. Do not label the venture noncommercial or pretend to request painting work.

## Observed fixture results

Executed `node tests/review-grok-fixtures.mjs` against the actual domain/import code in memory. No browser records were changed. Queue evaluation date fixed to 2026-09-16.

| Pack | Actual result |
|---|---|
| Pass 1 | 11 ready; 1 duplicate skipped |
| Valid pass 2 | 10 ready; 0 rejected |
| Valid due queue | EST-V001, EST-V003, EST-V007 |
| Invalid pass 2 | All 7 rejected |
| Seed pass 2 | All 5 accepted |
| Conflict pass 2 after seed | 4 ready; 6 duplicate rows skipped |
| Re-import valid pack | 0 added; all 10 skipped |

### Two gaps to address in the next build

1. **Conflicting rows within a file:** current policy keeps the first valid occurrence and visibly rejects later duplicates. This accepts EST-C002 row A. Grok proposes holding both inconsistent rows; its intended accepted count is 3, while current behavior is 4. Prefer holding all conflicting versions with a clear explanation. Existing records are not overwritten under the current implementation.
2. **Customer-wide opt-outs:** current do-not-contact applies per estimate. EST-S005 remains eligible despite EST-C004 opting out the same normalized email. Before real customer use, implement a visible shared-email suppression rule and a deliberate way to resolve it. Do not match customers by name alone or group blank emails together.

### Policy clarifications

- Drafts do not enter routine follow-up queues; no ambiguity in the current product.
- Missing email is permitted; show the missing-email notice and allow a generic phone/copy draft. There is no sending function anywhere.
- CSV duplicates never overwrite existing won/lost/opted-out records. Exact matches and conflicts currently share a generic duplicate reason; clearer categories would improve the preview.
- Grok's conflict summary initially says 2, then correctly clarifies 3 under its proposed policy. Use 3 for that proposal.
- Fixed fixture dates belong in automated checks; the user's manual walkthrough should use the actual current date. Do not change the computer clock.
- Full restore intentionally replaces the workspace after explicit confirmation. It is not a merge operation.

## Next actions

Run the user's short manual test, complete targeted prospect verification, and prioritize the two concrete data-safety gaps before any real-customer pilot. Defer production integrations and price commitments until interviews clarify the onboarding burden and existing workflow.
