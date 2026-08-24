/**
 * Meta attribution cookies, read on the payment screen.
 *
 * These are only *collected* here — the Purchase event itself is sent server-side
 * from the Stripe webhook, because the deposit is confirmed by Stripe rather than
 * by this device reaching a success screen. An installed home-screen app can be
 * killed by iOS the moment the payment sheet closes, so anything fired from the
 * browser would under-report.
 */

export interface MetaAttribution {
  fbp: string | null;
  fbc: string | null;
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const prefix = `${name}=`;
  for (const part of document.cookie.split(";")) {
    const entry = part.trim();
    if (entry.startsWith(prefix)) {
      const value = entry.slice(prefix.length);
      return value.length > 0 ? decodeURIComponent(value) : null;
    }
  }
  return null;
}

/**
 * Build an `_fbc` value from a `fbclid` in the URL.
 *
 * Normally the pixel does this, but it can only do it in the browser that
 * received the click. Someone who opens the installed app from an ad link lands
 * in a separate cookie store, so this covers the case where the click id is
 * present but no cookie was ever written for it.
 *
 * Format is Meta's: `fb.1.<creation time in ms>.<fbclid>`. The click id is
 * case-sensitive and must not be altered.
 */
function fbcFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const fbclid = new URLSearchParams(window.location.search).get("fbclid");
    if (!fbclid) return null;
    return `fb.1.${Date.now()}.${fbclid}`;
  } catch {
    return null;
  }
}

/**
 * The attribution values to forward with the deposit request.
 *
 * Both are frequently null for installed users — the ad click happens in Safari
 * while the payment happens in the installed app, and iOS keeps those cookie
 * stores separate. The server still has the hashed email, user id, IP and user
 * agent to match on, so a missing cookie degrades match quality rather than
 * losing the conversion.
 */
export function metaAttribution(): MetaAttribution {
  return {
    fbp: readCookie("_fbp"),
    fbc: readCookie("_fbc") ?? fbcFromUrl(),
  };
}

/** The pixel, as installed by the snippet in `index.html`. */
type Fbq = (command: string, event: string, params?: Record<string, unknown>) => void;

/**
 * Fire a browser-side pixel event for an *intent* step.
 *
 * Strictly for moments that involve no money: reaching the paywall, submitting
 * card details. Anything that reports value — Purchase, StartTrial, Subscribe —
 * is sent server-side from the Stripe webhook, because only Stripe knows whether
 * money actually moved, and an installed app can be killed by iOS the instant
 * the payment sheet closes.
 *
 * Silent when the pixel is blocked or absent. Ad reporting never interrupts a
 * person mid-flow.
 */
export function trackIntent(event: "InitiateCheckout" | "AddPaymentInfo", params?: Record<string, unknown>): void {
  try {
    const fbq = (window as unknown as { fbq?: Fbq }).fbq;
    if (typeof fbq !== "function") return;
    fbq("track", event, params);
  } catch (error) {
    console.error("meta: pixel event failed", error);
  }
}
