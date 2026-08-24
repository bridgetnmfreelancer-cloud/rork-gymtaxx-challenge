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
  /** True when the first challenge is free and the card is saved, not charged. */
  offersFreeChallenge: boolean;
}

const PLANS: Record<PlanId, Plan> = {
  monthly: {
    id: "monthly",
    name: "GymTaxx Monthly",
    priceMinor: 799,
    interval: "month",
    offersFreeChallenge: true,
  },
  annual: {
    id: "annual",
    name: "GymTaxx Annual",
    priceMinor: 5999,
    interval: "year",
    offersFreeChallenge: true,
  },
  one_challenge: {
    id: "one_challenge",
    name: "GymTaxx One Challenge",
    priceMinor: 999,
    interval: "one_off",
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
 * The free first challenge is once per account, ever. This is re-checked here
 * rather than trusted from the paywall: the participation row is client-writable,
 * so somebody could otherwise select a trial plan repeatedly and take an endless
 * run of free challenges. Someone who has already had theirs pays the first
 * period up front and gets no trial.
 */
export function resolvePlanPricing(id: PlanId, freeChallengeUsed: boolean): PlanPricing {
  const plan = planById(id);
  const startsFree = plan.offersFreeChallenge && !freeChallengeUsed;
  return {
    plan,
    feeMinor: startsFree ? 0 : plan.priceMinor,
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
