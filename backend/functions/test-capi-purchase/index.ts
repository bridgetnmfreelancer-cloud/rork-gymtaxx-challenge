import {
  AuthError,
  corsHeaders,
  json,
  requireAuth,
} from "../_shared/auth.ts";
import { attributionFromRequest, minorToMajor, sendPurchaseEvent } from "../_shared/meta.ts";

/**
 * TEMPORARY — verifies Meta Conversions API wiring without a real charge.
 *
 * Stripe is on live keys, so confirming the integration through a genuine deposit
 * would mean a real £60–100 charge and a manual refund. This fires one Purchase
 * through the exact same `sendPurchaseEvent` path the Stripe webhook uses, so a
 * success here proves the access token, hashing, payload shape and endpoint are
 * all correct.
 *
 * It does NOT touch the database, Stripe, or any real participation.
 *
 * This is also the only place the Events Manager test code is applied, which is
 * what keeps real deposits reporting live regardless of what is left in the
 * environment. Admin-gated, and the amount is fixed rather than caller-supplied
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { user } = await requireAuth(req);

    const allowed = adminEmails();
    const email = (user.email ?? "").toLowerCase();
    if (allowed.length === 0 || !allowed.includes(email)) {
      return json({ error: "not_found" }, 404);
    }

    const testEventCode = Deno.env.get("META_CAPI_TEST_EVENT_CODE");
    const { clientIp, clientUserAgent } = attributionFromRequest(req);

    const result = await sendPurchaseEvent({
      // Unique per run so repeated tests aren't collapsed as duplicates by Meta.
      eventId: `capi-test-${crypto.randomUUID()}`,
      eventTime: Math.floor(Date.now() / 1000),
      value: minorToMajor(TEST_AMOUNT_MINOR),
      currency: "gbp",
      email: user.email ?? null,
      userId: user.id,
      clientIp,
      clientUserAgent,
      // Without this the £1 would be counted as real revenue against your ads.
      testEventCode,
    });

    return json({
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
