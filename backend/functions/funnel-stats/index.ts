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

type VisitRow = {
  visitor_id: string;
  first_seen_at: string;
  landed_at: string | null;
  tapped_join_at: string | null;
  reached_install_at: string | null;
  reached_signup_at: string | null;
  signed_up_at: string | null;
  source: string | null;
  campaign: string | null;
  referrer_host: string | null;
  is_standalone: boolean;
  is_in_app_browser: boolean;
};

/**
 * The anonymous funnel, built only from browser visits.
 *
 * Rows flagged standalone come from the installed app, which on iPhone gets its
 * own storage and therefore its own visitor id. Mixing them in would count one
 * person twice and make the arrivals numbers meaningless.
 *
 * The funnel itself starts at the landing page rather than at "arrived",
 * because someone opening the bare domain goes straight to the install steps
 * and never sees the landing page. Counting them as having dropped out of a
 * page they were never shown would invent a leak that isn't there.
 */
function buildArrivals(visits: VisitRow[]) {
  const browser = visits.filter((visit) => !visit.is_standalone);
  const landed = browser.filter((visit) => visit.landed_at !== null);

  const stages: Stage[] = [
    { key: "landed", label: "Saw the landing page", count: landed.length },
    { key: "tapped_join", label: "Tapped Join", count: landed.filter((v) => v.tapped_join_at !== null).length },
    {
      key: "reached_install",
      label: "Reached the install steps",
      count: landed.filter((v) => v.reached_install_at !== null).length,
    },
  ];

  const installed = visits.filter((visit) => visit.is_standalone);

  return {
    stages,
    steps: buildSteps(stages),
    /** Every browser visit, including people who skipped the landing page. */
    total: browser.length,
    /** Arrived straight at the install steps, usually from the marketing site. */
    skippedLanding: browser.length - landed.length,
    /**
     * Opened inside TikTok or Instagram, where "Add to Home Screen" does not
     * exist at all. These people cannot install however good the page is.
     */
    inAppBrowser: browser.filter((visit) => visit.is_in_app_browser).length,
    /** Carried on without installing, via the "continue in browser" link. */
    continuedInBrowser: browser.filter((visit) => visit.reached_signup_at !== null).length,
    signedUpInBrowser: browser.filter((visit) => visit.signed_up_at !== null).length,
    /** Sign-ups that happened inside the installed app, counted separately. */
    fromInstalledApp: {
      reachedSignup: installed.filter((visit) => visit.reached_signup_at !== null).length,
      signedUp: installed.filter((visit) => visit.signed_up_at !== null).length,
    },
  };
}

/**
 * The whole journey on one ladder, from advert click to deposit paid.
 *
 * Deliberately spans two different measuring systems, because no single one can
 * see the whole thing. The first three rungs count anonymous browsers; the rest
 * count accounts. The join between them is the install, and on iPhone an
 * installed app is given its own private storage, so the person who installs
 * comes back indistinguishable from a stranger. Nothing can carry an id across
 * that gap.
 *
 * The practical consequence is that the step from "reached the install steps"
 * to "signed up" is the one number here that is an estimate rather than a
 * count, and it reads wrong whenever the two sides cover different periods —
 * visitor tracking started long after the first accounts existed. The client
 * says so on screen rather than letting it be read as a real leak.
 */
function buildJourney(visits: VisitRow[], rows: FunnelRow[]): { stages: Stage[]; steps: Step[] } {
  const browser = visits.filter((visit) => !visit.is_standalone);

  const stages: Stage[] = [
    { key: "landed", label: "Saw the landing page", count: browser.filter((v) => v.landed_at !== null).length },
    { key: "tapped_join", label: "Tapped Join", count: browser.filter((v) => v.tapped_join_at !== null).length },
    {
      key: "reached_install",
      label: "Reached the install steps",
      count: browser.filter((v) => v.reached_install_at !== null).length,
    },
    { key: "signed_up", label: "Signed up", count: rows.length },
    { key: "answered", label: "Answered the questions", count: rows.filter((r) => r.answered).length },
    {
      key: "built",
      label: "Started setting up their challenge",
      count: rows.filter((r) => r.has_challenge).length,
    },
    { key: "paid", label: "Paid the deposit", count: rows.filter(isPaid).length },
  ];

  return { stages, steps: buildSteps(stages) };
}

/** Which ad or link brought them, first touch only. */
function buildSources(visits: VisitRow[]): { source: string; visitors: number; reachedInstall: number }[] {
  const counts = new Map<string, { visitors: number; reachedInstall: number }>();
  for (const visit of visits) {
    if (visit.is_standalone) continue;
    const source = visit.source ?? visit.referrer_host ?? "Direct";
    const entry = counts.get(source) ?? { visitors: 0, reachedInstall: 0 };
    entry.visitors += 1;
    if (visit.reached_install_at !== null) entry.reachedInstall += 1;
    counts.set(source, entry);
  }
  return [...counts.entries()]
    .map(([source, entry]) => ({ source, ...entry }))
    .sort((a, b) => b.visitors - a.visitors);
}

type VisitDay = { date: string; arrivals: number; tappedJoin: number; reachedInstall: number; signedUp: number };

function buildVisitsByDay(visits: VisitRow[]): VisitDay[] {
  const buckets = new Map<string, VisitDay>();
  for (const visit of visits) {
    if (visit.is_standalone) continue;
    const date = londonDate(new Date(visit.first_seen_at));
    const bucket = buckets.get(date) ?? { date, arrivals: 0, tappedJoin: 0, reachedInstall: 0, signedUp: 0 };
    bucket.arrivals += 1;
    if (visit.tapped_join_at !== null) bucket.tappedJoin += 1;
    if (visit.reached_install_at !== null) bucket.reachedInstall += 1;
    if (visit.signed_up_at !== null) bucket.signedUp += 1;
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

    // Anonymous arrivals. Read with the service role because the table has no
    // policies at all — it is written through a function and read only here.
    // A failure to read visits must not take the whole funnel down, since the
    // account-level numbers are still useful on their own.
    const { data: visitData, error: visitError } = await admin
      .from("visits")
      .select(
        "visitor_id, first_seen_at, landed_at, tapped_join_at, reached_install_at, reached_signup_at, signed_up_at, source, campaign, referrer_host, is_standalone, is_in_app_browser",
      )
      .gte("first_seen_at", since.toISOString());

    if (visitError) console.error("funnel-stats: visits query failed", visitError);
    const visits = (visitData ?? []) as VisitRow[];

    // The first visit ever recorded, regardless of the range being viewed.
    // Without it the visitor numbers look catastrophic on the "All" range,
    // where accounts go back to launch but visits only go back to the day
    // tracking shipped.
    const { data: firstVisit } = await admin
      .from("visits")
      .select("first_seen_at")
      .order("first_seen_at", { ascending: true })
      .limit(1)
      .maybeSingle();

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
      journey: buildJourney(visits, rows),
      trackingStartedAt: firstVisit?.first_seen_at ?? null,
      arrivals: buildArrivals(visits),
      sources: buildSources(visits),
      visitsByDay: buildVisitsByDay(visits),
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
