import { corsHeaders, createAdminClient, json } from "../_shared/auth.ts";
import { verifyWebhookSignature } from "../_shared/stripe.ts";
import { addWeeks, safeZone, weeklyStart, weeksBetween } from "../_shared/gymweek.ts";
import { minorToMajor, sendPurchaseEvent } from "../_shared/meta.ts";

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
 *
 * That Monday is worked out in the zone stored on the participation, not the
 * server's. Using London for an American user would hand them a start date that
 * had already begun, or push them a day further out than the app promised.
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
      .select(
        "user_id, payment_status, started_at, ends_at, time_zone, fbp, fbc, client_ip, client_user_agent, capi_purchase_sent_at",
      )
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

    // Payment is what enrols someone, so the start is recomputed from this moment
    // rather than trusted from commit time. It can move in either direction: later
    // when the deposit landed in a following week, earlier when the record was
    // written against a stale far-off date.
    const zone = safeZone(participation.time_zone);
    const committedStart = new Date(participation.started_at);
    const anchoredStart = weeklyStart(new Date(), zone);
    if (anchoredStart.getTime() !== committedStart.getTime()) {
      // Preserve the challenge's length rather than assuming four weeks, so a
      // future change to the challenge config can't silently shorten someone's run.
      const weeks = weeksBetween(committedStart, new Date(participation.ends_at));
      update.started_at = anchoredStart.toISOString();
      update.ends_at = addWeeks(anchoredStart, weeks, zone).toISOString();
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

    // Ad reporting is the last thing that happens, and it cannot change anything
    // above it. The deposit is recorded and the challenge is active by now, so a
    // failure at Meta costs a reported conversion and nothing else.
    await reportPurchase(admin, {
      userChallengeId,
      userId: participation.user_id,
      alreadySent: participation.capi_purchase_sent_at !== null,
      intentId: intent.id,
      // The money Stripe actually captured, in the currency it was captured in —
      // not recomputed here, and not assumed to be pounds. Roughly half of
      // joiners pay in dollars, so hardcoding a currency would misreport them.
      amountMinor: Number(intent.amount_received ?? intent.amount),
      currency: String(intent.currency ?? "gbp"),
      fbp: participation.fbp,
      fbc: participation.fbc,
      clientIp: participation.client_ip,
      clientUserAgent: participation.client_user_agent,
    });

    return json({ received: true });
  } catch (err) {
    console.error("stripe-webhook: unexpected failure", err);
    return json({ error: "internal_error" }, 500);
  }
});

interface PurchaseReport {
  userChallengeId: string;
  userId: string;
  alreadySent: boolean;
  intentId: string;
  amountMinor: number;
  currency: string;
  fbp: string | null;
  fbc: string | null;
  clientIp: string | null;
  clientUserAgent: string | null;
}

/**
 * Report the deposit to Meta's Conversions API.
 *
 * Isolated in its own function with a blanket catch so there is no code path from
 * an advertising problem back into payment handling. It returns void on purpose:
 * the caller has nothing to decide based on the outcome.
 *
 * `capi_purchase_sent_at` is the duplicate guard. The `payment_status` check
 * earlier already makes webhook redelivery a no-op, but a manually resent event
 * from the Stripe dashboard would otherwise be able to inflate reported revenue.
 */
async function reportPurchase(
  admin: ReturnType<typeof createAdminClient>,
  report: PurchaseReport,
): Promise<void> {
  try {
    if (report.alreadySent) return;

    // Email lives on the profile rather than the participation, so it is read
    // here and hashed before it leaves the server. It is never stored twice.
    let email: string | null = null;
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("email")
      .eq("id", report.userId)
      .maybeSingle();
    if (profileError) {
      // Match quality drops without it, but the event is still worth sending.
      console.error("stripe-webhook: could not read email for reporting", profileError.message);
    } else {
      email = profile?.email ?? null;
    }

    const result = await sendPurchaseEvent({
      // Stripe's intent id is stable across redeliveries, so Meta can also
      // deduplicate on its own side.
      eventId: report.intentId,
      eventTime: Math.floor(Date.now() / 1000),
      value: minorToMajor(report.amountMinor),
      currency: report.currency,
      email,
      userId: report.userId,
      fbp: report.fbp,
      fbc: report.fbc,
      clientIp: report.clientIp,
      clientUserAgent: report.clientUserAgent,
    });

    if (!result.sent) {
      console.error(
        "stripe-webhook: Meta purchase not reported",
        result.reason,
        result.detail ?? "",
      );
      return;
    }

    // Stamped only after Meta accepted it, so a failure can be retried by a
    // later redelivery rather than being silently marked as done.
    const { error: stampError } = await admin
      .from("user_challenges")
      .update({ capi_purchase_sent_at: new Date().toISOString() })
      .eq("id", report.userChallengeId);
    if (stampError) {
      console.error("stripe-webhook: purchase reported but not stamped", stampError.message);
    }
  } catch (err) {
    console.error(
      "stripe-webhook: Meta reporting failed",
      err instanceof Error ? err.message : err,
    );
  }
}
