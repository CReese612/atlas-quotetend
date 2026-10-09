// Public contact configuration for early-access requests.
//
// Leave a value empty until it is verified and actually monitored. The website adapts:
//   formEndpoint set  -> the form POSTs to it and only reports success on a 2xx response.
//   contactEmail set  -> the form opens the visitor's email app with the request filled in;
//                        the page states plainly that nothing is sent until they press Send.
//   bookingUrl set    -> a "Book a walkthrough" link is shown.
//   nothing set       -> no form is shown and no contact address is displayed.
//
// The site never claims an inquiry was delivered unless formEndpoint confirmed it.
export const SITE_CONFIG = Object.freeze({
  contactEmail: '',
  bookingUrl: '',
  formEndpoint: ''
});
