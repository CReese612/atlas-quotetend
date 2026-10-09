// Public contact configuration for the early-access form. Everything here ships to visitors'
// browsers, so it must never contain a secret. Setup and live-test steps: docs/PUBLIC_SITE.md.
//
//   formEndpoint     HTTPS URL of the provider-hosted form that receives requests as JSON POSTs.
//                    QuoteTend's Formspree form. The form ID is public by design (it appears in
//                    every submission request) and grants no account access.
//   formExtraFields  Optional public (non-secret) fields a provider requires in every submission.
//   bookingUrl       Optional HTTPS scheduling page. Adds a "Book a Demo" button.
//   contactEmail     Optional monitored inbox shown as a "Prefer email?" link. Formspree delivers
//                    notifications to the inbox set in the Formspree dashboard, not this value.
//
// Success is shown only after the form service confirms acceptance. With formEndpoint empty, public
// visitors see an honest "requests open soon" message and localhost shows a non-sending preview.
export const SITE_CONFIG = Object.freeze({
  formEndpoint: 'https://formspree.io/f/xbgdylzd',
  formExtraFields: Object.freeze({}),
  bookingUrl: '',
  contactEmail: ''
});
