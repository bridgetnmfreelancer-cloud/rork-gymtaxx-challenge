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

const CURRENCY = "gbp";

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
        "id, goal_workouts_per_week, payment_status, stripe_payment_intent_id, challenges(number_of_weeks, reward_per_workout)",
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
        if (isReusable(existing.status) && existing.amount === amountMinor) {
          return json({
            status: "requires_payment",
            clientSecret: existing.client_secret,
            publishableKey,
            amountMinor,
            currency: CURRENCY,
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
      currency: CURRENCY,
      userChallengeId: participation.id,
      userId: user.id,
      idempotencyKey: `deposit_${participation.id}_${amountMinor}`,
    });

    // Service role: the user must not be able to write payment fields themselves.
    const admin = createAdminClient();
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
      currency: CURRENCY,
    });
  } catch (err) {
    if (err instanceof AuthError) return json({ error: "unauthorized" }, 401);
    console.error("create-deposit-payment failed", err);
    return json({ error: "internal_error" }, 500);
  }
});
