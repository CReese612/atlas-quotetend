# Product brief and decisions

Source: the user's **Check ChatGPT access** task, read September 16, 2026.

QuoteTend is the working company/product name. Description: estimate follow-up software for contractors. Tagline: Keep every estimate moving.

Initial audience: small painting contractors, with Columbia, Missouri as the initial research area. The user wants a software product and can devote roughly four hours per day. Keep additional spending at zero for this build. Customer demand and pricing remain unvalidated. Brand/domain/legal clearance is not established.

Agreed MVP: manual or CSV estimate entry; customer, contact, job, amount, dates and status tracking; due follow-up queue; editable message drafts for human review; contact history and won/lost outcomes; opt-outs; CSV export; honest pipeline totals.

Explicit boundaries: fictional demo data, no purchases, no account connections, no sending, no public deployment and no automatic customer messaging. Business contact in draft materials: quotetend@gmail.com.

Grok passes 1–3 have been reviewed. Pass-2 fixtures now exercise conflict holding and shared-email opt-outs. Pass-3 prospect briefs inform the interview kit, but websites and research do not establish demand, interest or willingness to pay. The proposed $19/month remains a hypothesis, not an approved launch price. Column mapping reduces import friction but does not create missing emails or provide a Joist integration.

Implementation decision (September 17): plain JavaScript UI with a local Node/Express server. The original browser demo remains separate. Private local accounts use SQLite, bcryptjs and express-session with one owner per business and server-enforced data isolation. No authentication provider is needed or connected. Full JSON backup supplements CSV for each workspace; stopped-database backups preserve all accounts. This is not a hosted production service.

Deferred: hosted accounts, staff invitations, subscriptions, payments, automatic outreach, AI API integration, CRM integration, production customer storage and cloud deployment.

September 18 local milestone: server-owned lifecycle evidence, focused account operations, versioned migration, restore safeguards and a small Follow-up Results view. Metrics describe owner-reported sequence and estimate value, not caused or collected revenue. No historical activity is fabricated. See FOLLOWUP_RESULTS.md.
