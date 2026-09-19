Continue QuoteTend research as Grok Bot, version 5. Focus on repairing the version 4 test pack and resolving specific uncertainties. Do not repeat broad market research or expand the prospect list.

QuoteTend is a local demo for small painting contractors: estimates created elsewhere, follow-up queues, editable local drafts, contact history, outcomes, opt-outs and CSV import. Fictional customers only. Use quotetend@gmail.com only in draft business signatures. No messages, calls, form submissions, account connections, purchases, trials, subscriptions or public deployments.

Current build context from Codex: 32 automated tests passed before this review. It already holds all differing valid versions of a new ID, skips exact repeats, protects existing IDs, suppresses queue/draft/contact actions across normalized nonblank emails, and supports column matching, explicit date/status choices and formatted USD. Missing status COLUMN defaults to Draft; blank status CELLS need explicit mapping or fail validation. Missing opt-out column requires acknowledgment; mapped blank opt-outs are invalid. Preview/cancel never changes saved data. CSV does not preserve history or saved drafts; full JSON backup does. Your localhost cannot reach the user's app: do not claim app tests unless actually executed with evidence.

Priority 1 — deliver a complete, corrected test pack.

Read your v4 completion report and manifest. Codex received only seed_existing, import_dupes, import_conflicts, import_email_optout, import_mapping and the enriched onboarding CSV, plus your research CSVs/memos. Thirteen artifacts listed in your completion report were absent from the delivered folder. Recover or regenerate the missing fixtures and supply a self-contained v5 pack with actual downloadable files, preferably one ZIP plus an inventory. Preserve v4 originals.

Fix these specific issues:
- Put CSV headers first. Remove leading or trailing comment records from import-ready CSVs. Label synthetic data in filenames, notes and README. A header-only file must contain only its header; an empty file must be zero bytes.
- C06 must use an invalid row followed by a valid row with the SAME ID, plus reversed order.
- C18 needs a won/lost opted-out source and a sent sibling sharing its email.
- C36 needs explicit setup of saved draft and contact history before backup; a CSV alone cannot test their restoration. Test only isolated disposable data, never the user's main workspace.
- Make accepted, repeated, existing-match, existing-conflict, held and invalid ROW counts mutually exclusive and reconcile them to input rows. Report held ID counts separately. List exact accepted IDs and due IDs on 2026-09-16.
- Give exact column mappings, date format, status mappings and initial state for every mapping case.

Codex's observed in-memory v4 results: duplicates 3 ready/3 repeats/2 held; seeded conflicts 1 ready/1 exact match/3 conflicts; seeded email pack 7 ready/1 conflict with S005 suppressed; explicit ISO mapping without status coercion 2 ready (M001,M004)/3 invalid. The enriched CSV fails because its first line is a comment. Separate fixture/parser checks you execute from proposed app expectations. Include file sizes, row counts and SHA-256 hashes; check every inventory entry exists.

Priority 2 — resolve your R9 proposal in a short decision memo.

Define what should happen when a valid normalized email and explicit true opt-out appear on an otherwise invalid row, a held same-ID group, or an existing-ID conflict. Compare (a) blocking import until repair and (b) a separately reviewed suppression action at commit. Recommend the smallest understandable option. No saved changes on preview/cancel, no corrupted estimates imported, no silent overwrite of existing estimates. Cover false-positive correction, provenance, reload, backup/restore, and exact user-facing explanation. Label this a proposal pending Codex review, not an agreed requirement. Provide 6–8 focused cases.

Priority 3 — make targeted contact corrections.

Keep the v4 first five as candidates, not interested customers. Recheck Pezley's business-controlled Columbia contact page and record visible contact text separately from link targets/schema. Resolve Copeland's inconsistent phone claim: 5733975042 and 5732424522 are DIFFERENT numbers. Keep Palmer marked unresolved unless stronger business-controlled evidence identifies a contact route. Do not infer owners from testimonials or email names. Cite exact source URLs, access dates and evidence locations; record blocked pages honestly. Do not contact anyone to verify.

Deliver the ZIP/inventory, corrected manifest, R9 memo, brief contact corrections and a one-page completion report separating researched, mechanically checked, app-tested and unfinished work. Stop after these tasks. Do not invent interviews, customer interest, timing measurements, source contents or test results. If files cannot be attached, state that clearly and provide exact file contents instead of inaccessible internal paths.
