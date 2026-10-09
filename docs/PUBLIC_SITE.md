# Public website and interactive demo

`public-site/` is a self-contained static site: the marketing homepage, the interactive contractor demo and a 404 page. It has no build step, no dependencies beyond the browser, and no connection to the private application, its accounts, APIs or SQLite data. Every demo record is fictional and stays in the visitor's browser.

## Structure

| Path | Purpose |
|---|---|
| `index.html` | Homepage. Product visuals are rendered from the demo's components and records, so the numbers always match the demo. |
| `demo.html` | Interactive demo for the fictional Fernbrook Roofing & Exteriors. |
| `404.html` | Not-found page for static hosts. |
| `assets/css/` | `tokens.css` (design tokens), `app.css` (product UI components), `site.css`, `demo.css`. |
| `assets/js/workspace.js` | Fictional records plus domain, reporting and import rules mirrored from `domain.js`, `results.js` and `import-mapping.js`. `tests/public-site.test.mjs` checks them against those modules. |
| `assets/js/components.js`, `tour.js` | Shared UI components and the guided-tour steps. |
| `assets/js/site-config.js` | Early-access contact settings (see below). |
| `serve.mjs` | Local preview server only. It is not needed by a static host. |

## Run it locally (PowerShell)

```powershell
Set-Location -LiteralPath 'C:\Dev\AI Businesses\QuoteTend'
node public-site/serve.mjs
```

- Website: http://127.0.0.1:4180/
- Demo: http://127.0.0.1:4180/demo.html
- Guided tour: http://127.0.0.1:4180/demo.html?tour=1 (`?tour=3` opens step 3 directly)

Set `$env:PORT = '4190'` first to use another port. Demo changes are saved per browser and port; use **Reset demo data** to restore the original records.

## Deploy

Publish the contents of `public-site/` to any static HTTPS host (for example Cloudflare Pages, Netlify, GitHub Pages or S3 with CloudFront). Links are relative, so the site also works from a sub-path. Configure the host to serve `404.html` for missing pages. Excluding `serve.mjs` from the upload is optional; it contains no secrets.

Fonts load from Google Fonts. If that is not acceptable, self-host the two families (Bricolage Grotesque and Inter, both open-licensed) and replace the `<link>` in both HTML files; the system font fallbacks already work.

## Early-access contact (configuration required)

`assets/js/site-config.js` ships with every channel empty, so the site shows no form and no address. Set only channels that are verified and monitored:

- `contactEmail`: the form opens the visitor's email app with their answers filled in. The page states that nothing is sent until they press Send.
- `formEndpoint` (HTTPS): the form POSTs JSON and reports success only on a 2xx response.
- `bookingUrl` (HTTPS): adds a "Book a walkthrough" button.

Reserved placeholder domains (`example.com`, `.example`, `.test`, `.invalid`) are rejected even if configured. `docs/PAID_PILOT_OFFER_DRAFT.md` proposes `quotetend@gmail.com` as the support contact, pending confirmation.

## Verify

```powershell
node --test tests/public-site.test.mjs
node tests/public-site-browser.mjs
```

The browser suite drives the installed Microsoft Edge headlessly (set `$env:QUOTETEND_BROWSER = 'chrome'` for Chrome) and writes screenshots to `test-results/public-site/`.
