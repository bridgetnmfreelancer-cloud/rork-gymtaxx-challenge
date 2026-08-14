/**
 * Tracks a deposit that has been paid but not yet confirmed by the server.
 *
 * Stripe confirming the card and our webhook marking the row paid are two
 * separate events, usually a second or two apart. Without this marker the app
 * can't tell "hasn't paid" from "paid, still settling", so it showed the
 * non-paying home screen to someone who had just handed over £80 — the worst
 * possible moment to imply their money didn't arrive.
 *
 * Kept in localStorage rather than router state on purpose. The payment screen
 * sets `return_url`, so a 3-D Secure challenge reloads the whole app, and iOS is
 * free to kill an installed web app the moment the payment sheet takes over.
 * Anything held in memory would be gone by the time they come back.
 */

const KEY = "gymtaxx.deposit.settling";

/**
 * How long the marker stays trustworthy.
 *
 * It exists to cover a webhook that takes seconds, so anything older is stale —
 * an abandoned 3-D Secure attempt, or a payment that failed after the app was
 * killed. Expiring it means a wrong marker can't strand someone on a waiting
 * screen indefinitely.
 */
const MARKER_TTL_MS = 10 * 60_000;

/** When to admit it's taking longer than it should. */
export const SLOW_AFTER_MS = 12_000;

/** Record that a payment has been submitted to Stripe. */
export function markDepositSettling(): void {
  try {
    localStorage.setItem(KEY, String(Date.now()));
  } catch {
    // Private browsing or a full quota. Waiting states degrade to the old
    // behaviour, which is not worth failing a payment over.
  }
}

/** Clear it once confirmed, or once we know the payment didn't happen. */
export function clearDepositSettling(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to do — the marker expires on its own.
  }
}

/**
 * When the payment was submitted, or null if there isn't a live marker.
 * Expired and malformed markers are removed as they're read.
 */
export function depositSettlingSince(): number | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;

    const since = Number(raw);
    if (!Number.isFinite(since) || since <= 0) {
      clearDepositSettling();
      return null;
    }
    // A clock change could put this in the future; treat that as unusable
    // rather than waiting forever on arithmetic that will never elapse.
    if (since > Date.now() || Date.now() - since > MARKER_TTL_MS) {
      clearDepositSettling();
      return null;
    }
    return since;
  } catch {
    return null;
  }
}

/** Whether a deposit is currently waiting on confirmation. */
export function isDepositSettling(): boolean {
  return depositSettlingSince() !== null;
}
