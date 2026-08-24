import { Check, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";

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
  startsFree,
  type Plan,
  type PlanId,
} from "@/lib/plans";
import { useCurrentChallenge, useParticipation, useProfile } from "@/lib/queries";
import { cn } from "@/lib/utils";

/**
 * The access plan, chosen after the challenge is configured and before any money
 * is taken.
 *
 * Placed here on purpose: the fee is a separate thing from the deposit, and
 * someone should meet it while they can still change their mind, not discover it
 * on the payment sheet. Both amounts are shown together at the bottom for the
 * same reason.
 *
 * Monthly and Annual lead because for most people they cost nothing today — the
 * first challenge is free. That turns the question from "how much" into "how do
 * you want to carry on", which is a far easier one to answer at this point.
 */
export default function PlanPicker() {
  const navigate = useNavigate();
  const { data: challenge } = useCurrentChallenge();
  const { data: participation } = useParticipation();
  const { data: profile, isLoading: isProfileLoading } = useProfile();

  const saved = useMemo(() => loadAnswers(), []);
  const goal = saved.goal && isWeeklyGoal(saved.goal) ? saved.goal : 4;
  const weeks = challenge?.number_of_weeks ?? CHALLENGE_WEEKS;

  // The participation row fixes the currency at join; before it exists we fall
  // back to the region so the paywall never shows the wrong symbol.
  const currency = participation ? currencyFrom(participation.currency) : currencyForRegion();
  const deposit = depositFor(goal, weeks);

  const freeChallengeUsed = profile?.free_challenge_used ?? false;

  const [selected, setSelected] = useState<PlanId>(() => loadPlanChoice() ?? "monthly");

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

  function proceed(): void {
    savePlanChoice(selected);
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
      <StepProgress step={3} total={4} onBack={() => navigate(-1)} />

      <div className="pt-6">
        <ScreenTitle className="animate-rise-in">Choose how you continue</ScreenTitle>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground animate-rise-in [animation-delay:60ms]">
          {freeChallengeUsed
            ? "Your free challenge has already been used, so a plan starts today."
            : "Your first challenge is free on either plan. Nothing extra is charged today."}
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

      <p className="mt-6 text-sm font-semibold text-foreground animate-rise-in [animation-delay:260ms]">
        Rather not subscribe?
      </p>
      <div className="mt-3 space-y-3">
        {secondary.map((plan, index) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            currency={currency}
            freeChallengeUsed={freeChallengeUsed}
            isSelected={selected === plan.id}
            onSelect={() => setSelected(plan.id)}
            delayMs={300 + index * 60}
          />
        ))}
      </div>

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

      <ScreenActions>
        <Button size="xl" className="w-full" onClick={proceed}>
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
        </span>
        <span className="mt-1 block text-sm leading-snug text-muted-foreground">
          {isFreeStart
            ? `Then ${formatFee(plan.price, currency)} ${intervalSuffix(plan.interval)}. Cancel any time.`
            : plan.detail.replace(/£[\d.]+/g, (match) => (currency === "usd" ? match.replace("£", "$") : match))}
        </span>
      </span>

      <span className="shrink-0 text-right">
        <span className={cn("tabular block font-extrabold text-foreground", prominent ? "text-xl" : "text-lg")}>
          {isFreeStart ? "Free" : formatFee(plan.price, currency)}
        </span>
        <span className="mt-0.5 block text-[11px] text-muted-foreground">
          {isFreeStart ? "today" : intervalSuffix(plan.interval)}
        </span>
      </span>
    </button>
  );
}
