/**
 * The join-up flow, as one ordered list.
 *
 * Every screen between the first question and the plan picker reports its
 * position from here, so the progress bar fills once, continuously, from the
 * opening screen to the moment they pay. It used to be counted per file, which
 * meant the bar filled during the questions and then reset to near-empty at the
 * challenge builder — reading, to anyone watching it, as though they'd gone
 * backwards or been handed a second form to fill in.
 *
 * Keeping the order in one place also makes the length of the flow a single
 * visible fact rather than something spread across seven components.
 */
export const FLOW_STEPS = [
  "problem",
  "mechanism",
  "habit",
  "goal",
  "blocker",
  "motivation",
  "struggling",
  "summary",
  "reminders",
  "challenge",
  "commit",
  "commitment",
  "proof",
  "account",
  "plan",
] as const;

export type FlowStep = (typeof FLOW_STEPS)[number];

/** Position of a screen in the flow, ready to spread onto `StepProgress`. */
export function flowProgress(step: FlowStep): { step: number; total: number } {
  return { step: FLOW_STEPS.indexOf(step) + 1, total: FLOW_STEPS.length };
}
