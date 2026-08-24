import {
  AuthError,
  corsHeaders,
  createAdminClient,
  json,
  requireAuth,
} from "../_shared/auth.ts";
import { cancelSubscriptionAtPeriodEnd, retrieveSubscription } from "../_shared/stripe.ts";

/**
 * Cancel or resume the signed-in user's plan.
 *
 * Cancelling has to be as easy as subscribing — that is the law in the UK and
 * the EU, and it is also the decent way to run a business people are trusting
 * with their money. There is no retention interstitial here and no email-us
 * step: one request, applied immediately.
 *
 * Cancellation takes effect at the end of the period they have already paid
 * for, never instantly. Cutting access the moment someone taps cancel would be
 * taking back something they have bought.
 *
 * Crucially, a cancelled plan does not touch a challenge in flight. Access is
 * only checked when a *new* challenge is started, so someone with a deposit
 * riding on this week can always keep verifying workouts and earning it back.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { user } = await requireAuth(req);
    const body = (await req.json().catch(() => ({}))) as { action?: unknown };
    const action = body.action;

    if (action !== "cancel" && action !== "resume") {
      return json({ error: "unknown_action" }, 400);
    }

    // Service role: billing columns are protected from the client by a trigger,
    // so this is the only path that can read and write them truthfully.
    const admin = createAdminClient();
    const { data: profile, error: readError } = await admin
      .from("profiles")
      .select("stripe_subscription_id, plan, plan_status")
      .eq("id", user.id)
      .maybeSingle();

    if (readError) throw readError;
    if (!profile?.stripe_subscription_id) {
      // One-off plans have nothing recurring to stop, so there is no failure
      // state to report — there is simply nothing to do.
      return json({ error: "no_subscription" }, 404);
    }

    const subscription = await cancelSubscriptionAtPeriodEnd(
      profile.stripe_subscription_id,
      action === "cancel",
    );

    const renewsAt = subscription.current_period_end
      ? new Date(subscription.current_period_end * 1000).toISOString()
      : null;

    // Written straight away rather than waiting for the webhook, so the screen
    // reflects the change the instant they come back to it.
    const update: Record<string, unknown> = {
      plan_cancel_at_period_end: subscription.cancel_at_period_end === true,
    };
    if (renewsAt) update.plan_renews_at = renewsAt;

    const { error: writeError } = await admin.from("profiles").update(update).eq("id", user.id);
    if (writeError) {
      // Stripe is the source of truth and has already accepted the change, so
      // this is a display lag rather than a failure worth showing the user.
      console.error("manage-subscription: local state not updated", writeError.message);
    }

    return json({
      status: "ok",
      cancelAtPeriodEnd: subscription.cancel_at_period_end === true,
      renewsAt,
    });
  } catch (err) {
    if (err instanceof AuthError) return json({ error: "unauthorized" }, 401);
    console.error("manage-subscription failed", err);
    return json({ error: "internal_error" }, 500);
  }
});

/**
 * Kept for reference: reading the live subscription is occasionally useful when
 * diagnosing a mismatch between Stripe and the profile row.
 */
export { retrieveSubscription };
