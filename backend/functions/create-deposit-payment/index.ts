import {
  AuthError,
  corsHeaders,
  createAdminClient,
  json,
  requireAuth,
} from "../_shared/auth.ts";
import {
  createPaymentIntent,
  isReusable,
  retrievePaymentIntent,
} from "../_shared/stripe.ts";
import { attributionFromRequest } from "../_shared/meta.ts";

/** Used only when a row somehow predates the currency column. */
const FALLBACK_CURRENCY = "gbp";
const ALLOWED_CURRENCIES = new Set(["gbp", "usd"]);

/** Meta cookies the payment screen forwards. Often absent for installed users. */
interface RequestBody {
  fbp?: unknown;
  fbc?: unknown;
}

function asCookie(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  // Bounded so a malformed or hostile body can't push junk into the column.
  if (trimmed.length === 0 || trimmed.length > 400) return undefined;
  return trimmed;
}

/**
 * Record who is paying, for the Meta Purchase event the Stripe webhook sends later.
 *
 * This has to happen here rather than in the webhook: the webhook's caller is
 * Stripe, so its IP and user agent describe Stripe's servers, not the person.
 *
 * Written with the service role because `user_challenges` grants users no UPDATE
 * policy at all, so nobody can forge their own attribution. Failures are logged
 * and swallowed — ad reporting is never a reason to block a deposit.
 */
async function recordAttribution(
  admin: ReturnType<typeof createAdminClient>,
  participationId: string,
  values: Record<string, string>,
): Promise<void> {
  if (Object.keys(values).length === 0) return;
  try {
    const { error } = await admin
      .from("user_challenges")
      .update(values)
      .eq("id", participationId);
    if (error) {
      console.error("create-deposit-payment: attribution not stored", error.message);
    }
  } catch (err) {
    console.error(
      "create-deposit-payment: attribution not stored",
      err instanceof Error ? err.message : err,
    );
  }
}

/**
 * Start the deposit payment for the signed-in user's challenge participation.
 *
 * The amount is computed on the server from the goal they committed to and the
 * challenge's terms — the client never sends an amount, so it can't choose what
 * to pay.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { user, supabase } = await requireAuth(req);

    // RLS-scoped read: a user can only ever see their own participation.
    const { data: participation, error } = await supabase
      .from("user_challenges")
      .select(
        "id, goal_workouts_per_week, payment_status, currency, stripe_payment_intent_id, challenges(number_of_weeks, reward_per_workout)",
      )
      .eq("challenge_status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!participation) {
      return json({ error: "no_participation" }, 404);
    }

    if (participation.payment_status === "paid") {
      return json({ status: "paid" });
    }

    // Captured while the real person is on the payment screen. Only non-empty
    // values are written, so a later visit without cookies can't wipe a good
    // earlier capture. Done before the intent branches below so reusing an
    // existing intent still refreshes it.
    const admin = createAdminClient();
    const body = (await req.json().catch(() => ({}))) as RequestBody;
    const { clientIp, clientUserAgent } = attributionFromRequest(req);
    const attribution: Record<string, string> = {};
    const fbp = asCookie(body.fbp);
    const fbc = asCookie(body.fbc);
    if (fbp) attribution.fbp = fbp;
    if (fbc) attribution.fbc = fbc;
    if (clientIp) attribution.client_ip = clientIp;
    if (clientUserAgent) attribution.client_user_agent = clientUserAgent;
    await recordAttribution(admin, participation.id, attribution);

    const challenge = Array.isArray(participation.challenges)
      ? participation.challenges[0]
      : participation.challenges;
    if (!challenge) return json({ error: "no_challenge" }, 404);

    // deposit = goal per week x weeks x reward per workout
    const amountMinor = Math.round(
      participation.goal_workouts_per_week *
        challenge.number_of_weeks *
        Number(challenge.reward_per_workout) *
        100,
    );
    if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
      return json({ error: "invalid_amount" }, 422);
    }

    // The currency was fixed when the person joined, so the charge follows the
    // record rather than anything the client sends or the phone's region now.
    // Both currencies use the same numbers (5 per workout), so the amount above
    // needs no conversion - only the label on it changes.
    const currency = String(participation.currency ?? FALLBACK_CURRENCY).toLowerCase();
    if (!ALLOWED_CURRENCIES.has(currency)) {
      console.error("unexpected currency on participation", participation.id, currency);
      return json({ error: "invalid_currency" }, 422);
    }

    const publishableKey = Deno.env.get("STRIPE_PUBLISHABLE_KEY");
    if (!publishableKey) throw new Error("STRIPE_PUBLISHABLE_KEY is not configured");

    // Reuse the intent already attached to this participation when we can, so a
    // user reopening the payment screen doesn't leave a trail of abandoned intents.
    //
    // A stored intent can legitimately be unreachable with the current key — most
    // often because it was created in the other Stripe mode (test vs live). That
    // must not dead-end the user, so we fall through and create a fresh intent.
    if (participation.stripe_payment_intent_id) {
      try {
        const existing = await retrievePaymentIntent(participation.stripe_payment_intent_id);
        if (existing.status === "succeeded") {
          return json({ status: "paid" });
        }
        // Currency must match too: an intent created in the other currency can't
        // be reused, and Stripe won't let it be changed after creation.
        if (
          isReusable(existing.status) &&
          existing.amount === amountMinor &&
          existing.currency === currency
        ) {
          return json({
            status: "requires_payment",
            clientSecret: existing.client_secret,
            publishableKey,
            amountMinor,
            currency,
          });
        }
      } catch (retrieveError) {
        console.error(
          "stored payment intent unreachable, creating a new one",
          participation.stripe_payment_intent_id,
          retrieveError instanceof Error ? retrieveError.message : retrieveError,
        );
      }
    }

    const intent = await createPaymentIntent({
      amountMinor,
      currency,
      userChallengeId: participation.id,
      userId: user.id,
      // Currency is part of the key: the same amount in a different currency is a
      // genuinely different charge and must not collide with a cached intent.
      idempotencyKey: `deposit_${participation.id}_${amountMinor}_${currency}`,
    });

    // Service role: the user must not be able to write payment fields themselves.
    const { error: updateError } = await admin
      .from("user_challenges")
      .update({ stripe_payment_intent_id: intent.id })
      .eq("id", participation.id);
    if (updateError) throw updateError;

    return json({
      status: "requires_payment",
      clientSecret: intent.client_secret,
      publishableKey,
      amountMinor,
      currency,
    });
  } catch (err) {
    if (err instanceof AuthError) return json({ error: "unauthorized" }, 401);
    console.error("create-deposit-payment failed", err);
    return json({ error: "internal_error" }, 500);
  }
});
