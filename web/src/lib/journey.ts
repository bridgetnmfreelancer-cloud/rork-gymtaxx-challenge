import { isStandalone } from "./pwa";
import type { ChallengeKind } from "./trial";

/**
 * Which entry journey this browser is on.
 *
 * "join" — the landing page's header pill — runs onboarding first and meets
 * the install page only once an account exists; "getapp" is today's journey,
 * which installs first. Stored locally because the flag has to survive roughly
 * eight screens of onboarding, back-and-forth included, and a query parameter
 * would have to be threaded through every one of those navigations by hand.
 *
 * The clear points are deliberate and few: the flag must stay available until
 * the install page has determined its destination — refreshes included — so it
 * is never cleared at account creation. It dies exactly when its purpose is
 * fulfilled (the install page resolves where the person goes next), or when a
 * Get-the-app tap overwrites it. There is no time expiry.
 */
export type Journey = "join" | "getapp";

const JOURNEY_KEY = "gymtaxx.journey";

export function setJourney(journey: Journey): void {
  try {
    window.localStorage.setItem(JOURNEY_KEY, journey);
  } catch (error) {
    // Private browsing can refuse writes; the journey still works in memory
    // for this session, it just won't survive a reload.
    console.error("journey: could not save", error);
  }
}

export function readJourney(): Journey | null {
  try {
    const value = window.localStorage.getItem(JOURNEY_KEY);
    return value === "join" || value === "getapp" ? value : null;
  } catch (error) {
    console.error("journey: could not read", error);
    return null;
  }
}

export function clearJourney(): void {
  try {
    window.localStorage.removeItem(JOURNEY_KEY);
  } catch (error) {
    console.error("journey: could not clear", error);
  }
}

/** Resolved the moment an account is created. */
export type PostSignupRoute = "install" | "pay" | "plan";

/**
 * Where account creation sends someone, journey included.
 *
 * A Join user in a browser meets the install page here rather than before
 * onboarding — and the flag is deliberately left alive, because the install
 * page still has to read it. Inside the installed app there is nothing to
 * install, so the destination is resolved on the spot and the flag dies with
 * that decision.
 */
export function postSignupRoute(kind: ChallengeKind | null): PostSignupRoute {
  if (readJourney() === "join") {
    if (isStandalone()) {
      clearJourney();
      return kind === "trial" ? "pay" : "plan";
    }
    return "install";
  }
  return kind === "trial" ? "pay" : "plan";
}
