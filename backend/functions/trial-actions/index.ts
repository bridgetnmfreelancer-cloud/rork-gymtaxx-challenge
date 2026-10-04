import {
  AuthError,
  corsHeaders,
  createAdminClient,
  json,
  requireAuth,
} from "../_shared/auth.ts";
import { addWeeks, safeZone, weeklyStart } from "../_shared/gymweek.ts";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * The participant's own trial actions.
 *
 * Two things a person can decide for themselves at the end of a trial week,
 * both of which only ever flip a status or create a row that is already paid.
 * No money moves here: the single Stripe charge from week one is refunded by
 * hand in the Stripe Dashboard, exactly like every other deposit.
 *
 * - `repeat-week` — accept the one second-chance week. Week two starts fresh at
 *   zero workouts and its result alone decides the final refundable amount;
 *   nothing is ever combined across the two weeks. Week one's row is marked
 *   `carried` so the operator refunds against week two's figure only.
 * - `request-refund` — record that the person has asked for their deposit back,
 *   so the finished list shows the request even before the review.
 *
 * Every eligibility check here is on the account's own trial history, and the
 * two-week ceiling is backed by a partial unique index in the database itself —
 * a double-tap or a race cannot create a third week.
 */

interface RequestBody {
  action?: unknown;
}

/** The account's trial rows, read with the joined challenge type. */
interface TrialRow {
  id: string;
  challenge_id: string;
  goal_workouts_per_week: number;
  payment_status: string;
  challenge_status: string;
  started_at: string;
  ends_at: string;
  currency: string;
  time_zone: string;
  deposit_minor: number | null;
  refund_status: string;
  repeat_of: string | null;
}

async function readTrialRows(admin: Admin, userId: string): Promise<TrialRow[]> {
  const { data, error } = await admin
    .from("user_challenges")
    .select(
      "id, challenge_id, goal_workouts_per_week, payment_status, challenge_status, started_at, ends_at, currency, time_zone, deposit_minor, refund_status, repeat_of, challenges!inner(challenge_type)",
    )
    .eq("user_id", userId)
    .eq("challenges.challenge_type", "trial_week")
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as unknown as TrialRow[];
}

/**
 * Accept the second-chance week.
 *
 * Eligibility, checked in order so the error names the real reason:
 * one paid initial trial, never repeated, not refunded or refund-requested,
 * and no week currently live. The second week is created **already paid** with
 * the same deposit and challenge terms, dated from the Monday at the moment of
 * acceptance — never from week one's dates.
 */
async function repeatWeek(admin: Admin, userId: string): Promise<Response> {
  const rows = await readTrialRows(admin, userId);

  const initial = rows.find((row) => row.payment_status === "paid" && row.repeat_of === null);
  if (!initial) return json({ error: "no_trial" }, 422);

  if (rows.some((row) => row.repeat_of !== null)) {
    return json({ error: "already_repeated" }, 422);
  }

  if (initial.refund_status === "refunded" || initial.refund_status === "requested") {
    // A refund in flight means the money is on its way back; week two would be
    // a promise to refund twice. The standard flow is the way back in.
    return json({ error: "refund_in_progress" }, 422);
  }

  const now = new Date();
  const liveWeek = rows.find(
    (row) =>
      row.payment_status === "paid" &&
      row.challenge_status === "active" &&
      new Date(row.ends_at) > now,
  );
  if (liveWeek) return json({ error: "week_in_progress" }, 422);

  const depositMinor = initial.deposit_minor ?? 0;
  if (depositMinor <= 0) return json({ error: "invalid_deposit" }, 422);

  // The database's partial unique index is the hard ceiling; this update's
  // guard is the readable one. Either refusing means the row moved under us
  // (refunded, requested) between the read and the write — refuse then too.
  const { data: carried, error: carryError } = await admin
    .from("user_challenges")
    .update({ refund_status: "carried" })
    .eq("id", initial.id)
    .eq("refund_status", "pending")
    .select("id")
    .maybeSingle();

  if (carryError) {
    console.error("trial-actions: carry update failed", initial.id, carryError.message);
    return json({ error: "update_failed" }, 500);
  }
  if (!carried) return json({ error: "refund_in_progress" }, 422);

  const zone = safeZone(initial.time_zone);
  const startedAt = weeklyStart(now, zone);
  const endsAt = addWeeks(startedAt, 1, zone);

  const { data: created, error: insertError } = await admin
    .from("user_challenges")
    .insert({
      user_id: userId,
      challenge_id: initial.challenge_id,
      goal_workouts_per_week: initial.goal_workouts_per_week,
      started_at: startedAt.toISOString(),
      ends_at: endsAt.toISOString(),
      currency: initial.currency,
      time_zone: initial.time_zone,
      // Already paid: the original charge covers both weeks. No intent id —
      // the refund at the end of week two goes against week one's charge.
      payment_status: "paid",
      challenge_status: "active",
      repeat_of: initial.id,
      deposit_minor: depositMinor,
      fee_minor: 0,
      plan: null,
    })
    .select("id, started_at, ends_at")
    .single();

  if (insertError) {
    // 23505 is the partial unique index: a second chance already exists for
    // this account, most likely from a double-tap. Return the row that beat us.
    if ((insertError as { code?: string }).code === "23505") {
      const existing = rows.find((row) => row.repeat_of !== null);
      if (existing) return json({ status: "ok", alreadyRepeated: true, id: existing.id });
    }

    // The carry write already happened; unwind it so the account reads exactly
    // as it did before this request rather than half-transitioned.
    console.error("trial-actions: repeat insert failed", initial.id, insertError.message);
    await admin.from("user_challenges").update({ refund_status: "pending" }).eq("id", initial.id);
    return json({ error: "insert_failed" }, 500);
  }

  return json({ status: "ok", participation: created });
}

/**
 * Record a refund request on the account's most recent ended paid **trial** week.
 *
 * Joined and pinned to trial rows, so a standard challenge can never be marked
 * `requested` from here even if a client asks at the wrong moment.
 *
 * Marks `requested` — never `refunded`; the money itself is moved by hand in
 * Stripe and then recorded through the operator screen as usual. A `carried`
 * row is refused: it is superseded by its repeat week, and refunding it as well
 * would pay the person twice.
 */
async function requestRefund(admin: Admin, userId: string): Promise<Response> {
  const { data: rows, error: readError } = await admin
    .from("user_challenges")
    .select("id, refund_status, challenges!inner(challenge_type)")
    .eq("user_id", userId)
    .eq("payment_status", "paid")
    .eq("challenge_status", "active")
    .eq("challenges.challenge_type", "trial_week")
    .lt("ends_at", new Date().toISOString())
    .order("ends_at", { ascending: false })
    .limit(1);

  if (readError) {
    console.error("trial-actions: refund request read failed", readError.message);
    return json({ error: "read_failed" }, 500);
  }

  const latest = (rows ?? [])[0] as { id: string; refund_status: string } | undefined;
  if (!latest) return json({ error: "nothing_ended" }, 422);
  if (latest.refund_status === "refunded") return json({ error: "already_refunded" }, 422);
  if (latest.refund_status === "carried") return json({ error: "carried_row" }, 422);
  if (latest.refund_status === "requested") return json({ status: "ok", refundStatus: "requested" });

  const { data: updated, error: updateError } = await admin
    .from("user_challenges")
    .update({ refund_status: "requested" })
    .eq("id", latest.id)
    .eq("refund_status", "pending")
    .select("id")
    .maybeSingle();

  if (updateError) {
    console.error("trial-actions: refund request update failed", latest.id, updateError.message);
    return json({ error: "update_failed" }, 500);
  }
  if (!updated) return json({ error: "state_changed" }, 409);

  return json({ status: "ok", refundStatus: "requested" });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { user } = await requireAuth(req);
    const body = (await req.json().catch(() => ({}))) as RequestBody;

    const admin = createAdminClient();
    if (body.action === "repeat-week") return await repeatWeek(admin, user.id);
    if (body.action === "request-refund") return await requestRefund(admin, user.id);

    return json({ error: "unknown_action" }, 400);
  } catch (err) {
    if (err instanceof AuthError) return json({ error: "unauthorized" }, 401);
    console.error("trial-actions failed", err);
    return json({ error: "internal_error" }, 500);
  }
});
