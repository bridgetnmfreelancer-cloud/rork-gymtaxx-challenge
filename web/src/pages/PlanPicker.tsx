import { useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";

import { useAuth } from "@/context/AuthProvider";
import { enrolQuietly } from "@/lib/enrol";
import { flowProgress } from "@/lib/flow";

import { Screen, ScreenActions, ScreenTitle } from "@/components/Screen";
import { StepProgress } from "@/components/StepProgress";
import { Button } from "@/components/ui/button";
import { trackIntent } from "@/lib/meta";
import { CHALLENGE_WEEKS, currencyForRegion, currencyFrom, depositFor, formatMoney } from "@/lib/money";
import { loadAnswers } from "@/lib/onboarding";
import { isWeeklyGoal } from "@/lib/money";
import { loadPlanChoice, savePlanChoice } from "@/lib/planChoice";
import {
  PLANS,
  HEADLINE_PLAN_IDS,
  feeDueNow,
  formatFee,
  intervalSuffix,
  planById,
  startsFree,
  type Plan,
  type PlanId,
} from "@/lib/plans";
import { queryKeys, useCurrentChallenge, useParticipation, useProfile } from "@/lib/queries";
import { cn } from "@/lib/utils";

/**
 * The access plan, chosen after the challenge is configured and before any money
 * is taken.
 *
 * Two subscription plans lead and everything else is collapsed behind one line —
 * four visible choices was a decision people put off, two is one they make. The
 * annual card is priced per month on purpose: £59.99 reads as a bill, £5 a month
 * next to £7.99 reads as the obvious one.
 *
 * Monthly is selected by default so the first-time decision is confirm-or-switch,
 * not pick-from-scratch.
 */
export default function PlanPicker() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: challenge } = useCurrentChallenge();
  const { data: participation } = useParticipation();
  const { data: profile, isLoading: isProfileLoading } = useProfile();

  const [isStarting, setIsStarting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const saved = useMemo(() => loadAnswers(), []);
  const goal = saved.goal && isWeeklyGoal(saved.goal) ? saved.goal : 4;
  const weeks = challenge?.number_of_weeks ?? CHALLENGE_WEEKS;

  // The participation row fixes the currency at join; before it exists we fall
  // back to the region so the paywall never shows the wrong symbol.
  const currency = participation ? currencyFrom(participation.currency) : currencyForRegion();
  const deposit = depositFor(goal, weeks);

  const freeChallengeUsed = profile?.free_challenge_used ?? false;

  const savedPlanChoice = useMemo(() => loadPlanChoice(), []);
  const [selected, setSelected] = useState<PlanId>(() => savedPlanChoice ?? "monthly");
  /**
   * One-time plans start collapsed — they're the escape hatch, not the offer.
   * Only someone who already chose one sees them open, so a returning visitor
   * isn't shown their own selection as hidden.
   */
  const [showOneTime, setShowOneTime] = useState<boolean>(
    () => savedPlanChoice === "one_challenge" || savedPlanChoice === "lifetime",
  );

  // Reaching the paywall is the intent signal. No money is involved, so this one
  // is safe to fire from the browser; anything carrying value is sent server-side.
  useEffect(() => {
    trackIntent("InitiateCheckout");
  }, []);

  const headline = PLANS.filter((plan) => HEADLINE_PLAN_IDS.includes(plan.id));
  const secondary = PLANS.filter((plan) => !HEADLINE_PLAN_IDS.includes(plan.id));

  const selectedPlan = PLANS.find((plan) => plan.id === selected) ?? PLANS[0];
  const fee = feeDueNow(selectedPlan, freeChallengeUsed);
  const dueToday = deposit + fee;

  /**
   * The safety net for enrolment.
   *
   * The deposit is priced from the participation row, so nobody can be allowed
   * to reach payment without one. It is normally created the instant they sign
   * up; if that failed — lost signal at exactly the wrong moment — this is the
   * last chance to put it right, and the only place a failure can still be said
   * out loud rather than surfacing as a broken payment screen.
   */
  async function proceed(): Promise<void> {
    if (isStarting) return;
    savePlanChoice(selected);

    if (!participation && user) {
      setError(null);
      setIsStarting(true);
      const enrolled = await enrolQuietly(user.id);
      setIsStarting(false);

      if (!enrolled) {
        setError("We couldn't set up your challenge just then. Check your connection and try again.");
        return;
      }
      await queryClient.invalidateQueries({ queryKey: queryKeys.participation(user.id) });
    }

    navigate("/pay");
  }

  if (isProfileLoading) {
    return (
      <Screen>
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
        </div>
      </Screen>
    );
  }

  // People who joined before access was charged for never see this screen. They
  // signed up on different terms and keep them; the server enforces the same
  // rule, so skipping past here cannot be used to dodge a fee.
  if (profile?.grandfathered === true) {
    return <Navigate to="/pay" replace />;
  }

  return (
    <Screen>
      <StepProgress {...flowProgress("plan")} onBack={() => navigate(-1)} />

      <div className="pt-6">
        <ScreenTitle className="animate-rise-in">
          {freeChallengeUsed ? "Choose your plan" : "Start your first challenge free."}
        </ScreenTitle>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground animate-rise-in [animation-delay:60ms]">
          {freeChallengeUsed
            ? "Your free challenge has already been used, so a plan starts today."
            : "Your first challenge is free on either plan. Only your fully refundable commitment deposit will be charged today."}
        </p>
      </div>

      <div className="mt-6 space-y-3">
        {headline.map((plan, index) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            currency={currency}
            freeChallengeUsed={freeChallengeUsed}
            isSelected={selected === plan.id}
            onSelect={() => setSelected(plan.id)}
            delayMs={120 + index * 60}
            prominent
          />
        ))}
      </div>

      <button
        type="button"
        onClick={() => setShowOneTime((current) => !current)}
        className="mt-6 flex w-full items-center justify-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground animate-rise-in [animation-delay:260ms]"
      >
        {showOneTime ? "Hide one-time options" : "Don't want another subscription? See one-time options."}
        <ChevronDown className={cn("h-4 w-4 transition-transform", showOneTime ? "rotate-180" : "")} aria-hidden="true" />
      </button>
      {showOneTime ? (
        <div className="mt-3 space-y-3">
          {secondary.map((plan, index) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              currency={currency}
              freeChallengeUsed={freeChallengeUsed}
              isSelected={selected === plan.id}
              onSelect={() => setSelected(plan.id)}
              delayMs={0}
            />
          ))}
        </div>
      ) : null}

      {/* The two kinds of money, side by side. The deposit is theirs and comes
          back; the fee is what GymTaxx charges. Conflating them is the single
          easiest way to lose someone's trust at this exact moment. */}
      <dl className="mt-6 divide-y divide-border overflow-hidden rounded-lg bg-card animate-rise-in [animation-delay:420ms]">
        <div className="flex items-baseline justify-between px-5 py-4">
          <div>
            <dt className="text-sm font-medium text-foreground">Your deposit</dt>
            <dd className="mt-0.5 text-xs text-muted-foreground">Refundable — earned back {formatMoney(5, currency)} at a time</dd>
          </div>
          <span className="tabular text-base font-semibold text-foreground">{formatMoney(deposit, currency)}</span>
        </div>
        <div className="flex items-baseline justify-between px-5 py-4">
          <div>
            <dt className="text-sm font-medium text-foreground">GymTaxx {selectedPlan.name.toLowerCase()}</dt>
            <dd className="mt-0.5 text-xs text-muted-foreground">
              {startsFree(selectedPlan, freeChallengeUsed)
                ? `Free this challenge, then ${formatFee(selectedPlan.price, currency)} ${intervalSuffix(selectedPlan.interval)}`
                : "Charged today"}
            </dd>
          </div>
          <span className="tabular text-base font-semibold text-foreground">
            {fee === 0 ? "Free" : formatFee(fee, currency)}
          </span>
        </div>
        <div className="flex items-baseline justify-between bg-primary px-5 py-4">
          <dt className="text-sm font-medium text-primary-foreground/70">Due today</dt>
          <dd className="tabular text-2xl font-extrabold text-accent">{formatFee(dueToday, currency)}</dd>
        </div>
      </dl>

      {startsFree(selectedPlan, freeChallengeUsed) ? (
        <p className="mt-4 text-xs leading-relaxed text-muted-foreground animate-rise-in [animation-delay:460ms]">
          Your card is saved but not charged for the plan. The first{" "}
          {formatFee(selectedPlan.price, currency)} is taken when this challenge ends, and we'll remind you before it
          is. Cancel any time from your account.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="mt-4 rounded-md bg-destructive/15 px-4 py-3 text-sm font-medium text-danger-ink">
          {error}
        </p>
      ) : null}

      <ScreenActions>
        <Button size="xl" className="w-full" onClick={() => void proceed()} disabled={isStarting}>
          {isStarting ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : null}
          Continue
        </Button>
      </ScreenActions>
    </Screen>
  );
}

function PlanCard({
  plan,
  currency,
  freeChallengeUsed,
  isSelected,
  onSelect,
  delayMs,
  prominent = false,
}: {
  plan: Plan;
  currency: ReturnType<typeof currencyForRegion>;
  freeChallengeUsed: boolean;
  isSelected: boolean;
  onSelect: () => void;
  delayMs: number;
  prominent?: boolean;
}) {
  const isFreeStart = startsFree(plan, freeChallengeUsed);

  /**
   * The annual card is anchored monthly on purpose: £59.99 reads as a bill,
   * £5 a month next to the £7.99 above it reads as the obvious choice. The
   * saving is derived from the two plan prices so the two can never drift.
   */
  const isAnnual = plan.interval === "year";
  const perMonth = isAnnual ? plan.price / 12 : null;
  const savingsPercent = isAnnual
    ? Math.round((1 - plan.price / (planById("monthly").price * 12)) * 100)
    : null;

  return (
    <button
      type="button"
      role="radio"
      aria-checked={isSelected}
      onClick={onSelect}
      style={{ animationDelay: `${delayMs}ms` }}
      className={cn(
        "flex w-full items-center gap-4 rounded-lg border-2 px-5 text-left transition-all active:scale-[0.99] animate-rise-in",
        prominent ? "py-5" : "py-4",
        isSelected ? "border-primary bg-card" : "border-transparent bg-card hover:border-border",
      )}
    >
      <span
        className={cn(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
          isSelected ? "border-primary bg-primary" : "border-border",
        )}
        aria-hidden="true"
      >
        {isSelected ? <Check className="h-3.5 w-3.5 text-primary-foreground" strokeWidth={3} /> : null}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className={cn("font-bold text-foreground", prominent ? "text-lg" : "text-base")}>{plan.name}</span>
          {plan.badge ? (
            <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-success-ink">
              {plan.badge}
            </span>
          ) : null}
          {savingsPercent !== null ? (
            <span className="rounded-full border border-accent px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-success-ink">
              Save {savingsPercent}%
            </span>
          ) : null}
        </span>
        <span className="mt-1 block text-sm leading-snug text-muted-foreground">
          {isAnnual
            ? isFreeStart
              ? "First challenge free. Cancel any time."
              : "Cancel any time."
            : isFreeStart
              ? `Then ${formatFee(plan.price, currency)} a month. Cancel any time.`
              : "Cancel any time."}
        </span>
      </span>

      <span className="shrink-0 text-right">
        {isAnnual && perMonth !== null ? (
          <>
            <span className="tabular block text-xl font-extrabold text-foreground">
              {formatFee(perMonth, currency)}
              <span className="text-xs font-semibold text-muted-foreground">/month</span>
            </span>
            <span className="mt-0.5 block text-[11px] text-muted-foreground">
              {formatFee(plan.price, currency)} billed annually
            </span>
          </>
        ) : (
          <>
            <span className={cn("tabular block font-extrabold text-foreground", prominent ? "text-xl" : "text-lg")}>
              {isFreeStart ? "Free" : formatFee(plan.price, currency)}
            </span>
            <span className="mt-0.5 block text-[11px] text-muted-foreground">
              {isFreeStart ? "today" : intervalSuffix(plan.interval)}
            </span>
          </>
        )}
      </span>
    </button>
  );
}
