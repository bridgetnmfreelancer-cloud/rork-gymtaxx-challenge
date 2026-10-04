import type { ChallengeRow } from "./database.types";
import { supabase } from "./supabase";

/** Which challenge terms apply — the 7-day trial week or the standard month. */
export type ChallengeKind = "trial" | "standard";

export interface ChallengeDecision {
  challenge: ChallengeRow;
  kind: ChallengeKind;
}

const TRIAL_FLAG_KEY = "trial_week_enabled";

/**
 * Whether the 7-day trial experiment is switched on.
 *
 * Read from the `app_config` row the operator flips with one SQL command — no
 * deploy to turn the experiment off. Any read error fails closed, so a broken
 * config row can never open an unintended free path.
 */
export async function isTrialEnabled(): Promise<boolean> {
  const { data, error } = await supabase
    .from("app_config")
    .select("value")
    .eq("key", TRIAL_FLAG_KEY)
    .maybeSingle();
  if (error) {
    console.error("trial: could not read flag", error.message);
    return false;
  }
  return data?.value === "on";
}

/**
 * Which challenge this person is joining, decided in one place.
 *
 * Flag on AND no **paid** trial in the account's history → the trial week;
 * everyone else gets the newest standard challenge, exactly as before.
 * Membership and payment history are irrelevant to eligibility — a returning
 * user, a paying member, a grandfathered account: none of them can be offered
 * a new initial trial, ever. An unpaid trial row is a resume, not a burned
 * trial; only the deposit clearing burns it.
 *
 * `userId` may be null on the pre-signup screens, where eligibility is simply
 * the flag: an anonymous visitor has no trial history yet.
 *
 * A trial-history read error fails toward standard, never toward the trial —
 * showing standard terms to someone eligible costs nothing, the reverse
 * quietly gives a free week away.
 */
export async function decideChallenge(userId: string | null): Promise<ChallengeDecision | null> {
  const enabled = await isTrialEnabled();

  let hasPaidTrial = false;
  let historyUsable = true;

  if (userId) {
    const { data: rows, error } = await supabase
      .from("user_challenges")
      .select("id, payment_status, challenges!inner(challenge_type)")
      .eq("user_id", userId)
      .eq("challenges.challenge_type", "trial_week")
      .order("created_at", { ascending: false });
    if (error) {
      console.error("trial: could not read trial history", error.message);
      historyUsable = false;
    } else {
      for (const row of rows ?? []) {
        if (row.payment_status === "paid") hasPaidTrial = true;
      }
    }
  }

  if (enabled && historyUsable && !hasPaidTrial) {
    const { data: trial, error } = await supabase
      .from("challenges")
      .select("*")
      .eq("challenge_type", "trial_week")
      .maybeSingle();
    if (error) console.error("trial: could not read trial challenge", error.message);
    if (trial) return { challenge: trial, kind: "trial" };
  }

  const { data: standard, error } = await supabase
    .from("challenges")
    .select("*")
    .eq("challenge_type", "standard")
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return standard ? { challenge: standard, kind: "standard" } : null;
}

/** Friendly copy for a `trial-actions` error code, for a toast. */
export function trialErrorCopy(code: string): string {
  switch (code) {
    case "no_trial":
      return "We couldn't find your trial week.";
    case "already_repeated":
      return "You've already had your second-chance week.";
    case "refund_in_progress":
      return "Your refund is already on its way back.";
    case "already_refunded":
    case "carried_row":
      return "Your deposit has already been sorted.";
    case "week_in_progress":
      return "A week is already running.";
    case "nothing_ended":
      return "Nothing to refund yet.";
    default:
      return "Something went wrong. Check your connection and try again.";
  }
}
