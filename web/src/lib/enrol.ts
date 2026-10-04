import { CHALLENGE_WEEKS, isWeeklyGoal } from "./money";
import { loadAnswers } from "./onboarding";
import { ensureParticipation } from "./participation";
import { supabase } from "./supabase";
import { recordQuestionsAnswered } from "./telemetry";
import { decideChallenge, type ChallengeKind } from "./trial";

/**
 * Turn the answers held on the phone into a real enrolment.
 *
 * The whole flow now runs before anyone has an account, so this is the moment
 * everything they chose anonymously becomes theirs: the questions are marked as
 * answered, and the challenge they configured is created against their new
 * account at the goal they picked.
 *
 * Which challenge they join — the 7-day trial week or the standard month — is
 * decided in one shared place (`decideChallenge`), the same function the
 * screens read their terms from, so what they were shown is what gets created.
 *
 * Runs immediately after sign-up, and again as a safety net at the paywall if
 * that first attempt failed — the deposit is priced from the participation row,
 * so nobody can be allowed to reach payment without one.
 */
export async function enrolFromAnswers(userId: string): Promise<ChallengeKind> {
  const answers = loadAnswers();
  const goal = answers.goal && isWeeklyGoal(answers.goal) ? answers.goal : 4;

  // Fire-and-forget: this is funnel measurement, and it must never be the reason
  // an enrolment fails.
  void recordQuestionsAnswered();

  const decision = await decideChallenge(userId);
  if (!decision) throw new Error("no live challenge to join");

  // Someone who came back to redo the flow may already have an unpaid row for
  // THIS challenge; that gets reused and re-priced rather than stacking up
  // abandoned records. An unpaid row for a different challenge — a trial left
  // unpaid while the flag was off, say — is deliberately left alone rather
  // than silently re-priced into terms they never saw.
  const { data: existing } = await supabase
    .from("user_challenges")
    .select("*")
    .eq("challenge_status", "active")
    .eq("challenge_id", decision.challenge.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  await ensureParticipation({
    userId,
    challengeId: decision.challenge.id,
    goal,
    weeks: decision.challenge.number_of_weeks ?? CHALLENGE_WEEKS,
    existing: existing ?? null,
  });

  return decision.kind;
}

export interface EnrolResult {
  enrolled: boolean;
  /** The terms they were enrolled on. A trial goes straight to payment. */
  kind: ChallengeKind | null;
}

/**
 * Enrol without letting a failure block navigation.
 *
 * Used straight after sign-up, where the person has just handed over an email
 * and must not be dead-ended by a network blip. The paywall retries this before
 * letting anyone through to payment, so a false here is recoverable.
 */
export async function enrolQuietly(userId: string): Promise<EnrolResult> {
  try {
    const kind = await enrolFromAnswers(userId);
    return { enrolled: true, kind };
  } catch (error) {
    console.error("enrol: could not create participation", error);
    return { enrolled: false, kind: null };
  }
}
