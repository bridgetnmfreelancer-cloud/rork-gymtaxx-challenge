import {
  AuthError,
  corsHeaders,
  createAdminClient,
  json,
  requireAuth,
} from "../_shared/auth.ts";

/**
 * The operator's funnel.
 *
 * Answers one question: of the people who arrive, where do they stop? Ad spend
 * is being pointed at the top of this funnel daily, so the cost of guessing is
 * real money.
 *
 * Locked down the same way as the review queue, for the same reason — it
 * returns other people's email addresses:
 *
 * 1. The caller must be on the admin allowlist. Everyone else gets 404, even
 *    with a perfectly valid session.
 * 2. The underlying `admin_funnel_rows` function reads auth.users, so execute
 *    on it is granted to service_role only. A participant holding a real token
 *    cannot reach it directly either.
 *
 * Read-only throughout. Nothing here can change a deposit, a goal or a review.
 */

/** Emails allowed to see the funnel, comma-separated. Empty means nobody. */
function adminEmails(): string[] {
  return (Deno.env.get("ADMIN_EMAILS") ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
}

/** Every day boundary is the operator's day, not the participant's. */
const REPORT_ZONE = "Europe/London";

type Parts = Record<string, string>;

function zonedParts(at: Date, timeZone: string): Parts {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts: Parts = {};
  for (const part of formatter.formatToParts(at)) {
    if (part.type !== "literal") parts[part.type] = part.value;
  }
  return parts;
}

/** How far the zone is from UTC at a given instant, in milliseconds. */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const p = zonedParts(instant, timeZone);
  const asUTC = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour),
    Number(p.minute),
    Number(p.second),
  );
  return asUTC - instant.getTime();
}

/**
 * Midnight in London, `daysBack` days ago.
 *
 * Resolved twice because the first correction can land on the other side of a
 * clock change, which would otherwise put the boundary an hour out twice a year.
 */
function londonMidnightDaysAgo(daysBack: number): Date {
  const now = new Date();
  const p = zonedParts(now, REPORT_ZONE);
  const wall = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day)) - daysBack * 86_400_000;
  let instant = wall - zoneOffsetMs(new Date(wall), REPORT_ZONE);
  instant = wall - zoneOffsetMs(new Date(instant), REPORT_ZONE);
  return new Date(instant);
}

/** The London calendar date an instant falls on, as YYYY-MM-DD. */
function londonDate(at: Date): string {
  const p = zonedParts(at, REPORT_ZONE);
  return `${p.year}-${p.month}-${p.day}`;
}

type FunnelRow = {
  user_id: string;
  email: string | null;
  signed_up_at: string;
  last_sign_in_at: string | null;
  installed_at: string | null;
  last_seen_at: string | null;
  has_device: boolean;
  answered: boolean;
  has_challenge: boolean;
  goal: number | null;
  payment_status: string | null;
  currency: string | null;
  time_zone: string | null;
  submissions: number;
  verified: number;
};

/**
 * Whether this account ever reached the home screen.
 *
 * `installed_at` is the honest signal but only exists from the day it shipped,
 * so a registered push device stands in for older accounts. That is a floor,
 * not a certainty: someone who installed and then declined reminders leaves no
 * trace at all. The client reports how much of the number is inferred.
 */
function isInstalled(row: FunnelRow): boolean {
  return row.installed_at !== null || row.has_device;
}

function isPaid(row: FunnelRow): boolean {
  return row.payment_status === "paid";
}

/** Furthest point reached, for the per-person list. */
function stageOf(row: FunnelRow): string {
  if (row.submissions > 0) return "logged_workout";
  if (isPaid(row)) return "paid";
  if (row.has_challenge) return "built";
  if (row.answered) return "answered";
  if (isInstalled(row)) return "installed";
  return "signed_up";
}

type Stage = { key: string; label: string; count: number };

function buildStages(rows: FunnelRow[]): Stage[] {
  return [
    { key: "signed_up", label: "Signed up", count: rows.length },
    { key: "installed", label: "Added to home screen", count: rows.filter(isInstalled).length },
    { key: "answered", label: "Answered the questions", count: rows.filter((r) => r.answered).length },
    { key: "built", label: "Built a challenge", count: rows.filter((r) => r.has_challenge).length },
    { key: "paid", label: "Paid the deposit", count: rows.filter(isPaid).length },
    { key: "logged_workout", label: "Logged a workout", count: rows.filter((r) => r.submissions > 0).length },
  ];
}

type Step = {
  from: string;
  to: string;
  entered: number;
  continued: number;
  lost: number;
  /** Share of the people who reached `from` that did not reach `to`. */
  dropPercent: number;
};

function buildSteps(stages: Stage[]): Step[] {
  const steps: Step[] = [];
  for (let i = 0; i < stages.length - 1; i += 1) {
    const entered = stages[i].count;
    const continued = stages[i + 1].count;
    const lost = Math.max(entered - continued, 0);
    steps.push({
      from: stages[i].label,
      to: stages[i + 1].label,
      entered,
      continued,
      lost,
      dropPercent: entered === 0 ? 0 : Math.round((lost / entered) * 100),
    });
  }
  return steps;
}

type DayBucket = { date: string; signups: number; installs: number; built: number; paid: number };

function buildByDay(rows: FunnelRow[]): DayBucket[] {
  const buckets = new Map<string, DayBucket>();
  for (const row of rows) {
    const date = londonDate(new Date(row.signed_up_at));
    const bucket = buckets.get(date) ?? { date, signups: 0, installs: 0, built: 0, paid: 0 };
    bucket.signups += 1;
    if (isInstalled(row)) bucket.installs += 1;
    if (row.has_challenge) bucket.built += 1;
    if (isPaid(row)) bucket.paid += 1;
    buckets.set(date, bucket);
  }
  return [...buckets.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
}

/** Country is only ever known once a device or a challenge records a zone. */
function buildPlaces(rows: FunnelRow[]): { place: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const place = row.time_zone ?? "Unknown";
    counts.set(place, (counts.get(place) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([place, count]) => ({ place, count }))
    .sort((a, b) => b.count - a.count);
}

type StatsRequest = { days?: number };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { user } = await requireAuth(req);

    const allowed = adminEmails();
    const email = (user.email ?? "").toLowerCase();
    if (allowed.length === 0 || !allowed.includes(email)) {
      // Deliberately not "you are not an admin" — no need to confirm what this
      // endpoint is to someone probing it.
      return json({ error: "not_found" }, 404);
    }

    const body = (await req.json().catch(() => ({}))) as StatsRequest;
    // 1 means "today so far". 0 means everything, which is what a launch-week
    // operator actually wants as a baseline.
    const days = [0, 1, 7, 30].includes(Number(body.days)) ? Number(body.days) : 1;
    const since = days === 0 ? new Date(0) : londonMidnightDaysAgo(days - 1);

    const admin = createAdminClient();
    const { data, error } = await admin.rpc("admin_funnel_rows", { p_since: since.toISOString() });

    if (error) {
      console.error("funnel-stats: query failed", error);
      return json({ error: "query_failed" }, 500);
    }

    const rows = (data ?? []) as FunnelRow[];
    const stages = buildStages(rows);
    const steps = buildSteps(stages);

    // The same funnel, but starting from people who reached the home screen.
    // This is the one that says whether installing actually helps someone pay.
    const installedRows = rows.filter(isInstalled);
    const installedStages = buildStages(installedRows).filter((stage) => stage.key !== "signed_up");
    const installedSteps = buildSteps(installedStages);

    const notInstalledRows = rows.filter((row) => !isInstalled(row));

    return json({
      since: since.toISOString(),
      days,
      stages,
      steps,
      installed: {
        stages: installedStages,
        steps: installedSteps,
        /** For comparison: how far people get when they never install. */
        notInstalledPaid: notInstalledRows.filter(isPaid).length,
        notInstalledTotal: notInstalledRows.length,
      },
      /** How much of the install number is a real signal rather than inferred. */
      installConfidence: {
        confirmed: rows.filter((row) => row.installed_at !== null).length,
        inferredFromReminders: rows.filter((row) => row.installed_at === null && row.has_device).length,
      },
      byDay: buildByDay(rows),
      places: buildPlaces(rows),
      people: rows.map((row) => ({
        email: row.email,
        signedUpAt: row.signed_up_at,
        stage: stageOf(row),
        installed: isInstalled(row),
        hasDevice: row.has_device,
        goal: row.goal,
        currency: row.currency,
        paymentStatus: row.payment_status,
        place: row.time_zone,
        submissions: row.submissions,
        verified: row.verified,
      })),
    });
  } catch (err) {
    if (err instanceof AuthError) return json({ error: "unauthorized" }, 401);
    console.error("funnel-stats: unexpected failure", err);
    return json({ error: "unexpected" }, 500);
  }
});
