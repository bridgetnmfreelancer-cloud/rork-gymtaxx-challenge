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
        <ScreenTitle className="animate-rise-in">Now put something behind your goal to motivate you.</ScreenTitle>
      </div>

      {/* The maths, shown as arithmetic rather than a table of labels — the
          deposit is the one number that matters, and the sum is how you get
          there in two lines instead of four rows. */}
      <div className="mt-8 space-y-1 animate-rise-in [animation-delay:80ms]">
        <p className="text-sm leading-relaxed text-muted-foreground">
          {goal} workouts/week × {weeks} weeks
        </p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {workouts} × {formatMoney(reward, currency)} = {formatMoney(deposit, currency)}
        </p>
      </div>

      <div className="mt-4 flex items-baseline justify-between rounded-lg bg-primary px-5 py-5 animate-rise-in [animation-delay:140ms]">
        <p className="text-sm font-medium text-primary-foreground/70">Your refundable commitment</p>
        <p className="tabular text-4xl font-extrabold text-accent">{formatMoney(deposit, currency)}</p>
      </div>

      <div className="mt-6 space-y-3 animate-rise-in [animation-delay:200ms]">
        <Outcome icon={ArrowUpRight} tone="good" title={`Log a workout, get ${formatMoney(reward, currency)} back`} />
        <Outcome icon={ArrowDownRight} tone="bad" title={`Miss a workout, lose ${formatMoney(reward, currency)}`} />
      </div>

      <ScreenActions>
        <Button size="xl" className="w-full" onClick={() => navigate("/ready")}>
          Continue
        </Button>
      </ScreenActions>
    </Screen>
  );
}

function Outcome({
  icon: Icon,
  tone,
  title,
}: {
  icon: typeof ArrowUpRight;
  tone: "good" | "bad";
  title: string;
}) {
  const isGood = tone === "good";
  return (
    <div className="flex items-center gap-4 rounded-lg border border-border p-4">
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${
          isGood ? "bg-accent" : "bg-destructive/25"
        }`}
      >
        <Icon className={`h-5 w-5 ${isGood ? "text-success-ink" : "text-danger-ink"}`} aria-hidden="true" />
      </div>
      <p className="min-w-0 font-semibold leading-tight text-foreground">{title}</p>
    </div>
  );
}
