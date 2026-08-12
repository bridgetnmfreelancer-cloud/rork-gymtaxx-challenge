import { CalendarDays, Loader2 } from "lucide-react";
import { useMemo } from "react";

import { BottomNav } from "@/components/BottomNav";
import { Screen, ScreenSubtitle, ScreenTitle } from "@/components/Screen";
import { StatusPill } from "@/pages/Home";
import type { UserChallengeRow, WorkoutSubmissionRow } from "@/lib/database.types";
import { addWeeks } from "@/lib/gymweek";
import { CHALLENGE_WEEKS, currencyFrom, formatMoney } from "@/lib/money";
import { statusOf } from "@/lib/progress";
import { useCurrentChallenge, useParticipation, useSubmissions } from "@/lib/queries";

type WeekGroup = {
  index: number;
  from: Date;
  rows: WorkoutSubmissionRow[];
  verified: number;
  goal: number;
};

/**
 * The record, week by week.
 *
 * Grouped by challenge week rather than by calendar month, because the week is
 * the unit that actually decides whether money is earned or forfeited.
 */
export default function History() {
  const { data: participation, isLoading: loadingParticipation } = useParticipation();
  const { data: challenge } = useCurrentChallenge();
  const { data: submissions, isLoading: loadingSubmissions } = useSubmissions(participation?.id);

  const totalWeeks = challenge?.number_of_weeks ?? CHALLENGE_WEEKS;

  const groups = useMemo<WeekGroup[]>(() => {
    if (!participation || !submissions) return [];
    return groupByWeek(participation, submissions, totalWeeks);
  }, [participation, submissions, totalWeeks]);

  const currency = currencyFrom(participation?.currency);
  const locale = currency === "gbp" ? "en-GB" : "en-US";

  if (loadingParticipation || (Boolean(participation) && loadingSubmissions)) {
    return (
      <Screen withNav>
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
        </div>
        <BottomNav />
      </Screen>
    );
  }

  if (!participation) {
    return (
      <Screen withNav>
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-card">
            <CalendarDays className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
          </div>
          <ScreenTitle className="mt-6 text-title">No history yet</ScreenTitle>
          <ScreenSubtitle>Once your challenge starts, every workout you prove shows up here.</ScreenSubtitle>
        </div>
        <BottomNav />
      </Screen>
    );
  }

  return (
    <Screen withNav>
      <header className="py-4">
        <ScreenTitle className="text-title">Your record</ScreenTitle>
        <p className="mt-1 text-sm text-muted-foreground">{challenge?.name ?? "Current challenge"}</p>
      </header>

      <div className="space-y-6">
        {groups.map((group) => (
          <section key={group.index} className="animate-rise-in" style={{ animationDelay: `${group.index * 50}ms` }}>
            <div className="flex items-baseline justify-between">
              <h2 className="font-semibold text-foreground">
                Week <span className="tabular">{group.index}</span>
              </h2>
              <p className="tabular text-sm font-medium text-muted-foreground">
                {group.verified} / {group.goal}
                {group.verified >= group.goal ? " \u2014 complete" : ""}
              </p>
            </div>

            {group.rows.length === 0 ? (
              <p className="mt-2 rounded-md border border-dashed border-border px-4 py-5 text-center text-sm text-muted-foreground">
                {group.from > new Date() ? "Not started yet" : "Nothing logged this week"}
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {group.rows.map((row) => (
                  <HistoryRow key={row.id} row={row} zone={participation.time_zone} locale={locale} />
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>

      <p className="mt-8 text-center text-xs text-muted-foreground">
        Verified workouts have earned {formatMoney(Number(challenge?.reward_per_workout ?? 5), currency)} each back.
      </p>

      <BottomNav />
    </Screen>
  );
}

function HistoryRow({ row, zone, locale }: { row: WorkoutSubmissionRow; zone: string; locale: string }) {
  const captured = new Date(row.captured_at);
  const day = new Intl.DateTimeFormat(locale, { timeZone: zone, weekday: "long", day: "numeric", month: "short" }).format(
    captured,
  );
  const time = new Intl.DateTimeFormat(locale, { timeZone: zone, hour: "numeric", minute: "2-digit" }).format(captured);
  const hasLocation = row.latitude !== null && row.longitude !== null;

  return (
    <li className="flex items-center justify-between rounded-md bg-card px-4 py-3">
      <div className="min-w-0">
        <p className="font-medium text-foreground">{day}</p>
        <p className="text-xs text-muted-foreground">
          {time}
          {hasLocation ? " \u00b7 location recorded" : " \u00b7 no location signal"}
        </p>
        {row.rejection_reason ? (
          <p className="mt-1 text-xs font-medium text-danger-ink">{row.rejection_reason}</p>
        ) : null}
      </div>
      <StatusPill status={statusOf(row)} />
    </li>
  );
}

/** Buckets submissions into the challenge's weeks, keeping empty weeks visible. */
function groupByWeek(
  participation: UserChallengeRow,
  submissions: WorkoutSubmissionRow[],
  totalWeeks: number,
): WeekGroup[] {
  const zone = participation.time_zone;
  const start = new Date(participation.started_at);

  return Array.from({ length: totalWeeks }, (_, offset) => {
    const from = addWeeks(start, offset, zone);
    const to = addWeeks(start, offset + 1, zone);

    const rows = submissions
      .filter((row) => {
        const at = new Date(row.captured_at);
        return at >= from && at < to;
      })
      .sort((a, b) => new Date(b.captured_at).getTime() - new Date(a.captured_at).getTime());

    return {
      index: offset + 1,
      from,
      rows,
      verified: rows.filter((row) => statusOf(row) === "verified").length,
      goal: participation.goal_workouts_per_week,
    };
  });
}
