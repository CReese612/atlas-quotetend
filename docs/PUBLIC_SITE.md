# Public website and interactive demo

`public-site/` is a self-contained static site: four marketing pages, the interactive contractor demo and a 404 page. It has no build step, no dependencies beyond the browser, and no connection to the private application, its accounts, APIs or SQLite data. Every demo record is fictional and stays in the visitor's browser.

## Structure

| Path | Purpose |
|---|---|
| `index.html` | Homepage: hero, the problem, three core benefits, a product preview and the early-access form (`#early-access`). Product visuals are rendered from the demo's components and records, so the numbers always match the demo. |
| `how-it-works.html` | The five-step workflow (what you do, what QuoteTend does), the three distinctions (a draft isn't a sent message; you contact customers yourself; a recorded win isn't proof of cause) and the estimate calculator. |
| `features.html` | Capabilities grouped as pipeline, follow-up, and results & data, plus "Available today / On the roadmap" (`#availability`). Previews marked `data-core` hide the demo's planned-feature extras (trade tags, trade and follow-up filters, the pipeline-by-state chart). |
| `faq.html` | Eleven questions in three groups, as native `<details>` accordions. |
| `demo.html` | Interactive demo for the fictional Fernbrook Roofing & Exteriors. |
| `404.html` | Not-found page for static hosts. |
| `favicon.ico`, `site.webmanifest`, `assets/favicon.svg`, `assets/icons/` | Favicon and app icons (generated, see Brand). |
| `assets/css/` | `tokens.css` (design tokens and wordmark), `app.css` (product UI components), `site.css`, `demo.css`. |
| `assets/js/workspace.js` | Fictional records plus domain, reporting and import rules mirrored from `domain.js`, `results.js` and `import-mapping.js`. `tests/public-site.test.mjs` checks them against those modules. |
| `assets/js/components.js`, `tour.js` | Shared UI components (including the wordmark) and the guided-tour steps. |
| `assets/js/early-access.js`, `site-config.js` | Early-access form and its Formspree configuration (see below). |
| `serve.mjs` | Local preview server only. It is not needed by a static host. |

## Run it locally (PowerShell)

```powershell
Set-Location -LiteralPath 'C:\Dev\AI Businesses\QuoteTend'
node public-site/serve.mjs
```

- Website: http://127.0.0.1:4180/ (also `/how-it-works.html`, `/features.html`, `/faq.html`)
- Early-access form: http://127.0.0.1:4180/#early-access
- Demo: http://127.0.0.1:4180/demo.html
- Guided tour: http://127.0.0.1:4180/demo.html?tour=1 (`?tour=3` opens step 3 directly)

Set `$env:PORT = '4190'` first to use another port. Demo changes are saved per browser and port; use **Reset demo data** to restore the original records.

The guided tour keeps each step tied to its screen. If a visitor navigates elsewhere, closes the featured record or switches queue tabs, the tour pauses and offers **Resume**; Back, Next and the step dots always move the workspace to the right screen.

## Brand

The business name is **QuoteTend** everywhere in text: titles, metadata, accessible names, URLs and code. The visual wordmark is **ꝘuoteTend**, with U+A758 as the first letter.

Bricolage Grotesque and Inter do not include U+A758, and system fallbacks render a visibly different Ꝙ (or a missing-glyph box), so the Ꝙ is drawn as vector paths (`Q_GLYPH` in `components.js`) and the rest of the wordmark is live display text. The DOM text is the ordinary spelling, kept visually hidden; the visible "uoteTend" is CSS generated content. The stroke is gold (`#a87a2c` on light backgrounds, `#d9ae5f` on dark).

After changing the glyph, regenerate the favicon, Apple touch icon, PWA icons, `favicon.ico` and manifest:

```powershell
node scripts/generate-brand-icons.mjs
```

## Deploy

Publish the contents of `public-site/` to any static HTTPS host (for example Cloudflare Pages, Netlify, GitHub Pages or S3 with CloudFront). Links are relative, so the site also works from a sub-path. Pages are linked by their `.html` file names, so no rewrite or "clean URL" rule is needed (hosts that add one keep working). Configure the host to serve `404.html` for missing pages. Excluding `serve.mjs` from the upload is optional; it contains no secrets.

There is one early-access form, on the homepage. Every other page links to it as `./#early-access`; on arrival `site.js` settles the scroll position below the sticky header and moves focus to the form section. The header, mobile menu and footer markup is repeated in each marketing page (there is no build step); `tests/public-site.test.mjs` fails if the copies drift apart.

Fonts load from Google Fonts. If that is not acceptable, self-host the two families (Bricolage Grotesque and Inter, both open-licensed) and replace the `<link>` in each HTML file; the system font fallbacks already work.

### Shared files used by the private application

The Sprint 2 private application (branch `venture/private-app-v2`) serves `assets/css/tokens.css`, `assets/css/app.css` and `assets/favicon.svg` directly. Treat those three files as a shared design system: website-only styling belongs in `site.css`, and any change to the shared files must be backward-compatible and checked with that branch's `node tests/browser-rehearsal.mjs`.

## Early-access form (Formspree)

The form posts to QuoteTend's Formspree form, `https://formspree.io/f/xbgdylzd`, set as `formEndpoint` in `assets/js/site-config.js`. The form ID is public by design and grants no account access. There is no QuoteTend backend and no secret anywhere in the site. Notifications go to the inbox set in the Formspree dashboard (intended: `quotetend@gmail.com`), not to anything configured on the website.

How a submission works:

- The browser sends one AJAX `POST` with a JSON body and `Accept: application/json`. No cookies are sent.
- The fields are `name`, `company`, `email` (Formspree uses it as the reply-to), `phone` (optional), `trade` (type of contracting business) and `message` (optional). It also sends `_subject` ("QuoteTend early access: <company>"), the empty `_gotcha` honeypot, `source: "quotetend-website"` and the `page` URL.
- "Request received" appears only when Formspree answers with a 2xx response that confirms acceptance (`next` or `ok: true` in the JSON).
- Everything else keeps the visitor's entries and shows an error: HTTP errors, rate limits (429), network failures, timeouts, a 2xx that doesn't confirm, and Formspree validation errors (shown under the matching field).
- The submit button is disabled while a request is in flight, so double clicks send one request.
- Spam protection: the honeypot, a minimum time before submitting, a two-link limit, length limits, and Formspree's own filtering.
- Failures write a non-personal console warning, for example `QuoteTend early-access request not accepted {status: 403, codes: ['INACTIVE']}`, to help with troubleshooting.

Formspree settings to confirm in the dashboard before the live test:

1. The form with ID `xbgdylzd` sends notifications to `quotetend@gmail.com`, and that address is verified on the account.
2. **Settings → Spam protection:** Formspree's own reCAPTCHA is off, or the form will reject AJAX submissions that carry no reCAPTCHA token. It has been off by default since February 2020.
3. If you restrict submissions to specific domains, the restriction must allow wherever you test from. Testing from the local preview sends from `http://127.0.0.1:4180`.

Automated tests never contact Formspree. The browser suite mocks the endpoint, blocks any unmocked request to `formspree.io`, and fails if one is attempted.

### Live acceptance test (one real submission)

1. Start the preview (see "Run it locally") and open http://127.0.0.1:4180/#early-access in your normal browser. Optionally open the developer tools (F12) on the **Network** tab.
2. Fill in the form with real details you control. For example: name "QuoteTend acceptance test", company "QuoteTend (test)", your own email, type "Other", message "Live acceptance test — please ignore". Take a few seconds, then click **Request Early Access** once. If the page asks you to take a moment, click again.
3. **Website accepted it:** the form changes to **Request received**. In the Network tab, the `xbgdylzd` request shows status 200 and a JSON response containing `next`.
4. **Formspree recorded it:** in the Formspree dashboard, open the form's **Submissions**. The entry shows the name, company, email, phone, trade, message, source and page.
5. **Email arrived:** check `quotetend@gmail.com`, including Spam and Promotions, for the notification with the subject "QuoteTend early access: QuoteTend (test)". Its reply-to should be the email you entered.
6. Delete the test submission in Formspree if you don't want it kept. Avoid repeated live submissions, because they count against the plan's limits.

If something fails:

| What you see | Where the problem is |
|---|---|
| "Request received", entry in Formspree, no email | **Formspree notifications**: target email, verification, spam folder or plan limits. The website did its job. |
| "Request received", no entry in Formspree | Check you are looking at form `xbgdylzd` in the right account or project. The site only shows success after Formspree confirms acceptance. |
| "The request wasn't accepted: …" or HTTP 403/404, with codes such as `INACTIVE`, `FORM_NOT_FOUND`, `BLOCKED` in the console | **Formspree configuration**: form inactive or deleted, reCAPTCHA required, or a domain restriction. |
| "The form service flagged the highlighted fields" | Formspree validation, for example an invalid email address. Correct the field and resubmit. |
| "Too many requests…" | Formspree rate limit. Wait a minute. |
| "We couldn't reach the form service" | Network on the testing computer: offline, firewall, VPN or a browser extension blocking `formspree.io`. Check the Network tab. |
| No request in the Network tab at all, or errors in the Console | **Website**. Report the console messages. |

### Privacy notice needed before public deployment

The form tells visitors that their details go to QuoteTend through Formspree and are used to reply about early access. That is accurate, but it is not a privacy notice. Before deploying, publish a short notice and link it beside the submit button. At minimum it should say, in your own approved words:

- **Who is collecting:** QuoteTend and a contact address for privacy questions.
- **What is collected:** name, company, business email, optional phone, type of contracting business, optional message, and the page the form was sent from. Formspree may also record technical details of the submission; confirm what in its privacy policy.
- **Why:** to reply to early-access requests and discuss fit and setup. Add any other use only if you will actually do it (for example product updates, which would need clear consent).
- **Who processes it:** Formspree (form handling and email notifications), Google (the Gmail inbox, and Google Fonts, which receives visitors' IP addresses when pages load), and the hosting provider once chosen.
- **How long it is kept and how to ask for access or deletion:** this is your decision. State only what you will actually do, and remember that deleting a request means removing it from Formspree and from the inbox.
- **What the demo stores:** the demo keeps its fictional data in the visitor's own browser storage and sends nothing.
- **An effective date.**

This list identifies the minimum topics. It is not legal advice, and requirements depend on where you and your visitors are.

## Verify

```powershell
node --test tests/*.test.mjs
node tests/public-site-browser.mjs
node tests/browser-rehearsal.mjs
```

The browser suites drive the installed Microsoft Edge headlessly (set `$env:QUOTETEND_BROWSER = 'chrome'` for Chrome). The public-site suite writes screenshots to `test-results/public-site/`.
