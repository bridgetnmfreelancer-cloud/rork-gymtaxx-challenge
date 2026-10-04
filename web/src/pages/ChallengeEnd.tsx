import { ChevronRight, Loader2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { BottomNav } from "@/components/BottomNav";
import { CountUpMoney } from "@/components/CountUp";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthProvider";
import type { ChallengeRow, UserChallengeRow, WorkoutSubmissionRow } from "@/lib/database.types";
import { currentZone, formatStartDate, weeklyStart } from "@/lib/gymweek";
import { currencyFrom, formatMoney } from "@/lib/money";
import { computeProgress, statusOf } from "@/lib/progress";
import { queryKeys } from "@/lib/queries";
import { callFunction } from "@/lib/supabase";
import { trialErrorCopy } from "@/lib/trial";

/**
 * The end of a challenge, stated as plainly as the month itself was.
 *
 * The hero is the one number the whole period was about: what came back. A
 * period that earned nothing puts the donated amount in the hero instead — same
 * honesty, different emphasis, because a zero at this size would read as an
 * accusation.
 *
 * For the 7-day trial week this screen is also the decision point: week one
 * offers the second-chance week (with the replacement rule stated before the
 * tap) or a plain refund request; week two is the final outcome with
 * continue-or-refund only. Nothing here waits on the operator — whatever is
 * verified so far is what the screen shows, and late approvals still lift the
 * numbers through the usual refetch-on-focus behaviour.
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
  const queryClient = useQueryClient();
  const { user } = useAuth();

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

  const isTrial = challenge?.challenge_type === "trial_week";
  const isSecondWeek = participation.repeat_of !== null;
  const refunded = participation.refund_status === "refunded";
  const refundRequested = participation.refund_status === "requested";
  const earnedNothing = progress.earned === 0;
  const nextStart = useMemo(
    () => formatStartDate(weeklyStart(new Date(), currentZone()), currentZone(), locale),
    [locale],
  );

  const refresh = useCallback(async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.participation(user?.id) });
    await queryClient.invalidateQueries({ queryKey: queryKeys.endedParticipation(user?.id) });
  }, [queryClient, user?.id]);

  const repeatWeek = useMutation({
    mutationFn: () => callFunction<{ status: string }>("trial-actions", { action: "repeat-week" }),
    onSuccess: () => {
      void refresh();
    },
    onError: (error) => toast.error(trialErrorCopy(String(error.message))),
  });

  const requestRefund = useMutation({
    mutationFn: () => callFunction<{ status: string }>("trial-actions", { action: "request-refund" }),
    onSuccess: () => {
      void refresh();
    },
    onError: (error) => toast.error(trialErrorCopy(String(error.message))),
  });

  // Week one with anything missed leads with the second-chance offer; a full
  // goal keeps it behind the deposit-back choice, where the offer belongs.
  const [offerOpen, setOfferOpen] = useState<boolean>(
    () => isTrial && !isSecondWeek && progress.earned < progress.deposit,
  );

  return (
    <Screen withNav>
      <header className="py-4">
        <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          {isTrial ? "Trial week finished" : "Challenge finished"}
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
              No workout earned it back. {isTrial && !isSecondWeek ? "Your second chance below can win it all back." : "It will be donated."}
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
              {isTrial ? " this week." : ` over ${progress.totalWeeks} weeks.`}
            </p>
          </>
        )}
      </section>

      <section className="mt-4 divide-y divide-border overflow-hidden rounded-lg bg-card animate-rise-in [animation-delay:80ms]">
        {isSecondWeek ? (
          <Line
            primary="Your final refund is based on this week's result alone"
            secondary="Week two replaced week one — nothing is combined."
          />
        ) : null}

        {progress.remaining > 0 ? (
          <Line
            primary={
              isTrial && !isSecondWeek
                ? `${formatMoney(progress.remaining, progress.currency)} still on the table`
                : `${formatMoney(progress.remaining, progress.currency)} will be donated`
            }
            secondary={
              isTrial && !isSecondWeek
                ? "Your second-chance week below can win all of it back."
                : "The part of your deposit no workout earned back."
            }
          />
        ) : null}

        {progress.earned > 0 ? (
          <Line
            primary={
              refunded
                ? "Deposit returned"
                : refundRequested || !isTrial
                  ? "Deposit being returned"
                  : `${formatMoney(progress.earned, progress.currency)} is yours to claim`
            }
            secondary={
              refunded
                ? "It is back on your card."
                : refundRequested || !isTrial
                  ? "You don't need to do anything — it lands on the card you paid with."
                  : "Request your refund below and it lands on the card you paid with."
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

      {/* Standard verdict: one settled month, straight into the next one. */}
      {!isTrial || refunded ? (
        <div className="mt-8 animate-rise-in [animation-delay:140ms]">
          <Button size="xl" className="w-full" onClick={() => navigate("/challenge")}>
            Start my next challenge
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </Button>
          <p className="mt-3 text-center text-xs text-muted-foreground">
            A new month would start {nextStart}.
          </p>
        </div>
      ) : isSecondWeek ? (
        <TrialSecondWeekActions
          nextStart={nextStart}
          canRefund={!earnedNothing && !refundRequested}
          refundPending={requestRefund.isPending}
          onRequestRefund={() => requestRefund.mutate()}
        />
      ) : offerOpen ? (
        <SecondChanceOffer
          progress={progress}
          repeatPending={repeatWeek.isPending}
          refundPending={requestRefund.isPending}
          onAccept={() => repeatWeek.mutate()}
          onDecline={() => requestRefund.mutate()}
          onContinue={() => navigate("/challenge")}
        />
      ) : (
        <TrialFirstWeekActions
          nextStart={nextStart}
          onRefund={() => setOfferOpen(true)}
        />
      )}

      <BottomNav />
    </Screen>
  );
}

/**
 * Week one, goal hit — the deposit is already earned, so the choice is between
 * continuing and starting the refund conversation, which is where the leave-it-
 * in offer lives.
 */
function TrialFirstWeekActions({ nextStart, onRefund }: { nextStart: string; onRefund: () => void }) {
  const navigate = useNavigate();

  return (
    <div className="mt-8 space-y-3 animate-rise-in [animation-delay:140ms]">
      <Button size="xl" className="w-full" onClick={() => navigate("/challenge")}>
        Continue with GymTaxx
        <ChevronRight className="h-5 w-5" aria-hidden="true" />
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        A full month would start {nextStart}. Your first month of membership is free.
      </p>
      <Button variant="outline" size="xl" className="w-full" onClick={onRefund}>
        Get my deposit back
      </Button>
    </div>
  );
}

interface TrialProgress {
  currency: ReturnType<typeof currencyFrom>;
  goalPerWeek: number;
  deposit: number;
  earned: number;
}

/**
 * The second-chance decision, with the replacement rule stated before the tap.
 *
 * Week two starts fresh at zero and its result alone decides the whole refund —
 * week one's figure is replaced, never combined. That has to be understood
 * before they accept, because it is the one rule that can surprise.
 */
function SecondChanceOffer({
  progress,
  repeatPending,
  refundPending,
  onAccept,
  onDecline,
  onContinue,
}: {
  progress: TrialProgress;
  repeatPending: boolean;
  refundPending: boolean;
  onAccept: () => void;
  onDecline: () => void;
  onContinue: () => void;
}) {
  return (
    <div className="mt-8 space-y-4 animate-rise-in [animation-delay:140ms]">
      {progress.earned > 0 ? (
        <p className="text-center text-sm text-muted-foreground">
          {formatMoney(progress.earned, progress.currency)} comes back to your card when you request it.
        </p>
      ) : null}

      <section className="rounded-lg border-2 border-primary p-5">
        <p className="font-bold text-foreground">Or leave your deposit in for one final week</p>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Week two starts fresh at zero workouts. Whatever week two earns is your whole
          refund — week one's result is replaced. Hit your full goal ({progress.goalPerWeek}{" "}
          workouts) and the entire {formatMoney(progress.deposit, progress.currency)} comes back.
        </p>

        <div className="mt-4 space-y-2">
          <Button size="xl" className="w-full" disabled={repeatPending || refundPending} onClick={onAccept}>
            {repeatPending ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : null}
            Start my final week
          </Button>
          <Button variant="outline" className="w-full" disabled={repeatPending || refundPending} onClick={onDecline}>
            {refundPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {progress.earned > 0 ? "No thanks, return what I earned" : "No thanks, close my trial"}
          </Button>
        </div>
      </section>

      <button
        type="button"
        onClick={onContinue}
        className="w-full py-2 text-center text-sm font-medium text-muted-foreground underline-offset-4 hover:underline"
      >
        Continue with GymTaxx instead
      </button>
    </div>
  );
}

/**
 * Week two — the final outcome. No third week exists under any circumstances,
 * so the only choices are the standard journey and the refund request.
 */
function TrialSecondWeekActions({
  nextStart,
  canRefund,
  refundPending,
  onRequestRefund,
}: {
  nextStart: string;
  canRefund: boolean;
  refundPending: boolean;
  onRequestRefund: () => void;
}) {
  const navigate = useNavigate();

  return (
    <div className="mt-8 space-y-3 animate-rise-in [animation-delay:140ms]">
      <Button size="xl" className="w-full" onClick={() => navigate("/challenge")}>
        Continue with GymTaxx
        <ChevronRight className="h-5 w-5" aria-hidden="true" />
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        A full month would start {nextStart}. Your first month of membership is free.
      </p>
      {canRefund ? (
        <Button variant="outline" size="xl" className="w-full" disabled={refundPending} onClick={onRequestRefund}>
          {refundPending ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : null}
          Get my deposit back
        </Button>
      ) : null}
    </div>
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
