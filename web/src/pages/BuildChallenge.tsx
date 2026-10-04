import { Flame, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Screen, ScreenActions, ScreenSubtitle, ScreenTitle } from "@/components/Screen";
import { StepProgress } from "@/components/StepProgress";
import { Button } from "@/components/ui/button";
import {
  CHALLENGE_WEEKS,
  WEEKLY_GOALS,
  currencyForRegion,
  isWeeklyGoal,
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
  const isTrial = challenge?.challenge_type === "trial_week";

  const start = useMemo(() => weeklyStart(new Date(), zone), [zone]);
  const startLabel = useMemo(
    () => formatStartDate(start, zone, currency === "gbp" ? "en-GB" : "en-US"),
    [start, zone, currency],
  );

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

  // Trial: this screen sells the week, and the commitment choice moves to the
  // next screen. The standard flow below is untouched — it comes back intact
  // the moment the experiment flag goes off.
  if (isTrial) {
    return (
      <Screen>
        <StepProgress {...flowProgress("challenge")} onBack={() => navigate(-1)} />
        <div className="relative flex flex-1 flex-col">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-4 h-64 w-64 -translate-x-1/2 rounded-full bg-accent/25 blur-3xl"
          />
          <div className="relative flex flex-1 flex-col items-center justify-center pb-10 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-accent animate-pop-in">
              <Flame className="h-8 w-8 text-success-ink" aria-hidden="true" />
            </div>
            <ScreenTitle className="mt-8 max-w-xs animate-rise-in">
              Try the GymTaxx method for one week
            </ScreenTitle>
            <p className="mt-4 text-lg font-medium leading-relaxed text-foreground animate-rise-in [animation-delay:120ms]">
              See what a week of actually showing up feels like.
            </p>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground animate-rise-in [animation-delay:200ms]">
              No subscription. Just a fully refundable commitment deposit.
            </p>
          </div>
        </div>
        <ScreenActions>
          <Button size="xl" className="w-full" onClick={commit}>
            Continue
          </Button>
        </ScreenActions>
      </Screen>
    );
  }

  return (
    <Screen>
      <StepProgress {...flowProgress("challenge")} onBack={() => navigate(-1)} />

      <div className="pt-6">
        <ScreenTitle className="animate-rise-in">Choose your weekly commitment</ScreenTitle>
        <ScreenSubtitle className="animate-rise-in [animation-delay:80ms]">
          {isTrial
            ? "How many workouts will you complete during your GymTaxx trial week?"
            : "How many workouts will you complete each week during your GymTaxx monthly challenge?"}
        </ScreenSubtitle>
      </div>

      <div className="mt-8 animate-rise-in [animation-delay:160ms]">
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

      {/* Money deliberately doesn't appear here — the deposit has its own
          screen next, and showing two kinds of money on one screen is what made
          this feel crowded. The date is the only fact still worth confirming. */}
      <div className="mt-8 animate-rise-in [animation-delay:220ms]">
        <dl className="overflow-hidden rounded-lg bg-card">
          <Row label="Starts" value={startLabel} />
        </dl>
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
