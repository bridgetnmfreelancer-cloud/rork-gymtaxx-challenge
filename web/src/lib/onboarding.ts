/**
 * Onboarding answers, mirroring `OnboardingModels.swift`.
 *
 * These are captured before anyone pays, so they live in local storage until
 * there's a reason to write them to the profile. The habit value must match the
 * strings the iOS app already writes to `profiles.current_workouts_per_week`.
 */

import { type WeeklyGoal } from "./money";

export type HabitId = "none" | "once" | "twice" | "three" | "fourPlus";

export type HabitOption = {
  id: HabitId;
  label: string;
  /** Stored in `profiles.current_workouts_per_week`. */
  dbValue: string;
  /** Rough weekly count, used to work out the gap on the result screen. */
  approxPerWeek: number;
};

export const HABIT_OPTIONS: HabitOption[] = [
  { id: "none", label: "Not at all right now", dbValue: "inconsistent", approxPerWeek: 0 },
  { id: "once", label: "About once a week", dbValue: "1_per_week", approxPerWeek: 1 },
  { id: "twice", label: "About twice a week", dbValue: "2_per_week", approxPerWeek: 2 },
  { id: "three", label: "About three times a week", dbValue: "3_per_week", approxPerWeek: 3 },
  { id: "fourPlus", label: "Four or more times a week", dbValue: "4_plus_per_week", approxPerWeek: 4 },
];

export type BlockerId = "motivation" | "procrastinate" | "tired" | "busy" | "tomorrow" | "other";

export type BlockerOption = {
  id: BlockerId;
  label: string;
  /** Used verbatim on the result screen, so it must read as a full sentence. */
  mirror: string;
};

export const BLOCKER_OPTIONS: BlockerOption[] = [
  { id: "motivation", label: "I lose motivation", mirror: "Motivation hasn't closed that gap." },
  { id: "procrastinate", label: "I procrastinate", mirror: "Putting it off hasn't closed that gap." },
  { id: "tired", label: "I'm too tired", mirror: "Waiting to feel rested hasn't closed that gap." },
  { id: "busy", label: "Life gets busy", mirror: "Waiting for a quiet week hasn't closed that gap." },
  { id: "tomorrow", label: "I keep saying \u201ctomorrow\u201d", mirror: "\u201cTomorrow\u201d hasn't closed that gap." },
  { id: "other", label: "Something else", mirror: "Whatever you've tried hasn't closed that gap." },
];

export type OnboardingAnswers = {
  habit: HabitId | null;
  goal: WeeklyGoal | null;
  blocker: BlockerId | null;
};

const STORAGE_KEY = "gymtaxx.onboarding";

export const EMPTY_ANSWERS: OnboardingAnswers = { habit: null, goal: null, blocker: null };

export function loadAnswers(): OnboardingAnswers {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_ANSWERS;
    const parsed = JSON.parse(raw) as Partial<OnboardingAnswers>;
    return {
      habit: parsed.habit ?? null,
      goal: parsed.goal ?? null,
      blocker: parsed.blocker ?? null,
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

export function habitById(id: HabitId | null): HabitOption | null {
  return HABIT_OPTIONS.find((option) => option.id === id) ?? null;
}

export function blockerById(id: BlockerId | null): BlockerOption | null {
  return BLOCKER_OPTIONS.find((option) => option.id === id) ?? null;
}
