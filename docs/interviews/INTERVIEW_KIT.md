# Contractor discovery kit — roofing and exterior contractors, Eugene/Lane County

**Current target (Sprint 4A, October 2026):** small roofing and exterior contractors in Eugene and Lane County, Oregon. Earlier material in this folder targeted painting contractors in Columbia, Missouri; that kit is preserved unchanged in the [archive section](#archive--painting-contractor-interview-kit-september-2026) below. Its candidate list is historical and is not a current outreach list.

**Status:** draft research material only. No roofing or exterior contractor has been contacted or interviewed, and nothing here is evidence of demand, interest or willingness to pay. The founder decides whom to contact and sends anything manually. Sprint 4A findings that motivate these questions: [SPRINT4A_CONTRACTOR_VALUE.md](../SPRINT4A_CONTRACTOR_VALUE.md).

The conversation is about **their current workflow first**. The demo is optional and comes last.

## What the conversations must answer

Each hypothesis has the evidence that would count against it. Record both.

| # | Hypothesis | Evidence for | Evidence against (take it seriously) |
|---|---|---|---|
| H1 | Sent estimates go quiet without a planned follow-up often enough to cost real jobs. | A specific recent estimate that slipped, with its approximate value and what happened. | They follow up reliably today (CRM reminders, a set routine, an office person), or most homeowners decide on the spot. |
| H2 | One person (often the owner) owns follow-up and would use a daily list. | They name who calls back and describe how that person decides whom to call. | Each salesperson owns their own leads in a tool QuoteTend can't reach; nobody owns follow-up at all. |
| H3 | Getting estimates into QuoteTend is acceptable: an export with stable estimate numbers, or a short list typed once. | They can show or describe an export with an estimate number per row, or have few enough open estimates to type. | No export; no estimate numbers; "I'd have to enter everything twice" is a dealbreaker. |
| H4 | They would open a second tool most working days. | They already keep a separate list (paper, whiteboard, spreadsheet) and update it. | "If it's not in [their main tool], it doesn't exist." |
| H5 | Someone would pay a modest monthly amount for this once it works with their data. | They say what they pay for software now, who approves it, and what would justify one more subscription, and later act on it (see the [evidence ladder](../PAID_PILOT_OFFER_DRAFT.md#sprint-4a-pilot-recommendation-and-evidence-ladder)). | No budget, or their existing tool already covers it. Compliments are not evidence. |

## Before the conversation

- Ask for permission to take written notes. Ask them to leave out customer names, addresses and contact details. No audio or video without separate permission.
- Bring no price. If asked: "It isn't set. What do you pay for software now?"
- Have a blank copy of the [notes template](INTERVIEW_TRACKER.md) open.
- If you may show the demo, open the public demo (`node public-site/serve.mjs`, then http://127.0.0.1:4180/demo.html) and click **Reset demo data** first. Use the private app only with fictional data.
- Do not ask for a customer list, an export file or account access. Seeing an export *screen* they choose to show is fine; record what you saw.

## Discovery questions (15–20 minutes)

Follow their story; skip questions they have already answered. Every question asks about something that happened, not about a hypothetical.

**A. The last real estimate**
1. "Walk me through the last roof or exterior estimate you sent, from the inspection to where it stands now."
2. "Where does that estimate live right now?" (Which tool, spreadsheet, paper or email thread? Who can see it?)
3. "How did it get to the homeowner?" (PDF by email, printed at the kitchen table, texted link, a measurement report plus a quote?)

**B. How follow-up actually happens**
4. "On a normal morning, how do you know which estimates need a call back?" Ask what they open first.
5. "Who makes those calls, and when in the day or week?"
6. "What does a follow-up usually look like: call, text, email? How many tries before you stop?"
7. "Where do you write down what the homeowner said?"

**C. The last one that slipped**
8. "Tell me about the last time an estimate went quiet longer than you meant it to. When did you notice, and what happened?" If nothing comes to mind, record that.
9. "About what was that job worth?" (Mark it as their recollection, not a measured figure.)
10. "How often does that happen in a typical month in your busy season? In winter?"
11. "Has a homeowner ever told you they went with someone else? What did they say?" Write their exact words.

**D. Roofing-specific timing**
12. "What usually stretches a homeowner's decision?" (Insurance adjuster, financing, HOA approval, other bids, waiting for dry weather.)
13. "How does the rainy season change your estimating and follow-up?"
14. "Roughly what share of your estimates involve an insurance claim? Does that change how you follow up?"

**E. Tools, exports and duplicate entry**
15. "What software do you use for estimates, scheduling and invoicing?" Don't name products for them.
16. "Does any of it remind you to follow up, or send follow-ups for you? Do you use that? Why or why not?"
17. "Can that software export your estimates? Would you be willing to show me the export screen, without customer data?" Note the format, the columns and whether each estimate has a number.
18. "Do you type the same customer or job details into more than one place today?"

**F. Fit and buying**
19. "If you had a list of who to call each day, where would you look at it: phone in the truck, office computer, printed?"
20. "What would make you stop using a new tool after a month?"
21. "Who decides when the business pays for software? Roughly what do you pay for software each month now?"
22. "What would have to be true for a follow-up list like this to be worth paying for?"

**Close:** "Would you be willing to meet again for 30 minutes and walk me through your real estimate list on your own screen?" Record the exact answer and any date agreed. A polite yes is not a commitment.

**Avoid** leading or hypothetical questions: "Wouldn't automatic follow-up be valuable?", "How much would you pay for…?", "Do you lose a lot of jobs because…?", "Would you use this?". Do not describe planned features as if they exist.

## Five-minute demo script (optional, after discovery)

Say first: "This is a fictional roofing company. QuoteTend doesn't send anything. You call or text from your own phone, then record what happened." Then let them drive where possible and watch where they hesitate.

| Minute | Screen | Say or ask | Watch for |
|---|---|---|---|
| 0–1 | Overview | "These are a fictional company's open estimates. How does this compare with what you look at in the morning?" | Do they read the due count and value without help? |
| 1–2 | Follow-ups → Due & overdue | "Who would you call first, and why?" Don't answer for them. | Do they pick the oldest promise or the biggest job? (The queue sorts oldest first; Estimates can sort by value.) |
| 2–3 | Open their pick → Follow-up draft | "This is an editable template. Copy puts it on your clipboard. Nothing is sent and no contact is recorded." Ask: "Would you send something like this, or just call?" | Do they understand copy ≠ sent? Do they want text, email or neither? |
| 3–4 | Log a contact | "This records a call that already happened and when to call back." If the homeowner decided on that call: "log the call first, then Mark won, so Follow-up Results counts it." | Does recording one call feel like admin they would skip? |
| 4–5 | Follow-up Results (or Import if exports came up) | "These numbers are only what was recorded. They aren't revenue and don't prove QuoteTend caused anything." For Import: show the sample preview and the stable-ID rule. | Do they ask about their own data, an export, or price? Record unprompted questions. |

Say explicitly what it does **not** do today: no sending, no connection to their estimating software or CRM, no team logins (one owner login), no automatic import, no provider-confirmed delivery. If something breaks, say so and note what happened.

## After each conversation

Fill in the [notes template](INTERVIEW_TRACKER.md) the same day. Keep the five kinds of record separate: what they said they do, what you saw, exact words, your interpretation and untested hypotheses. Unknown stays unknown.

## After three conversations

Compare the hypotheses table without inventing a score. Then choose one:

- **Continue toward a pilot** only if at least two described a specific recent slipped estimate with a real job value (H1) *and* can get estimates in with stable numbers or by typing a short list (H3). Next step: the evidence ladder in the [pilot proposal](../PAID_PILOT_OFFER_DRAFT.md#sprint-4a-pilot-recommendation-and-evidence-ladder).
- **Change the product question** if the pain is real but the second tool is the obstacle (H4 fails): investigate their specific export or a lighter daily list before writing code.
- **Stop or re-target** if follow-up is already handled well by what they use (H1 fails), or no one would maintain the list.

These are qualitative decisions from a handful of conversations, not a market measurement.

---

## Archive — painting-contractor interview kit (September 2026)

Preserved unchanged below for decision history (headings demoted one level). It targeted painting contractors in Columbia, Missouri. It is superseded by the roofing kit above; its candidate businesses are not current outreach targets, and no invitation from it was sent.

### Contractor interview kit

Goal: learn how small painting businesses handle estimates after sending them, and whether a separate follow-up tool would fit their work. Nothing in the prospect research establishes customer demand. Start with three conversations; choose the next product change from observed problems, not compliments.

Version 4 candidate order: Dave's Painting, TigerStripe Painting, Ai Painting Plus, AC PaintingAdvantage LLC (phone), Pezley Painting. Palmer remains on hold for contact verification; Copeland's conflicting contacts remain unresolved. Research is not evidence of interest. Use the updated OUTREACH_DRAFTS.md.

For startup and a concise rehearsal checklist, use [START_HERE](../../START_HERE.md). Grok is not needed to run this kit.

#### Prepare

- Run `../FIRST_USER_TEST.md` and the optional import exercise in `../IMPORT_GUIDE.md` yourself.
- Open the local demo at http://127.0.0.1:4173/. Keep Node running. Use only fictional customers; do not ask participants to upload their customer list or connect an account.
- Save a full backup before modifying the demo. Do not reset a workspace containing work you want to retain.
- Have this guide and a blank copy of `INTERVIEW_TRACKER.md` available. The demo is local only; it has no public link to send. A conversation can happen without showing the app.
- Read `OUTREACH_DRAFTS.md` before manually contacting anyone. Nothing has been sent or scheduled. Keep price out of the invitation; $19/month remains an untested idea.

#### Fifteen-minute conversation

**0–1 minutes — opening.** “Thanks for helping. I'm building an early prototype called QuoteTend and trying to understand how painters manage estimates after they're sent. I'd like to hear about your actual process first, then show a short fictional example if useful. Is it okay if I take written notes? Please leave out customer names and contact details.” Do not record audio/video without separate permission.

**1–8 minutes — learn before showing.** Use these questions in order; follow the concrete story instead of forcing every question.

1. “Walk me through the last estimate you sent, from the visit to what happened next.” Probe for the actual next step and who did it.
2. “Where does that estimate live now? How do you know which ones still need attention?” Ask what they open during a normal day.
3. “Tell me about the last time the customer took longer to decide. What happened?” If nothing was difficult, record that.
4. “How do you record accepted, declined, not-now, or do-not-contact requests?” Ask how preferences carry across repeat jobs or shared email addresses.
5. “About how many estimates are usually awaiting a decision, and who handles them?” Keep their estimate separate from any measured count.
6. “What tools do you already use? What would be involved in getting an estimate into a second tool?” Ask: “Do you enter the same estimate information in more than one place today? What have you tried changing, and what happened?” Ask which export fields they can access. No live customer export is needed.

**8–13 minutes — five-minute demo, if wanted.** Introduce it as a local prototype using made-up data and editable templates. It does not send messages.

| Minute | Show or ask the participant to do | Observe |
|---|---|---|
| 1 | Open Follow-ups, choose a due fictional estimate. “What would you do next?” | Can they locate and interpret the next step without coaching? |
| 2 | Review/edit a draft. Save it; explain copying is separate from contact logging. | Do they distinguish a draft from a sent message? |
| 3 | Log a clearly simulated phone contact and set a future date. Show Upcoming. | Does the workflow resemble their actual process? |
| 4 | Show one outcome or opt-out and the cleared schedule. Explain matching email preferences apply across estimates. | Do suppression and reactivation rules match expectations? |
| 5 | Show column matching and a preview with fictional rows. Use the import guide if they care about spreadsheets. | Can their source data provide stable ID, customer, job, amount and date? What extra work remains? |

Avoid narrating the answer to each task before they try it. Note assistance required. If a bug appears, capture the action and visible result, then continue the conversation; do not pretend the feature worked.

**13–15 minutes — assess and close.** “Where, if anywhere, would this fit in your current routine?” “What would you keep using instead?” “What would make this more work than it's worth?” “What would need to be true before you tried a tool like this?” Ask whether they would like a later conversation; a polite yes is not adoption or willingness to pay. Thank them and agree only to follow-ups they requested.

#### After each interview

Write the notes immediately. Separate exact quotes, reported behavior, observed demo behavior and your interpretation. Record missing answers as unknown. If asked price, say it is not set; ask what they currently spend and who decides, without implying a commitment.

After three interviews, compare these dimensions without manufacturing a numeric validation score:

| Dimension | Evidence to capture |
|---|---|
| Recurring problem | Specific recent incident, frequency, consequence and current workaround; or evidence there is no material problem. |
| Workflow fit | Named owner of follow-up and where a second tool could fit. |
| Import feasibility | Actual source tool, obtainable fields, missing data and effort to maintain it. |
| Usability | Task completed independently, completed with help, failed, or not attempted. |
| Existing alternative | How their spreadsheet/CRM/calendar already solves this; switching burden. |
| Next-step interest | Exact permission/action agreed. Distinguish “sounds useful” from an arranged follow-up; neither is a sale. |

Choose one response: improve a repeatedly confusing workflow; investigate a common import obstacle with a fictional sample; or pause expansion if the need is weak or already solved. These are qualitative decisions, not a statistically representative market result. Authentication, durable storage and a data-handling plan are prerequisites to any future real-data pilot.

#### Preparing a later measured pilot

Use [PILOT_BASELINE](PILOT_BASELINE.md) before observation and [RESULTS_REVIEW](RESULTS_REVIEW.md) afterward. Local account Follow-up Results distinguishes recorded follow-up/outcome sequence from causal revenue. Do not present fictional demo totals as customer evidence.
