/**
 * Meta Conversions API — server-side Purchase reporting.
 *
 * This module exists to be *unfailable*. Every export catches its own errors and
 * returns a result object rather than throwing, because the only caller is the
 * Stripe webhook, and a problem at Meta must never cost someone the challenge
 * they just paid for. Nothing in here writes to the database or touches Stripe.
 *
 * Reporting is deliberately server-side only. The browser pixel can't be trusted
 * to fire a Purchase: an installed home-screen app can be killed by iOS the
 * instant the payment sheet closes, and the deposit is confirmed by Stripe's
 * webhook rather than by the user's device reaching a success screen.
 */

const GRAPH_VERSION = "v21.0";

/** The dataset (pixel) that receives these events. Same id as the browser pixel. */
const PIXEL_ID = "1037615782556108";

/**
 * Meta gets one shot within the webhook's lifetime. Without a deadline a hanging
 * request would stall the webhook response, Stripe would treat it as a failure
 * and retry, and we'd be doing work for a payment already recorded.
 */
const REQUEST_TIMEOUT_MS = 4000;

export interface PurchaseAttribution {
  fbp?: string | null;
  fbc?: string | null;
  clientIp?: string | null;
  clientUserAgent?: string | null;
}

/**
 * The conversion events this app reports.
 *
 * - `Purchase` — the access fee actually cleared. Value is the fee alone.
 * - `StartTrial` — a free first challenge began. Value is zero: no money moved,
 *   and giving it a price here would double-count against the `Subscribe` that
 *   follows weeks later.
 * - `Subscribe` — the first real recurring payment cleared after a trial.
 */
export type ConversionEventName = "Purchase" | "StartTrial" | "Subscribe";

export interface PurchaseEvent extends PurchaseAttribution {
  /** Stripe PaymentIntent id. Doubles as Meta's `event_id` for deduplication. */
  eventId: string;
  /** Unix seconds. Meta rejects a batch containing anything over 7 days old. */
  eventTime: number;
  /** Major units (80, not 8000) — Meta expects a decimal amount. */
  value: number;
  /** ISO currency code of the money actually captured. */
  currency: string;
  email?: string | null;
  userId: string;
  /**
   * Events Manager test code. Set ONLY by the deliberate verification path.
   *
   * Passed in rather than read from the environment on purpose: while a test code
   * is present an event goes to Test Events instead of live reporting, so reading
   * it globally would let a leftover env var silently divert real customers'
   * deposits out of live reporting, with nothing on screen to reveal it.
   */
  testEventCode?: string | null;
}

export type PurchaseResult =
  | {
      sent: true;
      /**
       * Meta's own count of what it accepted. A 200 carrying `events_received: 0`,
       * or warnings in `messages`, is how Meta reports an event it took but will
       * not actually report on — indistinguishable from success unless read.
       */
      eventsReceived?: number;
      /** Identifies the exact request to Meta support. */
      fbTraceId?: string;
      /** Warnings Meta attached to an otherwise-accepted event. */
      messages?: string[];
    }
  | { sent: false; reason: string; detail?: string };

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** SHA-256 hex, which is the only hash Meta accepts for contact information. */
async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return toHex(digest);
}

/**
 * Meta matches on the hash, so normalisation has to happen before hashing or the
 * hash simply won't equal the one their side computed: trimmed and lower-cased.
 */
async function hashEmail(email: string): Promise<string | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized.includes("@")) return null;
  return await sha256Hex(normalized);
}

/** Drop empty strings so we never send a key whose value is meaningless. */
function clean(value: string | null | undefined): string | undefined {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Send a conversion event.
 *
 * Returns a result instead of throwing. `sent: false` means the caller should log
 * and carry on — never retry the payment, never undo an activation.
 *
 * The value passed in must be the GymTaxx access fee, never the deposit and
 * never the two added together. A deposit is the user's own refundable money;
 * reporting it as a sale would tell Meta to optimise against revenue that does
 * not exist.
 */
export async function sendConversionEvent(
  eventName: ConversionEventName,
  event: PurchaseEvent,
): Promise<PurchaseResult> {
  try {
    const accessToken = Deno.env.get("META_CAPI_ACCESS_TOKEN");
    if (!accessToken) {
      // Not an error: the integration is simply not configured yet.
      return { sent: false, reason: "not_configured" };
    }

    // A trial legitimately carries no money, so zero is valid for it alone.
    const allowsZero = eventName === "StartTrial";
    if (!Number.isFinite(event.value) || event.value < 0 || (!allowsZero && event.value <= 0)) {
      return { sent: false, reason: "invalid_value" };
    }

    // `external_id` is the user id, hashed. Meta only recommends hashing it, but
    // there's no upside to shipping our raw primary keys to an ad platform.
    const externalId = await sha256Hex(event.userId);
    const hashedEmail = event.email ? await hashEmail(event.email) : null;

    const userData: Record<string, string | string[]> = { external_id: [externalId] };
    if (hashedEmail) userData.em = [hashedEmail];

    // fbp/fbc/IP/user-agent are explicitly *not* hashed — Meta requires them raw.
    const fbp = clean(event.fbp);
    const fbc = clean(event.fbc);
    const clientIp = clean(event.clientIp);
    const clientUserAgent = clean(event.clientUserAgent);
    if (fbp) userData.fbp = fbp;
    if (fbc) userData.fbc = fbc;
    if (clientIp) userData.client_ip_address = clientIp;
    if (clientUserAgent) userData.client_user_agent = clientUserAgent;

    const payload: Record<string, unknown> = {
      data: [
        {
          event_name: eventName,
          event_time: event.eventTime,
          // Stripe's PaymentIntent id is stable across webhook redeliveries, so
          // Meta can collapse duplicates even if our own guard is bypassed.
          event_id: event.eventId,
          action_source: "website",
          event_source_url: "https://app.gymtaxx.com/pay",
          user_data: userData,
          custom_data: {
            value: event.value,
            currency: event.currency.toUpperCase(),
          },
        },
      ],
    };

    // Present only for the verification path, so the event lands in Test Events
    // rather than live reporting.
    const testEventCode = clean(event.testEventCode);
    if (testEventCode) payload.test_event_code = testEventCode;

    const response = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${PIXEL_ID}/events?access_token=${encodeURIComponent(accessToken)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );

    // Read the body on success as well as on failure. Meta answers 200 both when
    // it will report an event and when it has quietly discarded one, and the only
    // things separating those cases are `events_received` and `messages`.
    const rawBody = await response.text().catch(() => "");

    if (!response.ok) {
      return {
        sent: false,
        reason: `http_${response.status}`,
        detail: rawBody.slice(0, 500),
      };
    }

    let eventsReceived: number | undefined;
    let fbTraceId: string | undefined;
    let messages: string[] | undefined;
    try {
      const parsed = JSON.parse(rawBody) as {
        events_received?: number;
        fbtrace_id?: string;
        messages?: unknown[];
      };
      if (typeof parsed.events_received === "number") eventsReceived = parsed.events_received;
      if (typeof parsed.fbtrace_id === "string") fbTraceId = parsed.fbtrace_id;
      if (Array.isArray(parsed.messages) && parsed.messages.length > 0) {
        messages = parsed.messages.map((entry) =>
          typeof entry === "string" ? entry : JSON.stringify(entry),
        );
      }
    } catch {
      // An unparseable body doesn't change the outcome: Meta still answered 200.
    }

    // Logged on success too. Previously only failures were recorded, so an event
    // Meta accepted but never reported left nothing behind to investigate.
    console.log(
      `meta: ${eventName} accepted`,
      JSON.stringify({
        eventId: event.eventId,
        value: event.value,
        currency: event.currency.toUpperCase(),
        eventsReceived,
        fbTraceId,
        messages,
        mode: testEventCode ? "test_events" : "live",
      }),
    );

    return { sent: true, eventsReceived, fbTraceId, messages };
  } catch (err) {
    return {
      sent: false,
      reason: "request_failed",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Purchase, kept as its own name because it is by far the most common call. */
export function sendPurchaseEvent(event: PurchaseEvent): Promise<PurchaseResult> {
  return sendConversionEvent("Purchase", event);
}

/**
 * Pull the payer's IP and user agent off a request.
 *
 * Only meaningful on a request made by the actual person. Calling this on the
 * Stripe webhook would record Stripe's data centre and HTTP client, which is
 * worse than sending nothing — Meta would match a real purchase to a machine.
 */
export function attributionFromRequest(req: Request): {
  clientIp?: string;
  clientUserAgent?: string;
} {
  // x-forwarded-for is a chain; the original client is the first entry.
  const forwarded = req.headers.get("x-forwarded-for") ?? "";
  const clientIp = clean(forwarded.split(",")[0]);
  const clientUserAgent = clean(req.headers.get("user-agent"));
  return { clientIp, clientUserAgent };
}

/**
 * Minor units to major units for Meta's `value`.
 *
 * Safe for this app because both supported currencies (GBP, USD) are two-decimal.
 * A zero-decimal currency such as JPY would need a different divisor.
 */
export function minorToMajor(amountMinor: number): number {
  return Math.round(amountMinor) / 100;
}
