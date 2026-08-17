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

type Stats = {
  since: string;
  days: number;
  stages: Stage[];
  steps: Step[];
  installed: {
    stages: Stage[];
    steps: Step[];
    notInstalledPaid: number;
    notInstalledTotal: number;
  };
  installConfidence: { confirmed: number; inferredFromReminders: number };
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
  paid: "Paid",
  logged_workout: "Logged a workout",
};

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
  const top = stages[0]?.count ?? 0;
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

  const { data, isLoading, isError } = useQuery({
    queryKey: ["funnel", days],
    queryFn: () => callFunction<Stats>("funnel-stats", { days }),
    staleTime: 60_000,
    retry: 0,
  });

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
  const installedCount = data.stages.find((stage) => stage.key === "installed")?.count ?? 0;
  const { confirmed, inferredFromReminders } = data.installConfidence;

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

      <div className="mt-6 grid grid-cols-3 gap-2">
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
