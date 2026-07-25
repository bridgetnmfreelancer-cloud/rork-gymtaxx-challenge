/**
 * Minimal Stripe REST helpers.
 *
 * Only two calls are needed for this cohort (create/read a PaymentIntent), so we
 * talk to the REST API directly rather than pulling in the whole Stripe SDK.
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
  currency: string;
  client_secret: string;
  metadata?: Record<string, string>;
}

async function stripeRequest(
  path: string,
  init: { method: "GET" | "POST"; form?: Record<string, string>; idempotencyKey?: string },
): Promise<PaymentIntent> {
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
    throw new Error(message);
  }
  return body as PaymentIntent;
}

export function retrievePaymentIntent(id: string): Promise<PaymentIntent> {
  return stripeRequest(`/payment_intents/${id}`, { method: "GET" });
}

/**
 * Create a PaymentIntent for a deposit.
 *
 * `userChallengeId` travels in metadata because the webhook has no other way to
 * know which participation record a succeeded payment belongs to.
 */
export function createPaymentIntent(params: {
  amountMinor: number;
  currency: string;
  userChallengeId: string;
  userId: string;
  idempotencyKey: string;
}): Promise<PaymentIntent> {
  return stripeRequest("/payment_intents", {
    method: "POST",
    idempotencyKey: params.idempotencyKey,
    form: {
      amount: String(params.amountMinor),
      currency: params.currency,
      // Card only: keeps the sheet to one in-app step with no redirect back into
      // the app, so no custom URL scheme is needed for this cohort.
      "payment_method_types[0]": "card",
      "metadata[user_challenge_id]": params.userChallengeId,
      "metadata[user_id]": params.userId,
    },
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
