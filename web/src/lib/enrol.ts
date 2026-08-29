import { CHALLENGE_WEEKS, isWeeklyGoal } from "./money";
import { loadAnswers } from "./onboarding";
import { ensureParticipation } from "./participation";
import { supabase } from "./supabase";
import { recordQuestionsAnswered } from "./telemetry";

/**
 * Turn the answers held on the phone into a real enrolment.
 *
 * The whole flow now runs before anyone has an account, so this is the moment
 * everything they chose anonymously becomes theirs: the questions are marked as
 * answered, and the challenge they configured is created against their new
 * account at the goal they picked.
 *
 * Runs immediately after sign-up, and again as a safety net at the paywall if
 * that first attempt failed — the deposit is priced from the participation row,
 * so nobody can be allowed to reach payment without one.
 */
export async function enrolFromAnswers(userId: string): Promise<void> {
  const answers = loadAnswers();
  const goal = answers.goal && isWeeklyGoal(answers.goal) ? answers.goal : 4;

  // Fire-and-forget: this is funnel measurement, and it must never be the reason
  // an enrolment fails.
  void recordQuestionsAnswered();

  const { data: challenge, error: challengeError } = await supabase
    .from("challenges")
    .select("*")
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (challengeError) throw challengeError;
  if (!challenge) throw new Error("no live challenge to join");

  // Someone who came back to redo the flow may already have an unpaid row; that
  // gets reused and re-priced rather than stacking up abandoned records.
  const { data: existing } = await supabase
    .from("user_challenges")
    .select("*")
    .eq("challenge_status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  await ensureParticipation({
    userId,
    challengeId: challenge.id,
    goal,
    weeks: challenge.number_of_weeks ?? CHALLENGE_WEEKS,
    existing: existing ?? null,
  });
}

/**
 * Enrol without letting a failure block navigation.
 *
 * Used straight after sign-up, where the person has just handed over an email
 * and must not be dead-ended by a network blip. The paywall retries this before
 * letting anyone through to payment, so a false here is recoverable.
 */
export async function enrolQuietly(userId: string): Promise<boolean> {
  try {
    await enrolFromAnswers(userId);
    return true;
  } catch (error) {
    console.error("enrol: could not create participation", error);
    return false;
  }
}
