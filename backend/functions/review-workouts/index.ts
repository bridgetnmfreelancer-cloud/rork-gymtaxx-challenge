import {
  AuthError,
  corsHeaders,
  createAdminClient,
  json,
  requireAuth,
} from "../_shared/auth.ts";
import { currentWeekStart, safeZone } from "../_shared/gymweek.ts";
import { notifyUser } from "../_shared/push.ts";

const PROOF_BUCKET = "workout-proofs";
/** How long a proof photo link stays valid for the reviewer. */
const SIGNED_URL_TTL_SECONDS = 60 * 30;

/**
 * The review queue, and the decision that moves money.
 *
 * Every workout is approved by hand at this volume, so this endpoint is the
 * operator's tool rather than anything a participant touches. Two things make
 * that safe:
 *
 * 1. The caller must be on the admin allowlist. Everyone else gets 403, even
 *    with a perfectly valid session.
 * 2. Only `status`, `rejection_reason`, `reviewed_at` and `reviewed_by` can be
 *    written. Nothing here can alter a deposit, a goal, or a challenge date.
 *
 * Approving does not transfer money by itself — refunds are issued by hand in
 * the Stripe Dashboard. It records what has been earned, which is what the
 * participant's dashboard reads.
 */

/** Emails allowed to review, comma-separated. Empty means nobody can review. */
function adminEmails(): string[] {
  return (Deno.env.get("ADMIN_EMAILS") ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
}

type Admin = ReturnType<typeof createAdminClient>;

/** Used only if a challenge row somehow predates the reward column. */
const FALLBACK_REWARD = 5;

/**
 * Tells the participant what was decided about their proof.
 *
 * Waiting on a human review is the one part of the app nobody can see progress
 * on, so the decision is worth interrupting someone for either way — an approval
 * because it is the moment money comes back, a rejection because it is only
 * fixable while there is still week left.
 *
 * Swallows every error it can raise. The decision is already recorded by the time
 * this runs, and a failed notification must never make a successful review look
 * like it failed.
 */
async function notifyDecision(
  admin: Admin,
  userId: string,
  participationId: string,
  decision: "verified" | "rejected",
  reason: string | null,
): Promise<void> {
  try {
    if (decision === "rejected") {
      await notifyUser(admin, userId, {
        title: "Workout not approved",
        body: reason
          ? `${reason} \u2014 log another from the gym and we'll take another look.`
          : "Log another one from the gym and we'll take another look.",
        url: "/history",
        tag: "gymtaxx-review",
      });
      return;
    }

    const { data: participation } = await admin
      .from("user_challenges")
      .select("goal_workouts_per_week, time_zone, currency, challenges(reward_per_workout)")
      .eq("id", participationId)
      .maybeSingle();

    const challenge = Array.isArray(participation?.challenges)
      ? participation?.challenges[0]
      : participation?.challenges;

    const reward = Number(challenge?.reward_per_workout ?? FALLBACK_REWARD);
    const symbol = String(participation?.currency ?? "gbp").toLowerCase() === "usd" ? "$" : "\u00A3";
    const goal = Number(participation?.goal_workouts_per_week ?? 0);

    const weekStart = currentWeekStart(new Date(), safeZone(participation?.time_zone));
    const { count } = await admin
      .from("workout_submissions")
      .select("id", { count: "exact", head: true })
      .eq("user_challenge_id", participationId)
      .eq("status", "verified")
      .gte("captured_at", weekStart.toISOString());

    const done = count ?? 0;
    const earned = `${symbol}${reward} earned back.`;

    await notifyUser(admin, userId, {
      title: "Workout approved \u2705",
      body:
        goal > 0 && done >= goal
          ? `${earned} That's the week complete \u2014 ${done} of ${goal}.`
          : `${earned} ${done} of ${goal} done this week.`,
      url: "/home",
      tag: "gymtaxx-review",
    });
  } catch (err) {
    console.error("review-workouts: decision notification failed", err);
  }
}

type ReviewRequest = {
  action?: "list" | "decide" | "whoami" | "test_activate" | "test_reset";
  submissionId?: string;
  decision?: "verified" | "rejected";
  reason?: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { user } = await requireAuth(req);

    const allowed = adminEmails();
    const email = (user.email ?? "").toLowerCase();
    if (allowed.length === 0 || !allowed.includes(email)) {
      // Deliberately not "you are not an admin" — no need to confirm the
      // endpoint's purpose to someone probing it.
      return json({ error: "not_found" }, 404);
    }

    const body = (await req.json().catch(() => ({}))) as ReviewRequest;
    const admin = createAdminClient();

    // Lets the client show operator-only controls. Reaching this line already
    // proves the caller is on the allowlist.
    if (body.action === "whoami") {
      return json({ isAdmin: true, email });
    }

    /**
     * Open the caller's OWN challenge without taking a deposit.
     *
     * Everything past the payment screen — the dashboard, camera proof, the
     * review queue, approvals — is unreachable until a participation is marked
     * paid, so testing the app used to mean making a real charge on live Stripe
     * keys and refunding it by hand.
     *
     * Scoped to the caller's own row and gated on the admin allowlist, so it is
     * not a way to give anyone else a free challenge. `stripe_payment_intent_id`
     * is deliberately left untouched: a test participation carries no intent, so
     * it can never be confused with a real one during a refund.
     */
    if (body.action === "test_activate" || body.action === "test_reset") {
      const paid = body.action === "test_activate";

      const { data: participation, error: readError } = await admin
        .from("user_challenges")
        .select("id")
        .eq("user_id", user.id)
        .eq("challenge_status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (readError) {
        console.error("review-workouts: test toggle read failed", readError.message);
        return json({ error: "read_failed" }, 500);
      }
      if (!participation) return json({ error: "no_participation" }, 404);

      const { error: updateError } = await admin
        .from("user_challenges")
        .update({ payment_status: paid ? "paid" : "unpaid" })
        .eq("id", participation.id);

      if (updateError) {
        console.error("review-workouts: test toggle failed", updateError.message);
        return json({ error: "update_failed" }, 500);
      }

      console.log(`review-workouts: test mode ${paid ? "on" : "off"} for ${email}`);
      return json({ status: "ok", paid });
    }

    if (body.action === "decide") {
      const { submissionId, decision } = body;
      if (!submissionId || (decision !== "verified" && decision !== "rejected")) {
        return json({ error: "invalid_request" }, 422);
      }

      const reason =
        decision === "rejected" && body.reason ? String(body.reason).slice(0, 200) : null;

      const { data: reviewed, error } = await admin
        .from("workout_submissions")
        .update({
          status: decision,
          rejection_reason: reason,
          reviewed_at: new Date().toISOString(),
          reviewed_by: user.id,
        })
        .eq("id", submissionId)
        .select("user_id, user_challenge_id")
        .maybeSingle();

      if (error) {
        console.error("review-workouts: decision failed", submissionId, error.message);
        return json({ error: "update_failed" }, 500);
      }

      if (reviewed) {
        await notifyDecision(
          admin,
          reviewed.user_id,
          reviewed.user_challenge_id,
          decision,
          reason,
        );
      }

      return json({ status: "ok" });
    }

    // Default: the pending queue, oldest first so nobody waits longest twice.
    const { data: rows, error } = await admin
      .from("workout_submissions")
      .select(
        "id, user_id, captured_at, created_at, storage_path, latitude, longitude, location_accuracy_m, location_status, user_challenges(goal_workouts_per_week, time_zone, currency)",
      )
      .eq("status", "pending")
      .order("captured_at", { ascending: true })
      .limit(50);

    if (error) {
      console.error("review-workouts: queue read failed", error.message);
      return json({ error: "read_failed" }, 500);
    }

    // Proof photos live in a private bucket, so each needs a short-lived link.
    const items = await Promise.all(
      (rows ?? []).map(async (row) => {
        const { data: signed } = await admin.storage
          .from(PROOF_BUCKET)
          .createSignedUrl(row.storage_path, SIGNED_URL_TTL_SECONDS);

        const participation = Array.isArray(row.user_challenges)
          ? row.user_challenges[0]
          : row.user_challenges;

        return {
          id: row.id,
          userId: row.user_id,
          capturedAt: row.captured_at,
          submittedAt: row.created_at,
          latitude: row.latitude,
          longitude: row.longitude,
          accuracyM: row.location_accuracy_m,
          locationStatus: row.location_status,
          timeZone: participation?.time_zone ?? "Europe/London",
          photoUrl: signed?.signedUrl ?? null,
        };
      }),
    );

    return json({ items });
  } catch (err) {
    if (err instanceof AuthError) return json({ error: "unauthorized" }, 401);
    console.error("review-workouts failed", err);
    return json({ error: "internal_error" }, 500);
  }
});
