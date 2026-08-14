/**
 * Onboarding answers.
 *
 * These are captured before anyone pays, so they live in local storage until
 * there's a reason to write them to the profile.
 *
 * Note the habit answers are no longer a subset of what
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
  { id: "never", label: "Never" },
  { id: "onOff", label: "On and off" },
  { id: "one", label: "1 time per week" },
  { id: "two", label: "2 times per week" },
  { id: "three", label: "3 times per week" },
  { id: "four", label: "4 times per week" },
  { id: "fivePlus", label: "5 or more times per week" },
];

export type BlockerId = "discipline" | "procrastination" | "distractions" | "anxiety";

export type BlockerOption = {
  id: BlockerId;
  /** The obstacle in one word, so the list can be scanned rather than read. */
  label: string;
  /** How it actually plays out, in the person's own terms. */
  detail: string;
};

export const BLOCKER_OPTIONS: BlockerOption[] = [
  { id: "discipline", label: "Discipline", detail: "I want to go but I don't have the motivation." },
  { id: "procrastination", label: "Procrastination", detail: "I promise myself but I don't end up going." },
  { id: "distractions", label: "Distractions", detail: "Phone, TV, friends, or other tasks." },
  { id: "anxiety", label: "Anxiety", detail: "I find the gym intimidating." },
];

export type OnboardingAnswers = {
  habit: HabitId | null;
  goal: WeeklyGoal | null;
  blocker: BlockerId | null;
};

const STORAGE_KEY = "gymtaxx.onboarding";

export const EMPTY_ANSWERS: OnboardingAnswers = { habit: null, goal: null, blocker: null };

function isHabitId(value: unknown): value is HabitId {
  return HABIT_OPTIONS.some((option) => option.id === value);
}

function isBlockerId(value: unknown): value is BlockerId {
  return BLOCKER_OPTIONS.some((option) => option.id === value);
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
