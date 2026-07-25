import { corsHeaders, createAdminClient, json } from "../_shared/auth.ts";
import { verifyWebhookSignature } from "../_shared/stripe.ts";

/**
 * Stripe webhook: the only thing allowed to mark a deposit as paid.
 *
 * Deliberately unauthenticated (Stripe has no Supabase session) — the signature
 * check is the security boundary. It handles exactly one event and writes exactly
 * two columns; refunds are issued by hand in the Stripe dashboard after the cohort.
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
    const { error } = await admin
      .from("user_challenges")
      .update({ payment_status: "paid", challenge_status: "active" })
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
