import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Copy, Download, Loader2, ShieldAlert, TrendingDown } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import { Screen, ScreenSubtitle, ScreenTitle } from "@/components/Screen";
import { suggestEmailFix } from "@/lib/email";
import { callFunction } from "@/lib/supabase";
import { cn } from "@/lib/utils";

type Stage = { key: string; label: string; count: number };

type Step = {
  from: string;
  to: string;
  entered: number;
  continued: number;
  lost: number;
  dropPercent: number;
};

type DayBucket = { date: string; signups: number; installs: number; built: number; paid: number };

type Place = { place: string; count: number };

type Arrivals = {
  stages: Stage[];
  steps: Step[];
  total: number;
  skippedLanding: number;
  inAppBrowser: number;
  continuedInBrowser: number;
  signedUpInBrowser: number;
  fromInstalledApp: { reachedSignup: number; signedUp: number };
};

type Source = { source: string; visitors: number; reachedInstall: number };

type VisitDay = { date: string; arrivals: number; tappedJoin: number; reachedInstall: number; signedUp: number };

type Person = {
  email: string | null;
  signedUpAt: string;
  stage: string;
  installed: boolean;
  hasDevice: boolean;
  goal: number | null;
  currency: string | null;
  paymentStatus: string | null;
  place: string | null;
  submissions: number;
  verified: number;
};

type Journey = { stages: Stage[]; steps: Step[] };

type MoneyTotals = { gbp: number; usd: number };

type Money = {
  /** Access fees that actually cleared. This is the real revenue. */
  revenue: MoneyTotals;
  /** Deposits being held on participants' behalf. Not income. */
  depositsHeld: MoneyTotals;
  planMix: { plan: string; count: number }[];
};

type Stats = {
  since: string;
  days: number;
  journey: Journey;
  trackingStartedAt: string | null;
  stages: Stage[];
  steps: Step[];
  installed: {
    stages: Stage[];
    steps: Step[];
    notInstalledPaid: number;
    notInstalledTotal: number;
  };
  installConfidence: { confirmed: number; inferredFromReminders: number };
  money: Money;
  arrivals: Arrivals;
  sources: Source[];
  visitsByDay: VisitDay[];
  byDay: DayBucket[];
  places: Place[];
  people: Person[];
};

const RANGES: { days: number; label: string }[] = [
  { days: 1, label: "Today" },
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 0, label: "All" },
];

const STAGE_NAMES: Record<string, string> = {
  signed_up: "Signed up",
  installed: "Installed",
  answered: "Answered questions",
  built: "Built a challenge",
  chose_plan: "Chose a plan",
  paid: "Paid",
  logged_workout: "Logged a workout",
};

/** Plan ids as they read on screen. "grandfathered" is not a plan anyone chose. */
const PLAN_NAMES: Record<string, string> = {
  monthly: "Monthly",
  annual: "Annual",
  one_challenge: "One challenge",
  lifetime: "Lifetime",
  grandfathered: "No plan (joined earlier)",
};

const EMPTY_MONEY: Money = {
  revenue: { gbp: 0, usd: 0 },
  depositsHeld: { gbp: 0, usd: 0 },
  planMix: [],
};

/** Minor units to a readable amount. Both supported currencies have two decimals. */
function money(minor: number, symbol: string): string {
  return `${symbol}${(minor / 100).toFixed(2)}`;
}

/** One currency's line, hidden entirely when there is nothing in it. */
function MoneyLine({ label, gbp, usd }: { label: string; gbp: number; usd: number }) {
  if (gbp === 0 && usd === 0) return null;
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular shrink-0 font-semibold text-foreground">
        {gbp > 0 ? money(gbp, "\u00a3") : null}
        {gbp > 0 && usd > 0 ? " \u00b7 " : null}
        {usd > 0 ? money(usd, "$") : null}
      </span>
    </div>
  );
}

const EMPTY_ARRIVALS: Arrivals = {
  stages: [],
  steps: [],
  total: 0,
  skippedLanding: 0,
  inAppBrowser: 0,
  continuedInBrowser: 0,
  signedUpInBrowser: 0,
  fromInstalledApp: { reachedSignup: 0, signedUp: 0 },
};

/**
 * Fill in anything the server didn't send.
 *
 * This screen reads deep into the response, and a single missing branch used to
 * take the entire page down to a white screen — which is exactly what happened
 * when the deployed function was a version behind the client that called it.
 * An analytics page failing to show one card is a nuisance; failing to render
 * at all looks like the whole thing is broken.
 */
function normalise(data: Partial<Stats> | undefined): Stats {
  return {
    since: data?.since ?? "",
    days: data?.days ?? 0,
    journey: {
      stages: data?.journey?.stages ?? [],
      steps: data?.journey?.steps ?? [],
    },
    trackingStartedAt: data?.trackingStartedAt ?? null,
    stages: data?.stages ?? [],
    steps: data?.steps ?? [],
    installed: {
      stages: data?.installed?.stages ?? [],
      steps: data?.installed?.steps ?? [],
      notInstalledPaid: data?.installed?.notInstalledPaid ?? 0,
      notInstalledTotal: data?.installed?.notInstalledTotal ?? 0,
    },
    installConfidence: {
      confirmed: data?.installConfidence?.confirmed ?? 0,
      inferredFromReminders: data?.installConfidence?.inferredFromReminders ?? 0,
    },
    money: data?.money ?? EMPTY_MONEY,
    arrivals: data?.arrivals ?? EMPTY_ARRIVALS,
    sources: data?.sources ?? [],
    visitsByDay: data?.visitsByDay ?? [],
    byDay: data?.byDay ?? [],
    places: data?.places ?? [],
    people: data?.people ?? [],
  };
}

/** "Europe/London" reads as "London" — the region prefix adds nothing here. */
function placeName(zone: string): string {
  const city = zone.includes("/") ? zone.slice(zone.lastIndexOf("/") + 1) : zone;
  return city.replace(/_/g, " ");
}

function dayLabel(date: string): string {
  const parsed = new Date(`${date}T12:00:00Z`);
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(parsed);
}

function timeLabel(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

/** One bar in a funnel, sized against the number who entered the funnel. */
function StageBar({ stage, top }: { stage: Stage; top: number }) {
  const share = top === 0 ? 0 : Math.round((stage.count / top) * 100);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium text-foreground">{stage.label}</p>
        <p className="shrink-0 text-sm text-muted-foreground">
          <span className="tabular font-semibold text-foreground">{stage.count}</span>
          {top > 0 ? <span className="tabular"> · {share}%</span> : null}
        </p>
      </div>
      <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-700 ease-out",
            stage.count === 0 ? "bg-muted" : "bg-success-ink",
          )}
          style={{ width: `${share}%` }}
        />
      </div>
    </div>
  );
}

/** The gap between two bars: how many stopped there, and how badly. */
function DropRow({ step, worst }: { step: Step; worst: boolean }) {
  if (step.lost === 0) {
    return (
      <p className="py-2 pl-3 text-xs text-muted-foreground">
        Everyone carried on
      </p>
    );
  }
  return (
    <p
      className={cn(
        "flex items-center gap-1.5 py-2 pl-3 text-xs",
        worst ? "font-semibold text-danger-ink" : "text-muted-foreground",
      )}
    >
      <TrendingDown className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="tabular">{step.lost}</span> stopped here
      <span className="tabular">({step.dropPercent}%)</span>
      {worst ? <span className="ml-1">· biggest leak</span> : null}
    </p>
  );
}

function Funnel({ stages, steps }: { stages: Stage[]; steps: Step[] }) {
  // Sized against the biggest rung rather than the first one. Normally they are
  // the same, but the whole-journey funnel mixes visitor counts with account
  // counts, and when visitor tracking is younger than the accounts a later rung
  // can legitimately be bigger than the first — which would otherwise draw a bar
  // several times wider than the card.
  const top = stages.reduce((max, stage) => Math.max(max, stage.count), 0);
  const worstLost = steps.reduce((max, step) => Math.max(max, step.lost), 0);
  // Only ever flag one step as the worst, even when two lose the same number.
  const worstIndex = steps.findIndex((step) => step.lost === worstLost && step.lost > 0);

  return (
    <div>
      {stages.map((stage, index) => (
        <div key={stage.key}>
          <StageBar stage={stage} top={top} />
          {index < steps.length ? <DropRow step={steps[index]} worst={index === worstIndex} /> : null}
        </div>
      ))}
    </div>
  );
}

/** A plain labelled number, for counts that sit outside the funnel bars. */
function Line({ label, value, muted = false }: { label: string; value: number; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className={muted ? "text-muted-foreground" : "text-foreground"}>{label}</span>
      <span className="tabular shrink-0 font-semibold text-foreground">{value}</span>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 rounded-lg bg-card p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/**
 * The operator's funnel screen.
 *
 * Not linked from anywhere in the app. The endpoint behind it returns 404 to
 * anyone not on the admin allowlist, so guessing the URL shows an empty state
 * rather than other people's email addresses.
 */
export default function Stats() {
  const [days, setDays] = useState<number>(1);

  const { data: raw, isLoading, isError } = useQuery({
    queryKey: ["funnel", days],
    queryFn: () => callFunction<Partial<Stats>>("funnel-stats", { days }),
    staleTime: 60_000,
    retry: 0,
  });

  const data = useMemo(() => normalise(raw), [raw]);

  const people = useMemo(() => data?.people ?? [], [data]);

  const emails = useMemo<string[]>(
    () => people.map((person) => person.email).filter((email): email is string => Boolean(email)),
    [people],
  );

  /**
   * Addresses that look mistyped.
   *
   * Sending to these is worse than pointless: every bounce chips away at the
   * sending reputation of the domain, which makes the reminders and password
   * resets that matter more likely to land in spam.
   */
  const suspect = useMemo<{ email: string; likely: string }[]>(
    () =>
      emails
        .map((email) => ({ email, likely: suggestEmailFix(email) }))
        .filter((row): row is { email: string; likely: string } => row.likely !== null),
    [emails],
  );

  const copyEmails = useCallback(async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(emails.join(", "));
      toast.success(`${emails.length} addresses copied`);
    } catch (error) {
      console.error("stats: clipboard refused", error);
      toast.error("Couldn't copy. Use the file instead.");
    }
  }, [emails]);

  const downloadCsv = useCallback((): void => {
    // Quoted so an address never breaks a column, and with the funnel stage
    // alongside it so the list can be segmented rather than blasted.
    const header = "email,signed_up,stage,place,goal,currency,reachable_by_reminder";
    const rows = people
      .filter((person) => person.email)
      .map((person) =>
        [
          person.email ?? "",
          person.signedUpAt,
          person.stage,
          person.place ?? "",
          person.goal ?? "",
          person.currency ?? "",
          person.hasDevice ? "yes" : "no",
        ]
          .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
          .join(","),
      );

    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `gymtaxx-signups-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [people]);

  if (isLoading) {
    return (
      <Screen>
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
        </div>
      </Screen>
    );
  }

  if (isError || !data) {
    return (
      <Screen>
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <ShieldAlert className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
          <ScreenTitle className="mt-6 text-title">Nothing here</ScreenTitle>
          <ScreenSubtitle>This page isn't available for your account.</ScreenSubtitle>
        </div>
      </Screen>
    );
  }

  const signedUp = data.stages[0]?.count ?? 0;
  const paid = data.stages.find((stage) => stage.key === "paid")?.count ?? 0;
  const arrivals = data.arrivals;
  const sawLanding = arrivals.stages[0]?.count ?? 0;
  const installedCount = data.stages.find((stage) => stage.key === "installed")?.count ?? 0;
  const { confirmed, inferredFromReminders } = data.installConfidence;
  const journeyTotal = data.journey.stages.reduce((sum, stage) => sum + stage.count, 0);

  /**
   * Visitor tracking is younger than the accounts, so on the wider ranges the
   * top of the funnel is missing days that the bottom of it still counts. Said
   * plainly, because otherwise it reads as a collapse in traffic.
   */
  const trackingNote = data.trackingStartedAt
    ? `Visitor counting started ${timeLabel(data.trackingStartedAt)}. Anyone who arrived before then is missing from the first three rows but still counted in the rest.`
    : null;

  return (
    <Screen className="pb-12">
      <header className="py-4">
        <ScreenTitle className="text-title">Funnel</ScreenTitle>
        <p className="mt-1 text-sm text-muted-foreground">London time · updates on open</p>
      </header>

      <div className="flex gap-2" role="tablist" aria-label="Date range">
        {RANGES.map((range) => (
          <button
            key={range.days}
            type="button"
            role="tab"
            aria-selected={days === range.days}
            onClick={() => setDays(range.days)}
            className={cn(
              "flex-1 rounded-md py-2 text-sm font-semibold transition-colors",
              days === range.days
                ? "bg-foreground text-background"
                : "bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {range.label}
          </button>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-4 gap-2">
        <div className="rounded-lg bg-card p-3 text-center">
          <p className="tabular text-2xl font-extrabold text-foreground">{arrivals.total}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Visitors</p>
        </div>
        <div className="rounded-lg bg-card p-3 text-center">
          <p className="tabular text-2xl font-extrabold text-foreground">{signedUp}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Signed up</p>
        </div>
        <div className="rounded-lg bg-card p-3 text-center">
          <p className="tabular text-2xl font-extrabold text-foreground">{installedCount}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Installed</p>
        </div>
        <div className="rounded-lg bg-card p-3 text-center">
          <p
            className={cn(
              "tabular text-2xl font-extrabold",
              paid > 0 ? "text-success-ink" : "text-foreground",
            )}
          >
            {paid}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">Paid</p>
        </div>
      </div>

      <Card title="The whole journey">
        {journeyTotal === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing recorded in this range.</p>
        ) : (
          <>
            <Funnel stages={data.journey.stages} steps={data.journey.steps} />
            <p className="mt-4 border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">
              The first three rows count browsers; the rest count accounts. The step between them is the install, and
              an installed app gets its own private storage on iPhone, so someone who installs comes back looking like
              a brand new visitor and cannot be matched to the advert they arrived from. Treat that one step as a
              rough guide and every other step as exact.
            </p>
            {trackingNote ? (
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{trackingNote}</p>
            ) : null}
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Of the {signedUp} who signed up,{" "}
              <span className="tabular font-semibold text-foreground">{installedCount}</span> are running it from their
              home screen. Installs by people who never signed up cannot be counted at all.
            </p>
          </>
        )}
      </Card>

      <Card title="Before they sign up">
        {arrivals.total === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nobody visited in this range. Visitor tracking only counts arrivals from the moment it went live, so older
            days will read zero.
          </p>
        ) : (
          <>
            {sawLanding > 0 ? <Funnel stages={arrivals.stages} steps={arrivals.steps} /> : null}

            <div className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
              <Line label="Visitors in total" value={arrivals.total} />
              {arrivals.skippedLanding > 0 ? (
                <Line label="Skipped the landing page" value={arrivals.skippedLanding} muted />
              ) : null}
              <Line label="Carried on in the browser" value={arrivals.continuedInBrowser} muted />
              <Line label="Signed up without installing" value={arrivals.signedUpInBrowser} muted />
              <Line label="Signed up from the installed app" value={arrivals.fromInstalledApp.signedUp} muted />
            </div>

            {arrivals.inAppBrowser > 0 ? (
              <div className="mt-4 rounded-md bg-destructive/15 px-4 py-3">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-danger-ink">
                  <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {arrivals.inAppBrowser} opened inside TikTok or Instagram
                </p>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                  Those browsers have no “Add to Home Screen” at all, so these people cannot install however good the
                  page is. They have to open it in Safari first.
                </p>
              </div>
            ) : null}

            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
              The trail stops at the install steps. An installed app gets its own separate storage on iPhone, so someone
              who installs comes back as a brand new visitor and cannot be matched to the ad they arrived from. That is
              why sign-ups from the installed app are counted on their own line rather than inside the funnel.
            </p>
          </>
        )}
      </Card>

      <Card title="Where visitors came from">
        {data.sources.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground">
                <th className="pb-2 text-left font-medium">Source</th>
                <th className="pb-2 text-right font-medium">Visitors</th>
                <th className="pb-2 text-right font-medium">To install</th>
              </tr>
            </thead>
            <tbody>
              {data.sources.map((source) => (
                <tr key={source.source} className="border-t border-border">
                  <td className="truncate py-2 text-left text-foreground">{source.source}</td>
                  <td className="tabular py-2 text-right text-foreground">{source.visitors}</td>
                  <td className="tabular py-2 text-right text-muted-foreground">{source.reachedInstall}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          Taken from the link they arrived on. Add utm_source to your ad links to see each ad separately — without it,
          everything from one platform lands in the same row.
        </p>
      </Card>

      <Card title="Visitors by day">
        {data.visitsByDay.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground">
                <th className="pb-2 text-left font-medium">Day</th>
                <th className="pb-2 text-right font-medium">Visited</th>
                <th className="pb-2 text-right font-medium">Join</th>
                <th className="pb-2 text-right font-medium">Install</th>
              </tr>
            </thead>
            <tbody>
              {data.visitsByDay.map((bucket) => (
                <tr key={bucket.date} className="border-t border-border">
                  <td className="py-2 text-left text-foreground">{dayLabel(bucket.date)}</td>
                  <td className="tabular py-2 text-right text-foreground">{bucket.arrivals}</td>
                  <td className="tabular py-2 text-right text-muted-foreground">{bucket.tappedJoin}</td>
                  <td className="tabular py-2 text-right text-muted-foreground">{bucket.reachedInstall}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* Kept apart on purpose. The deposit total is money being held on other
          people's behalf and expected to go back to them; only the fee is
          income. Showing one number for both would overstate revenue roughly
          tenfold and make everything decided from it wrong. */}
      <Card title="Money">
        <div className="rounded-md bg-primary px-4 py-4">
          <p className="text-xs font-medium text-primary-foreground/70">Revenue · access fees taken</p>
          <p className="tabular mt-1 text-3xl font-extrabold text-accent">
            {data.money.revenue.gbp === 0 && data.money.revenue.usd === 0
              ? "\u00a30.00"
              : [
                  data.money.revenue.gbp > 0 ? money(data.money.revenue.gbp, "\u00a3") : null,
                  data.money.revenue.usd > 0 ? money(data.money.revenue.usd, "$") : null,
                ]
                  .filter(Boolean)
                  .join(" \u00b7 ")}
          </p>
        </div>

        <div className="mt-4 space-y-2">
          <MoneyLine label="Deposits held (not revenue)" gbp={data.money.depositsHeld.gbp} usd={data.money.depositsHeld.usd} />
        </div>

        {data.money.planMix.length > 0 ? (
          <ul className="mt-4 space-y-2 border-t border-border pt-4">
            {data.money.planMix.map((entry) => (
              <li key={entry.plan} className="flex items-center justify-between text-sm">
                <span className="text-foreground">{PLAN_NAMES[entry.plan] ?? entry.plan}</span>
                <span className="tabular font-semibold text-foreground">{entry.count}</span>
              </li>
            ))}
          </ul>
        ) : null}

        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
          Deposits are participants' own money and are expected to go back to them, so they are never counted as
          revenue — here or in your ad reporting. Forfeited deposits do become income, but only once a challenge has
          finished, which is not shown on this screen.
        </p>
      </Card>

      <Card title="Every step">
        {signedUp === 0 ? (
          <p className="text-sm text-muted-foreground">Nobody signed up in this range.</p>
        ) : (
          <Funnel stages={data.stages} steps={data.steps} />
        )}
      </Card>

      <Card title="After installing">
        {installedCount === 0 ? (
          <p className="text-sm text-muted-foreground">Nobody reached the home screen in this range.</p>
        ) : (
          <>
            <Funnel stages={data.installed.stages} steps={data.installed.steps} />
            <p className="mt-4 border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">
              For comparison, <span className="tabular font-semibold text-foreground">{data.installed.notInstalledPaid}</span>{" "}
              of <span className="tabular">{data.installed.notInstalledTotal}</span> who never installed went on to pay.
            </p>
          </>
        )}
      </Card>

      <Card title="How reliable the install number is">
        <p className="text-sm leading-relaxed text-muted-foreground">
          <span className="tabular font-semibold text-foreground">{confirmed}</span> confirmed by opening the app from
          the home screen.{" "}
          <span className="tabular font-semibold text-foreground">{inferredFromReminders}</span> assumed, because they
          switched reminders on — only an installed app can do that.
        </p>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          Anyone who installed but declined reminders before install tracking started is counted as not installed, so
          this figure is a floor rather than an exact count.
        </p>
      </Card>

      <Card title="By day">
        {data.byDay.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground">
                <th className="pb-2 text-left font-medium">Day</th>
                <th className="pb-2 text-right font-medium">Signed</th>
                <th className="pb-2 text-right font-medium">Inst.</th>
                <th className="pb-2 text-right font-medium">Built</th>
                <th className="pb-2 text-right font-medium">Paid</th>
              </tr>
            </thead>
            <tbody>
              {data.byDay.map((bucket) => (
                <tr key={bucket.date} className="border-t border-border">
                  <td className="py-2 text-left text-foreground">{dayLabel(bucket.date)}</td>
                  <td className="tabular py-2 text-right text-foreground">{bucket.signups}</td>
                  <td className="tabular py-2 text-right text-muted-foreground">{bucket.installs}</td>
                  <td className="tabular py-2 text-right text-muted-foreground">{bucket.built}</td>
                  <td
                    className={cn(
                      "tabular py-2 text-right font-semibold",
                      bucket.paid > 0 ? "text-success-ink" : "text-muted-foreground",
                    )}
                  >
                    {bucket.paid}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card title="Where they are">
        {data.places.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing yet.</p>
        ) : (
          <ul className="space-y-2">
            {data.places.map((place) => (
              <li key={place.place} className="flex items-center justify-between text-sm">
                <span className={place.place === "Unknown" ? "text-muted-foreground" : "text-foreground"}>
                  {placeName(place.place)}
                </span>
                <span className="tabular font-semibold text-foreground">{place.count}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          Only known once someone builds a challenge or turns on reminders, so early leavers show as unknown.
        </p>
      </Card>

      <Card title={`Email list (${emails.length})`}>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void copyEmails()}
            disabled={emails.length === 0}
            className="flex flex-1 items-center justify-center gap-2 rounded-md bg-foreground py-3 text-sm font-semibold text-background disabled:opacity-40"
          >
            <Copy className="h-4 w-4" aria-hidden="true" />
            Copy all
          </button>
          <button
            type="button"
            onClick={downloadCsv}
            disabled={emails.length === 0}
            className="flex flex-1 items-center justify-center gap-2 rounded-md bg-muted py-3 text-sm font-semibold text-foreground disabled:opacity-40"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Spreadsheet
          </button>
        </div>

        {suspect.length > 0 ? (
          <div className="mt-4 rounded-md bg-destructive/15 px-4 py-3">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-danger-ink">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
              {suspect.length} look mistyped
            </p>
            <ul className="mt-2 space-y-1">
              {suspect.map((row) => (
                <li key={row.email} className="break-all text-xs text-foreground">
                  {row.email} <span className="text-muted-foreground">→ probably {row.likely}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Leave these out. Bounces damage the reputation of your sending domain, which pushes real reminders and
              password resets into spam.
            </p>
          </div>
        ) : null}

        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          The spreadsheet includes how far each person got, so you can write to people who stopped at the deposit
          differently from people who never built a challenge.
        </p>
      </Card>

      <Card title={`People (${people.length})`}>
        {people.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nobody signed up in this range.</p>
        ) : (
          <ul className="space-y-3">
            {people.map((person) => (
              <li key={`${person.email}-${person.signedUpAt}`} className="border-t border-border pt-3 first:border-0 first:pt-0">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-sm font-medium text-foreground">{person.email ?? "No email"}</p>
                  <p className="tabular shrink-0 text-xs text-muted-foreground">{timeLabel(person.signedUpAt)}</p>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  <span
                    className={cn(
                      "font-semibold",
                      person.stage === "paid" || person.stage === "logged_workout"
                        ? "text-success-ink"
                        : "text-foreground",
                    )}
                  >
                    {STAGE_NAMES[person.stage] ?? person.stage}
                  </span>
                  {person.place ? ` · ${placeName(person.place)}` : " · place unknown"}
                  {person.goal ? ` · ${person.goal}/week` : ""}
                  {person.currency ? ` · ${person.currency}` : ""}
                  {person.hasDevice ? " · reminders on" : " · unreachable"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </Screen>
  );
}
