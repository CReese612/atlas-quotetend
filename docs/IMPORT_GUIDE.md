# Import a fictional spreadsheet

Keep the current browser and port. First open **Settings & data → Download workspace export** and save the JSON or copy it into a local `.json` file. CSV exports do not include activity history or saved drafts.

1. Export your spreadsheet as comma-separated CSV with one header row. XLSX and pasted tab-separated grids are not supported. Use fictional names and `example.com` emails.
2. Give each estimate a stable, unique ID. Do not generate new IDs every time you export: the ID prevents repeat imports. Include customer, job, USD amount and estimate date. Add missing required information in the source spreadsheet. **No estimate or quote numbers?** Add an ID column once (E-1001, E-1002 …), type the IDs in, and keep that column in every later export. Row numbers, `=ROW()` formulas or IDs built from today's date are not stable: re-sorting or re-exporting changes them and the same estimate would look new. A job number works only if each job has exactly one estimate row. For a handful of estimates, **Add estimate** is simpler; QuoteTend numbers those itself.
3. Choose the CSV file, or expand **Or paste CSV text**. Click **Match pasted columns** when pasting.
4. Review every suggested column. Leave unavailable optional fields unmapped. Choose the date format actually used in the source; slashes, dashes or dots between the parts all work (10/15/2026, 10-15-2026), and year-first dates (2026/10/15) are read under any choice. Two-digit years and spelled-out months are rejected with a message saying so. Map unfamiliar statuses explicitly: Draft = not shared, Sent = awaiting decision, Won = accepted, Lost = declined. Pending, Sold, Accepted and Declined are preselected as Sent, Won, Won and Lost; check them. A source without a status column uses the one status you choose for every row (Sent is preselected). Phone, project address and trade/service columns are optional and matched by common headings (Phone, Mobile, Job Site, Address, Trade, Service Type…). Sprint 4A added suggestions for Estimate Amount, Bid Amount, Total Price, Date Sent, Created Date, Homeowner, Job Name, Scope, Stage and Estimate No.; every suggestion still needs your confirmation.
5. Map opt-outs when available. A mapped opt-out column accepts true/false, yes/no or 1/0; blank cells are invalid. Without this column, review the source for opt-outs before checking the acknowledgment. Missing email does not prevent import, but prevents matching that record to other email-based opt-outs. If a Notes cell sounds like a contact preference ("asked us not to call again", "stop calling", "opt out"), the preview flags that row; it is never turned into an opt-out automatically, so fix the source or mark the estimate **Do not contact** yourself.
6. Optional: **First follow-up for sent estimates without a date.** Most owner spreadsheets have no follow-up column, which would put every sent estimate under **Needs a date**. Pick a day (today or later) to put those estimates in that day's queue instead. Rows with their own follow-up date keep it; draft, won, lost and opted-out rows get no date. Leave it blank to keep the earlier behavior.
7. Click **Preview import**. Check amounts, dates, statuses and all warnings. Error messages quote the cell from your file and say what would work. Nothing is saved yet. Changing a mapping invalidates the preview; changing a column also resets date/status options, so confirm them again.
8. Import only when the ready rows are correct. The validation report can be copied or downloaded for fixing rejected rows. Correct the source and preview again; do not change existing IDs just to bypass a conflict.

| Preview result | Meaning / action |
|---|---|
| Ready | New valid estimate; saved only after Import is clicked. |
| Held within-file | Different valid rows share a new ID. None of those versions are saved. Resolve the source conflict. |
| Existing conflict ("Existing ID · protected") | ID already exists with different fields. The saved record is never changed by an import. The row lists each difference as *file value, saved value*. If only follow-up or last-contact dates differ, QuoteTend has simply moved them as you worked (or cleared them for an opt-out). If the amount, status, job or customer differs, the summary names the estimate: open it and edit it yourself if the file is right. |
| Duplicate | Exact repeat within the file or matching existing record; skipped. |
| Invalid | Fix the listed field problems. Invalid rows cannot import. |

An imported opt-out can pause existing estimates sharing the same email. The preview lists affected IDs. Email matching trims whitespace and ignores case; it does not infer identity from names, phone numbers, aliases or blank emails. Closed records can still be the source of an opt-out. Shared household/company inboxes are intentionally treated as one contact preference.

## Small copy-and-paste exercise

The fixed dates below are format examples, not promises of a due-today queue. You can change them consistently before previewing. Leave IDs stable when repeating the exercise.

```csv
Quote ID,Customer,Email,Project,Total,Date,State,Follow Up,Opt Out
PRACTICE-1,Sam Example,sam@example.com,Fictional hallway,"$1,250.50",09/16/2026,Awaiting,09/19/2026,no
PRACTICE-2,Riley Example,riley@example.com,Fictional porch,800,09/16/2026,Awaiting,09/19/2026,no
PRACTICE-2,Riley Example,riley@example.com,Fictional porch,900,09/16/2026,Awaiting,09/19/2026,no
```

Map Status to State, select MM/DD/YYYY, and map Awaiting to Sent. Expected on a workspace without these IDs: one ready row and two held rows. Only Sam can import. Repeat after importing: Sam is a duplicate and Riley remains held.

## Re-importing an updated spreadsheet

Re-importing the same export is safe: new IDs are added, identical rows are skipped and saved estimates are never overwritten. Expect the rows you have worked in QuoteTend to show as protected, because QuoteTend has changed their follow-up dates or status since the export. Real revisions in the source (a new price, a decision you recorded only in the spreadsheet) are listed separately in the preview summary; QuoteTend does not apply them for you. There is no merge or sync. See [Sprint 4A](SPRINT4A_CONTRACTOR_VALUE.md#3-import-friction-report) for why.

## Limits

If a rejected or conflicting row has an explicit opt-out and valid email, the entire import is blocked unless an existing or ready-to-import opt-out already retains that email's preference. The notice lists source records, emails and matching estimates. Repair the source without discarding a real opt-out and preview again. For an existing record, cancel and save its confirmed opt-out in All estimates first. Preview and cancellation never save preferences: existing follow-ups remain unchanged until you save a correction. This also applies when the blocked email has no matching estimate yet. Blank/invalid emails and unrecognized opt-out values cannot establish an email-based preference; fix those source errors separately.

On narrow screens each preview record is stacked with its customer, amount/status and complete result, so errors do not require horizontal scrolling.

Up to 2 MB and 5,000 estimate rows. Only USD and the displayed date formats are supported. A malformed CSV row with the wrong number of fields blocks preview until repaired. Missing follow-up dates on Sent estimates go to **Needs a date**; with no status column, every row gets the status you chose. Joist/basic accounting exports may lack needed fields: ask which export is actually available and recreate a fictional sample rather than requesting live customer data.
