/**
 * Onboarding answers.
 *
 * These are captured before anyone has an account, so they live in local storage
 * until sign-up, at which point what the database can hold gets written to the
 * profile. On iPhone an installed app has its own private storage, which is
 * exactly why the whole flow runs *inside* the installed app — answers given in
 * Safari would not survive the install.
 *
 * Note the habit answers are not a subset of what
 * `profiles.current_workouts_per_week` accepts — that column has a check
 * constraint from the iOS app's shorter list, and "Never" and "5 or more" have
 * no value in it. Nothing writes the habit answer to the database today, so this
 * is harmless, but that constraint needs widening before anything does.
 */

import { type WeeklyGoal } from "./money";

export type HabitId = "never" | "onOff" | "one" | "two" | "three" | "four" | "fivePlus";

export type HabitOption = {
  id: HabitId;
  label: string;
};

export const HABIT_OPTIONS: HabitOption[] = [
  { id: "never", label: "I'm currently not going to the gym" },
  { id: "onOff", label: "On and off" },
  { id: "one", label: "1 time per week" },
  { id: "two", label: "2 times per week" },
  { id: "three", label: "3 times per week" },
  { id: "four", label: "4 times per week" },
  { id: "fivePlus", label: "5 or more times per week" },
];

/**
 * A habit answer as a number of workouts a week, for the four-week comparison.
 *
 * "On and off" is counted as one. It has no true number, and the honest reading
 * of someone who describes their gym habit that way is closer to one than to
 * two — better to understate their current rate than to overstate it.
 */
export function habitPerWeek(habit: HabitId | null): number {
  switch (habit) {
    case "never":
      return 0;
    case "onOff":
    case "one":
      return 1;
    case "two":
      return 2;
    case "three":
      return 3;
    case "four":
      return 4;
    case "fivePlus":
      return 5;
    default:
      return 1;
  }
}

export type BlockerId = "procrastination" | "distractions" | "anxiety" | "discipline";

export type BlockerOption = {
  id: BlockerId;
  /** The obstacle in one word, so the list can be scanned rather than read. */
  label: string;
  /** How it actually plays out, in the person's own terms. */
  detail: string;
};

export const BLOCKER_OPTIONS: BlockerOption[] = [
  { id: "procrastination", label: "Procrastination", detail: "I keep saying tomorrow." },
  { id: "distractions", label: "Distractions", detail: "Like phone, TV, and sleep." },
  { id: "anxiety", label: "Scared of the gym", detail: "I find the gym intimidating." },
  { id: "discipline", label: "No motivation", detail: "I want to go but I can't get myself to go." },
];

export type MotivationId = "lose_weight" | "build_muscle" | "health" | "discipline";

export type MotivationOption = { id: MotivationId; label: string };

export const MOTIVATION_OPTIONS: MotivationOption[] = [
  { id: "lose_weight", label: "I want to lose weight" },
  { id: "build_muscle", label: "I want to build muscle" },
  { id: "health", label: "I want to get stronger, fitter and healthier" },
  { id: "discipline", label: "I want to build discipline" },
];

export type StrugglingId = "always" | "months" | "years";

export type StrugglingOption = { id: StrugglingId; label: string; detail: string };

export const STRUGGLING_OPTIONS: StrugglingOption[] = [
  { id: "always", label: "Since I started going to the gym", detail: "I have never been consistent." },
  { id: "months", label: "A couple of months", detail: "I was consistent before." },
  { id: "years", label: "Many years", detail: "It has been a long time since I was consistent." },
];

export type CommitmentId = "very" | "somewhat" | "little" | "none";

export type CommitmentOption = { id: CommitmentId; label: string };

export const COMMITMENT_OPTIONS: CommitmentOption[] = [
  { id: "very", label: "Very committed" },
  { id: "somewhat", label: "Somewhat committed" },
  { id: "little", label: "A little bit committed" },
  { id: "none", label: "Not committed at all" },
];

export type OnboardingAnswers = {
  habit: HabitId | null;
  goal: WeeklyGoal | null;
  blocker: BlockerId | null;
  motivation: MotivationId | null;
  struggling: StrugglingId | null;
  commitment: CommitmentId | null;
};

const STORAGE_KEY = "gymtaxx.onboarding";

export const EMPTY_ANSWERS: OnboardingAnswers = {
  habit: null,
  goal: null,
  blocker: null,
  motivation: null,
  struggling: null,
  commitment: null,
};

function isHabitId(value: unknown): value is HabitId {
  return HABIT_OPTIONS.some((option) => option.id === value);
}

function isBlockerId(value: unknown): value is BlockerId {
  return BLOCKER_OPTIONS.some((option) => option.id === value);
}

function isMotivationId(value: unknown): value is MotivationId {
  return MOTIVATION_OPTIONS.some((option) => option.id === value);
}

function isStrugglingId(value: unknown): value is StrugglingId {
  return STRUGGLING_OPTIONS.some((option) => option.id === value);
}

function isCommitmentId(value: unknown): value is CommitmentId {
  return COMMITMENT_OPTIONS.some((option) => option.id === value);
}

/**
 * Read saved answers, discarding any that no longer exist.
 *
 * The options have been reworded since the first release, so a returning phone
 * can hold an id that isn't on the list any more. Validating here means those
 * come back as unanswered rather than as an invisible selection.
 */
export function loadAnswers(): OnboardingAnswers {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_ANSWERS;
    const parsed = JSON.parse(raw) as Partial<OnboardingAnswers>;
    return {
      habit: isHabitId(parsed.habit) ? parsed.habit : null,
      goal: parsed.goal ?? null,
      blocker: isBlockerId(parsed.blocker) ? parsed.blocker : null,
      motivation: isMotivationId(parsed.motivation) ? parsed.motivation : null,
      struggling: isStrugglingId(parsed.struggling) ? parsed.struggling : null,
      commitment: isCommitmentId(parsed.commitment) ? parsed.commitment : null,
    };
  } catch (error) {
    console.error("onboarding: could not read saved answers", error);
    return EMPTY_ANSWERS;
  }
}

export function saveAnswers(answers: OnboardingAnswers): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(answers));
  } catch (error) {
    // Private browsing can refuse writes; the flow must still work in memory.
    console.error("onboarding: could not save answers", error);
  }
}
