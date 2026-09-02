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
 * TEMPORARY - verifies Meta Conversions API wiring without a real charge.
 *
 * Stripe is on live keys, so confirming this through a genuine deposit would mean
 * a real charge and a manual refund. This fires one event through the exact same
 * `sendConversionEvent` path the Stripe webhook uses, so the access token,
 * hashing, payload shape and endpoint are all genuinely exercised.
 *
 * It does NOT touch the database, Stripe, or any real participation.
 *
 * Admin-gated, and the amounts are fixed rather than caller-supplied so this
 * cannot be used to push arbitrary revenue into reporting.
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

/** Only the two events a new challenge can produce are testable here. */
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

    /**
     * Purchase is verified in Test Events, because a fake sale must never reach
     * live reporting and be optimised against as real revenue.
     *
     * StartTrial is verified LIVE, with no test code, deliberately. The question
     * being answered is why a real StartTrial never appears in the live event
     * list, and the Stripe webhook never sends a test code - so a Test Events run
     * exercises a different path to the one that is failing and proves nothing.
     * A trial carries a value of zero, so no false revenue can enter reporting.
     */
    const sendsLive = eventName === "StartTrial";
    const configuredTestCode = Deno.env.get("META_CAPI_TEST_EVENT_CODE") ?? null;
    const testEventCode = sendsLive ? null : configuredTestCode;

    const { clientIp, clientUserAgent } = attributionFromRequest(req);

    const result = await sendConversionEvent(eventName, {
      // Unique per run so repeated tests aren't collapsed as duplicates by Meta.
      eventId: `capi-test-${crypto.randomUUID()}`,
      eventTime: Math.floor(Date.now() / 1000),
      // Zero for a trial, matching the webhook exactly. A token amount here
      // would test a payload we never actually send in production.
      value: eventName === "StartTrial" ? 0 : minorToMajor(TEST_AMOUNT_MINOR),
      currency: "gbp",
      email: user.email ?? null,
      userId: user.id,
      clientIp,
      clientUserAgent,
      testEventCode,
    });

    return json({
      eventName,
      result,
      mode: testEventCode ? "test_events" : "live_reporting",
      /**
       * Returned so a stale code is visible rather than inferred. Test codes in
       * Events Manager rotate, and an out-of-date one sends the event to a test
       * session nobody is watching - indistinguishable, on screen, from the
       * event never having been sent at all.
       */
      configuredTestCode,
      tokenConfigured: Boolean(Deno.env.get("META_CAPI_ACCESS_TOKEN")),
    });
  } catch (err) {
    if (err instanceof AuthError) return json({ error: "unauthorized" }, 401);
    console.error("test-capi-purchase: unexpected failure", err);
    return json({ error: "internal_error" }, 500);
  }
});
