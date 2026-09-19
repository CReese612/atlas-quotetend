# Your first QuoteTend test — about 10 minutes

Use fictional details only. No customer emails or phone calls are needed. Do not reset the workspace or import fixtures for this first test.

Open http://127.0.0.1:4173/ in the same browser you have been using. If it is unavailable, follow the startup instructions in [START_HERE](../START_HERE.md). Write down the current Open pipeline and Won estimates totals on Overview.

## 1. Add one estimate

Click **Add estimate**. Enter:

| Field | Value |
|---|---|
| Customer name | Jordan Example |
| Email | jordan.example@example.com |
| Job description | Interior hallway painting — my demo test |
| Amount (USD) | 1250.00 |
| Estimate date | Today's date |
| Status | Sent |
| Next follow-up | Today's date |
| Do not contact | Leave unchecked |
| Notes | Fictional test. Customer is choosing between two colors. |

Click the form's **Add estimate** button. Expected: Open pipeline increases by $1,250. Write down the generated QT estimate ID. Existing demo totals may differ if you have already changed records; compare before and after.

## 2. Find it in the queue

Click **Follow-ups → Due & overdue**. Find **Jordan Example**, then click its **Review** button. Expected: $1,250, your job description, and **Due today**.

## 3. Personalize a draft

In **Follow-up draft**, add: “Happy to talk through the two color options.” Click **Save draft**, then **Copy draft**. Paste into Notepad to verify the words copied. Do not paste into an email composer or send anything.

Close the detail window with **×**, reopen Jordan, and confirm your added sentence remains. Expected: saving/copying does not add contact history or change the due date.

## 4. Simulate a contact

In **Log a contact**, set:

- Contact date: today.
- Method: Phone.
- Next follow-up: three calendar days after today.
- Contact note: “DEMO ONLY — simulated call; customer is reviewing colors.”

Click **Record contact & next step**. Expected: the note appears in Activity history, and your edited draft remains. Close the window and check **Follow-ups → Upcoming**. Jordan should appear there and no longer be under **Due & overdue**.

## 5. Simulate winning the job

Review Jordan from Upcoming. Click **Mark won**, then confirm **Mark won**. Expected: status becomes Won, follow-up date clears, draft/contact controls disappear, and the activity history remains.

Close the window. Under **All estimates**, search for Jordan and confirm Won. On **Overview**, Won estimates should be $1,250 above the total you recorded at the start; Open pipeline should return to its starting amount, assuming you made no other changes.

## 6. Check persistence

Reload the page. Go to **All estimates**, search for Jordan, and open it. Expected: Won status and activity history remain. Keep this fictional record for our review.

## Optional: opt-out check

Create a second estimate with customer **Morgan Optout**, email **morgan.optout@example.com**, job **Fictional bedroom painting**, amount **900**, estimate date today, status Sent, and **Do not contact checked**. Expected: it saves in All estimates, but no follow-up date is active and it never appears in the follow-up queues.

Create another sent estimate using **MORGAN.OPTOUT@example.com** and a different fictional job. Expected: it also shows a shared-email opt-out, has no active follow-up date, and offers no draft or contact logging. Its detail view links to the blocking estimate. Blank email addresses are not grouped. Removing the source opt-out requires explicit review and does not restore old dates.

For a separate import walkthrough, use `docs/IMPORT_GUIDE.md`. Export a full backup before experimenting with imports or resets.

## Send Codex your results

Copy and complete:

```text
Added estimate: pass/fail
Found due follow-up: pass/fail
Saved and copied edited draft: pass/fail
Logged contact and moved to Upcoming: pass/fail
Marked won and checked totals: pass/fail
Reload preserved status/history: pass/fail
Most confusing step:
Anything I expected but couldn't find:
Overall: could I repeat this without instructions?
```

If a step fails, record what you clicked and what appeared. Leave the record as-is so Codex can investigate.
