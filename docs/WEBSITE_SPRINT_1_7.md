# Website Sprint 1.7 — Information architecture and homepage simplification

Engineering report for the product owner and Atlas. Acceptance stays with them. Nothing was merged or deployed, and no improvement in conversion is claimed: the change responds to one qualitative visitor observation and has not been measured.

## 1. Executive summary

The long single-page website is now a focused homepage plus three supporting pages, using the existing design system unchanged:

- **Home** (`index.html`): hero, the problem, three core benefits, a product preview of the demo, and the early-access form. **Copy fell from about 1,560 to about 535 words (−66%)**, and the page height from 12,728px to 5,907px at 1440px wide (−54%) and from 21,816px to 10,366px at 390px (−52%).
- **How it works** (`how-it-works.html`): the five-step workflow from the brief, split into what you do and what QuoteTend does, the three required distinctions, and the estimate calculator.
- **Features** (`features.html`): the six existing feature stories regrouped into the ten capabilities, with "Available today / On the roadmap".
- **FAQ** (`faq.html`): 11 questions in three groups.
- **Demo** (`demo.html`): unchanged.

The early-access form is still the single Formspree form, on the homepage; every page links to it. Navigation is now consistent site-wide (desktop bar and an accessible mobile menu) and keeps the primary call to action visible on phones. No visual identity, demo, shared stylesheet or private-application file changed.

## 2. Structure, before and after

| Before (Sprint 1.6) | After (Sprint 1.7) |
|---|---|
| `index.html`: 9 sections and 7 FAQ answers in one page; navigation jumped to in-page anchors (`#product`, `#how`, `#demo`, `#faq`) | `index.html`: 5 sections. Navigation: **How it works · Features · Demo · FAQ** + **Request Early Access**; the logo returns home |
| — | `how-it-works.html`, `features.html`, `faq.html` |
| `demo.html`, `404.html` | unchanged |

Site map: Home → How it works → Features (`#overview` … `#availability`) → Demo → FAQ; every page → `./#early-access` (the homepage form).

## 3. Original homepage content inventory (Sprint 1.6)

Word counts exclude the rendered product previews and the form; heights at 1440px.

| # | Section | Primary message | Words | Height | Class | Repeats | Decision |
|---|---|---|---|---|---|---|---|
| 1 | Hero | Your next job might already be in your estimates | 103 | 882px | A | — | **Kept** on Home; CTAs reordered, lede shortened |
| 2 | Trades strip | Built for exterior contractors | 11 | 83px | A | — | **Kept** |
| 3a | Problem: before/after | Estimates slip between truck, inbox and notebook | ≈95 | ≈1,300px | A | — | **Kept** on Home |
| 3b | "Your numbers" calculator | What's waiting in your estimates | ≈85 | ≈600px | B | — | **Moved** to How it works |
| 4 | Product: six features | Visibility, queues, drafts, tracking, reporting, CSV | 397 | 4,402px | C | Queues, CSV, drafts and reporting are each re-explained in sections 5, 7 and 9 | **Moved** to Features; Home gets **3 compact benefits** |
| 5 | How it works (4 steps) | Import → prioritize → follow up → track | 122 | 1,187px | B | Restates section 4 | **Moved and expanded** to 5 steps |
| 6 | Demo showcase | Explore a fully loaded account | 136 | 950px | A/C | Demo invitation repeated 7× across the page | **Kept** as the product preview; list cut from 6 to 4 |
| 7 | Available today vs roadmap | What exists and what doesn't | 158 | 1,017px | E | CSV and no-automation repeated | **Moved** to Features `#availability` |
| 8 | Early access + form | Assisted setup | 78 | 1,071px | A | — | **Kept** (one line added linking to the FAQ and availability) |
| 9 | FAQ (7) | CRM, import, messaging, demo, onboarding, availability, reporting | 377 | 773px | D | CRM, CSV and no-automation repeat sections 4 and 7 | **Moved** to FAQ and extended to 11 questions |

Category F (low-value or repetitive): the repeated "you can try the demo" prompts (hero proof, how-it-works footer, showcase, FAQ aside, FAQ answer) and the restated CSV and no-auto-send lines. Each now appears once per page where it matters.

## 4. Where each section went, and 5. what was consolidated or removed

- **Moved verbatim or nearly so:** the six feature stories and their notes (Features), the truth cards and "Good to know" (Features), the calculator (How it works), and all seven FAQ answers (FAQ, with "Is QuoteTend available…" reworded as "Is QuoteTend available now?").
- **Consolidated:** the six-item feature tour becomes three benefits on Home (Organize / Prioritize / Track), each linking to its Features section. The no-auto-send message, previously repeated four times on the homepage, appears once there ("Nothing is sent automatically…") and fully on How it works and the FAQ.
- **Removed from Home only:** the "Four moves" how-it-works panel (replaced by the five-step page) and two of the six demo-itinerary items.
- **Removed outright:** nothing of substance. The old hero lede's "helps your team turn more conversations into signed jobs" was dropped as an implied outcome claim.
- **New copy (kept short):** four FAQ answers (what QuoteTend does, who it's for, opt-outs, contact), the You/QuoteTend workflow lines, the three distinctions, the overview-dashboard and customer-details feature text, and page introductions. All new claims were checked against the customer app (see §11).

## 6–7. Measured reduction (homepage)

| | Sprint 1.6 | Sprint 1.7 | Change |
|---|---|---|---|
| Copy (words, excluding previews and form) | 1,564 | 535 | **−65.8%** |
| Scroll height at 1440px | 12,728px | 5,907px | **−53.6%** |
| Scroll height at 390px | 21,816px | 10,366px | **−52.5%** |
| Main sections | 9 (+ strip) | 5 (+ strip) | |

The word reduction is larger than the 35–50% guideline because the new structure itself moves the FAQ, features, how-it-works and roadmap content (1,054 words) off the homepage. Nothing was cut to reach a number. Combined copy across the four marketing pages is now about 2,520 words, so Visitor B has more detail than before, not less. Measured with a headless Edge script (Playwright) over each page's `<main>` text, previews excluded.

## 8. Navigation

- **Desktop (≥901px):** logo (home) · How it works · Features · Demo · FAQ · **Request Early Access** button. The current page is marked with `aria-current="page"` and a sage pill.
- **Tablet and phone (≤900px):** logo · **Request Early Access** (shortened to "Early Access" under 641px) · Menu button. The menu lists Home, How it works, Features, Interactive demo and FAQ (current page marked with a gold dot), then Request Early Access and Start the guided tour. Opening it moves focus to the first link; Escape closes it and returns focus; it closes on navigation and at desktop width. No horizontal overflow at 360, 390, 820, 1440 or 1920px.
- **Footer (all pages):** How it works, Features, Interactive demo, Guided tour · Request early access, FAQ, Available today & planned.
- **Cross-page form links:** `./#early-access` from supporting pages. On arrival `site.js` scrolls the section below the sticky header and moves focus to it (the in-page behaviour already used on Home).
- **Demo:** unchanged. It keeps its links to the website (logo, "Back to website", "Early access" → `index.html#early-access`).

## 9. Screenshots

In `docs/screenshots/sprint1-7/` (JPEG, about 3.3 MB). The browser suite regenerates full-resolution PNGs, including every page at 820 and 1920px, in `test-results/public-site/`.

| Page | Desktop | Phone |
|---|---|---|
| Home | [1440 full](screenshots/sprint1-7/home-1440-full.jpg) · [1920](screenshots/sprint1-7/home-1920.jpg) · [820](screenshots/sprint1-7/home-820.jpg) | [390 full](screenshots/sprint1-7/home-390-full.jpg) · [menu open](screenshots/sprint1-7/nav-mobile-390-open.jpg) |
| How it works | [1440 full](screenshots/sprint1-7/how-it-works-1440-full.jpg) | [390 full](screenshots/sprint1-7/how-it-works-390-full.jpg) |
| Features | [1440 full](screenshots/sprint1-7/features-1440-full.jpg) | [390 full](screenshots/sprint1-7/features-390-full.jpg) |
| FAQ | [1440 full](screenshots/sprint1-7/faq-1440-full.jpg) | [390 full](screenshots/sprint1-7/faq-390-full.jpg) |
| Header CTA from Features → form | [1440](screenshots/sprint1-7/early-access-from-features-1440.jpg) | — |

## 10. Formspree and demo regression

- **Form:** `early-access.js` and `site-config.js` are unchanged. The endpoint is still `https://formspree.io/f/xbgdylzd`, it appears once in the published site, and there is still a single form. Browser groups cover validation, the loading state, success only on a confirmed 2xx, 503/429/403/422/network/unconfirmed failures, duplicate-submit protection, the honeypot, the minimum fill time, mobile layout, the email-only and closed modes, and the non-local-host mode. Every Formspree request in the suites is mocked; the final group asserts that **no request reached the live form**.
- **Demo:** `demo.html`, `demo.js`, `tour.js`, `workspace.js`, `components.js` and `demo.css` are unchanged. All demo groups pass: dashboard, search and filters, queues, drafts, copy, contact, outcome, Results, import, reset, the five-step tour, pause/resume, deep links, tablet, phone, and blocked storage.

## 11. Private application compatibility

- The Sprint 2 private app (`venture/private-app-v2`, `0ac1bc4`) serves `public-site/assets/css/tokens.css`, `public-site/assets/css/app.css` and `public-site/assets/favicon.svg` directly. **These three files are byte-identical** to both `683e49a` and `0ac1bc4`: same git blob hashes (`8c6e61b…`, `27ba1d8…`). All website styling is in `site.css`, which the private app doesn't load; it copies the demo components rather than importing site JavaScript.
- **Sprint 2 browser rehearsal against this branch's `public-site/`:** `0ac1bc4` was extracted read-only (`git archive`, no worktree or branch) and this branch's `public-site/` copied over it. `node tests/browser-rehearsal.mjs` → **24/24 groups passed, no uncaught errors or CSP violations.**
- **Baseline private rehearsal on this branch** (the pre-Sprint-2 app at `683e49a`): `node tests/browser-rehearsal.mjs` → **10/10 passed**, the same as before the sprint.
- **Feature claims** were checked against both the baseline app and the Sprint 2 app: search fields (customer, job, estimate ID, email), status filters including do-not-contact, the three queues, the overview KPIs and recent activity, drafts, contact logging, outcomes, Results drill-down, CSV import and export, workspace backups, and the opt-out safeguards (queue exclusion, shared email, confirmation before removal, import blocked when an opt-out would be lost). Sprint 2-only capabilities (phone, address and trade fields, the Recently contacted queue) are **not** claimed and remain described as planned, consistent with the demo's disclosure.

## 12. Accessibility and responsiveness

- One `h1` per page and a logical heading order; skip link to `#main` on every page; landmark navs labelled Primary, Mobile, "Features on this page" and "Question groups".
- Visible focus rings on all controls (asserted for the skip link and FAQ questions). Sections focused by script don't draw a page-wide ring.
- FAQ answers use native `<details>`/`<summary>`: Enter and Space work, and all answers start collapsed.
- Decorative previews are `inert`, `aria-hidden`, and carry no duplicate IDs.
- Reduced motion turns off scroll reveals on every page (asserted), plus the existing global reduced-motion rules.
- Colour contrast reuses the existing tokens. New text pairings, computed with the WCAG formula: gold-400 links on evergreen panels 5.67:1 (on evergreen-950, 8.21:1), the active nav state (evergreen-700 on sage-100) 7.68:1, workflow text on the dark panel 8.98:1, text links on white 9.13:1, and the page note (text-3 on ivory) 5.25:1. All are above the 4.5:1 AA threshold.
- No element extends past the viewport at 390, 820, 1440 or 1920px on any page (asserted per element). The header fits at 360px.
- Not tested: screen readers, Safari/iOS, Firefox, physical devices, Windows high-contrast mode.

## 13. Test commands and exact outcomes

Environment: Windows 11, Node v24.19.0, Playwright 1.63 with installed Microsoft Edge (headless), dependencies from `pnpm-lock.yaml` (`npx pnpm@10.14.0 install --frozen-lockfile`).

| Command | Baseline `683e49a` | This branch |
|---|---|---|
| `node --test tests/*.test.mjs` | 85 tests: 83 pass, 2 fail, 0 skipped | **86 tests: 84 pass, 2 fail, 0 skipped** |
| — failures (both runs) | `interview-ready.test.mjs` "Grok conflicts…" and "Grok valid and invalid files…": `ENOENT …\Grok Bot Research & Product Testing\*.csv` (git-ignored local fixtures, absent from the repository) | identical, unchanged |
| `node --test tests/public-site.test.mjs` | 13/13 | **14/14** (new: multipage structure) |
| `node tests/public-site-browser.mjs` | 22/22 groups | **27/27 groups**; no request reached the live Formspree form |
| `node tests/browser-rehearsal.mjs` (baseline private app) | 10/10 | **10/10** |
| Sprint 2 `node tests/browser-rehearsal.mjs`, with this branch's `public-site/` | — | **24/24** |
| Sprint 2 `node --test tests/private-app.test.mjs` | — | 6 pass, 4 fail, then the process hangs. **Pre-existing and environment-related:** the identical result occurs on an unmodified `0ac1bc4` copy. Tests 7–10 fail with `EPERM` removing their temporary SQLite folder on Windows, and the open handles keep the process alive. Sprint 2 reported 10/10 on Linux. Not caused by and not fixed in this sprint. |

Test changes, and why:
- `public-site.test.mjs`: the published-page list now includes the three new pages. The honest-copy checks that applied only to the homepage now apply to all four marketing pages, plus new checks for automation, AI or integration claims, and for invented prices, proof or certifications. The required distinctions are asserted on How it works and the FAQ. A new test covers one form, identical header/menu/footer copies, active states, unique titles and descriptions, one `h1`, no canonical/`og:url`/analytics, and the homepage section order. The server test adds the new routes and their security headers. The link check covers all five pages. The CTA assertions now expect "Request Early Access" first and the demo second (the old test expected the reverse). The demo's links back to the site are asserted. Nothing was loosened.
- `public-site-browser.mjs`: the homepage group checks the new visuals and section set and that the page stays under 7,000px. New groups cover supporting-page previews (including that customer-app previews hide demo-only features), cross-page links and CTAs, desktop navigation and arrival at the form from every page, mobile navigation and keyboard on every page, the 390/820/1440/1920 layout sweep with screenshots, and the FAQ keyboard. The calculator test moved to How it works. Skip links and reduced motion now cover every page.

## 14. Files changed

| File | Change |
|---|---|
| `public-site/index.html` | Rewritten as the five-section homepage; new navigation |
| `public-site/how-it-works.html`, `features.html`, `faq.html` | New |
| `public-site/assets/css/site.css` | Website-only styles: active nav, mobile header CTA, benefits, page heading, workflow, distinctions, CTA band, feature index, record card, FAQ groups; dead `.header-link` rules removed |
| `public-site/assets/js/site.js` | Previews for the Features page (overview, record, core-only variants), new step and benefit previews, cross-page focus on arrival, the preview-mode console warning only where the form exists |
| `tests/public-site.test.mjs`, `tests/public-site-browser.mjs` | As above |
| `docs/PUBLIC_SITE.md` | Structure, local URLs, deployment note, shared-files note |
| `docs/WEBSITE_SPRINT_1_7.md`, `docs/screenshots/sprint1-7/` | This report and screenshots |

Not changed: `tokens.css`, `app.css`, `demo.css`, `demo.html`, `404.html`, every JavaScript module except `site.js`, `serve.mjs`, `site-config.js`, `site.webmanifest`, icons, and every private-application file.

## 15. Branch and commits

Branch `venture/website-sprint-1-7`, based on `venture/website-demo-v2` at `683e49a` (per the owner's correction; the website is kept isolated from the private-app work). It doesn't include, and was not merged with, `venture/private-app-v2`, `venture/staging-qa` or `main`. The commit is listed in the handoff message.

## 16. Preview (PowerShell)

```powershell
Set-Location -LiteralPath 'C:\Dev\AI Businesses\QuoteTend-Website-Sprint-1.7'
node public-site/serve.mjs
# http://127.0.0.1:4180/  ·  /how-it-works.html  ·  /features.html  ·  /faq.html  ·  /demo.html  ·  /#early-access
```

The local preview submits to the real Formspree form (as before), so only test it there deliberately, following "Live acceptance test" in `docs/PUBLIC_SITE.md`.

## 17. Known limitations

- **Duplicated chrome.** Header, mobile menu and footer markup is repeated in four files, because there is no build step. A test fails if the copies drift, but an edit has to be made four times.
- **Demo disclosure versus Sprint 2.** The demo still says trade tags, street and phone details preview *planned* features. In the Sprint 2 app those fields exist. The website follows the demo, the baseline it ships from, and doesn't claim them. When Sprint 2 is accepted, the website and demo copy should be updated together.
- **Mobile length.** At 390px the homepage is still about 10,400px, because the approved before/after illustration stacks vertically. It is half its former length, but it is the largest remaining block.
- **Cross-page anchor** behaviour relies on JavaScript to settle the position after previews render; without JavaScript the browser's native jump applies.
- **Browsers:** tested in headless Edge only. The Sprint 2 private unit test file can't complete on this Windows machine (see §13).
- **No measurement.** No analytics were added, so nothing here shows the change improves conversion.

## 18. Items for owner or Atlas approval

1. Accept the new structure and the homepage's five sections (including the 66% copy reduction, above the 35–50% guideline).
2. The new copy listed in §4–5, especially the FAQ answers on opt-outs and contact ("the early-access form is the best way to reach us").
3. The CTA labels "Request Early Access" and "Try the Interactive Demo", and the shortened "Early Access" in the phone header.
4. When Sprint 2 is accepted: update the demo disclosure and the Features page to list phone, address and trade as available (both together).
5. Whether to publish a contact email (`contactEmail` stays empty; the footer adds a Contact link automatically once it is set).
6. The privacy notice still needed before public deployment (unchanged from `docs/PUBLIC_SITE.md`).
7. The PR target. The original brief named `venture/private-app-v2`; the corrected base is `venture/website-demo-v2`. Both share `683e49a`, so either PR would show only this sprint's changes. Please confirm which branch should receive the website work. No PR has been opened.
