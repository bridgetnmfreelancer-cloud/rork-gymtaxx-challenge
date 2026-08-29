import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";

import { Screen, ScreenActions, ScreenTitle } from "@/components/Screen";
import { StepProgress } from "@/components/StepProgress";
import { Button } from "@/components/ui/button";
import { flowProgress } from "@/lib/flow";
import { currencyFrom, currencyForRegion, depositFor, formatMoney, isWeeklyGoal, totalWorkouts } from "@/lib/money";
import { loadAnswers } from "@/lib/onboarding";
import { useCurrentChallenge, useParticipation } from "@/lib/queries";
import { CHALLENGE_WEEKS, REWARD_PER_WORKOUT } from "@/lib/money";

/**
 * The deposit, stated plainly.
 *
 * Both outcomes are spelled out here rather than buried — someone should not be
 * able to reach the payment sheet without having read what happens if they miss.
 *
 * Reached before anyone has an account, so nothing is written from this screen.
 * The goal is already saved on the phone; the participation row it implies gets
 * created at sign-up, a few screens later.
 */
export default function Commit() {
  const navigate = useNavigate();
  const { data: challenge } = useCurrentChallenge();
  const { data: participation } = useParticipation();

  const saved = useMemo(() => loadAnswers(), []);
  const goal = saved.goal && isWeeklyGoal(saved.goal) ? saved.goal : 4;

  const weeks = challenge?.number_of_weeks ?? CHALLENGE_WEEKS;
  const reward = Number(challenge?.reward_per_workout ?? REWARD_PER_WORKOUT);
  const currency = participation ? currencyFrom(participation.currency) : currencyForRegion();

  const workouts = totalWorkouts(goal, weeks);
  const deposit = depositFor(goal, weeks);

  return (
    <Screen>
      <StepProgress {...flowProgress("commit")} onBack={() => navigate(-1)} />

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

      <ScreenActions>
        <Button size="xl" className="w-full" onClick={() => navigate("/ready")}>
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
