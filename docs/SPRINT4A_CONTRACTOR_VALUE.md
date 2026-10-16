# Sprint 4A — Contractor value and demo effectiveness

Engineering and research report for the founder. Acceptance stays with the founder; independent technical review is still required before anything is integrated into `venture/development`. Nothing was merged, deployed, published or sent, and no business was contacted.

**Read this first.** Every workflow result below comes from scripted runs against fictional data on this computer. No contractor used QuoteTend, no interview took place, and nothing here measures demand, willingness to pay or human task time. "Actions" are counted UI interactions in a reproducible script; "scripted ms" is how long the script took, not how long a person would take.

Target for this sprint: small roofing and exterior contractors in Eugene and Lane County, Oregon. Earlier documents that target painting contractors in Columbia, Missouri, or propose $19/month, are historical and are marked as such where they are still linked.

## 1. Executive summary

**Main finding.** The core loop works and is honest: open QuoteTend, see who is due, call from the record, log the call in two taps, and the estimate comes back on its next date. In the scripted day, an owner cleared a 9-estimate due queue at about 3 UI actions per call, and the next day's list was correct without re-entering anything. The demo now tells the same story the private app delivers.

**What blocks adoption is not the daily loop, it is getting and keeping estimates in QuoteTend.** The evidence:

1. **A typical owner spreadsheet produced an empty "today" list.** Most spreadsheets have no follow-up column, so every sent estimate lands in "Needs a date". Dating them one at a time took 3 actions per estimate (18 actions for 6). *Fixed in this sprint* with an optional first follow-up date chosen once during import.
2. **Re-imports hid real changes.** Re-importing an updated export flagged 11 rows as "protected" with identical wording. Five differed only in follow-up dates QuoteTend had moved or cleared; four more differed because the owner had recorded a decision or opt-out in QuoteTend; two were real revisions in the spreadsheet (a new price, a sale recorded there) that were silently not applied. *Fixed for visibility*: each protected row now says what differs, and the summary separates follow-up activity from real differences. QuoteTend still never overwrites or merges, by design.
3. **Spreadsheets without estimate numbers cannot be imported**, and nothing explained what to do. *Guidance added*; no ID generation was built (see §3 for why).
4. **Import errors were confusing.** A US date with dashes was reported as "must be a valid ISO date (YYYY-MM-DD)" even after choosing MM/DD/YYYY; bad amounts produced two messages that never showed the value. *Fixed*: messages quote the cell and say what works; dashes, dots and year-first dates are now read.
5. **A $64,900 win disappeared from Follow-up Results** because it was marked won without the decisive call being logged first. The rule is correct and conservative, but nothing told the owner. *Fixed*: the won/lost confirmation now says so before anything is saved.
6. **Opt-outs written in Notes were imported as contactable.** *Fixed for safety*: such rows are flagged for review; QuoteTend never turns a note into an opt-out or back.

**Impact on adoption.** Import went from 8 to 4 UI actions for the audit spreadsheet, a re-import from 8 to 4, and an undated spreadsheet no longer needs one scheduling visit per estimate. These remove avoidable onboarding friction. They do not remove the deeper adoption risks, which only conversations can test: QuoteTend is a second place to keep estimates, it does not remind the owner to open it, and many roofing tools already include follow-up tasks. See §12.

## 2. Workflow audit (scenarios A–J)

**Setup.** `node scripts/sprint4a-workflow-audit.mjs` starts the real server on a disposable SQLite database, registers a fictional business, imports a 34-row fictional spreadsheet (30 sent, 2 won, 1 lost, 1 draft; US dates, $ amounts, statuses Pending/Sold/Lost/Draft, a Do Not Contact column), works through the scenarios in headless Edge, restarts the server one day later with a frozen clock for scenario J, and then runs the public demo. Output: `test-results/sprint4a/report.md`, `report.json` and screenshots (regenerated on each run; selected copies in `docs/screenshots/sprint4a/`). Desktop is 1440×900, tablet 820×1180, phone 390×844 (Edge emulation, not a physical phone).

Counts and times below are from the final run on the Sprint 4A code; "before" is the same script on the base commit `3dc2fc1`.

| ID | Scenario | Start → intended outcome | UI actions (before → after) | Scripted ms | Severity | Finding / change |
|---|---|---|---|---|---|---|
| I | Owner imports spreadsheet estimates | Empty account → 34 estimates with correct statuses, dates, opt-outs | **8 → 4** | 1,128 | High | "Estimate Amount" and "Date Sent" were not recognized; "Pending" and "Sold" needed manual meanings. Now suggested (owner still confirms). |
| A | 30 outstanding estimates | Imported pipeline → understand it at a glance | 1 | 1,278 | — | Heading states "9 follow-ups need attention"; KPIs: $461,145 open, 9 due, 6 needs a date. On a phone the heading and **Open follow-up queue** are above the fold; the first due row starts at 991 px (one scroll), below the getting-started banner and KPIs. Tablet: first due row at 823 px, visible. |
| B | Identify today's calls | Overview → list of everyone to call | 1 | 836 | Low | Queue grouped Overdue (6, $116,770) and Due today (3, $77,520), oldest promise first. Phone numbers are not on queue rows; they are one tap away in the record (tap-to-call link). |
| C | Prioritize a high-value roof job | Queue → find the biggest due estimate | 3 (detour) | 469 | Medium | The $64,900 HOA roof sat at position 7 of 9. The queue has no value sort; Estimates → filter Due & overdue → sort by value finds it (3 actions, leaves the queue). Not changed: whether owners prioritize by value or by age is an interview question. |
| D | Personalize a message | Record → edited, saved, copied draft; nothing sent or logged | 4 | 865 | Low | Ledger after save + copy: one `draft_saved` event, no contact. Copy status says nothing was sent. Template read "$64,900.00 estimate for roof replacement - building c"; now "$64,900 estimate for roof replacement - Building C". |
| E | Already called a homeowner | Overdue record → call recorded, next date set, leaves today's list | 6 (minimum 2) | 386 | Medium | Defaults (today, Phone, next in 3 days) make it Review → Record. The contact form is 1.3 panel-heights down on desktop, **1.95 screens down on a phone** (draft panel first). Not changed; see §10. |
| E-2 | Work the rest of today's queue | 3 due estimates → all logged | 9 (3 per estimate) | 977 | Low | Review → Record → close, repeated. Queue emptied. |
| F-a | Homeowner asks for no further contact | Record → all follow-ups stopped, history kept | 4 | 349 | — | Do not contact + confirm. Leaves every queue. Shared-email sibling (Sofia) was suppressed at import. |
| F-b | …asked during a follow-up call | Record → call and opt-out both recorded | 6 | 404 | Medium | Logging the call **requires a next follow-up date** even though the customer just opted out; the date is then cleared. Data stays correct, but it is redundant input. Not changed (domain rule); see §10. |
| G-a | Homeowner accepts; owner marks won | Record → win recorded | 3 | 523 | **High** (reporting) | No contact was logged first, so this $64,900 win is absent from "Won after a recorded follow-up". **Changed:** the confirmation now explains this and how to avoid it. |
| G-b | Accepts during a follow-up call | Record → call + win, counted | 6 | 371 | Medium | Correctly counted ($38,750). Requires log (with a throwaway next date) then Mark won + confirm. |
| G-c | Homeowner declines | Record → loss recorded | 4 | 327 | — | Clears the date, leaves queues. |
| H | Review recorded activity | End of day → what was done and what it led to | 2 | 1,337 | Low | Recently contacted: 6. Results: 6 contacts, 6 estimates followed up, 1 won after follow-up ($38,750). Caveats are visible on the page. |
| I-2 | Re-import the updated spreadsheet next morning | Workspace after a day of work + export with 1 revised price, 1 sale recorded in the sheet, 2 new estimates → only new ones added, real changes noticed | **8 → 4** | 1,424 | **High** | 2 ready, 23 identical, **11 protected**. Before: all 11 said "conflicts with an existing estimate; nothing overwritten". After: 5 say only follow-up dates differ (4 worked in QuoteTend, 1 cleared by a shared-email opt-out); 6 are listed with their differing fields (2 real revisions, 4 decisions/opt-outs the owner recorded in QuoteTend). The revised price is still not applied (by design); it is now visible. |
| J | Returns the next day | Signed out overnight, clock +1 day → today's list without re-entry | 6 (3 are sign-in) | 1,018 | Low | 2 due (the two "due tomorrow" estimates); yesterday's 6 calls in Recently contacted; the 6 undated imports still wait under Needs a date. Nothing reminds the owner to open QuoteTend. |
| N | Date each "Needs a date" estimate | 6 undated estimates → all scheduled | 18 (3 each) | 2,321 | **High** | The cost the new import option avoids. With the option, one date field at import replaces this. |
| M | Record panel on tablet/phone | Upcoming record → reach draft, contact form, decision | — | 956 | Medium | No horizontal scroll at 820 or 390. Distance from panel top in screen-heights: tablet draft 0.24 / Record contact 0.94 / Mark won 1.22; phone 0.48 / 1.95 / 2.47. |

Scenario J was simulated with a server process frozen at real time + 24 h (`tests/helpers/freeze-clock.mjs`) and a browser clock moved the same amount. Day 1 ran on the real clock (business day 2026-10-15, America/Los_Angeles).

**Can an owner complete the day's follow-ups without several disconnected views?** Yes, once estimates have dates: Overview → Follow-ups → (Review → Record → close) per customer, all in one queue plus a side panel. The disconnected parts are elsewhere: prioritizing by value (Estimates), recording a decision reached on a call (two sections plus a confirmation), and getting dates onto imported estimates (one record at a time, before this sprint).

**Demo versus product (same journey).** Demo: 1 action to the queue, 4 to personalize/save/copy, 3 to log a contact, 1 to Results; first heading rendered in ~360 ms. The demo lacks the contact *result* field, the decision date and its correction, Reopen, Add/Edit estimate, the Recently contacted tab, and real file upload (it uses a fixed sample). The private app lacks the tour and Reset. None of these gaps overstate the product.

Screenshots: [overview, phone](screenshots/sprint4a/overview-390.jpg) · [due queue](screenshots/sprint4a/followups-due-1440.jpg) · [draft copied](screenshots/sprint4a/draft-copied-1440.jpg) · [record, phone](screenshots/sprint4a/record-390.jpg) · [won without a logged contact](screenshots/sprint4a/confirm-won-without-contact-1440.jpg) · [results](screenshots/sprint4a/results-1440.jpg) · [next day](screenshots/sprint4a/overview-next-day-1440.jpg).

## 3. Import friction report

Six synthetic spreadsheets (fictional, `example.com`, 555-01xx) were run through the real import code (`import-mapping.js` + `domain.js`) the same way the app runs them, before and after the changes, plus the browser runs above. Variants: an owner spreadsheet with non-standard headings; a homeowner list without IDs and with a repeated customer; a CRM-style export with split first/last names, `Stage`, `Job Number` and a blank opt-out cell; 17 date/amount/status edge cases; duplicates and conflicting versions including an opted-out email; and a week-2 re-export with revisions and removed rows.

### Answers to the import questions

| # | Question | Finding |
|---|---|---|
| 1 | Mandatory source fields | Stable estimate ID, customer name, job description, amount, estimate date. |
| 2 | Necessary for useful daily follow-up | The five above **plus a phone number** (how roofers mostly follow up, unverified) and **a follow-up date** (without one, nothing appears in the daily queue). Email only matters for email follow-up and shared-email opt-out matching. |
| 3 | Manual preparation | Typical: export to CSV; add an ID column if the sheet has no estimate numbers; join first/last name columns; make the opt-out column explicit. Real exports have not been seen. |
| 4 | Absent fields | Optional fields stay blank, never guessed. No status column → one chosen status. No opt-out column → explicit acknowledgment required. No follow-up date → "Needs a date", or (new) a chosen first follow-up date. |
| 5 | Mapping suggestions understandable | Yes: each select shows the heading and a sample value. Missed common headings are now partly covered. |
| 6 | Status meanings explained | Yes (Draft = not shared … Lost = declined). Pending/Sold now preselected; anything else requires an explicit choice. |
| 7 | Money and date errors discoverable | Before: partly (generic messages, duplicated, no value). Now each message quotes the cell, names the expected format and why it failed. |
| 8 | Repeat imports | Safe: identical rows skipped, new IDs added, saved estimates never overwritten. Before this sprint, worked rows were indistinguishable from real revisions; now explained. |
| 9 | When an estimate changes in the source | Not applied. The row is protected and (now) lists the differing fields; the owner edits the estimate manually. No merge or sync. |
| 10 | Correcting a bad mapping | Before import: yes (preview, Back to matching, nothing saved). **After import: no undo and no delete.** A wrongly mapped batch is fixed by editing records one at a time or restoring the workspace export taken beforehand (the guide says to take one). Not changed; noted as a risk for assisted onboarding. |
| 11 | Opt-outs preserved | Yes for mapped opt-out columns and shared emails; an import that would lose an explicit opt-out on a rejected row is blocked. Opt-outs written only in Notes were lost silently; they are now flagged (not converted). Blank opt-out cells are still rejected on purpose. |
| 12 | Identify failures | Per-row outcome, a summary, and a downloadable validation report (now including the differing fields). |
| 13 | Finish without technical help | Plausible for a clean sheet with estimate numbers (4 actions in the audit). Not plausible yet for a sheet with no IDs or split names; plan an assisted session. Unverified with real users. |
| 14 | Continue without importing | Yes: **Add estimate** numbers estimates itself (QT-1001…) and defaults the next follow-up to 3 days out. Practical for a small first batch. |

### Import-friction matrix

| Problem | Severity | Evidence | Action | Code or onboarding |
|---|---|---|---|---|
| Undated sent estimates all land in "Needs a date"; nothing shows as due | High | Audit N: 18 actions for 6 estimates; spreadsheet C had no follow-up column | **Done:** optional first follow-up date at import | Code (done) |
| Re-import shows worked rows and real revisions identically; revisions silently not applied | High | Audit I-2: 11 protected, 2 real revisions | **Done:** per-row differences + summary. Future: explicit per-row "apply file values" only if pilots need it | Code (done) / future |
| No estimate numbers in the spreadsheet | High | Spreadsheet B blocked at preview | **Done:** guidance on the import page and in the error. Assisted onboarding adds an ID column. No ID generation (below) | Onboarding + copy (done) |
| Opt-out recorded only in Notes | High (consent) | Spreadsheet A, E-1051 imported as contactable | **Done:** review flag; never auto-converted | Code (done) + onboarding |
| Misleading date errors; dashed/dotted/year-first dates rejected | Medium | Spreadsheet D: 4 of 17 rows | **Done:** read unambiguous separators; explain two-digit years and spelled months | Code (done) |
| Amount errors duplicated, value not shown | Medium | Spreadsheet D, C | **Done:** one message quoting the cell. "$ 1,250", "USD 1250", "$21k" still rejected | Code (done) |
| Common headings not suggested (Estimate Amount, Date Sent, Homeowner, Stage, Job Name…) | Medium | Audit I: 2 manual selects; C: 6 | **Done:** a few unambiguous synonyms; ambiguous pairs still left to the owner | Code (done) |
| Pending/Sold need manual meaning | Low | Audit I: 2 selects | **Done:** preselected, still confirmable | Code (done) |
| First/last name in separate columns | Medium | Spreadsheet C | Join columns in the spreadsheet before export | Onboarding |
| Job number vs estimate number | Medium | Spreadsheet C | A job number is a stable ID only if each job has one estimate row | Onboarding |
| Blank opt-out cells rejected | Medium | C, D | Kept strict (a preference is never guessed); message now says how to fix | Onboarding |
| Blank job description rejected | Low | D | Required; map a job-type column as the description if that is all there is | Onboarding |
| No undo/delete after a wrong import | Medium | Code review; no delete command exists | Export first (already advised); consider "undo last import" only if pilots hit it | Future, evidence-dependent |
| XLSX not accepted | Low | By design | Save as CSV | Onboarding |
| Same customer, same day, two estimates | Low | Spreadsheet B (Hannah) | Fine with real IDs; breaks any name/date-based ID scheme | — |

### Stable IDs: options and trade-offs

| Option | Benefit | Risk | Recommendation |
|---|---|---|---|
| Require stable source IDs (current) | Repeat imports are exact; nothing merges wrongly | Spreadsheets without estimate numbers need preparation | **Keep.** Add the column during assisted onboarding |
| Deterministic ID from fields (hash of name + date + job/amount) | No preparation | Any revision (new price, corrected job) creates a "new" estimate → duplicates on re-import; same-customer same-day jobs collide | **Do not build** |
| Explicit row reconciliation (preview proposes likely matches by email/phone + date; owner confirms "same as E-…" or "new") | Works without IDs; owner stays in control | Moderate build; new matching rules to test; ongoing owner effort each import | Only if interviews show ID-less spreadsheets are common **and** re-import is the chosen workflow |
| Manual entry of a small first batch | Zero code; IDs generated by QuoteTend | Tedious beyond ~15 estimates; not repeatable from a source | **Use now** for small pilots |
| One-time generated IDs for a first import | Quick start | Re-importing the same file duplicates every row unless reconciliation exists | Not without reconciliation |
| Founder-assisted preparation | Zero code; teaches the stable-ID habit | Founder time per customer | **Use now** |

Import still never overwrites a saved estimate, still holds conflicting versions, still blocks an import that would lose an opt-out, and the server re-validates every row. Sprint 4A changed explanations and one explicit optional default, not those rules.

## 4. Product value assessment

| Daily question | Answered today? | How, and where it falls short |
|---|---|---|
| What should I do today? | Yes, if estimates have dates | Overview heading and the due queue (1 click). Undated imports showed nothing as due before this sprint. Nothing prompts the owner to open QuoteTend. |
| Who should I contact first? | Partly | Oldest promise first; within a day, highest value first. Values are visible, transparent and unweighted. No value-first view in the queue (3-action detour). No score, prediction or probability, by design. |
| What should I say? | Partly | One editable template with first name, amount and job (now cleaner). Useful for email/text; irrelevant for a phone call, yet it is the first thing in the record. Tone and length for texts are untested. |
| What happened after the contact? | Yes, if logged | Contact result and note, history, Recently contacted, Results. Depends on the owner logging every call. |
| What should I do next? | Yes | Every logged contact sets a next date (default +3 days), so open estimates always come back. The required date is redundant when the call ended in a decision or opt-out. |

**Immediately useful:** the due & overdue queue with values; the overview due count; tap-to-call and mail links in the record; two-tap contact logging with a default next date; won/lost/do-not-contact clearing queues while keeping history; shared-email opt-out suppression; correct carry-forward to the next day.

**Useful but cumbersome:** importing (IDs, mapping, opt-out review); re-importing (no sync); recording a decision reached on a call (log + decide + confirm, with a throwaway date); finding the biggest due job; reaching the call log on a phone (two screens below the draft).

**Low value for a first pilot:** Follow-up Results cohort detail, the weekly contacts chart, the age chart and the pipeline-by-state bar. They are honest, but with a few weeks of one owner's data they mostly restate the queue. Their real job is later: evidence for a results review.

**Unnecessary complexity for the owner (necessary for integrity):** reporting periods, contact correction/void, retained opt-outs, restore safety copies. Keep them; don't demo them.

**Critical missing capabilities to validate before building anything:** (1) getting estimates in without double entry from the tool they already use; (2) something that brings the owner back each day (QuoteTend never notifies the owner); (3) a fast phone-first path from "I just hung up" to "logged". Team logins may matter for owners with an office manager.

**Assumptions that need contractor interviews:** follow-up actually slips and costs jobs; one person owns callbacks; exports exist with estimate numbers; the owner would open a second tool daily; calls dominate over texts/emails; value-first vs age-first priority; insurance and weather timing; who buys software and what they pay now.

**30-second explanation (true today, no future features):** "QuoteTend keeps every estimate you've sent in one list. When you open it in the morning it shows who's due for a call back, oldest promise first, with the job value next to each. After you call, two taps record it and set the next date. It doesn't text or email anyone for you, and it doesn't plug into your estimating software; you bring estimates in from a spreadsheet." It can be explained in 30 seconds. Whether that is worth a second tool is the open question.

## 5. Demo effectiveness report

**Scenario.** The demo already had one coherent fictional business that fits the target: Fernbrook Roofing & Exteriors, 22 estimates, $268,395 open across 14 homeowners. It includes new estimates (1–5 days), 4 overdue and 2 due today, several high-value roof replacements ($16,950–$64,900 plus a $71,200 exterior package draft), small repairs ($2,640–$8,240), recently contacted customers, upcoming follow-ups, 4 won and 2 lost, a do-not-contact case and multi-entry histories. Sprint 4A kept the data and its totals (tests pin them), and replaced a hail claim with a windstorm claim, which fits Lane County better. Totals are fictional and are not presented as revenue or market data anywhere.

**First-time owner.** Purpose: the heading ("6 follow-ups need attention") and KPIs make it clear within the first screen. Next action: **Open follow-up queue** is the primary button; the welcome banner offers the five-step tour. Core value without explanation: a visitor can find, open, copy and log in about nine actions without guidance. The tour explains the rest.

**Five-minute journey** (scripted, after fixes): open today's follow-ups (1) → choose the $38,750 overdue siding job (1) → personalize, save, copy (3; status: "Nothing was sent and no contact was recorded… then log the contact once it happens") → log a simulated call with a next date (2) → close and open Results (2), where the page says "Recorded sequence, not proof of caused revenue". The founder's version is in the [discovery kit](interviews/INTERVIEW_KIT.md#five-minute-demo-script-optional-after-discovery).

**Truth audit.**

| Claim or behavior | Status | Action |
|---|---|---|
| "Trade tags, street and phone details, and some charts preview planned customer-app features" (demo, homepage, Features) | **Out of date** since the Sprint 2 app shipped them; understated the product | Corrected on all three pages; tests updated |
| Tour: "anyone on your team can pick up the conversation" | **Overclaim**: one owner login, no team accounts | Reworded to the owner's own history |
| Demo labels "recorded by your team", "What your team recorded", tour "what your team records" | Implied multiple users | Reworded ("in this workspace", "what you record") |
| Tour finish: "You found the money waiting in open estimates" | Revenue-flavored | "You saw the estimate value still awaiting a decision" |
| Copying a draft | Truthful: clipboard only, no event | Copy status now also says to log the contact once it happens (matches the app) |
| Marking won without a logged contact | Results silently left it out (demo and app) | Same explanation added to the demo confirmation |
| Draft text "$21,480.00", lower-cased job | Robotic | Template fixed in app and demo together (parity test) |
| "Nothing is ever sent", results caveats, fictional labels | Truthful | Unchanged |
| Marketing pages saying "what your team records" | Softer; a small business's team, not a login claim | Left as accepted copy; flagged for the founder |

The marketing site's design, structure and visual system were not changed.

## 6. Changes implemented

| Area | Files | Change | Risk |
|---|---|---|---|
| Re-import explanations | `domain.js` (`previewImport`: `differences`, `FOLLOWUP_FIELDS`), `app/ui.js`, `app/views.js`, `app/main.js` (report), `app/shell.css` | Protected rows list each differing field (file vs saved); summary separates real differences from follow-up activity and warns never to remove an opt-out to match a file; expected duplicates shown in neutral text | Low: informational only. Classification, import candidates, server validation and opt-out blocking unchanged |
| First follow-up option | `import-mapping.js`, `app/views.js`, `app/main.js` | Optional date (today or later) for sent, contactable rows without a date; shown per row in the preview; never before the estimate date; blank = previous behavior | Low–medium: changes imported data only when the owner chooses a date, visibly, before saving |
| Import messages and dates | `import-mapping.js` | Errors quote the cell and the expected format; no follow-on date errors; dashes/dots read in the chosen order; year-first dates read | Low: rules and server validation unchanged; ambiguous formats still rejected |
| Suggestions | `import-mapping.js`, `app/main.js` | More heading synonyms; Pending/Sold preselected; suggestions recomputed when the status column changes | Low: suggestions are confirmed by the owner; ambiguous matches still blank |
| Opt-outs in Notes | `import-mapping.js`, `app/views.js` | Review flag and summary; never converts | Low: false positives only add a warning |
| Missing IDs | `import-mapping.js`, `app/views.js` | Guidance on the import page and in the error | None |
| Won/lost without a contact | `app/main.js`, `public-site/assets/js/demo.js` | Confirmation explains Follow-up Results won't count it | None: copy in an existing dialog |
| Draft template | `domain.js` (`draftAmount`, `draftJob`), `public-site/assets/js/workspace.js` | Whole dollars without ".00"; only the first ordinary letter lowered | Low: saved drafts untouched; demo/app parity tested |
| Demo and site truth | `public-site/demo.html`, `index.html`, `features.html`, `assets/js/tour.js`, `demo.js`, `workspace.js` (one note), `site.js` (comments) | See §5 | Low: copy only; design untouched |
| Tests | `tests/import-onboarding.test.mjs` (new, 9 tests), `tests/browser-rehearsal.mjs` (+1 group, +4 assertions), `tests/public-site.test.mjs`, `tests/public-site-browser.mjs` | Cover every change; updated assertions that pinned the outdated disclosure and the old "$21,480.00" draft | — |
| Research tooling | `scripts/sprint4a-workflow-audit.mjs` | Reproducible scenario audit (not a test; disposable DB and browser) | None for the product |
| Docs | this report, `IMPORT_GUIDE.md`, `interviews/INTERVIEW_KIT.md`, `INTERVIEW_TRACKER.md`, `OUTREACH_DRAFTS.md`, `PILOT_BASELINE.md`, `PAID_PILOT_OFFER_DRAFT.md`, `PRODUCT.md`, `START_HERE.md`, `LAUNCH_READINESS.md`, screenshots | Current positioning, discovery kit, pilot recommendation; historical material kept | — |

No server route, command, schema, ledger, authentication, session, backup or results calculation changed. No dependency was added.

## 7. Contractor discovery kit

The active kit is [interviews/INTERVIEW_KIT.md](interviews/INTERVIEW_KIT.md): five hypotheses with disconfirming evidence, 22 behavior questions (last real estimate, how follow-up happens, the last one that slipped, roofing timing such as insurance and rain, tools/exports/duplicate entry, fit and buying), a list of questions to avoid, a five-minute demo script with what to watch for, and decision rules after three conversations. The [notes template](interviews/INTERVIEW_TRACKER.md) records the five required categories separately: contractor-stated behavior, directly observed behavior, verbatim statements, founder interpretation and unverified hypotheses, plus the evidence-of-intent level reached. The earlier painting kit and Columbia, Missouri candidates are preserved as history; the [outreach drafts](interviews/OUTREACH_DRAFTS.md) now carry one unaddressed roofing template. Nothing was sent.

## 8. Paid pilot recommendation

Details and the evidence ladder are in [PAID_PILOT_OFFER_DRAFT.md](PAID_PILOT_OFFER_DRAFT.md#sprint-4a-pilot-recommendation-and-evidence-ladder). In short:

- **What a contractor must believe before paying:** follow-up slips and costs them jobs; they will open a second list most days; getting estimates in is a one-time job, not weekly double entry; their customer data is safe; one saved job a year is worth more than the subscription. QuoteTend can claim none of these today.
- **Offer to test (founder approval needed, nothing finalized):** a 30-day assisted pilot for one owner, founder-run import on a call, a 15-minute weekly check-in, success criteria agreed before starting, then a monthly price. $29/month remains a hypothesis; $19 is historical. A paid pilot with real customer data cannot start until the hosting, backup, privacy and payment gates pass.
- **Order of evidence:** discovery → a second session on their real workflow → a concrete onboarding date → accepted written pilot terms → payment. Polite interest, compliments and "send me a link" are recorded but don't count.

### Readiness gates (kept separate)

| Gate | Status | Basis |
|---|---|---|
| Product/demo readiness | **Ready for discovery calls with fictional data** | Audit, truth fixes, all suites passing |
| Customer-validation readiness | **Kit ready; zero conversations held** | No evidence of demand or willingness to pay exists |
| Technical production readiness | **Not ready** | Hosting/TLS, off-service backup, monitoring and hosted restart are externally blocked ([LAUNCH_READINESS](../LAUNCH_READINESS.md)) |
| Real-data and payment readiness | **Not ready** | Privacy/terms, retention, support coverage and Stripe test mode not done; no real customer data may be used |

## 9. Verification report

Environment: Windows 11, Node v24.19.0, Playwright 1.63 with installed Microsoft Edge (headless). All runs used temporary SQLite databases, fresh browser contexts and fictional data. The normal account database and the user's browser profile were not touched. Every external form request in the public-site suite is mocked or blocked.

| Command | Base `3dc2fc1` | Sprint 4A |
|---|---|---|
| `node --test tests/*.test.mjs` | 182 tests, 182 pass, 0 fail | **191 tests, 191 pass, 0 fail** (+9 in `import-onboarding.test.mjs`) |
| `node tests/browser-rehearsal.mjs` | 24/24 groups | **25/25 groups** (+1 group, +4 assertions), no page errors or CSP violations |
| `node tests/public-site-browser.mjs` | 27/27 groups | **27/27 groups**; no request reached the live form service |
| `node tests/security-xss-browser.mjs` | all pass | **all pass** |
| `node tests/business-calendar-browser.mjs` | 4/4 scenarios | **4/4** |
| `node tests/restore-history-browser.mjs` | 8/8 checks | **8/8** |
| `node scripts/sprint4a-workflow-audit.mjs` (research tool) | 21 scenarios ran | **22 scenarios ran** (N added); report in `test-results/sprint4a/` |

Failures seen during the sprint, all from intended changes and fixed in the tests: the demo/app draft parity check (until the demo template mirrored the app), a new rehearsal assertion that was wrong about which fields differed (the test row also had blank notes; the product was right), and a public-site assertion pinned to "$21,480.00". No pre-existing failures were found.

Specifically verified: copying a draft writes no event and no contact (audit D, rehearsal); repeated imports never overwrite or duplicate (unit tests, audit I-2 shows the revised amount stayed $17,960); an import that would lose an opt-out is still blocked (existing tests); notes never become opt-outs (unit test); cancelling a preview with the new follow-up option saves nothing (rehearsal); tenant isolation, authentication, results and restore suites unchanged and passing.

Not verified: physical phones, Safari/iOS, Firefox, screen readers, real contractor exports, human task times, and anything hosted.

## 10. Next-sprint recommendation (ranked by commercial impact)

1. **Hold three to five discovery conversations** with Eugene/Lane County roofing or exterior owners using the kit. No code. This is the only step that can show demand.
2. **Recreate (fictionally) the exports those owners actually have** and run them through the import probe. Decide from that whether reconciliation without IDs is needed.
3. **Founder decisions** on pilot terms, price to test, support hours and data handling, so a willing owner can be given clear terms.
4. **Separately authorized, only if conversations support it:** pass the hosted, backup and privacy gates needed for a real-data pilot.
5. **Small product follow-ups, each only if interviews point to it:** log a call and its decision in one step (no throwaway date); a value-first toggle on the due queue; a "jump to Log a contact" link at the top of the record on phones; a daily reminder to the owner (needs an email or SMS provider, so a separate decision); explicit per-row reconciliation on re-import.

Not recommended now: integrations, automatic customer messaging, AI drafting, team accounts, billing implementation.

## 11. Release handoff

- Repository: `https://github.com/CReese612/atlas-quotetend`; workspace `C:\Dev\AI Businesses\QuoteTend-Dev`.
- Branch: `venture/contractor-value-sprint`, created from verified `origin/venture/development` = `3dc2fc14a04c62b56a64f8c694f876a13ad3ca41`.
- Final commit SHA, working-tree status and push status: reported in the handoff message for this sprint (a commit cannot contain its own SHA). Check with `git log -1 --format=%H venture/contractor-value-sprint`.
- Not merged into `venture/development`, `main` or any staging branch. Not deployed. No accounts, payments, outreach or real data.
- **Independent review needed** before integration, especially: the first follow-up import option (`import-mapping.js`), the `differences` field in `previewImport` (`domain.js`), and the notes opt-out pattern (false positives and negatives).

## 12. Final question

*"If I owned a small roofing company and already had an estimating workflow, why would I add QuoteTend to my daily routine instead of continuing with what I use now?"*

**Strongest reason to adopt.** It answers "who do I call back today?" in one screen, with the job value next to each name, and keeps answering it the next day without anyone remembering. Logging a call takes two taps and always sets the next date, so an estimate cannot quietly fall off the list. If your current "system" is a spreadsheet, the inbox or memory, and a $20,000 roof has ever gone quiet because nobody called back, that is a concrete, cheap fix.

**Strongest reason to reject.** It is a second place to keep estimates, and it does nothing to bring you back to it. You still create estimates in your estimating tool, then export or retype them, then remember to open QuoteTend every day, then log every call. If your estimating tool or CRM already has follow-up tasks or reminders, QuoteTend duplicates them with more upkeep. If you already call everyone back within a few days, it adds administration without new information. And today it cannot hold real customer data at all, because hosting, backup and privacy are not ready.

**Verdict.** For an owner with a working estimating tool that already has reminders, QuoteTend is **not compelling** yet. The case is plausible only for owners who track estimates in spreadsheets, paper or memory and who can name a recent estimate that slipped. Whether those owners exist in Eugene/Lane County, and would maintain a second list, is unknown. Sprint 4A made the product easier to start with and more truthful to demonstrate; it did not create evidence of demand. The next step is conversations, not code.
