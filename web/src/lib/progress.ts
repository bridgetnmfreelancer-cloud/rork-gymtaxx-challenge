import type { ChallengeRow, UserChallengeRow, WorkoutSubmissionRow } from "./database.types";
import { addWeeks, weekIndex } from "./gymweek";
import { CHALLENGE_WEEKS, REWARD_PER_WORKOUT, currencyFrom, depositFor, type CurrencyCode } from "./money";

/** Verification status of a submission, mirroring `WorkoutStatus` in Swift. */
export type WorkoutStatus = "pending" | "verified" | "rejected";

export function statusOf(row: WorkoutSubmissionRow): WorkoutStatus {
  const value = row.status;
  if (value === "verified" || value === "rejected") return value;
  return "pending";
}

/** Why a check-in does or doesn't carry a position, mirroring `LocationStatus`. */
export type LocationState = "located" | "approximate" | "no_signal" | "denied" | "unknown";

export type ChallengeProgress = {
  currency: CurrencyCode;
  rewardPerWorkout: number;
  goalPerWeek: number;
  totalWeeks: number;
  /** 1-based, clamped so a late viewer never sees "week 5 of 4". */
  currentWeek: number;
  start: Date;
  end: Date;
  /** End of the week in play — the deadline shown on the dashboard. */
  weekEnds: Date;
  verifiedThisWeek: number;
  pendingThisWeek: number;
  verifiedTotal: number;
  earned: number;
  deposit: number;
  /** Still to be earned. Never negative, even if review over-approves. */
  remaining: number;
  isComplete: boolean;
};

/**
 * Everything the dashboard needs, derived in one place.
 *
 * Money is derived from *verified* submissions only: a pending photo has not
 * earned anything yet, and showing it as earned would be a promise we might
 * have to take back at review.
 */
export function computeProgress({
  participation,
  challenge,
  submissions,
  now = new Date(),
}: {
  participation: UserChallengeRow;
  challenge: ChallengeRow | null;
  submissions: WorkoutSubmissionRow[];
  now?: Date;
}): ChallengeProgress {
  const zone = participation.time_zone;
  const totalWeeks = challenge?.number_of_weeks ?? CHALLENGE_WEEKS;
  const reward = Number(challenge?.reward_per_workout ?? REWARD_PER_WORKOUT);
  const goalPerWeek = participation.goal_workouts_per_week;

  const start = new Date(participation.started_at);
  const end = new Date(participation.ends_at);

  const currentWeek = weekIndex(start, now, totalWeeks);
  const weekFrom = addWeeks(start, currentWeek - 1, zone);
  const weekEnds = addWeeks(start, currentWeek, zone);

  const inThisWeek = submissions.filter((row) => {
    const at = new Date(row.captured_at);
    return at >= weekFrom && at < weekEnds;
  });

  const verifiedThisWeek = inThisWeek.filter((row) => statusOf(row) === "verified").length;
  const pendingThisWeek = inThisWeek.filter((row) => statusOf(row) === "pending").length;
  const verifiedTotal = submissions.filter((row) => statusOf(row) === "verified").length;

  const deposit = depositFor(goalPerWeek, totalWeeks);
  const earned = Math.min(verifiedTotal * reward, deposit);

  return {
    currency: currencyFrom(participation.currency),
    rewardPerWorkout: reward,
    goalPerWeek,
    totalWeeks,
    currentWeek,
    start,
    end,
    weekEnds,
    verifiedThisWeek,
    pendingThisWeek,
    verifiedTotal,
    earned,
    deposit,
    remaining: Math.max(deposit - earned, 0),
    isComplete: now >= end,
  };
}

/**
 * Whether a workout can be logged right now.
 *
 * One a day is the rule: it stops a single gym trip being photographed three
 * times, and it matches how the manual version has always been run.
 */
export function alreadyLoggedToday(submissions: WorkoutSubmissionRow[], zone: string, now = new Date()): boolean {
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: zone, dateStyle: "short" });
  const today = formatter.format(now);
  return submissions.some((row) => {
    if (statusOf(row) === "rejected") return false;
    return formatter.format(new Date(row.captured_at)) === today;
  });
}

/** "Sunday 11:59pm" — the deadline as people read it. */
export function formatDeadline(weekEnds: Date, zone: string, locale: string): string {
  // The week boundary is the *start* of the next day, so step back a minute to
  // land on the Sunday people actually recognise.
  const lastMoment = new Date(weekEnds.getTime() - 60_000);
  const day = new Intl.DateTimeFormat(locale, { timeZone: zone, weekday: "long" }).format(lastMoment);
  return `${day} 11:59pm`;
}
