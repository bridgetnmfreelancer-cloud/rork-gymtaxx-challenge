/**
 * Google Analytics 4 page-view tracking.
 *
 * The gtag.js loader lives in index.html next to the Meta Pixel, wrapped in a
 * production-domain guard — previews and local builds load nothing. The tag is
 * configured there with `send_page_view: false`, so every page_view seen by GA4
 * comes from here: one per navigation, never a duplicate.
 */

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

/** Fires a page_view for an SPA navigation. Fire-and-forget, never throws. */
export function gaPageView(path: string, title?: string): void {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  try {
    window.gtag("event", "page_view", {
      page_path: path,
      page_title: title ?? document.title,
    });
  } catch {
    // A measurement failure must never surface to the person using the app.
  }
}
