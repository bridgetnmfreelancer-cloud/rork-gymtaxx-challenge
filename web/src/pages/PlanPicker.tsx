import { useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";

import { useAuth } from "@/context/AuthProvider";
import { enrolQuietly } from "@/lib/enrol";
import { flowProgress } from "@/lib/flow";
import { loadLengthChoice } from "@/lib/lengthChoice";
import { CHALLENGE_WEEKS, labelWeeks } from "@/lib/money";

import { Screen, ScreenActions } from "@/components/Screen";
import { StepProgress } from "@/components/StepProgress";
import { Button } from "@/components/ui/button";
import { trackIntent } from "@/lib/meta";
import { currencyForRegion, currencyFrom } from "@/lib/money";
import { loadPlanChoice, savePlanChoice } from "@/lib/planChoice";
import {
  PLANS,
  HEADLINE_PLAN_IDS,
  feeDueNow,
  formatFee,
  type Plan,
  type PlanId,
} from "@/lib/plans";
import { queryKeys, useCurrentChallenge, useParticipation, useProfile } from "@/lib/queries";
import { recordVisit } from "@/lib/visitor";
import { cn } from "@/lib/utils";

/**
 * The access plan, chosen after the challenge is configured and before any money
 * is taken.
 *
 * The length of the challenge was picked back in the builder and travels on the
 * phone; the one-off plan's fee follows it. Monthly stays selected by default
 * so the decision is confirm-or-switch, not pick-from-scratch.
 *
 * The deposit breakdown lives on the payment screen, next to the charge it
 * explains.
 */
export default function PlanPicker() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: participation } = useParticipation();
  const { data: profile, isLoading: isProfileLoading } = useProfile();
  // The decision, not only the profile: on the trial week there are no plans
  // to pick, so this screen must not render at all.
  const { data: decision, isLoading: isDecisionLoading } = useCurrentChallenge();
  const isTrial = decision?.challenge_type === "trial_week";

  const [isStarting, setIsStarting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // The participation row fixes the currency at join; before it exists we fall
  // back to the region so the paywall never shows the wrong symbol.
  const currency = participation ? currencyFrom(participation.currency) : currencyForRegion();

  // The length chosen in the builder. The challenge row it selected is what
  // gets priced server-side; this is only the number the card should show.
  const weeks = loadLengthChoice() ?? CHALLENGE_WEEKS;

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

  // Reaching the plans is the intent signal — the screen where the prices are
  // first compared. No money is involved, so this one is safe to fire from the
  // browser; anything carrying value is sent server-side.
  useEffect(() => {
    // Wait for the decision as well as the profile: a trial never reaches the
    // plans, and the funnel must not count a paywall view that never showed.
    if (!isProfileLoading && !isDecisionLoading && !isTrial) {
      trackIntent("InitiateCheckout");
      // The journey's "saw paywall": anchored to the same moment as the pixel,
      // so the two tools can never disagree about what was counted.
      void recordVisit("saw_paywall");
    }
  }, [isProfileLoading, isDecisionLoading, isTrial]);

  const headline = PLANS.filter((plan) => HEADLINE_PLAN_IDS.includes(plan.id));
  const secondary = PLANS.filter((plan) => !HEADLINE_PLAN_IDS.includes(plan.id));

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

  if (isProfileLoading || isDecisionLoading) {
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

  // The trial week has no plans — the deposit is the whole offer. Anyone
  // steered here on trial terms (social sign-in, a stale link, back navigation)
  // goes straight to the paywall that prices their trial. Every trial path
  // enrols before it can land here, so payment always has a row to price
  // against.
  if (isTrial) {
    return <Navigate to="/pay" replace />;
  }

  return (
    <Screen>
      <StepProgress {...flowProgress("plan")} onBack={() => navigate(-1)} />

      {/* Same system as the screen before it: headline in the top band, bold
          not extra-bold, a clear band of nothing between each element. */}
      <h1 className="mx-auto mt-10 max-w-[18ch] text-center text-[2rem] font-bold leading-[1.2] tracking-[-0.02em] text-foreground animate-rise-in">
        Make this the last time you quit the gym.
      </h1>
      <p className="mt-4 text-center text-lg text-muted-foreground animate-rise-in [animation-delay:60ms]">
        Choose a plan
      </p>

      {/* The length was chosen on the builder; here it is only restated, with
          the door back open for anyone who landed here by another route. */}
      <p className="mt-6 text-center text-sm text-muted-foreground animate-rise-in [animation-delay:90ms]">
        Your {labelWeeks(weeks)} challenge ·{" "}
        <Link to="/challenge" className="font-semibold text-foreground underline-offset-4 hover:underline">
          change
        </Link>
      </p>

      <div className="mt-8 space-y-3.5">
        {headline.map((plan, index) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            currency={currency}
            weeks={weeks}
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
        className="mt-8 flex w-full items-center justify-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground animate-rise-in [animation-delay:260ms]"
      >
        {showOneTime ? "Hide one time options" : "Don't want a subscription? See one time options"}
        <ChevronDown className={cn("h-4 w-4 transition-transform", showOneTime ? "rotate-180" : "")} aria-hidden="true" />
      </button>
      {showOneTime ? (
        <div className="mt-4 space-y-3">
          {secondary.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              currency={currency}
              weeks={weeks}
              isSelected={selected === plan.id}
              onSelect={() => setSelected(plan.id)}
              delayMs={0}
            />
          ))}
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-4 rounded-md bg-destructive/15 px-4 py-3 text-sm font-medium text-danger-ink">
          {error}
        </p>
      ) : null}

      <ScreenActions>
        <Button size="xl" className="h-16 w-full rounded-full text-lg font-bold" onClick={() => void proceed()} disabled={isStarting}>
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
  weeks,
  isSelected,
  onSelect,
  delayMs,
  prominent = false,
}: {
  plan: Plan;
  currency: ReturnType<typeof currencyForRegion>;
  weeks: number;
  isSelected: boolean;
  onSelect: () => void;
  delayMs: number;
  prominent?: boolean;
}) {
  /**
   * One line per card, saying only when the money starts — the price on the
   * right and the subline here are the whole story. Anything more (per-month
   * maths, savings chips) is what overloaded the previous version.
   */
  const isOneTime = plan.interval === "one_off";
  const subline = isOneTime
    ? plan.id === "lifetime"
      ? "Pay once. Use forever."
      : "No subscription"
    : "Starts today.";

  return (
    <button
      type="button"
      role="radio"
      aria-checked={isSelected}
      onClick={onSelect}
      style={{ animationDelay: `${delayMs}ms` }}
      className={cn(
        "flex w-full items-center gap-4 rounded-lg border-2 px-5 text-left transition-all active:scale-[0.99] animate-rise-in",
        prominent ? "py-6" : "py-5",
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
        <span className="mt-1 block text-sm leading-snug text-muted-foreground">{subline}</span>
      </span>

      <span className={cn("tabular shrink-0 font-extrabold text-foreground", prominent ? "text-xl" : "text-lg")}>
        {formatFee(feeDueNow(plan, weeks), currency)}
      </span>
    </button>
  );
}
