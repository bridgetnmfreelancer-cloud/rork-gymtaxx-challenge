import { isInAppBrowser, isStandalone } from "./pwa";
import { supabase } from "./supabase";

/**
 * Anonymous arrival tracking, for the part of the funnel that happens before
 * anyone has an account.
 *
 * Everything from sign-up onwards is already visible in the database. Ad spend
 * lands on the landing page, and until this existed, the entire stretch between
 * "clicked the ad" and "created an account" was invisible — which is almost
 * certainly where most of the money goes.
 *
 * Deliberately holds nothing personal. The visitor id is a random number this
 * browser generates for itself; no IP address, no fingerprint, nothing that
 * identifies a person. It is only ever attached to a name once someone chooses
 * to create an account.
 */

const VISITOR_KEY = "gymtaxx.visitor";
const ATTRIBUTION_KEY = "gymtaxx.visitor.attribution";

/** The stages an arrival passes through before an account exists. */
export type VisitStep = "landing" | "join_tapped" | "install" | "signup_form" | "signed_up";

type Attribution = {
  source: string | null;
  campaign: string | null;
  referrerHost: string | null;
};

/**
 * Falls back to memory when storage is unavailable.
 *
 * Safari private browsing throws on `localStorage`, and a thrown error here
 * would take down the landing page for the sake of a statistic.
 */
let memoryVisitorId: string | null = null;

function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Private mode. The visit still gets counted, just not linked to the next.
  }
}

function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Older WebKit without randomUUID. Shape matters because the column is a uuid.
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** This browser's random id, created on first arrival and kept afterwards. */
function visitorId(): string {
  if (typeof window === "undefined") return "";
  if (memoryVisitorId) return memoryVisitorId;

  const existing = readStored(VISITOR_KEY);
  if (existing) {
    memoryVisitorId = existing;
    return existing;
  }

  const created = newId();
  memoryVisitorId = created;
  writeStored(VISITOR_KEY, created);
  return created;
}

/**
 * Where this arrival came from, captured on the first page they see.
 *
 * First touch wins: the ad that introduced someone keeps the credit even if
 * they return later through a bare link, otherwise every returning visitor
 * would look like organic traffic.
 */
function attribution(): Attribution {
  if (typeof window === "undefined") return { source: null, campaign: null, referrerHost: null };

  const stored = readStored(ATTRIBUTION_KEY);
  if (stored) {
    try {
      return JSON.parse(stored) as Attribution;
    } catch {
      // Corrupt entry — fall through and recapture from the current URL.
    }
  }

  const params = new URLSearchParams(window.location.search);
  const clickIds: [string, string][] = [
    ["fbclid", "facebook"],
    ["ttclid", "tiktok"],
    ["gclid", "google"],
  ];
  const matchedClick = clickIds.find(([param]) => params.get(param));

  let referrerHost: string | null = null;
  try {
    // Host only. A full referrer URL can carry search terms and other things
    // that have no business being stored.
    if (document.referrer) referrerHost = new URL(document.referrer).host || null;
  } catch {
    referrerHost = null;
  }

  const captured: Attribution = {
    source: params.get("utm_source") ?? (matchedClick ? matchedClick[1] : null),
    campaign: params.get("utm_campaign") ?? params.get("utm_content"),
    referrerHost,
  };

  writeStored(ATTRIBUTION_KEY, JSON.stringify(captured));
  return captured;
}

/**
 * Stages already sent this page load.
 *
 * Without this, a re-render or a back-and-forth between screens would fire the
 * same stage repeatedly. The database keeps only the first timestamp, so the
 * numbers would still be right — this just avoids the pointless requests.
 */
const sentThisLoad = new Set<VisitStep>();

/**
 * Record that an anonymous arrival reached a stage.
 *
 * Fire-and-forget, like the rest of the telemetry. Someone arriving from an ad
 * must never see an error because a measurement call failed, and must never
 * wait on one either.
 */
export async function recordVisit(step: VisitStep): Promise<void> {
  if (typeof window === "undefined") return;
  if (sentThisLoad.has(step)) return;
  sentThisLoad.add(step);

  try {
    const { source, campaign, referrerHost } = attribution();
    const { error } = await supabase.rpc("record_visit", {
      p_visitor: visitorId(),
      p_step: step,
      p_source: source,
      p_campaign: campaign,
      p_referrer: referrerHost,
      p_standalone: isStandalone(),
      p_in_app: isInAppBrowser(),
    });
    if (error) {
      sentThisLoad.delete(step);
      console.warn("visit not recorded", error.message);
    }
  } catch (err) {
    sentThisLoad.delete(step);
    console.warn("visit not recorded", err);
  }
}
