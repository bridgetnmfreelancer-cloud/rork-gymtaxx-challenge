/**
 * Minimal Stripe REST helpers.
 *
 * We talk to the REST API directly rather than pulling in the whole Stripe SDK.
 * Everything money-related is computed on the server and passed in explicitly —
 * nothing in here reads a price from a request body.
 */

const STRIPE_API = "https://api.stripe.com/v1";

export function stripeSecretKey(): string {
  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  return key;
}

export interface PaymentIntent {
  id: string;
  status: string;
  amount: number;
  amount_received?: number;
  currency: string;
  client_secret: string;
  customer?: string | null;
  payment_method?: string | null;
  metadata?: Record<string, string>;
}

export interface Customer {
  id: string;
  email?: string | null;
  metadata?: Record<string, string>;
}

export interface Price {
  id: string;
  currency: string;
  unit_amount: number | null;
}

export interface Subscription {
  id: string;
  status: string;
  current_period_end?: number;
  trial_end?: number | null;
  cancel_at_period_end?: boolean;
  customer?: string;
  metadata?: Record<string, string>;
}

interface StripeList<T> {
  data: T[];
}

/** Thrown for any non-2xx Stripe response, carrying the HTTP status. */
export class StripeError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "StripeError";
    this.status = status;
  }
}

async function stripeRequest<T>(
  path: string,
  init: { method: "GET" | "POST"; form?: Record<string, string>; idempotencyKey?: string },
): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${stripeSecretKey()}`,
  };
  if (init.form) headers["Content-Type"] = "application/x-www-form-urlencoded";
  if (init.idempotencyKey) headers["Idempotency-Key"] = init.idempotencyKey;

  const res = await fetch(`${STRIPE_API}${path}`, {
    method: init.method,
    headers,
    body: init.form ? new URLSearchParams(init.form).toString() : undefined,
  });

  const body = await res.json();
  if (!res.ok) {
    const message = body?.error?.message ?? `Stripe request failed (${res.status})`;
    throw new StripeError(message, res.status);
  }
  return body as T;
}

export function retrievePaymentIntent(id: string): Promise<PaymentIntent> {
  return stripeRequest<PaymentIntent>(`/payment_intents/${id}`, { method: "GET" });
}

/**
 * Create the single charge that opens a challenge.
 *
 * The deposit and the access fee are added together so the person enters their
 * card once, but the split travels in metadata and is the only thing reporting
 * ever reads. `amount` is the total; it is deliberately never treated as revenue.
 *
 * `automatic_payment_methods` is what puts Apple Pay in front of an iPhone user.
 * Redirects are switched off with it: this runs as an installed home-screen app,
 * and a redirect-based method can hand the return trip to Safari, stranding
 * someone whose money has already moved.
 */
export function createPaymentIntent(params: {
  amountMinor: number;
  depositMinor: number;
  feeMinor: number;
  currency: string;
  userChallengeId: string;
  userId: string;
  plan: string;
  customerId: string;
  /** Save the card for a later subscription charge. */
  saveCard: boolean;
  description: string;
  idempotencyKey: string;
}): Promise<PaymentIntent> {
  const form: Record<string, string> = {
    amount: String(params.amountMinor),
    currency: params.currency,
    customer: params.customerId,
    description: params.description,
    "automatic_payment_methods[enabled]": "true",
    "automatic_payment_methods[allow_redirects]": "never",
    "metadata[user_challenge_id]": params.userChallengeId,
    "metadata[user_id]": params.userId,
    "metadata[plan]": params.plan,
    // Read by the webhook. The fee is the revenue figure; the deposit is the
    // user's own money and must never be reported as a sale.
    "metadata[deposit_minor]": String(params.depositMinor),
    "metadata[fee_minor]": String(params.feeMinor),
  };

  if (params.saveCard) {
    // Required so the same card can be charged when the free challenge ends.
    form.setup_future_usage = "off_session";
  }

  return stripeRequest<PaymentIntent>("/payment_intents", {
    method: "POST",
    idempotencyKey: params.idempotencyKey,
    form,
  });
}

/** Statuses where the existing intent's client secret can still be presented. */
export function isReusable(status: string): boolean {
  return [
    "requires_payment_method",
    "requires_confirmation",
    "requires_action",
    "processing",
  ].includes(status);
}

/**
 * The Stripe customer for a person, created once and reused.
 *
 * A customer is what makes a saved card and a subscription possible at all. The
 * stored id is verified rather than trusted: it can legitimately be unreachable
 * after a switch between Stripe's test and live modes, and that must not
 * dead-end someone trying to pay.
 */
export async function findOrCreateCustomer(params: {
  existingCustomerId: string | null;
  userId: string;
  email: string | null;
}): Promise<Customer> {
  if (params.existingCustomerId) {
    try {
      const found = await stripeRequest<Customer & { deleted?: boolean }>(
        `/customers/${params.existingCustomerId}`,
        { method: "GET" },
      );
      if (!found.deleted) return found;
    } catch (err) {
      console.error(
        "stripe: stored customer unreachable, creating a new one",
        params.existingCustomerId,
        err instanceof Error ? err.message : err,
      );
    }
  }

  const form: Record<string, string> = {
    "metadata[user_id]": params.userId,
  };
  if (params.email) form.email = params.email;

  return await stripeRequest<Customer>("/customers", {
    method: "POST",
    // One customer per user even if two requests race.
    idempotencyKey: `customer_${params.userId}`,
    form,
  });
}

/**
 * The recurring Price for a plan and currency, created on first use.
 *
 * Stripe subscriptions need a real Price object, so rather than asking anyone to
 * hand-create four of them in the dashboard, they are looked up by a stable key
 * and made if missing. The product carries a fixed id for the same reason: the
 * whole thing is self-healing and safe to run twice.
 */
export async function ensureSubscriptionPrice(params: {
  planId: string;
  planName: string;
  unitAmountMinor: number;
  currency: string;
  interval: "month" | "year";
}): Promise<Price> {
  const lookupKey = `gymtaxx_${params.planId}_${params.currency}`;
  const productId = `gymtaxx_${params.planId}`;

  const existing = await stripeRequest<StripeList<Price>>(
    `/prices?lookup_keys[]=${encodeURIComponent(lookupKey)}&active=true&limit=1`,
    { method: "GET" },
  );
  const found = existing.data[0];
  // Guard against a stale price left behind by a pricing change: a mismatched
  // amount means the catalogue moved and a new Price is needed.
  if (found && found.unit_amount === params.unitAmountMinor) return found;

  try {
    await stripeRequest<{ id: string }>(`/products/${productId}`, { method: "GET" });
  } catch (err) {
    if (!(err instanceof StripeError) || err.status !== 404) throw err;
    await stripeRequest<{ id: string }>("/products", {
      method: "POST",
      idempotencyKey: `product_${productId}`,
      form: { id: productId, name: params.planName },
    });
  }

  return await stripeRequest<Price>("/prices", {
    method: "POST",
    idempotencyKey: `price_${lookupKey}_${params.unitAmountMinor}`,
    form: {
      product: productId,
      currency: params.currency,
      unit_amount: String(params.unitAmountMinor),
      "recurring[interval]": params.interval,
      lookup_key: lookupKey,
      transfer_lookup_key: "true",
    },
  });
}

/**
 * Start a subscription whose free period runs exactly as long as the challenge.
 *
 * `trialEndUnix` is the challenge's own end date, not a fixed number of days.
 * Billing someone on day 28 when their challenge finishes on day 31 would take
 * money while they still had a deposit riding on the outcome, which is the
 * single most disputable charge this product could make.
 */
export function createSubscription(params: {
  customerId: string;
  priceId: string;
  /** Unix seconds. Omit to bill immediately. */
  trialEndUnix: number | null;
  defaultPaymentMethod: string | null;
  userId: string;
  plan: string;
  idempotencyKey: string;
}): Promise<Subscription> {
  const form: Record<string, string> = {
    customer: params.customerId,
    "items[0][price]": params.priceId,
    "metadata[user_id]": params.userId,
    "metadata[plan]": params.plan,
    // The card was collected with the deposit, so a failed renewal should chase
    // the customer rather than silently cancel a paying member.
    payment_behavior: "allow_incomplete",
  };

  if (params.trialEndUnix !== null) {
    form.trial_end = String(params.trialEndUnix);
    // If the saved card fails when the trial ends, keep the subscription alive
    // and let the dunning emails do their work.
    form["trial_settings[end_behavior][missing_payment_method]"] = "cancel";
  }
  if (params.defaultPaymentMethod) {
    form.default_payment_method = params.defaultPaymentMethod;
  }

  return stripeRequest<Subscription>("/subscriptions", {
    method: "POST",
    idempotencyKey: params.idempotencyKey,
    form,
  });
}

export function retrieveSubscription(id: string): Promise<Subscription> {
  return stripeRequest<Subscription>(`/subscriptions/${id}`, { method: "GET" });
}

/**
 * Cancel at the end of the paid period rather than immediately.
 *
 * Someone who cancels has already paid for the period they're in, and cutting
 * access the instant they tap the button would be taking something they bought.
 */
export function cancelSubscriptionAtPeriodEnd(id: string, cancel: boolean): Promise<Subscription> {
  return stripeRequest<Subscription>(`/subscriptions/${id}`, {
    method: "POST",
    form: { cancel_at_period_end: cancel ? "true" : "false" },
  });
}

/** Constant-time-ish hex comparison for webhook signatures. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Verify a Stripe webhook signature (`Stripe-Signature` header).
 *
 * This is the security boundary for marking a deposit paid: without it, anyone
 * who knows the URL could POST a fake "payment succeeded" event.
 */
export async function verifyWebhookSignature(
  payload: string,
  signatureHeader: string,
  secret: string,
  toleranceSeconds = 300,
): Promise<boolean> {
  let timestamp = "";
  const provided: string[] = [];

  for (const part of signatureHeader.split(",")) {
    const [key, value] = part.trim().split("=");
    if (key === "t" && value) timestamp = value;
    if (key === "v1" && value) provided.push(value);
  }
  if (!timestamp || provided.length === 0) return false;

  // Reject replays of an old, captured event.
  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(age) || age > toleranceSeconds) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${timestamp}.${payload}`),
  );
  const expected = toHex(signed);

  return provided.some((candidate) => safeEqual(candidate, expected));
}
