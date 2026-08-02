import { corsHeaders, createAdminClient, json } from "../_shared/auth.ts";
import { verifyWebhookSignature } from "../_shared/stripe.ts";
import { addWeeks, weeklyStart, weeksBetween } from "../_shared/gymweek.ts";

/**
 * Stripe webhook: the only thing allowed to mark a deposit as paid.
 *
 * Deliberately unauthenticated (Stripe has no Supabase session) — the signature
 * check is the security boundary. It handles exactly one event, and never issues
 * money: refunds are made by hand in the Stripe dashboard after a challenge ends.
 *
 * It also re-anchors the start date. A user commits to a goal before paying, so
 * the start written then can already be in the past by the time the money lands
 * (committed Saturday, paid Wednesday). Recomputing it here means the challenge
 * always begins on a Monday that is still ahead of them.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!secret) {
    console.error("stripe-webhook: STRIPE_WEBHOOK_SECRET is not configured");
    return json({ error: "not_configured" }, 500);
  }

  const signature = req.headers.get("Stripe-Signature");
  const payload = await req.text();

  if (!signature || !(await verifyWebhookSignature(payload, signature, secret))) {
    console.error("stripe-webhook: invalid signature");
    return json({ error: "invalid_signature" }, 400);
  }

  try {
    const event = JSON.parse(payload);
    if (event.type !== "payment_intent.succeeded") {
      // Acknowledge everything else so Stripe stops retrying it.
      return json({ received: true, ignored: event.type });
    }

    const intent = event.data?.object;
    const userChallengeId: string | undefined = intent?.metadata?.user_challenge_id;
    if (!userChallengeId) {
      console.error("stripe-webhook: succeeded intent without user_challenge_id", intent?.id);
      return json({ received: true });
    }

    const admin = createAdminClient();

    // Matching on the stored intent id as well makes redelivery a no-op and stops a
    // payment for one participation from ever unlocking another.
    const { data: participation, error: readError } = await admin
      .from("user_challenges")
      .select("payment_status, started_at, ends_at")
      .eq("id", userChallengeId)
      .eq("stripe_payment_intent_id", intent.id)
      .maybeSingle();

    if (readError) {
      console.error("stripe-webhook: failed to read participation", readError);
      return json({ error: "read_failed" }, 500);
    }
    if (!participation) {
      // Nothing matches this intent. Acknowledge so Stripe stops retrying.
      console.error("stripe-webhook: no participation for intent", intent.id);
      return json({ received: true });
    }
    if (participation.payment_status === "paid") {
      // Redelivery of an event we already handled. Returning early is what keeps
      // the re-anchor below from pushing an in-flight challenge into the future.
      return json({ received: true, alreadyPaid: true });
    }

    const update: Record<string, string> = {
      payment_status: "paid",
      challenge_status: "active",
    };

    const committedStart = new Date(participation.started_at);
    const anchoredStart = weeklyStart(new Date());
    if (anchoredStart > committedStart) {
      // Preserve the challenge's length rather than assuming four weeks, so a
      // future change to the challenge config can't silently shorten someone's run.
      const weeks = weeksBetween(committedStart, new Date(participation.ends_at));
      update.started_at = anchoredStart.toISOString();
      update.ends_at = addWeeks(anchoredStart, weeks).toISOString();
    }

    const { error } = await admin
      .from("user_challenges")
      .update(update)
      .eq("id", userChallengeId)
      .eq("stripe_payment_intent_id", intent.id);

    if (error) {
      console.error("stripe-webhook: failed to mark paid", error);
      // 500 so Stripe retries — the user is otherwise stuck unpaid.
      return json({ error: "update_failed" }, 500);
    }

    return json({ received: true });
  } catch (err) {
    console.error("stripe-webhook: unexpected failure", err);
    return json({ error: "internal_error" }, 500);
  }
});
