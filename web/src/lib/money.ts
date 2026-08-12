/**
 * Money, mirroring the iOS `Currency` type.
 *
 * The UK sees pounds, everyone else sees dollars, and the *numbers are the
 * same* (5 per workout either way) — only the label changes. The currency is
 * fixed on the participation record when someone joins, so a refund always goes
 * back in the currency that came in.
 */

export type CurrencyCode = "gbp" | "usd";

export const REWARD_PER_WORKOUT = 5;
export const CHALLENGE_WEEKS = 4;

/** Weekly goals on offer. Two a week is too easy to be a real commitment. */
export const WEEKLY_GOALS = [3, 4, 5] as const;
export type WeeklyGoal = (typeof WEEKLY_GOALS)[number];

export function isWeeklyGoal(value: number): value is WeeklyGoal {
  return WEEKLY_GOALS.includes(value as WeeklyGoal);
}

/** Never throws on an unfamiliar value — a money label must not break a screen. */
export function currencyFrom(stored: string | null | undefined): CurrencyCode {
  return String(stored ?? "").toLowerCase() === "usd" ? "usd" : "gbp";
}

/** The currency a new joiner is priced in, from their browser's region. */
export function currencyForRegion(): CurrencyCode {
  try {
    const locale = new Intl.Locale(navigator.language);
    const region = locale.region ?? "";
    return region === "GB" ? "gbp" : "usd";
  } catch {
    return "usd";
  }
}

export function currencySymbol(code: CurrencyCode): string {
  return code === "gbp" ? "£" : "$";
}

/** "£80" — whole pounds/dollars, because every amount here is a whole number. */
export function formatMoney(amount: number, code: CurrencyCode): string {
  return `${currencySymbol(code)}${Math.round(amount).toLocaleString("en-GB")}`;
}

/** Total workouts required across the whole challenge. */
export function totalWorkouts(goal: number, weeks: number = CHALLENGE_WEEKS): number {
  return goal * weeks;
}

/** deposit = goal per week x weeks x reward per workout. Matches the server. */
export function depositFor(goal: number, weeks: number = CHALLENGE_WEEKS): number {
  return totalWorkouts(goal, weeks) * REWARD_PER_WORKOUT;
}
