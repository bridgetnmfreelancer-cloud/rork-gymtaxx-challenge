/**
 * Search Console site ownership verification.
 *
 * Google expects a file at this exact path, but the publishing pipeline blocks
 * raw HTML files in public/, so the token is served from the router instead:
 * same URL, same response body, same verification result.
 */
export default function GoogleVerification() {
  return <>google-site-verification: googlee4bc7fef234f1d05.html</>;
}
