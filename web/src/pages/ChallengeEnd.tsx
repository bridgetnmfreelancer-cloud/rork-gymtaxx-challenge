import { ChevronRight } from "lucide-react";
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";

import { BottomNav } from "@/components/BottomNav";
import { CountUpMoney } from "@/components/CountUp";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/ui/button";
import type { ChallengeRow, UserChallengeRow, WorkoutSubmissionRow } from "@/lib/database.types";
import { currentZone, formatStartDate, weeklyStart } from "@/lib/gymweek";
import { currencyFrom, formatMoney } from "@/lib/money";
import { computeProgress, statusOf } from "@/lib/progress";

/**
 * The end of a challenge, stated as plainly as the month itself was.
 *
 * The hero is the one number the whole month was about: what came back. A month
 * that earned nothing puts the donated amount in the hero instead — same honesty,
 * different emphasis, because a zero at this size would read as an accusation.
 *
 * Nothing here waits on the operator. Whatever is verified so far is what the
 * screen shows; if a proof is approved later, the refetch-on-focus behaviour of
 * the queries quietly lifts the number without anyone reloading.
 */
export default function ChallengeEnd({
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

  // Proofs still waiting on review — they can still lift the total, so they
  // get a line rather than silence.
  const pending = useMemo(
    () =>
      submissions.filter((row) => {
        if (statusOf(row) !== "pending") return false;
        const at = new Date(row.captured_at);
        return at >= progress.start && at < progress.end;
      }).length,
    [submissions, progress.start, progress.end],
  );

  const refunded = participation.refund_status === "refunded";
  const earnedNothing = progress.earned === 0;
  const nextStart = useMemo(
    () => formatStartDate(weeklyStart(new Date(), currentZone()), currentZone(), locale),
    [locale],
  );

  return (
    <Screen withNav>
      <header className="py-4">
        <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          Challenge finished
        </p>
      </header>

      <section className="rounded-lg bg-primary p-6 animate-rise-in">
        {earnedNothing ? (
          <>
            <p className="text-sm font-medium text-primary-foreground/70">Forfeited</p>
            <CountUpMoney
              value={progress.deposit}
              currency={progress.currency}
              className="mt-1 block text-[3.25rem] font-extrabold leading-none text-accent"
            />
            <p className="mt-2 text-sm text-primary-foreground/70">
              No workout earned it back. It will be donated.
            </p>
          </>
        ) : (
          <>
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
              {progress.verifiedTotal} {progress.verifiedTotal === 1 ? "workout" : "workouts"} verified
              over {progress.totalWeeks} weeks.
            </p>
          </>
        )}
      </section>

      <section className="mt-4 divide-y divide-border overflow-hidden rounded-lg bg-card animate-rise-in [animation-delay:80ms]">
        {progress.remaining > 0 ? (
          <Line
            primary={`${formatMoney(progress.remaining, progress.currency)} will be donated`}
            secondary="The part of your deposit no workout earned back."
          />
        ) : null}

        {progress.earned > 0 ? (
          <Line
            primary={refunded ? "Deposit returned" : "Deposit being returned"}
            secondary={
              refunded
                ? "It is back on your card."
                : "You don't need to do anything — it lands on the card you paid with."
            }
          />
        ) : null}

        {pending > 0 ? (
          <Line
            primary={`${pending} ${pending === 1 ? "workout" : "workouts"} still under review`}
            secondary="If they're approved, your total goes up."
          />
        ) : null}
      </section>

      <div className="mt-8 animate-rise-in [animation-delay:140ms]">
        <Button size="xl" className="w-full" onClick={() => navigate("/challenge")}>
          Start my next challenge
          <ChevronRight className="h-5 w-5" aria-hidden="true" />
        </Button>
        <p className="mt-3 text-center text-xs text-muted-foreground">
          A new month would start {nextStart}.
        </p>
      </div>

      <BottomNav />
    </Screen>
  );
}

function Line({ primary, secondary }: { primary: string; secondary?: string }) {
  return (
    <div className="px-5 py-4">
      <p className="font-medium text-foreground">{primary}</p>
      {secondary ? <p className="mt-0.5 text-sm text-muted-foreground">{secondary}</p> : null}
    </div>
  );
}
