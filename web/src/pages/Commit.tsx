import { ArrowDownRight, ArrowUpRight, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Screen, ScreenActions, ScreenTitle } from "@/components/Screen";
import { StepProgress } from "@/components/StepProgress";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthProvider";
import { currencyFrom, currencyForRegion, depositFor, formatMoney, isWeeklyGoal, totalWorkouts } from "@/lib/money";
import { loadAnswers } from "@/lib/onboarding";
import { ensureParticipation } from "@/lib/participation";
import { queryKeys, useCurrentChallenge, useParticipation } from "@/lib/queries";
import { CHALLENGE_WEEKS, REWARD_PER_WORKOUT } from "@/lib/money";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Step 10: the deposit, stated plainly.
 *
 * Both outcomes are spelled out here rather than buried — someone should not be
 * able to reach the payment sheet without having read what happens if they miss.
 */
export default function Commit() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: challenge } = useCurrentChallenge();
  const { data: participation } = useParticipation();

  const [isWorking, setIsWorking] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const saved = useMemo(() => loadAnswers(), []);
  const goal = saved.goal && isWeeklyGoal(saved.goal) ? saved.goal : 4;

  const weeks = challenge?.number_of_weeks ?? CHALLENGE_WEEKS;
  const reward = Number(challenge?.reward_per_workout ?? REWARD_PER_WORKOUT);
  const currency = participation ? currencyFrom(participation.currency) : currencyForRegion();

  const workouts = totalWorkouts(goal, weeks);
  const deposit = depositFor(goal, weeks);

  async function startPayment(): Promise<void> {
    if (isWorking) return;
    if (!user || !challenge) {
      setError("We couldn't load your challenge. Pull down to refresh and try again.");
      return;
    }

    setError(null);
    setIsWorking(true);
    try {
      await ensureParticipation({
        userId: user.id,
        challengeId: challenge.id,
        goal,
        weeks,
        existing: participation ?? null,
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.participation(user.id) });
      // The access plan is chosen before any money is taken, so the fee is never
      // a surprise on the payment sheet.
      navigate("/plan");
    } catch (caught) {
      console.error("commit: could not create participation", caught);
      setError("We couldn't set up your challenge just then. Try again in a moment.");
    } finally {
      setIsWorking(false);
    }
  }

  return (
    <Screen>
      <StepProgress step={2} total={4} onBack={() => navigate(-1)} />

      <div className="pt-6">
        <ScreenTitle className="animate-rise-in">Now put something behind it.</ScreenTitle>
      </div>

      <dl className="mt-8 divide-y divide-border overflow-hidden rounded-lg bg-card animate-rise-in [animation-delay:80ms]">
        <Row label="Your goal" value={`${goal} workouts a week`} />
        <Row label="Over" value={`${weeks} weeks`} />
        <Row label="That's" value={`${workouts} workouts`} />
        <Row label="Each one worth" value={formatMoney(reward, currency)} />
      </dl>

      <div className="mt-4 flex items-baseline justify-between rounded-lg bg-primary px-5 py-5 animate-rise-in [animation-delay:140ms]">
        <p className="text-sm font-medium text-primary-foreground/70">Refundable commitment</p>
        <p className="tabular text-4xl font-extrabold text-accent">{formatMoney(deposit, currency)}</p>
      </div>

      <div className="mt-6 space-y-3 animate-rise-in [animation-delay:200ms]">
        <Outcome
          icon={ArrowUpRight}
          tone="good"
          title={`Complete a workout, earn ${formatMoney(reward, currency)} back`}
          detail="Verified from the gym. Your own money, returned to you."
        />
        <Outcome
          icon={ArrowDownRight}
          tone="bad"
          title={`Miss a workout, forfeit ${formatMoney(reward, currency)}`}
          detail="No second chances at the end of the week. That's the point."
        />
      </div>

      <p className="mt-6 text-xs leading-relaxed text-muted-foreground animate-rise-in [animation-delay:260ms]">
        Your {formatMoney(deposit, currency)} is taken now and held. Nothing further is ever charged — the most you can
        lose is what you put in, and the most you can get back is the same {formatMoney(deposit, currency)}.
      </p>

      {error ? (
        <p role="alert" className="mt-4 rounded-md bg-destructive/15 px-4 py-3 text-sm font-medium text-danger-ink">
          {error}
        </p>
      ) : null}

      <ScreenActions>
        <Button size="xl" className="w-full" onClick={startPayment} disabled={isWorking}>
          {isWorking ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : null}
          Continue
        </Button>
      </ScreenActions>
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-5 py-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="tabular text-base font-semibold text-foreground">{value}</dd>
    </div>
  );
}

function Outcome({
  icon: Icon,
  tone,
  title,
  detail,
}: {
  icon: typeof ArrowUpRight;
  tone: "good" | "bad";
  title: string;
  detail: string;
}) {
  const isGood = tone === "good";
  return (
    <div className="flex items-start gap-4 rounded-lg border border-border p-4">
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${
          isGood ? "bg-accent" : "bg-destructive/25"
        }`}
      >
        <Icon className={`h-5 w-5 ${isGood ? "text-success-ink" : "text-danger-ink"}`} aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <p className="font-semibold leading-tight text-foreground">{title}</p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}
