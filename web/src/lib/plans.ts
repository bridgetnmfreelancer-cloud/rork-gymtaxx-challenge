/**
 * The GymTaxx access plans.
 *
 * Two kinds of money pass through this app and they must never be confused:
 *
 * - The **deposit** is the person's own commitment money. It is refundable, it
 *   is not revenue, and it is priced by `money.ts` from their weekly goal.
 * - The **plan fee** is what GymTaxx charges for access. It is revenue, and it
 *   is the only figure ever reported to Meta as a purchase value.
 *
 * Both can be taken in a single card charge, but they stay separated everywhere
 * else — in metadata, in reporting, and on screen.
 *
 * IMPORTANT: `backend/functions/_shared/plans.ts` is the server's copy of this
 * file and the two must be changed together. The server recomputes every amount
 * itself, so a drift here can only ever mislead the screen, never the charge.
 */

import type { CurrencyCode } from "./money";

export type PlanId = "one_challenge" | "monthly" | "annual" | "lifetime";

export type PlanInterval = "one_off" | "month" | "year";

export interface Plan {
  id: PlanId;
  /** Shown as the card's heading. */
  name: string;
  /** The recurring or one-off price, in major units. Same number either currency. */
  price: number;
  interval: PlanInterval;
  /** True when the first challenge is free and the card is only saved, not charged. */
  offersFreeChallenge: boolean;
  /** One line under the name explaining what they're actually getting. */
  detail: string;
  /** Ribbon text, when this plan is worth steering people towards. */
  badge?: string;
}

export const PLANS: readonly Plan[] = [
  {
    id: "monthly",
    name: "Monthly",
    price: 7.99,
    interval: "month",
    offersFreeChallenge: true,
    detail: "First challenge free, then £7.99 a month. Cancel any time.",
    // No badge: it is pre-selected by default, and Annual carries the steer.
  },
  {
    id: "annual",
    name: "Annual",
    price: 59.99,
    interval: "year",
    offersFreeChallenge: true,
    detail: "First challenge free, then £59.99 a year — about £5 a month.",
    badge: "Best value",
  },
  {
    id: "one_challenge",
    name: "One challenge",
    price: 9.99,
    interval: "one_off",
    offersFreeChallenge: false,
    detail: "This challenge only. No subscription.",
  },
  {
    id: "lifetime",
    name: "Lifetime",
    price: 119.99,
    interval: "one_off",
    offersFreeChallenge: false,
    detail: "Every challenge, for as long as GymTaxx runs. Paid once.",
    badge: "Founding member",
  },
] as const;

/** The two plans that lead the paywall, in the order they're shown. */
export const HEADLINE_PLAN_IDS: readonly PlanId[] = ["monthly", "annual"];

export function isPlanId(value: unknown): value is PlanId {
  return PLANS.some((plan) => plan.id === value);
}

export function planById(id: PlanId): Plan {
  const found = PLANS.find((plan) => plan.id === id);
  // Every caller passes a validated id, so this is a programming error.
  if (!found) throw new Error(`unknown plan: ${id}`);
  return found;
}

/**
 * What this person is charged for access *today*, in major units.
 *
 * A free first challenge is once per account, ever. Someone who has already had
 * theirs pays the first period up front instead of getting another one — the
 * server applies the same rule, so the screen and the charge cannot disagree.
 */
export function feeDueNow(plan: Plan, freeChallengeUsed: boolean): number {
  if (plan.offersFreeChallenge && !freeChallengeUsed) return 0;
  return plan.price;
}

/** True when this plan starts as a free challenge for this particular person. */
export function startsFree(plan: Plan, freeChallengeUsed: boolean): boolean {
  return plan.offersFreeChallenge && !freeChallengeUsed;
}

/** "a month" / "a year" / "" — the suffix after a price. */
export function intervalSuffix(interval: PlanInterval): string {
  if (interval === "month") return "a month";
  if (interval === "year") return "a year";
  return "once";
}

/**
 * Money with decimals, for fees.
 *
 * `formatMoney` in `money.ts` deliberately rounds to whole units because every
 * deposit is a whole number. Fees are not, so they need their own formatter
 * rather than a change that would put "£80.00" on the deposit screens.
 */
export function formatFee(amount: number, code: CurrencyCode): string {
  const symbol = code === "gbp" ? "£" : "$";
  return `${symbol}${amount.toFixed(2)}`;
}
