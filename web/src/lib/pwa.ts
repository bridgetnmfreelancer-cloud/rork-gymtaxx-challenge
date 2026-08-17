/**
 * Home-screen install detection.
 *
 * The install step carries real weight in this funnel: on iPhone, push
 * reminders only work for an installed web app, and reminders are how a
 * non-paying user gets brought back to the paywall.
 */

/** True once the app is launched from the home screen rather than a browser tab. */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  // `standalone` is the iOS-only signal; the media query covers everyone else.
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosStandalone || window.matchMedia("(display-mode: standalone)").matches;
}

export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  // iPadOS 13+ reports as a Mac, so touch points are the reliable tell.
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/**
 * An embedded browser (TikTok, Instagram, Facebook) that cannot "Add to Home
 * Screen" at all. These users must be told to open in Safari first, or the
 * install instructions describe a button they do not have.
 */
export function isInAppBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/FBAN|FBAV|Instagram|Line\/|Twitter|Snapchat|Pinterest|musical_ly|Bytedance|TikTok/i.test(ua)) {
    return true;
  }
  // Safari's own UA contains "Safari"; iOS in-app WebViews generally do not.
  if (isIOS() && /AppleWebKit/.test(ua) && !/Safari/.test(ua) && !/CriOS|FxiOS/.test(ua)) {
    return true;
  }
  return false;
}

/**
 * Which browser this is, to the extent it can be trusted.
 *
 * On iPhone every browser is WebKit underneath, but only Safari can add to the
 * Home Screen. Chrome and Firefox therefore render install steps describing a
 * Share button they do not have, which reads as the instructions being wrong
 * rather than the browser being wrong.
 */
export type BrowserKind = "safari" | "chrome" | "firefox" | "edge" | "opera" | "duckduckgo" | "in-app" | "unknown";

/**
 * Deliberately biased towards "unknown".
 *
 * Telling someone who is already in Safari that they are in Chrome would stop a
 * person who was about to succeed — far more costly than staying quiet for a
 * browser nobody uses. So a browser is only ever named from its own vendor
 * token, never inferred from the absence of another.
 */
export function detectBrowser(): BrowserKind {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent;

  // Vendor tokens first: most of these also contain "Safari", and Chrome and
  // Firefox are otherwise hard to tell apart from an embedded WebView.
  if (/CriOS/.test(ua)) return "chrome";
  if (/FxiOS/.test(ua)) return "firefox";
  if (/EdgiOS/.test(ua)) return "edge";
  if (/OPiOS|OPT\//.test(ua)) return "opera";
  if (/DuckDuckGo/.test(ua)) return "duckduckgo";
  if (isInAppBrowser()) return "in-app";
  if (isIOS() && /Safari/.test(ua)) return "safari";
  return "unknown";
}

/** The browser's name as its own users would say it, or null when unsure. */
export function browserName(kind: BrowserKind): string | null {
  switch (kind) {
    case "chrome":
      return "Chrome";
    case "firefox":
      return "Firefox";
    case "edge":
      return "Edge";
    case "opera":
      return "Opera";
    case "duckduckgo":
      return "DuckDuckGo";
    default:
      return null;
  }
}

/** Whether this browser could ever show a push permission prompt. */
export function canUsePush(): boolean {
  if (typeof window === "undefined") return false;
  if (!("Notification" in window) || !("serviceWorker" in navigator)) return false;
  // iOS only grants push to installed web apps, whatever the API reports.
  if (isIOS() && !isStandalone()) return false;
  return true;
}
