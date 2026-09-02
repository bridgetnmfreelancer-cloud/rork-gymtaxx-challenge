import {
  AuthError,
  corsHeaders,
  json,
  requireAuth,
} from "../_shared/auth.ts";
import {
  attributionFromRequest,
  minorToMajor,
  sendConversionEvent,
  type ConversionEventName,
} from "../_shared/meta.ts";

/**
 * TEMPORARY — verifies Meta Conversions API wiring without a real charge.
 *
 * Stripe is on live keys, so confirming the integration through a genuine deposit
 * would mean a real £60–100 charge and a manual refund. This fires one event
 * through the exact same `sendConversionEvent` path the Stripe webhook uses, so a
 * success here proves the access token, hashing, payload shape and endpoint are
 * all correct.
 *
 * It does NOT touch the database, Stripe, or any real participation.
 *
 * `StartTrial` is testable separately because it is the one event that carries a
 * value of zero, and a zero-value event is the most likely thing for Meta to
 * accept with a 200 and then decline to report. Testing it with the same shape
 * the webhook sends is the only way to see Meta's own verdict on it.
 *
 * This is also the only place the Events Manager test code is applied, which is
 * what keeps real deposits reporting live regardless of what is left in the
 * environment. Admin-gated, and the amounts are fixed rather than caller-supplied
 * so it can't be used to push arbitrary revenue into reporting.
 */

/** Emails allowed to run this, comma-separated. Empty means nobody. */
function adminEmails(): string[] {
  return (Deno.env.get("ADMIN_EMAILS") ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
}

/** Deliberately not a real deposit figure, so it is obvious in reporting. */
const TEST_AMOUNT_MINOR = 100;

/** Only the two events the webhook can send for a new challenge are testable. */
function requestedEvent(raw: unknown): ConversionEventName {
  return raw === "StartTrial" ? "StartTrial" : "Purchase";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { user } = await requireAuth(req);

    const allowed = adminEmails();
    const email = (user.email ?? "").toLowerCase();
    if (allowed.length === 0 || !allowed.includes(email)) {
      return json({ error: "not_found" }, 404);
    }

    const body = await req.json().catch(() => ({}));
    const eventName = requestedEvent((body as { event?: unknown }).event);

    const testEventCode = Deno.env.get("META_CAPI_TEST_EVENT_CODE");
    const { clientIp, clientUserAgent } = attributionFromRequest(req);

    const result = await sendConversionEvent(eventName, {
      // Unique per run so repeated tests aren't collapsed as duplicates by Meta.
      eventId: `capi-test-${crypto.randomUUID()}`,
      eventTime: Math.floor(Date.now() / 1000),
      // Zero for a trial, matching the webhook exactly. Sending a token amount
      // here instead would test a payload we never actually use in production.
      value: eventName === "StartTrial" ? 0 : minorToMajor(TEST_AMOUNT_MINOR),
      currency: "gbp",
      email: user.email ?? null,
      userId: user.id,
      clientIp,
      clientUserAgent,
      // Without this the £1 would be counted as real revenue against your ads.
      testEventCode,
    });

    return json({
      eventName,
      result,
      // Without a test code the event lands in LIVE reporting, which is worth
      // knowing before wondering why Test Events looks empty.
      mode: testEventCode ? "test_events" : "live_reporting",
      tokenConfigured: Boolean(Deno.env.get("META_CAPI_ACCESS_TOKEN")),
    });
  } catch (err) {
    if (err instanceof AuthError) return json({ error: "unauthorized" }, 401);
    console.error("test-capi-purchase: unexpected failure", err);
    return json({ error: "internal_error" }, 500);
  }
});
