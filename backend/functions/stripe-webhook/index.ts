import { corsHeaders, createAdminClient, json } from "../_shared/auth.ts";
import {
  createSubscription,
  ensureSubscriptionPrice,
  verifyWebhookSignature,
} from "../_shared/stripe.ts";
import { addWeeks, safeZone, weeklyStart, weeksBetween } from "../_shared/gymweek.ts";
import { minorToMajor, sendConversionEvent, type ConversionEventName } from "../_shared/meta.ts";
import { isPlanId, planById, stripeInterval, type PlanId } from "../_shared/plans.ts";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Stripe webhook: the only thing allowed to mark a deposit as paid, grant a
 * plan, or report money to Meta.
 *
 * Deliberately unauthenticated (Stripe has no Supabase session) — the signature
 * check is the security boundary. It never issues money: refunds are made by
 * hand in the Stripe dashboard after a challenge ends.
 *
 * The rule that matters most in this file: **only the access fee is revenue.**
 * A single card charge carries both the person's refundable deposit and the
 * GymTaxx fee, and the split travels in the intent's metadata. Reporting the
 * total would tell Meta we earn £80–£100 a sale when most of that is money we
 * are holding on someone's behalf and expect to give back.
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
    const admin = createAdminClient();

    switch (event.type) {
      case "payment_intent.succeeded":
        return await handleDepositPaid(admin, event.data?.object);
      case "invoice.payment_succeeded":
        return await handleInvoicePaid(admin, event.data?.object);
      case "invoice.payment_failed":
        return await handleInvoiceFailed(admin, event.data?.object);
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        return await handleSubscriptionChanged(admin, event.data?.object, event.type);
      default:
        // Acknowledge everything else so Stripe stops retrying it.
        return json({ received: true, ignored: event.type });
    }
  } catch (err) {
    console.error("stripe-webhook: unexpected failure", err);
    return json({ error: "internal_error" }, 500);
  }
});

/**
 * The deposit (and any access fee) cleared: open the challenge.
 *
 * The start date is re-anchored here. Someone commits to a goal before paying,
 * so the start written then can already be in the past by the time the money
 * lands (committed Saturday, paid Wednesday). Recomputing it means the challenge
 * always begins on a Monday still ahead of them — worked out in the zone stored
 * on the participation, not the server's.
 */
async function handleDepositPaid(admin: Admin, intent: Record<string, unknown> | undefined): Promise<Response> {
  const metadata = (intent?.metadata ?? {}) as Record<string, string>;
  const userChallengeId = metadata.user_challenge_id;
  const intentId = String(intent?.id ?? "");

  if (!userChallengeId) {
    console.error("stripe-webhook: succeeded intent without user_challenge_id", intentId);
    return json({ received: true });
  }

  // Matching on the stored intent id as well makes redelivery a no-op and stops a
  // payment for one participation from ever unlocking another.
  const { data: participation, error: readError } = await admin
    .from("user_challenges")
    .select(
      "user_id, payment_status, started_at, ends_at, time_zone, currency, plan, fbp, fbc, client_ip, client_user_agent, capi_purchase_sent_at, capi_start_trial_sent_at",
    )
    .eq("id", userChallengeId)
    .eq("stripe_payment_intent_id", intentId)
    .maybeSingle();

  if (readError) {
    console.error("stripe-webhook: failed to read participation", readError);
    return json({ error: "read_failed" }, 500);
  }
  if (!participation) {
    console.error("stripe-webhook: no participation for intent", intentId);
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

  const zone = safeZone(participation.time_zone);
  const committedStart = new Date(participation.started_at);
  const anchoredStart = weeklyStart(new Date(), zone);
  // The challenge's own end date, which the trial below is pinned to.
  let endsAt = new Date(participation.ends_at);

  if (anchoredStart.getTime() !== committedStart.getTime()) {
    // Preserve the challenge's length rather than assuming four weeks, so a
    // future change to the challenge config can't silently shorten someone's run.
    const weeks = weeksBetween(committedStart, endsAt);
    endsAt = addWeeks(anchoredStart, weeks, zone);
    update.started_at = anchoredStart.toISOString();
    update.ends_at = endsAt.toISOString();
  }

  const { error } = await admin
    .from("user_challenges")
    .update(update)
    .eq("id", userChallengeId)
    .eq("stripe_payment_intent_id", intentId);

  if (error) {
    console.error("stripe-webhook: failed to mark paid", error);
    // 500 so Stripe retries — the user is otherwise stuck unpaid.
    return json({ error: "update_failed" }, 500);
  }

  const feeMinor = Number(metadata.fee_minor ?? 0);
  const planId: PlanId | null = isPlanId(metadata.plan) ? metadata.plan : null;
  const currency = String(intent?.currency ?? participation.currency ?? "gbp");

  // Access is granted after the challenge is safely open, so a problem creating
  // a subscription can never leave someone who has paid without their challenge.
  const granted = await grantAccess(admin, {
    userId: participation.user_id,
    planId,
    customerId: typeof intent?.customer === "string" ? intent.customer : null,
    paymentMethodId: typeof intent?.payment_method === "string" ? intent.payment_method : null,
    currency,
    trialEndsAt: endsAt,
    startsFree: feeMinor === 0,
  });

  // Reporting is the last thing that happens and cannot change anything above
  // it. A trial carries no money, so it reports as StartTrial at zero rather
  // than as a sale; only a fee that actually cleared is a Purchase.
  const isTrialStart = planId !== null && feeMinor === 0 && granted.createdSubscription;
  if (feeMinor > 0) {
    await report(admin, "Purchase", {
      userChallengeId,
      userId: participation.user_id,
      alreadySent: participation.capi_purchase_sent_at !== null,
      eventId: intentId,
      value: minorToMajor(feeMinor),
      currency,
      stampColumn: "capi_purchase_sent_at",
      participation,
    });
  } else if (isTrialStart) {
    await report(admin, "StartTrial", {
      userChallengeId,
      userId: participation.user_id,
      alreadySent: participation.capi_start_trial_sent_at !== null,
      eventId: `trial_${intentId}`,
      // Zero on purpose: no money has moved. Pricing it here would double-count
      // against the Subscribe event that follows when the trial converts.
      value: 0,
      currency,
      stampColumn: "capi_start_trial_sent_at",
      participation,
    });
  }

  return json({ received: true });
}

interface GrantResult {
  createdSubscription: boolean;
}

/**
 * Record what the person is entitled to, and start their subscription.
 *
 * Wrapped so nothing in here can throw into the caller: the challenge is already
 * open by this point, and a Stripe hiccup creating a subscription must not undo
 * a payment that succeeded. A missing subscription is recoverable by hand; a
 * challenge rolled back because of one is not.
 */
async function grantAccess(
  admin: Admin,
  params: {
    userId: string;
    planId: PlanId | null;
    customerId: string | null;
    paymentMethodId: string | null;
    currency: string;
    trialEndsAt: Date;
    startsFree: boolean;
  },
): Promise<GrantResult> {
  // No plan means a grandfathered account, which keeps its original terms.
  if (!params.planId) return { createdSubscription: false };

  const plan = planById(params.planId);
  const now = new Date().toISOString();
  const profileUpdate: Record<string, unknown> = {
    plan: plan.id,
    plan_status: "active",
    plan_started_at: now,
  };

  // A free first challenge is once per account, ever. Stamped the moment it is
  // handed out, so a second run has to be paid for.
  if (params.startsFree) profileUpdate.free_challenge_used = true;

  const interval = stripeInterval(plan);
  let createdSubscription = false;

  if (interval && params.customerId) {
    try {
      const price = await ensureSubscriptionPrice({
        planId: plan.id,
        planName: plan.name,
        unitAmountMinor: plan.priceMinor,
        currency: params.currency,
        interval,
      });

      // The trial runs to the end of the challenge, not a fixed 28 days. Billing
      // someone mid-challenge, while their own deposit is still riding on the
      // outcome, is the most disputable charge this product could make.
      const trialEndUnix = params.startsFree
        ? Math.floor(params.trialEndsAt.getTime() / 1000)
        : null;

      const subscription = await createSubscription({
        customerId: params.customerId,
        priceId: price.id,
        trialEndUnix,
        defaultPaymentMethod: params.paymentMethodId,
        userId: params.userId,
        plan: plan.id,
        idempotencyKey: `sub_${params.userId}_${plan.id}_${params.trialEndsAt.getTime()}`,
      });

      createdSubscription = true;
      profileUpdate.stripe_subscription_id = subscription.id;
      profileUpdate.plan_status = subscription.status === "trialing" ? "trialing" : subscription.status;
      if (trialEndUnix !== null) {
        profileUpdate.plan_renews_at = params.trialEndsAt.toISOString();
      } else if (subscription.current_period_end) {
        profileUpdate.plan_renews_at = new Date(subscription.current_period_end * 1000).toISOString();
      }
    } catch (err) {
      // Logged loudly: this is the one failure here worth a human looking at,
      // because the person has access but nothing will renew it.
      console.error(
        "stripe-webhook: subscription not created",
        params.userId,
        plan.id,
        err instanceof Error ? err.message : err,
      );
    }
  }

  const { error } = await admin.from("profiles").update(profileUpdate).eq("id", params.userId);
  if (error) {
    console.error("stripe-webhook: plan not recorded", params.userId, error.message);
  }

  return { createdSubscription };
}

/**
 * A subscription invoice was paid.
 *
 * The first one with money on it is the moment a free challenge turned into a
 * paying member, which is the only signal worth optimising ads towards. Later
 * renewals update the date but report nothing — they are not new conversions.
 */
async function handleInvoicePaid(admin: Admin, invoice: Record<string, unknown> | undefined): Promise<Response> {
  const customerId = typeof invoice?.customer === "string" ? invoice.customer : null;
  const amountPaid = Number(invoice?.amount_paid ?? 0);
  const currency = String(invoice?.currency ?? "gbp");
  const subscriptionId = typeof invoice?.subscription === "string" ? invoice.subscription : null;
  if (!customerId) return json({ received: true });

  const { data: profile } = await admin
    .from("profiles")
    .select("id, capi_subscribe_sent_at")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  if (!profile) {
    console.error("stripe-webhook: invoice for unknown customer", customerId);
    return json({ received: true });
  }

  const periodEnd = Number((invoice as { period_end?: number })?.period_end ?? 0);
  const update: Record<string, unknown> = { plan_status: "active" };
  if (subscriptionId) update.stripe_subscription_id = subscriptionId;
  if (Number.isFinite(periodEnd) && periodEnd > 0) {
    update.plan_renews_at = new Date(periodEnd * 1000).toISOString();
  }
  await admin.from("profiles").update(update).eq("id", profile.id);

  // A zero invoice is the bookkeeping entry Stripe raises when a trial starts.
  // Nothing was paid, so there is nothing to report.
  if (amountPaid <= 0 || profile.capi_subscribe_sent_at !== null) {
    return json({ received: true });
  }

  const result = await sendConversionEvent("Subscribe", {
    eventId: String(invoice?.id ?? `invoice_${customerId}`),
    eventTime: Math.floor(Date.now() / 1000),
    value: minorToMajor(amountPaid),
    currency,
    email: await emailFor(admin, profile.id),
    userId: profile.id,
    // The payer is not on this request — Stripe is — so browser attribution is
    // deliberately absent rather than filled with a data centre's fingerprint.
    fbp: null,
    fbc: null,
    clientIp: null,
    clientUserAgent: null,
  });

  if (result.sent) {
    await admin
      .from("profiles")
      .update({ capi_subscribe_sent_at: new Date().toISOString() })
      .eq("id", profile.id);
  } else {
    console.error("stripe-webhook: Subscribe not reported", result.reason, result.detail ?? "");
  }

  return json({ received: true });
}

/**
 * A renewal failed.
 *
 * Marked past due rather than cancelled: Stripe retries over several days, and
 * cutting someone off on the first failed attempt would punish an expired card.
 * Access is checked when a *new* challenge is started, so nobody mid-challenge
 * loses the ability to earn their own deposit back over a billing problem.
 */
async function handleInvoiceFailed(admin: Admin, invoice: Record<string, unknown> | undefined): Promise<Response> {
  const customerId = typeof invoice?.customer === "string" ? invoice.customer : null;
  if (!customerId) return json({ received: true });

  const { error } = await admin
    .from("profiles")
    .update({ plan_status: "past_due" })
    .eq("stripe_customer_id", customerId);
  if (error) console.error("stripe-webhook: past_due not recorded", error.message);

  return json({ received: true });
}

/** Keep the app's copy of the subscription in step with Stripe's. */
async function handleSubscriptionChanged(
  admin: Admin,
  subscription: Record<string, unknown> | undefined,
  eventType: string,
): Promise<Response> {
  const customerId = typeof subscription?.customer === "string" ? subscription.customer : null;
  if (!customerId) return json({ received: true });

  const isDeleted = eventType === "customer.subscription.deleted";
  const status = String(subscription?.status ?? "canceled");
  const periodEnd = Number(subscription?.current_period_end ?? 0);

  const update: Record<string, unknown> = {
    plan_status: isDeleted ? "canceled" : status,
    plan_cancel_at_period_end: subscription?.cancel_at_period_end === true,
  };
  if (!isDeleted && Number.isFinite(periodEnd) && periodEnd > 0) {
    update.plan_renews_at = new Date(periodEnd * 1000).toISOString();
  }

  const { error } = await admin.from("profiles").update(update).eq("stripe_customer_id", customerId);
  if (error) console.error("stripe-webhook: subscription change not recorded", error.message);

  return json({ received: true });
}

/** Email lives on the profile, read here and hashed before it leaves the server. */
async function emailFor(admin: Admin, userId: string): Promise<string | null> {
  const { data, error } = await admin.from("profiles").select("email").eq("id", userId).maybeSingle();
  if (error) {
    console.error("stripe-webhook: could not read email for reporting", error.message);
    return null;
  }
  return data?.email ?? null;
}

interface ReportInput {
  userChallengeId: string;
  userId: string;
  alreadySent: boolean;
  eventId: string;
  value: number;
  currency: string;
  stampColumn: "capi_purchase_sent_at" | "capi_start_trial_sent_at";
  participation: {
    fbp: string | null;
    fbc: string | null;
    client_ip: string | null;
    client_user_agent: string | null;
  };
}

/**
 * Report a conversion to Meta's Conversions API.
 *
 * Isolated with a blanket catch so there is no code path from an advertising
 * problem back into payment handling. It returns void on purpose: the caller has
 * nothing to decide based on the outcome.
 *
 * The stamp column is the duplicate guard. The `payment_status` check earlier
 * already makes webhook redelivery a no-op, but an event resent by hand from the
 * Stripe dashboard would otherwise be able to inflate reported revenue.
 */
async function report(admin: Admin, eventName: ConversionEventName, input: ReportInput): Promise<void> {
  try {
    if (input.alreadySent) return;

    const result = await sendConversionEvent(eventName, {
      eventId: input.eventId,
      eventTime: Math.floor(Date.now() / 1000),
      value: input.value,
      currency: input.currency,
      email: await emailFor(admin, input.userId),
      userId: input.userId,
      fbp: input.participation.fbp,
      fbc: input.participation.fbc,
      clientIp: input.participation.client_ip,
      clientUserAgent: input.participation.client_user_agent,
    });

    if (!result.sent) {
      console.error(`stripe-webhook: Meta ${eventName} not reported`, result.reason, result.detail ?? "");
      return;
    }

    // Stamped only after Meta accepted it, so a failure can be retried by a
    // later redelivery rather than being silently marked as done.
    const { error } = await admin
      .from("user_challenges")
      .update({ [input.stampColumn]: new Date().toISOString() })
      .eq("id", input.userChallengeId);
    if (error) {
      console.error(`stripe-webhook: ${eventName} reported but not stamped`, error.message);
    }
  } catch (err) {
    console.error("stripe-webhook: Meta reporting failed", err instanceof Error ? err.message : err);
  }
}
