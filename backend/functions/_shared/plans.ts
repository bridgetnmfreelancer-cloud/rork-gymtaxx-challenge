/**
 * The GymTaxx access plans — server copy.
 *
 * This is the authority for money. `web/src/lib/plans.ts` mirrors it so the
 * paywall can show the right numbers, but every amount actually charged is
 * computed here, from the plan id stored on the participation row. The client
 * never sends a price.
 *
 * The deposit and the plan fee are separate kinds of money and stay separate:
 * the deposit is the user's own refundable commitment, the fee is GymTaxx
 * revenue. They may travel in one card charge, but only the fee is ever
 * reported to Meta as a purchase value.
 */

export type PlanId = "one_challenge" | "monthly" | "annual" | "lifetime";

export type PlanInterval = "one_off" | "month" | "year";

export interface Plan {
  id: PlanId;
  name: string;
  /** Minor units (999 = 9.99). Same number in both supported currencies. */
  priceMinor: number;
  interval: PlanInterval;
  /**
   * Fee by challenge length, for the one-off plan priced per length. A length
   * without an entry — or no map at all — falls back to `priceMinor`.
   */
  pricesByWeeksMinor?: Partial<Record<number, number>>;
  /**
   * Always false: the free-first-challenge perk is no longer offered to new
   * subscribers. The field survives so the resolver's shape (and the webhook's
   * `startsFree` plumbing) is untouched — accounts that joined under the perk
   * keep their stored terms on their profile.
   */
  offersFreeChallenge: boolean;
}

const PLANS: Record<PlanId, Plan> = {
  monthly: {
    id: "monthly",
    name: "GymTaxx Monthly",
    priceMinor: 799,
    interval: "month",
    offersFreeChallenge: false,
  },
  annual: {
    id: "annual",
    name: "GymTaxx Annual",
    priceMinor: 5999,
    interval: "year",
    offersFreeChallenge: false,
  },
  one_challenge: {
    id: "one_challenge",
    name: "GymTaxx One Challenge",
    priceMinor: 999,
    interval: "one_off",
    pricesByWeeksMinor: { 1: 299, 2: 499 },
    offersFreeChallenge: false,
  },
  lifetime: {
    id: "lifetime",
    name: "GymTaxx Lifetime",
    priceMinor: 11999,
    interval: "one_off",
    offersFreeChallenge: false,
  },
};

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(PLANS, value);
}

export function planById(id: PlanId): Plan {
  return PLANS[id];
}

export interface PlanPricing {
  plan: Plan;
  /** What to add to today's charge for access. Zero on a free first challenge. */
  feeMinor: number;
  /** True when a subscription should be created with a trial rather than billed now. */
  startsFree: boolean;
  /** True when this plan should create a Stripe subscription at all. */
  isRecurring: boolean;
}

/**
 * Resolve what this person actually pays for access today.
 *
 * `weeks` is the length of the challenge being joined, read from its
 * `challenges` row — the same row that priced the deposit, so the fee and the
 * deposit can never disagree about the terms. It only moves the one-off plan's
 * price (1 week £2.99, 2 weeks £4.99, 4 weeks £9.99); subscriptions cover any
 * length at their own price.
 *
 * The free first challenge is once per account, ever. This is re-checked here
 * rather than trusted from the paywall: the participation row is client-writable,
 * so somebody could otherwise select a trial plan repeatedly and take an endless
 * run of free challenges. No plan offers the perk any more, so `startsFree` is
 * always false — the check stays for the accounts that hold a stored stamp and
 * for the webhook plumbing behind it.
 */
export function resolvePlanPricing(id: PlanId, freeChallengeUsed: boolean, weeks?: number): PlanPricing {
  const plan = planById(id);
  const startsFree = plan.offersFreeChallenge && !freeChallengeUsed;
  const feeMinor = startsFree ? 0 : (plan.pricesByWeeksMinor?.[weeks ?? -1] ?? plan.priceMinor);
  return {
    plan,
    feeMinor,
    startsFree,
    isRecurring: plan.interval === "month" || plan.interval === "year",
  };
}

/** Stripe's `recurring[interval]` value for a subscription plan. */
export function stripeInterval(plan: Plan): "month" | "year" | null {
  if (plan.interval === "month") return "month";
  if (plan.interval === "year") return "year";
  return null;
}

/**
 * How long access lasts for a plan that is not a subscription.
 *
 * `one_challenge` is spent on the challenge it was bought for, so it has no
 * expiry date of its own. Lifetime never expires.
 */
export function isPerpetual(plan: Plan): boolean {
  return plan.id === "lifetime";
}
