import {
  AuthError,
  corsHeaders,
  createAdminClient,
  json,
  requireAuth,
} from "../_shared/auth.ts";
import {
  createPaymentIntent,
  findOrCreateCustomer,
  isReusable,
  retrievePaymentIntent,
} from "../_shared/stripe.ts";
import { isPlanId, resolvePlanPricing, type PlanId } from "../_shared/plans.ts";
import { attributionFromRequest } from "../_shared/meta.ts";

/** Used only when a row somehow predates the currency column. */
const FALLBACK_CURRENCY = "gbp";
const ALLOWED_CURRENCIES = new Set(["gbp", "usd"]);

/** Meta cookies the payment screen forwards, plus the plan they chose. */
interface RequestBody {
  fbp?: unknown;
  fbc?: unknown;
  plan?: unknown;
}

function asCookie(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  // Bounded so a malformed or hostile body can't push junk into the column.
  if (trimmed.length === 0 || trimmed.length > 400) return undefined;
  return trimmed;
}

/**
 * Record who is paying, for the Meta events the Stripe webhook sends later.
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
 * Start the single payment that opens a challenge.
 *
 * Two separate kinds of money travel in one card charge:
 *
 * - the **deposit**, the person's own refundable commitment, priced from the
 *   goal they committed to and the challenge's terms;
 * - the **access fee**, GymTaxx's revenue, priced from the plan they chose.
 *
 * Neither is ever sent by the client. The plan *id* is, but it is validated
 * against the catalogue and priced here, so the worst a tampered value can do is
 * select a different real plan at that plan's real price.
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

    const admin = createAdminClient();
    const body = (await req.json().catch(() => ({}))) as RequestBody;

    // Captured while the real person is on the payment screen. Only non-empty
    // values are written, so a later visit without cookies can't wipe a good
    // earlier capture.
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
    const depositMinor = Math.round(
      participation.goal_workouts_per_week *
        challenge.number_of_weeks *
        Number(challenge.reward_per_workout) *
        100,
    );
    if (!Number.isFinite(depositMinor) || depositMinor <= 0) {
      return json({ error: "invalid_amount" }, 422);
    }

    // Billing state is read with the service role: the columns are protected
    // from the client by a trigger, so this is the only trustworthy source for
    // whether their free challenge has already been spent.
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("email, stripe_customer_id, free_challenge_used, grandfathered")
      .eq("id", user.id)
      .maybeSingle();
    if (profileError) throw profileError;

    // Everyone who joined before access was charged for keeps their original
    // terms. Charging them retroactively would be a bad trade for a handful of
    // pounds and the first cohort's goodwill.
    const isGrandfathered = profile?.grandfathered === true;

    let planId: PlanId | null = null;
    let feeMinor = 0;
    let saveCard = false;

    if (!isGrandfathered) {
      if (!isPlanId(body.plan)) {
        return json({ error: "no_plan" }, 422);
      }
      planId = body.plan;
      const pricing = resolvePlanPricing(planId, profile?.free_challenge_used === true);
      feeMinor = pricing.feeMinor;
      // A free first challenge still needs the card on file, or there is nothing
      // to charge when the trial ends.
      saveCard = pricing.isRecurring;
    }

    const amountMinor = depositMinor + feeMinor;

    // The currency was fixed when the person joined, so the charge follows the
    // record rather than anything the client sends or the phone's region now.
    // Both currencies use the same numbers, so the amounts above need no
    // conversion — only the label on them changes.
    const currency = String(participation.currency ?? FALLBACK_CURRENCY).toLowerCase();
    if (!ALLOWED_CURRENCIES.has(currency)) {
      console.error("unexpected currency on participation", participation.id, currency);
      return json({ error: "invalid_currency" }, 422);
    }

    const publishableKey = Deno.env.get("STRIPE_PUBLISHABLE_KEY");
    if (!publishableKey) throw new Error("STRIPE_PUBLISHABLE_KEY is not configured");

    const responseShape = {
      status: "requires_payment" as const,
      publishableKey,
      depositMinor,
      feeMinor,
      amountMinor,
      currency,
      plan: planId,
    };

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
        // Amount and currency must both match: changing the plan changes the
        // total, and Stripe won't let either be altered after creation.
        if (
          isReusable(existing.status) &&
          existing.amount === amountMinor &&
          existing.currency === currency &&
          (existing.metadata?.plan ?? "") === (planId ?? "")
        ) {
          return json({ ...responseShape, clientSecret: existing.client_secret });
        }
      } catch (retrieveError) {
        console.error(
          "stored payment intent unreachable, creating a new one",
          participation.stripe_payment_intent_id,
          retrieveError instanceof Error ? retrieveError.message : retrieveError,
        );
      }
    }

    // A customer is what makes the saved card and the later subscription
    // possible. Created once per person and reused from here on.
    const customer = await findOrCreateCustomer({
      existingCustomerId: profile?.stripe_customer_id ?? null,
      userId: user.id,
      email: profile?.email ?? user.email ?? null,
    });

    if (customer.id !== profile?.stripe_customer_id) {
      const { error: customerError } = await admin
        .from("profiles")
        .update({ stripe_customer_id: customer.id })
        .eq("id", user.id);
      if (customerError) {
        // Not fatal: the charge can still go through, and the next visit will
        // simply create the customer again rather than stranding anyone.
        console.error("create-deposit-payment: customer id not stored", customerError.message);
      }
    }

    const major = (minor: number): string => (minor / 100).toFixed(2);
    // Written onto the charge so the Stripe dashboard itself says how much of it
    // is refundable — refunds are issued by hand, often at speed.
    const description =
      feeMinor > 0
        ? `Deposit ${major(depositMinor)} (refundable) + GymTaxx ${planId} ${major(feeMinor)}`
        : `Deposit ${major(depositMinor)} (refundable)`;

    const intent = await createPaymentIntent({
      amountMinor,
      depositMinor,
      feeMinor,
      currency,
      userChallengeId: participation.id,
      userId: user.id,
      plan: planId ?? "",
      customerId: customer.id,
      saveCard,
      description,
      // Plan and currency are both part of the key: the same total under a
      // different plan is a genuinely different charge and must not collide.
      idempotencyKey: `deposit_${participation.id}_${amountMinor}_${currency}_${planId ?? "none"}`,
    });

    // Service role: the user must not be able to write payment fields themselves.
    const { error: updateError } = await admin
      .from("user_challenges")
      .update({
        stripe_payment_intent_id: intent.id,
        plan: planId,
        deposit_minor: depositMinor,
        fee_minor: feeMinor,
      })
      .eq("id", participation.id);
    if (updateError) throw updateError;

    return json({ ...responseShape, clientSecret: intent.client_secret });
  } catch (err) {
    if (err instanceof AuthError) return json({ error: "unauthorized" }, 401);
    console.error("create-deposit-payment failed", err);
    return json({ error: "internal_error" }, 500);
  }
});
