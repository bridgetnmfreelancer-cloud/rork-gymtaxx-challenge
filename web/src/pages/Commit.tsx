import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Screen, ScreenActions, ScreenTitle } from "@/components/Screen";
import { StepProgress } from "@/components/StepProgress";
import { Button } from "@/components/ui/button";
import { flowProgress } from "@/lib/flow";
import { currentZone, formatStartDate, weeklyStart } from "@/lib/gymweek";
import { currencyFrom, currencyForRegion, depositFor, formatMoney, isWeeklyGoal, totalWorkouts, WEEKLY_GOALS, type WeeklyGoal } from "@/lib/money";
import { loadAnswers, saveAnswers } from "@/lib/onboarding";
import { useCurrentChallenge, useEndedParticipation, useParticipation } from "@/lib/queries";
import { cn } from "@/lib/utils";
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
  const { data: lastEnded } = useEndedParticipation();

  const saved = useMemo(() => loadAnswers(), []);
  const goal = saved.goal && isWeeklyGoal(saved.goal) ? saved.goal : 4;

  const weeks = challenge?.number_of_weeks ?? CHALLENGE_WEEKS;
  const isTrial = challenge?.challenge_type === "trial_week";
  const reward = Number(challenge?.reward_per_workout ?? REWARD_PER_WORKOUT);
  const currency = participation ? currencyFrom(participation.currency) : currencyForRegion();

  const workouts = totalWorkouts(goal, weeks);
  const deposit = depositFor(goal, weeks);

  // Trial: the commitment choice lives on this screen (the screen before sells
  // the week). 4 is preselected so the trial summary is always visible — the
  // page reads at a glance with zero taps.
  const [selectedGoal, setSelectedGoal] = useState<WeeklyGoal>(() =>
    saved.goal && isWeeklyGoal(saved.goal) ? saved.goal : 4,
  );

  const zone = useMemo(() => currentZone(), []);
  const startLabel = useMemo(
    () => formatStartDate(weeklyStart(new Date(), zone), zone, currency === "gbp" ? "en-GB" : "en-US"),
    [zone, currency],
  );

  if (isTrial) {
    const trialDeposit = depositFor(selectedGoal, weeks);
    return (
      <Screen>
        <StepProgress {...flowProgress("commit")} onBack={() => navigate(-1)} />

        <div className="pt-6">
          {/* Centred like the intro's header so the trial pair reads as one
              system — header, choice, summary — and the question sits straight
              over the symmetric grid below it. */}
          <ScreenTitle className="animate-rise-in text-center">
            How many workouts are you committing to next week?
          </ScreenTitle>
        </div>

        <div className="mt-8 animate-rise-in [animation-delay:120ms]">
          <div className="grid grid-cols-3 gap-3" role="radiogroup" aria-label="Workouts next week">
            {WEEKLY_GOALS.map((option) => {
              const isSelected = option === selectedGoal;
              return (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => setSelectedGoal(option)}
                  className={cn(
                    "flex h-28 items-center justify-center rounded-2xl transition-all active:scale-[0.97]",
                    isSelected ? "bg-primary text-primary-foreground" : "bg-card text-foreground",
                  )}
                >
                  <span className="tabular text-5xl font-extrabold leading-none">{option}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div key={selectedGoal} className="mt-8 rounded-2xl bg-card p-5 animate-rise-in">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Your trial</p>
          <p className="mt-3 text-lg font-bold text-foreground">{selectedGoal} workouts</p>
          <p className="mt-0.5 text-lg font-bold text-foreground">
            <span className="tabular">{formatMoney(trialDeposit, currency)}</span> refundable deposit
          </p>
          <p className="mt-2 text-base text-muted-foreground">Starts {startLabel}</p>
        </div>

        <ScreenActions>
          <Button
            size="xl"
            className="w-full"
            onClick={() => {
              saveAnswers({ ...saved, goal: selectedGoal });
              navigate("/ready");
            }}
          >
            Continue
          </Button>
        </ScreenActions>
      </Screen>
    );
  }

  return (
    <Screen>
      <StepProgress {...flowProgress("commit")} onBack={() => navigate(-1)} />

      <div className="pt-6">
        <ScreenTitle className="animate-rise-in">Now put something behind your goal to motivate you.</ScreenTitle>
      </div>

      {/* The maths is the hero here, the way the goal number was the hero of
          the screen before: each step of the sum gets a card, the workings sit
          small above the result, and the result is the biggest thing on the
          page. Reading the two cards top to bottom IS understanding the price. */}
      <div className="mt-8 space-y-3">
        <div className="rounded-lg bg-card p-5 animate-rise-in [animation-delay:80ms]">
          <p className="text-sm text-muted-foreground">
            {isTrial ? `${goal} workouts, one week` : `${goal} workouts/week × ${weeks} weeks`}
          </p>
          <p className="mt-1 leading-none">
            <span className="tabular text-4xl font-extrabold text-foreground">{workouts}</span>
            <span className="ml-2 text-base font-semibold text-foreground">
              {isTrial ? "workouts in your trial week" : "workouts for the month"}
            </span>
          </p>
        </div>

        <div className="rounded-lg bg-primary px-5 py-6 animate-rise-in [animation-delay:140ms]">
          <p className="text-sm text-primary-foreground/70">
            {workouts} workouts × {formatMoney(reward, currency)}
          </p>
          <p
            key={deposit}
            className="tabular mt-1 text-5xl font-extrabold leading-none text-accent animate-pop-in"
          >
            {formatMoney(deposit, currency)}
          </p>
          <p className="mt-2 text-sm text-primary-foreground/70">Your refundable commitment</p>
        </div>
      </div>

      <div className="mt-6 space-y-3 animate-rise-in [animation-delay:200ms]">
        <Outcome icon={ArrowUpRight} tone="good" title={`Log a workout, get ${formatMoney(reward, currency)} back`} />
        <Outcome icon={ArrowDownRight} tone="bad" title={`Miss a workout, lose ${formatMoney(reward, currency)}`} />
      </div>

      {isTrial ? (
        <p className="mt-5 text-center text-sm text-muted-foreground animate-rise-in [animation-delay:240ms]">
          One week only — no membership. Hit your goal and the full deposit comes back.
        </p>
      ) : null}

      {/* A returning participant can start before their old deposit lands, so
          the two flows would otherwise cross silently. One quiet line keeps the
          money they already know about from becoming a surprise on their card. */}
      {lastEnded ? (
        <p className="mt-5 text-center text-sm text-muted-foreground animate-rise-in [animation-delay:240ms]">
          {lastEnded.refund_status === "refunded"
            ? "Your previous deposit has been returned."
            : "Your previous deposit is being returned to your card."}
        </p>
      ) : null}

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
