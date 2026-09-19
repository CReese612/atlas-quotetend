# Contractor interview kit

Goal: learn how small painting businesses handle estimates after sending them, and whether a separate follow-up tool would fit their work. Nothing in the prospect research establishes customer demand. Start with three conversations; choose the next product change from observed problems, not compliments.

Version 4 candidate order: Dave's Painting, TigerStripe Painting, Ai Painting Plus, AC PaintingAdvantage LLC (phone), Pezley Painting. Palmer remains on hold for contact verification; Copeland's conflicting contacts remain unresolved. Research is not evidence of interest. Use the updated OUTREACH_DRAFTS.md.

For startup and a concise rehearsal checklist, use [START_HERE](../../START_HERE.md). Grok is not needed to run this kit.

## Prepare

- Run `../FIRST_USER_TEST.md` and the optional import exercise in `../IMPORT_GUIDE.md` yourself.
- Open the local demo at http://127.0.0.1:4173/. Keep Node running. Use only fictional customers; do not ask participants to upload their customer list or connect an account.
- Save a full backup before modifying the demo. Do not reset a workspace containing work you want to retain.
- Have this guide and a blank copy of `INTERVIEW_TRACKER.md` available. The demo is local only; it has no public link to send. A conversation can happen without showing the app.
- Read `OUTREACH_DRAFTS.md` before manually contacting anyone. Nothing has been sent or scheduled. Keep price out of the invitation; $19/month remains an untested idea.

## Fifteen-minute conversation

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

## After each interview

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

## Preparing a later measured pilot

Use [PILOT_BASELINE](PILOT_BASELINE.md) before observation and [RESULTS_REVIEW](RESULTS_REVIEW.md) afterward. Local account Follow-up Results distinguishes recorded follow-up/outcome sequence from causal revenue. Do not present fictional demo totals as customer evidence.
