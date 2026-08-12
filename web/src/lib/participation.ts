import { addWeeks, currentZone, weeklyStart } from "./gymweek";
import { currencyForRegion } from "./money";
import { supabase } from "./supabase";
import type { UserChallengeRow } from "./database.types";

/**
 * Enrol the signed-in user in a challenge, before any money moves.
 *
 * Payment status and challenge status are deliberately omitted so the server
 * defaults apply — RLS only accepts `unpaid` + `active` from a client, so a user
 * can never mark their own deposit as paid.
 *
 * The start is snapped forward to the next Monday on *their* clock. If the
 * deposit then lands in a later week, the Stripe webhook re-anchors both dates,
 * so nobody begins a challenge whose first week is already over.
 */
export async function createParticipation({
  userId,
  challengeId,
  goal,
  weeks,
}: {
  userId: string;
  challengeId: string;
  goal: number;
  weeks: number;
}): Promise<UserChallengeRow> {
  const zone = currentZone();
  const start = weeklyStart(new Date(), zone);
  const end = addWeeks(start, weeks, zone);

  const { data, error } = await supabase
    .from("user_challenges")
    .insert({
      user_id: userId,
      challenge_id: challengeId,
      goal_workouts_per_week: goal,
      started_at: start.toISOString(),
      ends_at: end.toISOString(),
      currency: currencyForRegion(),
      time_zone: zone,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Reuse an unpaid participation rather than stacking up abandoned rows.
 *
 * People bounce off the payment screen and come back later; without this, each
 * return trip would leave another dead record and the deposit function reads
 * only the newest one.
 */
export async function ensureParticipation({
  userId,
  challengeId,
  goal,
  weeks,
  existing,
}: {
  userId: string;
  challengeId: string;
  goal: number;
  weeks: number;
  existing: UserChallengeRow | null;
}): Promise<UserChallengeRow> {
  if (existing && existing.payment_status === "unpaid") {
    if (existing.goal_workouts_per_week === goal) return existing;

    // They changed their mind about the goal before paying, so the deposit
    // amount changes with it.
    const { data, error } = await supabase
      .from("user_challenges")
      .update({ goal_workouts_per_week: goal })
      .eq("id", existing.id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  return createParticipation({ userId, challengeId, goal, weeks });
}
