import { Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Screen, ScreenActions, ScreenTitle } from "@/components/Screen";
import { StepProgress } from "@/components/StepProgress";
import { Button } from "@/components/ui/button";
import {
  CHALLENGE_WEEKS,
  REWARD_PER_WORKOUT,
  WEEKLY_GOALS,
  currencyForRegion,
  depositFor,
  formatMoney,
  isWeeklyGoal,
  totalWorkouts,
  type WeeklyGoal,
} from "@/lib/money";
import { flowProgress } from "@/lib/flow";
import { currentZone, formatStartDate, weeklyStart } from "@/lib/gymweek";
import { loadAnswers, saveAnswers } from "@/lib/onboarding";
import { useCurrentChallenge } from "@/lib/queries";
import { cn } from "@/lib/utils";

/**
 * The challenge laid out as a thing they're entering, not a purchase.
 *
 * Every number here is derived from the same rule the server uses to price the
 * deposit (goal x weeks x reward), so what they read is what they're charged.
 *
 * Runs before sign-up, so the challenge row is read anonymously and falls back
 * to the shared constants if that read isn't permitted — the terms are identical
 * for everyone, and a blank screen here would cost a sale.
 */
export default function BuildChallenge() {
  const navigate = useNavigate();
  const { data: challenge, isLoading } = useCurrentChallenge();

  const saved = useMemo(() => loadAnswers(), []);
  const [goal, setGoal] = useState<WeeklyGoal>(() => (saved.goal && isWeeklyGoal(saved.goal) ? saved.goal : 4));

  const zone = useMemo(() => currentZone(), []);
  const currency = useMemo(() => currencyForRegion(), []);

  const weeks = challenge?.number_of_weeks ?? CHALLENGE_WEEKS;
  const reward = Number(challenge?.reward_per_workout ?? REWARD_PER_WORKOUT);

  const start = useMemo(() => weeklyStart(new Date(), zone), [zone]);
  const startLabel = useMemo(
    () => formatStartDate(start, zone, currency === "gbp" ? "en-GB" : "en-US"),
    [start, zone, currency],
  );

  const workouts = totalWorkouts(goal, weeks);
  const deposit = depositFor(goal, weeks);

  function commit(): void {
    saveAnswers({ ...saved, goal });
    navigate("/commit");
  }

  if (isLoading) {
    return (
      <Screen>
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
        </div>
      </Screen>
    );
  }

  return (
    <Screen>
      <StepProgress {...flowProgress("challenge")} onBack={() => navigate(-1)} />

      <div className="pt-6">
        <ScreenTitle className="animate-rise-in">Build a challenge</ScreenTitle>
      </div>

      <div className="mt-8 animate-rise-in [animation-delay:160ms]">
        <p className="mb-3 text-center text-sm font-semibold text-foreground">Workouts per week</p>
        <div className="grid grid-cols-3 gap-3" role="radiogroup" aria-label="Workouts per week">
          {WEEKLY_GOALS.map((option) => {
            const isSelected = option === goal;
            return (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => setGoal(option)}
                className={cn(
                  "flex h-24 flex-col items-center justify-center rounded-lg border-2 transition-all active:scale-[0.97]",
                  isSelected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-transparent bg-card text-foreground hover:border-border",
                )}
              >
                <span className="tabular text-3xl font-extrabold leading-none">{option}</span>
                <span
                  className={cn("mt-1 text-xs font-medium", isSelected ? "text-primary-foreground/70" : "text-muted-foreground")}
                >
                  a week
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-8 animate-rise-in [animation-delay:220ms]">
        <p className="mb-3 text-sm font-semibold text-foreground">Your challenge</p>
        {/* The per-workout figure isn't a row here — it's stated in the
            commitment line below, and saying it twice invited a double-take. */}
        <dl className="divide-y divide-border overflow-hidden rounded-lg bg-card">
          <Row label="Starts" value={startLabel} />
          <Row label="Duration" value={`${weeks} weeks`} />
          <Row label="Required workouts" value={String(workouts)} />
        </dl>
      </div>

      <div className="mt-4 flex items-baseline justify-between rounded-lg bg-primary px-5 py-5 animate-rise-in [animation-delay:280ms]">
        <div>
          <p className="text-sm font-medium text-primary-foreground/70">Fully refundable commitment</p>
          <p className="mt-1 text-xs text-primary-foreground/60">All yours to earn, {formatMoney(reward, currency)} at a time</p>
        </div>
        <p key={deposit} className="tabular text-4xl font-extrabold text-accent animate-pop-in">
          {formatMoney(deposit, currency)}
        </p>
      </div>

      <ScreenActions>
        <Button size="xl" className="w-full" onClick={commit}>
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
