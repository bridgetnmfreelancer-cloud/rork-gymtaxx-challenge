import { CreditCard, Dumbbell, Loader2, ShieldCheck } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";

import { LengthPicker } from "@/components/LengthPicker";
import { Screen, ScreenActions, ScreenSubtitle, ScreenTitle } from "@/components/Screen";
import { StepProgress } from "@/components/StepProgress";
import { Button } from "@/components/ui/button";
import {
  CHALLENGE_WEEKS,
  WEEKLY_GOALS,
  currencyForRegion,
  isWeeklyGoal,
  type ChallengeWeeks,
  type WeeklyGoal,
} from "@/lib/money";
import { loadLengthChoice, saveLengthChoice } from "@/lib/lengthChoice";
import { flowProgress } from "@/lib/flow";
import { currentZone, formatStartDate, weeklyStart } from "@/lib/gymweek";
import { loadAnswers, saveAnswers } from "@/lib/onboarding";
import { useCurrentChallenge, useParticipation } from "@/lib/queries";
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
  // Only meaningful once signed in; the builder mostly runs before that. A live
  // paid challenge — a trial week still running, most importantly — means this
  // person already has terms in motion, and must never meet the length picker
  // mid-trial: they go back to the dashboard their week lives on.
  const { data: participation } = useParticipation();

  const saved = useMemo(() => loadAnswers(), []);
  const [goal, setGoal] = useState<WeeklyGoal>(() => (saved.goal && isWeeklyGoal(saved.goal) ? saved.goal : 4));
  const [weeksChoice, setWeeksChoice] = useState<ChallengeWeeks>(
    () => loadLengthChoice() ?? (challenge?.number_of_weeks as ChallengeWeeks | undefined) ?? CHALLENGE_WEEKS,
  );

  const zone = useMemo(() => currentZone(), []);
  const currency = useMemo(() => currencyForRegion(), []);

  const isTrial = challenge?.challenge_type === "trial_week";

  const start = useMemo(() => weeklyStart(new Date(), zone), [zone]);
  const startLabel = useMemo(
    () => formatStartDate(start, zone, currency === "gbp" ? "en-GB" : "en-US"),
    [start, zone, currency],
  );

  function pickLength(length: ChallengeWeeks): void {
    setWeeksChoice(length);
    saveLengthChoice(length);
  }

  function commit(): void {
    saveAnswers({ ...saved, goal });
    navigate("/commit");
  }

  const hasLiveChallenge =
    participation?.payment_status === "paid" &&
    Boolean(participation.ends_at && new Date(participation.ends_at) > new Date());

  if (hasLiveChallenge) {
    return <Navigate to="/home" replace />;
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

  // Trial: this screen sells the week as three scannable benefits, and the
  // commitment choice moves to the next screen. The standard flow below is
  // untouched — it comes back intact the moment the experiment flag goes off.
  if (isTrial) {
    const benefits: { icon: ReactNode; label: string }[] = [
      {
        icon: <Dumbbell className="h-5 w-5" aria-hidden="true" />,
        label: "One week of accountability",
      },
      {
        icon: (
          <span className="relative inline-flex" aria-hidden="true">
            <CreditCard className="h-5 w-5" />
            <span className="absolute top-1/2 h-0.5 w-[calc(100%+6px)] -translate-y-1/2 -rotate-45 rounded-full bg-current" />
          </span>
        ),
        label: "No subscription",
      },
      {
        icon: <ShieldCheck className="h-5 w-5" aria-hidden="true" />,
        label: "Fully refundable commitment deposit",
      },
    ];

    return (
      <Screen>
        <StepProgress {...flowProgress("challenge")} onBack={null} />

        <div className="flex flex-1 flex-col">
          {/* Little calendar illustration — pure CSS, no image payload. */}
          <div className="relative mx-auto mt-14 h-36 w-40 animate-pop-in" aria-hidden="true">
            <div className="absolute -left-7 top-7 h-1 w-5 -rotate-[30deg] rounded-full bg-accent" />
            <div className="absolute -left-5 top-16 h-1 w-4 -rotate-[30deg] rounded-full bg-accent/60" />
            <div className="absolute -right-7 top-7 h-1 w-5 rotate-[30deg] rounded-full bg-accent" />
            <div className="absolute -right-5 top-16 h-1 w-4 rotate-[30deg] rounded-full bg-accent/60" />
            <div className="relative h-full w-full rounded-2xl border border-border/70 bg-background shadow-xl shadow-foreground/5">
              <div className="absolute -top-2.5 left-9 h-5 w-1.5 rounded-full bg-foreground" />
              <div className="absolute -top-2.5 right-9 h-5 w-1.5 rounded-full bg-foreground" />
              <div className="flex h-14 items-center justify-center gap-1.5 rounded-t-2xl bg-accent/25">
                {Array.from({ length: 6 }, (_, i) => (
                  <span key={i} className="h-2.5 w-2.5 rounded-full bg-accent" />
                ))}
              </div>
              <div className="grid grid-cols-6 gap-x-2.5 gap-y-2.5 p-4">
                {Array.from({ length: 12 }, (_, i) => (
                  <span key={i} className="h-2 w-2 rounded-full bg-muted" />
                ))}
              </div>
            </div>
          </div>

          {/* The H1 is the page's only headline — no supporting line, so the
              hierarchy is illustration → headline → benefits, nothing between. */}
          <ScreenTitle className="mt-10 animate-rise-in text-center">
            Try GymTaxx
            <br />
            for free next week
          </ScreenTitle>

          <ul className="mt-10 space-y-5 animate-rise-in [animation-delay:120ms]">
            {benefits.map((benefit) => (
              <li key={benefit.label} className="flex items-center gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent/40 text-success-ink">
                  {benefit.icon}
                </span>
                <span className="text-base font-medium text-foreground">{benefit.label}</span>
              </li>
            ))}
          </ul>
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
        <ScreenTitle className="animate-rise-in">Build your challenge</ScreenTitle>
        <ScreenSubtitle className="animate-rise-in [animation-delay:80ms]">
          Pick how long it runs and how many workouts you'll commit to each week.
        </ScreenSubtitle>
      </div>

      <p className="mt-8 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground animate-rise-in [animation-delay:120ms]">
        How long?
      </p>
      <div className="mt-3">
        <LengthPicker goal={goal} currency={currency} selected={weeksChoice} onSelect={pickLength} />
      </div>

      <p className="mt-8 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground animate-rise-in [animation-delay:140ms]">
        Each week
      </p>

      <div className="mt-3 animate-rise-in [animation-delay:160ms]">
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

      {/* The picker already separated the two kinds of money per length; the
          deposit maths gets its own screen next. The date is the other fact
          worth confirming before the commitment is made. */}
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
