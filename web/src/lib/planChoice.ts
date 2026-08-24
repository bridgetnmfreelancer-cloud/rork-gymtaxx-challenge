/**
 * The plan someone picked on the paywall.
 *
 * Held on the device between the paywall and the payment screen rather than
 * written to their participation row, because `user_challenges` grants clients
 * no UPDATE policy — deliberately, since that row decides what they are charged.
 * The choice travels to `create-deposit-payment`, which validates it, prices it
 * server-side and records it with the service role.
 *
 * Treating this as a hint rather than a fact is the point: the worst a tampered
 * value can do is select a different real plan, and the server then charges the
 * real price of that plan.
 */

import { isPlanId, type PlanId } from "./plans";

const STORAGE_KEY = "gymtaxx.plan";

export function loadPlanChoice(): PlanId | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return isPlanId(raw) ? raw : null;
  } catch (error) {
    console.error("plan: could not read saved choice", error);
    return null;
  }
}

export function savePlanChoice(plan: PlanId): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, plan);
  } catch (error) {
    // Private browsing refuses writes; the flow still works for this session.
    console.error("plan: could not save choice", error);
  }
}

export function clearPlanChoice(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error("plan: could not clear choice", error);
  }
}
