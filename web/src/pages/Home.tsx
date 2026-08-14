import { Camera, ChevronRight, Clock, Loader2, Sparkles } from "lucide-react";
import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";

import { BottomNav } from "@/components/BottomNav";
import { ConfirmingDeposit } from "@/components/ConfirmingDeposit";
import { CountUpMoney } from "@/components/CountUp";
import { Screen } from "@/components/Screen";
import { WeekDots } from "@/components/WeekDots";
import { Button } from "@/components/ui/button";
import { formatStartDate } from "@/lib/gymweek";
import { CHALLENGE_WEEKS, currencyForRegion, depositFor, formatMoney, isWeeklyGoal } from "@/lib/money";
import { loadAnswers } from "@/lib/onboarding";
import { alreadyLoggedToday, computeProgress, formatDeadline, statusOf } from "@/lib/progress";
import { useCurrentChallenge, useParticipation, useSubmissions } from "@/lib/queries";
import { clearDepositSettling, depositSettlingSince } from "@/lib/settlement";
import { weeklyStart, currentZone } from "@/lib/gymweek";
import type { ChallengeRow, UserChallengeRow, WorkoutSubmissionRow } from "@/lib/database.types";

/**
 * The screen people see every time they open GymTaxx.
 *
 * Three states live here rather than in separate routes, because which one
 * applies depends on data that has to load first — and bouncing between routes
 * mid-load would flash the wrong screen at someone who has already paid.
 */
export default function Home() {
  const { data: participation, isLoading: loadingParticipation } = useParticipation();
  const { data: challenge, isLoading: loadingChallenge } = useCurrentChallenge();
  const { data: submissions, isLoading: loadingSubmissions } = useSubmissions(participation?.id);

  // Snapshotted at mount, so clearing it below can't change this render pass.
  const settlingSince = useMemo(() => depositSettlingSince(), []);
  const isPaid = participation?.payment_status === "paid";

  useEffect(() => {
    if (isPaid) clearDepositSettling();
  }, [isPaid]);

  const isLoading = loadingParticipation || loadingChallenge || (Boolean(participation) && loadingSubmissions);

  if (isLoading) {
    return (
      <Screen withNav>
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
        </div>
        <BottomNav />
      </Screen>
    );
  }

  if (!participation || !isPaid) {
    // Their card has already been charged; the confirmation just hasn't arrived.
    // Dropping them on the sell screen here would tell someone who has just paid
    // £80 that they haven't paid at all.
    if (settlingSince !== null) return <ConfirmingDeposit since={settlingSince} withNav />;
    return <ReadyWhenYouAre />;
  }

  return <Dashboard submissions={submissions ?? []} participation={participation} challenge={challenge ?? null} />;
}

/**
 * The non-paying home screen: built to sell, not to sulk.
 *
 * They keep the goal they configured and the Monday it would start, so coming
 * back costs them one tap rather than the whole flow again. This is where a
 * reminder lands them.
 */
function ReadyWhenYouAre() {
  const navigate = useNavigate();
  const answers = useMemo(() => loadAnswers(), []);
  const goal = answers.goal && isWeeklyGoal(answers.goal) ? answers.goal : 4;

  const currency = currencyForRegion();
  const zone = useMemo(() => currentZone(), []);
  const startLabel = useMemo(
    () => formatStartDate(weeklyStart(new Date(), zone), zone, currency === "gbp" ? "en-GB" : "en-US"),
    [zone, currency],
  );

  return (
    <Screen withNav>
      <div className="flex flex-1 flex-col justify-center py-10">
        <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-accent animate-pop-in">
          <Sparkles className="h-7 w-7 text-success-ink" aria-hidden="true" />
        </div>

        <h1 className="mt-6 text-display text-foreground animate-rise-in">Ready when you are.</h1>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground animate-rise-in [animation-delay:60ms]">
          Your challenge is built and waiting. It starts the moment you put something behind it.
        </p>

        <dl className="mt-8 divide-y divide-border overflow-hidden rounded-lg bg-card animate-rise-in [animation-delay:120ms]">
          <SummaryRow label="Your goal" value={`${goal} workouts a week`} />
          <SummaryRow label="Would start" value={startLabel} />
          <SummaryRow label="Commitment" value={formatMoney(depositFor(goal, CHALLENGE_WEEKS), currency)} />
        </dl>

        <Button size="xl" className="mt-8 w-full animate-rise-in [animation-delay:180ms]" onClick={() => navigate("/challenge")}>
          Start my challenge
        </Button>

        <button
          type="button"
          onClick={() => navigate("/onboarding")}
          className="mt-3 w-full py-2 text-sm font-medium text-muted-foreground underline-offset-4 hover:underline"
        >
          Remind me how it works
        </button>
      </div>

      <BottomNav />
    </Screen>
  );
}

function Dashboard({
  participation,
  challenge,
  submissions,
}: {
  participation: UserChallengeRow;
  challenge: ChallengeRow | null;
  submissions: WorkoutSubmissionRow[];
}) {
  const navigate = useNavigate();

  const progress = useMemo(
    () => computeProgress({ participation, challenge, submissions }),
    [participation, challenge, submissions],
  );

  const locale = progress.currency === "gbp" ? "en-GB" : "en-US";
  const loggedToday = useMemo(
    () => alreadyLoggedToday(submissions, participation.time_zone),
    [submissions, participation.time_zone],
  );

  const recent = submissions.slice(0, 3);

  return (
    <Screen withNav>
      <header className="flex items-baseline justify-between py-4">
        <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          Week <span className="tabular">{progress.currentWeek}</span> of{" "}
          <span className="tabular">{progress.totalWeeks}</span>
        </p>
        <p className="text-sm font-medium text-muted-foreground">{challenge?.name ?? "Challenge"}</p>
      </header>

      <section className="rounded-lg bg-primary p-6 animate-rise-in">
        <p className="text-sm font-medium text-primary-foreground/70">Earned back</p>
        <div className="mt-1 flex items-baseline gap-3">
          <CountUpMoney
            value={progress.earned}
            currency={progress.currency}
            className="text-[3.25rem] font-extrabold leading-none text-accent"
          />
          <span className="text-base font-medium text-primary-foreground/60">
            of {formatMoney(progress.deposit, progress.currency)}
          </span>
        </div>
        <p className="mt-2 text-sm text-primary-foreground/70">
          {formatMoney(progress.remaining, progress.currency)} still to earn
        </p>
      </section>

      <section className="mt-4 rounded-lg bg-card p-5 animate-rise-in [animation-delay:80ms]">
        <div className="flex items-baseline justify-between">
          <p className="font-semibold text-foreground">This week</p>
          <p className="tabular text-sm font-medium text-muted-foreground">
            {progress.verifiedThisWeek} / {progress.goalPerWeek} done
          </p>
        </div>

        <div className="mt-4">
          <WeekDots
            goal={progress.goalPerWeek}
            verified={progress.verifiedThisWeek}
            pending={progress.pendingThisWeek}
          />
        </div>

        <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="h-4 w-4" aria-hidden="true" />
          <span>Week closes {formatDeadline(progress.weekEnds, participation.time_zone, locale)}</span>
        </div>
      </section>

      <div className="mt-4 animate-rise-in [animation-delay:140ms]">
        <Button
          size="xl"
          className="w-full"
          disabled={loggedToday || progress.isComplete}
          onClick={() => navigate("/verify")}
        >
          <Camera className="h-5 w-5" aria-hidden="true" />
          {progress.isComplete ? "Challenge finished" : loggedToday ? "Logged for today" : "Verify a workout"}
        </Button>
        {loggedToday && !progress.isComplete ? (
          <p className="mt-3 text-center text-xs text-muted-foreground">
            One workout a day counts. Come back tomorrow.
          </p>
        ) : null}
      </div>

      {recent.length > 0 ? (
        <section className="mt-8 animate-rise-in [animation-delay:200ms]">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-foreground">Recent workouts</h2>
            <button
              type="button"
              onClick={() => navigate("/history")}
              className="flex items-center gap-0.5 text-sm font-medium text-muted-foreground"
            >
              All
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <ul className="mt-3 space-y-2">
            {recent.map((row) => (
              <SubmissionRow key={row.id} row={row} zone={participation.time_zone} locale={locale} />
            ))}
          </ul>
        </section>
      ) : null}

      <BottomNav />
    </Screen>
  );
}

export function SubmissionRow({
  row,
  zone,
  locale,
}: {
  row: WorkoutSubmissionRow;
  zone: string;
  locale: string;
}) {
  const status = statusOf(row);
  const captured = new Date(row.captured_at);

  const day = new Intl.DateTimeFormat(locale, { timeZone: zone, weekday: "long" }).format(captured);
  const time = new Intl.DateTimeFormat(locale, { timeZone: zone, hour: "numeric", minute: "2-digit" }).format(captured);

  return (
    <li className="flex items-center justify-between rounded-md bg-card px-4 py-3">
      <div className="min-w-0">
        <p className="font-medium text-foreground">{day}</p>
        <p className="text-xs text-muted-foreground">{time}</p>
      </div>
      <StatusPill status={status} />
    </li>
  );
}

export function StatusPill({ status }: { status: "pending" | "verified" | "rejected" }) {
  if (status === "verified") {
    return (
      <span className="rounded-full bg-accent px-3 py-1 text-xs font-semibold text-success-ink">Verified</span>
    );
  }
  if (status === "rejected") {
    return (
      <span className="rounded-full bg-destructive/20 px-3 py-1 text-xs font-semibold text-danger-ink">Rejected</span>
    );
  }
  return (
    <span className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted-foreground">
      Pending
    </span>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-5 py-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="tabular text-base font-semibold text-foreground">{value}</dd>
    </div>
  );
}
