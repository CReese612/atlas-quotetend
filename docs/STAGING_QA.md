# QA staging — prepared only, NOT deployed

Purpose: give the product owner (and an independent tester using a cloud browser) a temporary HTTPS copy of the **real** Sprint 2 authenticated app, with a brand-new SQLite database that contains only fictional data. Nothing here is provisioned. **No hosted resource may be created until the owner approves the specific resources and cost below.**

## Architecture

- One separate Render **web service** `quotetend-staging-qa` (Node 24.19.0, `node server.mjs`), one instance, region Ohio.
- One 1 GB persistent disk mounted at `/var/data`. Database: `/var/data/quotetend-staging.sqlite`. Backups: `/var/data/staging-backups`.
- The unchanged Node/Express/SQLite app runs in its normal hosted mode (`NODE_ENV=production`): HTTPS-only, one trusted proxy hop, Host and Origin checks, Secure/HttpOnly/SameSite=Strict cookies scoped to `/api`, CSP, HSTS, rate limiting, invitation-only registration.
- The existing pilot Blueprint (`render.yaml`) is untouched and still unapplied. The staging Blueprint is `staging/render.staging.yaml`; it shares no service name, disk, database path or secret with the pilot.
- No Render Preview Environments, no PostgreSQL, no tunnel to any developer machine, no external services.

### Why a paid service with a disk
Render free web services have an ephemeral filesystem, and they cannot attach disks. They would lose the SQLite file on every restart, spin-down or redeploy, so persistence could not be verified. A persistent disk requires a paid web service.

## Documented prices (render.com/pricing.md, read 2026-10-09; verify on the day)

| Item | Price |
|---|---|
| Workspace plan Hobby | $0/month + compute (one seat, 5 GB bandwidth included) |
| Web service, "Starter" (<1 CPU, 512 MB) | $7/month |
| Persistent disk | $0.25 per GB per month (1 GB = $0.25/month) |
| Billing | Compute "prorated to the second"; disk billed on provisioned size, prorated |
| Shell access | Available on all plans (not on free web services) |

Expected cost, if the workspace is already on Hobby: **$7.25 per month if left running a full month**, about **$0.24 per day** (monthly figure ÷ 30; Render does not publish its proration denominator). A 7-day test is about $1.70. Deleting the service and disk stops charges (prorated). A Pro workspace ($25/month) is **not** required. If the owner's workspace is already on a paid plan, that existing fee is unaffected.

Tradeoffs: a service with a disk cannot scale beyond one instance and has no zero-downtime deploys (brief downtime on each deploy). Disk size can be increased but not decreased. Render takes automatic daily disk snapshots (kept at least seven days) — not a substitute for the app's own backups.

## Resources the owner must authorize

1. One Render web service, plan Starter ($7/month), name `quotetend-staging-qa`.
2. One 1 GB persistent disk ($0.25/month).
3. Deployment from branch `venture/staging-qa` (manual deploys only; auto-deploy is off).
4. A freshly generated `SESSION_SECRET`, entered by the owner in Render's environment settings.
No other accounts, domains, email, payment or third-party services are involved.

## Environment variables (Render dashboard; none are committed)

| Variable | Value | Note |
|---|---|---|
| `NODE_ENV` | `production` | Keeps every hosted-mode protection on |
| `NODE_VERSION` | `24.19.0` | `node:sqlite` needs Node 24 |
| `TZ` | `America/Chicago` | Same as pilot; seed dates follow this zone |
| `PUBLIC_ORIGIN` | `https://<service-name>.onrender.com` | **Owner enters**; exact origin shown in Render, no path |
| `SESSION_SECRET` | random, 48+ characters | **Owner enters**; new value, never the pilot's |
| `TRUST_PROXY_HOPS` | `1` | |
| `QUOTETEND_DB` | `/var/data/quotetend-staging.sqlite` | |
| `QUOTETEND_BACKUP_DIR` | `/var/data/staging-backups` | |
| `QUOTETEND_NOINDEX` | `1` | `X-Robots-Tag: noindex` header and `Disallow: /` robots.txt (not a security boundary) |
| `QUOTETEND_STAGING` | `1` | Required by the seed script |
| `QA_OWNER_EMAIL` | owner's QA login email | **Owner enters**; fictional or throwaway address |

Generate the secret locally and paste it only into Render:

```bash
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

## Deployment steps (after written approval)

1. Render Dashboard → New → **Blueprint** → select `CReese612/atlas-quotetend`, branch `venture/staging-qa`, **Blueprint file path `staging/render.staging.yaml`**. (Alternative: create the web service and disk manually with the same values; do not let Render pick up the root `render.yaml`, which would create the pilot service.)
2. Enter the three prompted values (`PUBLIC_ORIGIN`, `SESSION_SECRET`, `QA_OWNER_EMAIL`). The final URL is only known after creation. If Render assigned a different subdomain than `https://quotetend-staging-qa.onrender.com`, correct `PUBLIC_ORIGIN` and redeploy. The app rejects requests whose Host differs from `PUBLIC_ORIGIN`, so the first deploy's health check can fail until it matches.
3. Wait for `/healthz` to report healthy. Confirm `https://<url>/signin` loads, `/robots.txt` disallows all, and `/api/me` returns 401 when signed out.
4. Open the service **Shell** in Render and run once:
   ```bash
   node staging/seed-qa.mjs
   ```
   It creates `QuoteTend QA Roofing & Exteriors` with 40 fictional estimates, then prints a **one-use recovery code** once (shell only; it is not logged or stored in plain text). It refuses to run unless the database file is named `quotetend-staging*.sqlite`.
5. The owner opens `/signin` → **Forgot your password?** → enters `QA_OWNER_EMAIL`, the recovery code, and chooses a unique password of at least 12 characters. No password is ever generated, printed or committed. The owner may rotate it any time in Account security, and give the credentials to the tester through a private channel.
6. Tester signs in at `/signin`; the first screen is the real private app.

Registration stays invitation-only. For the cross-tenant test, create a second business with `node invite-owner.mjs second-tester@example.test` in the Shell, give the code to the tester privately, and they register at `/signin` ("Have an invitation?").

## Resetting QA data (explicit, staging only)

Restores the 40 seed estimates for the QA business **and discards every QA edit** (keeps the owner's password; other businesses are not touched; dates are re-anchored to today). It refuses unless the database name matches `quotetend-staging*.sqlite`, the business is the QA seed business, and both guards are given:

```bash
QUOTETEND_STAGING_RESET=reset-qa-data node staging/seed-qa.mjs --reset
```

Seeding never happens automatically at startup, and a plain re-run refuses when the owner already exists.

## Seed data

40 estimates (IDs `QA-1001`–`QA-1040`) across Roofing, Siding, Gutters, Windows & doors and Exterior repairs. Dates are relative to the seed day. On the seed day: 26 sent (8 overdue, 2 due today, 11 upcoming, 3 with no follow-up date, 2 paused by opt-out), 4 draft, 6 won, 4 lost. Follow-up Results over all time then show 17 contacts, 15 followed, 3 won, 2 lost, 10 open. Contacted and never contacted (including multi-contact records); one opt-out and one record paused by that shared email; missing email, phone or address; notes. Wins: six, of which three have a logged contact beforehand and three do not (see below). Emails use the reserved `@example.test` domain, phones use the fictional `(541) 555-01xx` range, addresses end `OR 00000`.

## QA scenarios → where to look

A. Overview: pipeline/due counts must equal what the Estimates list shows. B. Estimates: create/edit/search/filter/sort, refresh. C. Follow-ups: overdue and upcoming queues, copy draft, log contact, reschedule. D. Outcomes: see the observation below. E. CSV: `tests/import-fixture.csv` plus your own file with phone/address/trade columns; re-import for duplicate handling; an opt-out row. F. Security: signed-out `/api/*` returns 401; second business sees 0 estimates; others' workspace ID returns 404. G. Persistence: refresh, sign out/in, then Render → Manual Deploy (or Restart) and sign in again.

### Observed behavior, unchanged and awaiting a product-design decision

Follow-up Results only counts an estimate if the owner logged a contact **before** marking it won. Marking an estimate Won without a logged contact changes the Won status (and the pipeline's won total) but does not add it to Follow-up Results. This is deliberate attribution logic, not a staging change; `tests/staging.test.mjs` records it as a characterization test. The seed has three wins of each kind (QA-1007/1017/1028 with contact; QA-1008/1016/1035 without) so an all-wins summary can be compared against follow-up attribution. If a product decision adds an all-wins summary, that test should be updated deliberately.

## Security controls

Login required for all `/api/workspaces/*`; tenant derived from the session only; invitation-only registration; Secure/HttpOnly/SameSite=Strict cookies; same-origin write checks; Host allow-list; HTTPS-only with HSTS; CSP and `no-store`; 40 auth attempts per 15 minutes per client; recovery codes hashed and one-use; static files by exact allow-list; noindex (courtesy only). Secrets live only in Render's environment. The seed script never prints or stores a password, refuses non-staging databases, and its reset is double-gated. The URL is public to anyone who knows it; the app login is the only gate. If an extra gate is wanted, the simplest option compatible with a cloud browser is to keep the URL private and have the owner suspend the service between test sessions; adding HTTP basic auth would require new code and is not included.

## Cleanup after acceptance

1. Export anything worth keeping from the app (CSV) — staging data is fictional.
2. Render Dashboard → the service `quotetend-staging-qa` → Settings → **Delete Web Service**; then Disks → delete `quotetend-staging-data` if it remains (deleting the disk destroys the database and backups permanently).
3. Delete the Blueprint if one was created; remove `SESSION_SECRET` from any password manager.
4. Confirm no `quotetend-staging-*` resource remains and the next invoice shows no staging charge.
To pause without deleting: Suspend the service (the disk keeps billing at $0.25/GB/month).
