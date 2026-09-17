import { useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";

import { useAuth } from "@/context/AuthProvider";
import { enrolQuietly } from "@/lib/enrol";
import { flowProgress } from "@/lib/flow";

import { Screen, ScreenActions } from "@/components/Screen";
import { StepProgress } from "@/components/StepProgress";
import { Button } from "@/components/ui/button";
import { trackIntent } from "@/lib/meta";
import { currencyForRegion, currencyFrom } from "@/lib/money";
import { loadPlanChoice, savePlanChoice } from "@/lib/planChoice";
import {
  PLANS,
  HEADLINE_PLAN_IDS,
  formatFee,
  startsFree,
  type Plan,
  type PlanId,
} from "@/lib/plans";
import { queryKeys, useParticipation, useProfile } from "@/lib/queries";
import { cn } from "@/lib/utils";

/**
 * The access plan, chosen after the challenge is configured and before any money
 * is taken.
 *
 * Two screens, one idea each, Cal-AI style. The first sells the free challenge —
 * a single headline, a single line about the deposit, a single button — and only
 * after that does the plan choice appear, so nobody reads a plan comparison and
 * a deposit explanation at the same time. People who have already used their free
 * challenge skip the first screen entirely: nothing on it would be true for them.
 *
 * The deposit breakdown used to sit at the bottom of the plans and was the page's
 * overload problem; it lives on the payment screen now, next to the charge it
 * explains. Monthly stays selected by default so the decision is
 * confirm-or-switch, not pick-from-scratch.
 */
export default function PlanPicker() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: participation } = useParticipation();
  const { data: profile, isLoading: isProfileLoading } = useProfile();

  const [isStarting, setIsStarting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [introDone, setIntroDone] = useState<boolean>(false);

  // The participation row fixes the currency at join; before it exists we fall
  // back to the region so the paywall never shows the wrong symbol.
  const currency = participation ? currencyFrom(participation.currency) : currencyForRegion();

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

  const showIntro = !freeChallengeUsed && !introDone;

  // Reaching the plans is the intent signal — the screen where the prices are
  // first compared. The free-challenge screen deliberately doesn't count: it
  // carries no choice, and counting it would shift what "reached the paywall"
  // has meant in the funnel since launch. No money is involved, so this one is
  // safe to fire from the browser; anything carrying value is sent server-side.
  useEffect(() => {
    if (!isProfileLoading && !showIntro) {
      trackIntent("InitiateCheckout");
    }
  }, [isProfileLoading, showIntro]);

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

  if (showIntro) {
    return (
      <Screen>
        <StepProgress {...flowProgress("plan")} onBack={() => navigate(-1)} />

        {/* Cal AI's proportions, measured off the reference: headline in the top
            eighth, the product filling about half the screen, reassurance and
            button anchored at the bottom — with a clear band of nothing between
            each. The emptiness is the design. Crowding these three elements is
            what made the page read as cheap.

            The headline is bold, not extra-bold: at this size the heavier weight
            turned the words into a slab. Cal AI's headline is lighter than
            instinct suggests, and the air around it does the shouting. */}
        <h1 className="mx-auto mt-10 max-w-[18ch] text-center text-[2rem] font-bold leading-[1.2] tracking-[-0.02em] text-foreground animate-rise-in">
          Your first GymTaxx challenge is on us.
        </h1>

        <div className="relative flex min-h-0 flex-1 items-center justify-center py-10">
          {/* A soft mint bloom behind the phone. Without it a white mockup floats
              on a white page with nothing holding it; with it the screen gains
              depth and the brand colour appears without drawing a single box. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/30 blur-[64px]"
          />
          <img
            src="/free-challenge-preview.webp"
            alt="A verified GymTaxx workout showing five dollars earned back"
            width={700}
            height={1520}
            /* Height-led so the phone shrinks on short screens instead of
               pushing the button below the fold. */
            className="relative h-full max-h-[44vh] w-auto object-contain [filter:drop-shadow(0_26px_44px_rgba(15,23,42,0.18))] animate-rise-in [animation-delay:120ms]"
          />
        </div>

        {/* Directly above the button, Cal-AI style — the last thing read before
            the tap is what makes the tap feel safe. */}
        <div className="flex items-center justify-center gap-2 pb-6 animate-rise-in [animation-delay:200ms]">
          <Check className="h-[18px] w-[18px] shrink-0 text-foreground" strokeWidth={2.75} aria-hidden="true" />
          <p className="text-[15px] font-semibold text-foreground">
            Only your refundable deposit is due today
          </p>
        </div>

        <ScreenActions className="pt-0">
          <Button size="xl" className="h-16 w-full rounded-full text-lg font-bold" onClick={() => setIntroDone(true)}>
            Start my free challenge
          </Button>
        </ScreenActions>
      </Screen>
    );
  }

  return (
    <Screen>
      <StepProgress
        {...flowProgress("plan")}
        onBack={() =>
          // The intro screen is part of this decision, so back returns to it
          // rather than leaving the paywall — unless it never applied.
          !freeChallengeUsed && introDone ? setIntroDone(false) : navigate(-1)
        }
      />

      <div className="pt-6">
        <h1 className="text-center text-[2.75rem] font-extrabold leading-[1.08] tracking-tight text-foreground animate-rise-in">
          Make this the last time you quit the gym.
        </h1>
        <p className="mt-3 text-center text-lg text-muted-foreground animate-rise-in [animation-delay:60ms]">
          Choose a plan
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
        {showOneTime ? "Hide one time options" : "Don't want a subscription? See one time options"}
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
    : startsFree(plan, freeChallengeUsed)
      ? "Starts after your free challenge"
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
        <span className="mt-1 block text-sm leading-snug text-muted-foreground">{subline}</span>
      </span>

      <span className={cn("tabular shrink-0 font-extrabold text-foreground", prominent ? "text-xl" : "text-lg")}>
        {formatFee(plan.price, currency)}
      </span>
    </button>
  );
}
