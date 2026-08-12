import {
  AuthError,
  corsHeaders,
  createAdminClient,
  json,
  requireAuth,
} from "../_shared/auth.ts";

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

type ReviewRequest = {
  action?: "list" | "decide";
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

    if (body.action === "decide") {
      const { submissionId, decision } = body;
      if (!submissionId || (decision !== "verified" && decision !== "rejected")) {
        return json({ error: "invalid_request" }, 422);
      }

      const reason =
        decision === "rejected" && body.reason ? String(body.reason).slice(0, 200) : null;

      const { error } = await admin
        .from("workout_submissions")
        .update({
          status: decision,
          rejection_reason: reason,
          reviewed_at: new Date().toISOString(),
          reviewed_by: user.id,
        })
        .eq("id", submissionId);

      if (error) {
        console.error("review-workouts: decision failed", submissionId, error.message);
        return json({ error: "update_failed" }, 500);
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
