/**
 * The challenge length someone picked while building their challenge.
 *
 * A sibling of `planChoice.ts` and deliberately the same shape: the choice is
 * held on the device between the builder and enrolment rather than written to
 * the participation row, because `user_challenges` grants clients no UPDATE
 * policy — deliberately, since that row decides what they are charged.
 *
 * The choice is again a hint rather than a fact: the value is validated
 * against the known lengths, and enrolment only uses it to *select* a real
 * `challenges` row, whose own terms (weeks, reward) are what get priced. The
 * worst a tampered value can do is pick a different real length at that
 * length's real price.
 */

import { isChallengeWeeks, type ChallengeWeeks } from "./money";

const STORAGE_KEY = "gymtaxx.weeks";

export function loadLengthChoice(): ChallengeWeeks | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw === null ? null : Number(raw);
    return isChallengeWeeks(parsed) ? parsed : null;
  } catch (error) {
    console.error("length: could not read saved choice", error);
    return null;
  }
}

export function saveLengthChoice(weeks: ChallengeWeeks): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(weeks));
  } catch (error) {
    // Private browsing refuses writes; the flow still works for this session.
    console.error("length: could not save choice", error);
  }
}
