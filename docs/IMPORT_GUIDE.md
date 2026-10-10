# Import a fictional spreadsheet

Keep the current browser and port. First open **Settings & data → Download workspace export** and save the JSON or copy it into a local `.json` file. CSV exports do not include activity history or saved drafts.

1. Export your spreadsheet as comma-separated CSV with one header row. XLSX and pasted tab-separated grids are not supported. Use fictional names and `example.com` emails.
2. Give each estimate a stable, unique ID. Do not generate new IDs every time you export: the ID prevents repeat imports. Include customer, job, USD amount and estimate date. Add missing required information in the source spreadsheet.
3. Choose the CSV file, or expand **Or paste CSV text**. Click **Match pasted columns** when pasting.
4. Review every suggested column. Leave unavailable optional fields unmapped. Choose the date format actually used in the source. Map unfamiliar statuses explicitly: Draft = not shared, Sent = awaiting decision, Won = accepted, Lost = declined. A source without a status column uses the one status you choose for every row (Sent is preselected). Phone, project address and trade/service columns are optional and matched by common headings (Phone, Mobile, Job Site, Address, Trade, Service Type…).
5. Map opt-outs when available. A mapped opt-out column accepts true/false, yes/no or 1/0; blank cells are invalid. Without this column, review the source for opt-outs before checking the acknowledgment. Missing email does not prevent import, but prevents matching that record to other email-based opt-outs.
6. Click **Preview mapped estimates**. Check amounts, dates, statuses and all warnings. Nothing is saved yet. Changing a mapping invalidates the preview; changing a column also resets date/status options, so confirm them again.
7. Import only when the ready rows are correct. The validation report can be copied or downloaded for fixing rejected rows. Correct the source and preview again; do not change existing IDs just to bypass a conflict.

| Preview result | Meaning / action |
|---|---|
| Ready | New valid estimate; saved only after Import is clicked. |
| Held within-file | Different valid rows share a new ID. None of those versions are saved. Resolve the source conflict. |
| Existing conflict | ID already exists with different fields. Existing record is protected; review/edit it separately if appropriate. |
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

## Limits

If a rejected or conflicting row has an explicit opt-out and valid email, the entire import is blocked unless an existing or ready-to-import opt-out already retains that email's preference. The notice lists source records, emails and matching estimates. Repair the source without discarding a real opt-out and preview again. For an existing record, cancel and save its confirmed opt-out in All estimates first. Preview and cancellation never save preferences: existing follow-ups remain unchanged until you save a correction. This also applies when the blocked email has no matching estimate yet. Blank/invalid emails and unrecognized opt-out values cannot establish an email-based preference; fix those source errors separately.

On narrow screens each preview record is stacked with its customer, amount/status and complete result, so errors do not require horizontal scrolling.

Up to 2 MB and 5,000 estimate rows. Only USD and the displayed date formats are supported. A malformed CSV row with the wrong number of fields blocks preview until repaired. Missing follow-up dates on Sent estimates go to **Needs a date**; with no status column, every row gets the status you chose. Joist/basic accounting exports may lack needed fields: ask which export is actually available and recreate a fictional sample rather than requesting live customer data.
