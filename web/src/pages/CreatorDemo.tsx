import {
  Camera,
  Check,
  ChevronRight,
  Clock,
  Loader2,
  Minus,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Share,
  ShieldCheck,
  Sparkles,
  SquarePlus,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { CountUpMoney } from "@/components/CountUp";
import { Logo } from "@/components/Logo";
import { Screen, ScreenActions } from "@/components/Screen";
import { WeekDots } from "@/components/WeekDots";
import { Button } from "@/components/ui/button";
import {
  CHALLENGE_WEEKS,
  WEEKLY_GOALS,
  currencyForRegion,
  depositFor,
  formatMoney,
  REWARD_PER_WORKOUT,
  type CurrencyCode,
  type WeeklyGoal,
} from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * The creator demo: an unlisted walkthrough of GymTaxx for UGC creators to film.
 *
 * It exists so a creator never becomes a customer with money attached. Nothing
 * here touches the database, Stripe, the review queue or the ad platform — every
 * screen is local demo state — so the link can be handed out freely, and anyone
 * who stumbles onto it gets a thing that gives nothing away. The camera is real
 * (footage has to look right) and verification pays out instantly rather than
 * going to review, because the payoff moment is the point being filmed.
 *
 * It is deliberately NOT the funnel. The persuasion run — the problem, how it
 * works, the questions, the four-week comparison — is there to convince a
 * stranger, and a creator filming the product doesn't need convincing. So the
 * demo goes install, set up the challenge, put money behind it, earn it back.
 * Nothing on screen announces itself as a mock-up either: anyone watching a
 * video can see that it is one, and the disclaimers were landing in shot.
 *
 * Kept to one file on purpose: the demo deliberately drifts from the product
 * (simulated payment, instant approval) and that difference should be easy to
 * find rather than sprinkled through the real screens behind a flag.
 */
type DemoStep = "intro" | "install" | "goal" | "deposit" | "commit" | "confirming" | "home" | "end";

type DemoWorkout = { id: string; day: string; time: string };

/** Where the goal picker opens — the goal most people choose. */
const DEFAULT_GOAL: WeeklyGoal = 4;

/** Two workouts already banked, so the dashboard opens with money on it. */
function seedWorkouts(): DemoWorkout[] {
  return [
    { id: "demo-mon", day: "Monday", time: "07:12" },
    { id: "demo-wed", day: "Wednesday", time: "18:40" },
  ];
}

function nowLabel(): { day: string; time: string } {
  const now = new Date();
  return {
    day: new Intl.DateTimeFormat("en-GB", { weekday: "long" }).format(now),
    time: new Intl.DateTimeFormat("en-GB", { hour: "numeric", minute: "2-digit" }).format(now),
  };
}

/**
 * Point the page at the demo's own home-screen manifest while it's open.
 *
 * Without this, installing from the demo produces an icon that launches the
 * real app: iPhone reads the manifest of whatever page you install from, and
 * the app-wide one starts at "/", which is the sign-up funnel. A creator who
 * installed the demo to film it full screen would be asked to log in.
 *
 * The swap is undone on the way out, so installing from any other screen still
 * lands on the real app.
 */
function useDemoManifest(): void {
  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    const title = document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-title"]');
    const previousManifest = link?.getAttribute("href") ?? null;
    const previousTitle = title?.getAttribute("content") ?? null;

    link?.setAttribute("href", "/demo.webmanifest");
    title?.setAttribute("content", "GymTaxx Demo");
    document.title = "GymTaxx Demo";

    return () => {
      if (previousManifest) link?.setAttribute("href", previousManifest);
      if (previousTitle) title?.setAttribute("content", previousTitle);
      document.title = "GymTaxx";
    };
  }, []);
}

export default function CreatorDemo() {
  const currency = useMemo(() => currencyForRegion(), []);

  useDemoManifest();

  const [step, setStep] = useState<DemoStep>("intro");
  const [goal, setGoal] = useState<WeeklyGoal>(DEFAULT_GOAL);
  const [didVerify, setDidVerify] = useState<boolean>(false);
  const [workouts, setWorkouts] = useState<DemoWorkout[]>(seedWorkouts);

  const deposit = depositFor(goal, CHALLENGE_WEEKS);
  // Two banked before filming starts, three once the camera moment lands.
  const verified = didVerify ? 3 : 2;

  /** Restarts the whole story — the fastest way to film a second take. */
  function restart(): void {
    setGoal(DEFAULT_GOAL);
    setDidVerify(false);
    setWorkouts(seedWorkouts());
    setStep("intro");
  }

  function handleVerified(): void {
    setDidVerify(true);
    const { day, time } = nowLabel();
    setWorkouts((current) => [{ id: `demo-now-${Date.now()}`, day, time }, ...current]);
  }

  return (
    <div className="min-h-full bg-background">
      <div className="mx-auto flex min-h-full w-full max-w-md flex-col px-5 pt-safe pb-safe">
        {/* The restart affordance, kept deliberately small — discreet enough to
            crop out of a recording, present enough to find on take three. */}
        {step !== "intro" && step !== "end" ? (
          <div className="flex items-center justify-end pt-2">
            <button
              type="button"
              onClick={restart}
              className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground"
            >
              <RotateCcw className="h-3 w-3" aria-hidden="true" />
              Restart demo
            </button>
          </div>
        ) : null}

        {step === "intro" ? <Intro onStart={() => setStep("install")} /> : null}
        {step === "install" ? <InstallSteps onNext={() => setStep("goal")} /> : null}
        {step === "goal" ? (
          <GoalPicker goal={goal} onChange={setGoal} onNext={() => setStep("deposit")} />
        ) : null}
        {step === "deposit" ? (
          <DepositStepper
            goal={goal}
            currency={currency}
            onChange={setGoal}
            onNext={() => setStep("commit")}
          />
        ) : null}
        {step === "commit" ? (
          <Commit goal={goal} currency={currency} deposit={deposit} onNext={() => setStep("confirming")} />
        ) : null}
        {step === "confirming" ? <Confirming onDone={() => setStep("home")} /> : null}
        {step === "home" ? (
          <Dashboard
            currency={currency}
            deposit={deposit}
            goal={goal}
            verified={verified}
            didVerify={didVerify}
            workouts={workouts}
            onVerified={handleVerified}
            onFinish={() => setStep("end")}
          />
        ) : null}
        {step === "end" ? <End onRestart={restart} /> : null}
      </div>
    </div>
  );
}

/** Shown to the creator, never on camera — what this is and what it isn't. */
function Intro({ onStart }: { onStart: () => void }) {
  return (
    <Screen className="flex-1">
      <div className="flex flex-1 flex-col justify-center py-10">
        <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-accent animate-pop-in">
          <Sparkles className="h-7 w-7 text-success-ink" aria-hidden="true" />
        </div>

        <h1 className="mt-6 text-display text-foreground animate-rise-in">Creator demo.</h1>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground animate-rise-in [animation-delay:60ms]">
          A full walkthrough of GymTaxx for filming. Nothing here is real — no account, no payment, nothing saved. The
          camera is your real camera; the money is pretend.
        </p>
      </div>

      <ScreenActions>
        <Button size="xl" className="h-16 w-full rounded-full text-lg font-bold" onClick={onStart}>
          Start the demo
        </Button>
      </ScreenActions>
    </Screen>
  );
}

/**
 * The install steps, filmable.
 *
 * Word for word the real install screen, minus the browser detection: that
 * exists to catch someone who arrived from a TikTok link, and a red "you can't
 * install from Chrome" warning appearing mid-shoot would be noise. Creators
 * film on iPhone Safari, so this is the Safari path.
 */
function InstallSteps({ onNext }: { onNext: () => void }) {
  const steps: { title: ReactNode; detail?: ReactNode }[] = [
    {
      title: "Open this page in Safari",
      detail: (
        <p className="mt-1.5 text-base leading-relaxed text-muted-foreground">
          GymTaxx can only be installed from Safari on iPhone.
        </p>
      ),
    },
    {
      title: (
        <>
          Tap the <span className="font-semibold">Share</span> button
        </>
      ),
      detail: (
        <>
          <span className="mt-2.5 block">
            <ControlBox icon={Share} />
          </span>
          <p className="mt-2.5 text-base leading-loose text-muted-foreground">
            Don't see it? Tap <RoundChip icon={MoreHorizontal} label="Browser menu" /> to reveal it.
          </p>
        </>
      ),
    },
    {
      title: (
        <>
          Tap <span className="font-semibold">View more</span>
        </>
      ),
      detail: (
        <span className="mt-2.5 block">
          <Chip label="View more" />
        </span>
      ),
    },
    {
      title: (
        <>
          Tap <span className="font-semibold">Add to Home Screen</span>
        </>
      ),
      detail: (
        <span className="mt-2.5 block">
          <ControlBox icon={SquarePlus} label="Add to Home Screen" />
        </span>
      ),
    },
  ];

  return (
    <Screen className="flex-1">
      <div className="mt-6 flex animate-rise-in flex-col items-center text-center">
        <Logo size={64} />
        <h1 className="mt-6 text-4xl font-bold leading-[1.1] tracking-tight text-foreground">
          Install the GymTaxx app
        </h1>
      </div>

      <ol className="mt-12 space-y-7">
        {steps.map((step, index) => (
          <li key={index} className="flex gap-3 animate-rise-in" style={{ animationDelay: `${80 + index * 70}ms` }}>
            <span className="tabular shrink-0 text-base font-bold text-muted-foreground">{index + 1}.</span>
            <div className="min-w-0">
              <p className="text-base leading-snug text-foreground">{step.title}</p>
              {step.detail}
            </div>
          </li>
        ))}
      </ol>

      <ScreenActions>
        <Button size="xl" className="h-16 w-full rounded-full text-lg font-bold" onClick={onNext}>
          Continue
        </Button>
      </ScreenActions>
    </Screen>
  );
}

/** An inline reproduction of a real browser button, as on the install screen. */
function Chip({ label }: { label: string }) {
  return (
    <span className="mx-0.5 inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-border bg-card px-2 py-1 align-middle text-[0.9375rem] font-semibold leading-none text-foreground">
      {label}
    </span>
  );
}

/** A round chip, matching how a browser renders its overflow menu button. */
function RoundChip({ icon: Icon, label }: { icon: typeof Share; label: string }) {
  return (
    <span
      className="mx-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full border border-border bg-card align-middle text-foreground"
      role="img"
      aria-label={label}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
    </span>
  );
}

/** A standalone swatch of the control, shown under its step. */
function ControlBox({ icon: Icon, label }: { icon: typeof Share; label?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2.5 rounded-lg border border-border",
        label ? "px-3.5 py-2.5" : "h-12 w-12 justify-center",
      )}
      role="img"
      aria-label={label ?? "Share"}
    >
      <Icon className="h-5 w-5 shrink-0 text-foreground" aria-hidden="true" />
      {label ? <span className="text-base font-semibold text-foreground">{label}</span> : null}
    </span>
  );
}

/** Choosing the weekly commitment — the real screen's copy and grid. */
function GoalPicker({
  goal,
  onChange,
  onNext,
}: {
  goal: WeeklyGoal;
  onChange: (goal: WeeklyGoal) => void;
  onNext: () => void;
}) {
  return (
    <Screen className="flex-1">
      <h1 className="mx-auto mt-10 max-w-[18ch] text-center text-[2rem] font-bold leading-[1.2] tracking-[-0.02em] text-foreground animate-rise-in">
        Choose your weekly commitment
      </h1>
      <p className="mx-auto mt-3 max-w-[32ch] text-center text-base leading-relaxed text-muted-foreground animate-rise-in [animation-delay:80ms]">
        How many workouts will you complete each week during your GymTaxx monthly challenge?
      </p>

      <div className="mt-10 animate-rise-in [animation-delay:160ms]">
        <div className="grid grid-cols-3 gap-3" role="radiogroup" aria-label="Workouts per week">
          {WEEKLY_GOALS.map((option) => {
            const isSelected = option === goal;
            return (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => onChange(option)}
                className={cn(
                  "flex h-24 flex-col items-center justify-center rounded-lg border-2 transition-all active:scale-[0.97]",
                  isSelected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-transparent bg-card text-foreground hover:border-border",
                )}
              >
                <span className="tabular text-3xl font-extrabold leading-none">{option}</span>
                <span
                  className={cn(
                    "mt-1 text-xs font-medium",
                    isSelected ? "text-primary-foreground/70" : "text-muted-foreground",
                  )}
                >
                  a week
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <ScreenActions>
        <Button size="xl" className="h-16 w-full rounded-full text-lg font-bold" onClick={onNext}>
          Continue
        </Button>
      </ScreenActions>
    </Screen>
  );
}

/**
 * The same number again, but as a stepper — and this time the money moves with
 * it. A grid of three options is one tap and gone; nudging a dial up to five
 * and watching the deposit climb is a shot. It exists for the footage.
 */
function DepositStepper({
  goal,
  currency,
  onChange,
  onNext,
}: {
  goal: WeeklyGoal;
  currency: CurrencyCode;
  onChange: (goal: WeeklyGoal) => void;
  onNext: () => void;
}) {
  const min = WEEKLY_GOALS[0];
  const max = WEEKLY_GOALS[WEEKLY_GOALS.length - 1];
  const deposit = depositFor(goal, CHALLENGE_WEEKS);

  function nudge(by: number): void {
    const next = goal + by;
    if (next < min || next > max) return;
    onChange(next as WeeklyGoal);
  }

  return (
    <Screen className="flex-1">
      <h1 className="mx-auto mt-10 max-w-[18ch] text-center text-[2rem] font-bold leading-[1.2] tracking-[-0.02em] text-foreground animate-rise-in">
        Workouts a week
      </h1>

      <div className="flex flex-1 flex-col justify-center pb-6">
        <div className="flex items-center justify-center gap-8 animate-rise-in [animation-delay:80ms]">
          <StepperButton
            label="One fewer workout a week"
            onClick={() => nudge(-1)}
            disabled={goal <= min}
            icon={Minus}
          />
          <span className="tabular w-[3ch] text-center text-[5.5rem] font-extrabold leading-none text-foreground">
            {goal}
          </span>
          <StepperButton label="One more workout a week" onClick={() => nudge(1)} disabled={goal >= max} icon={Plus} />
        </div>

        <div className="mt-12 rounded-xl bg-card p-6 text-center animate-rise-in [animation-delay:140ms]">
          <p className="text-sm font-medium text-muted-foreground">Your refundable deposit</p>
          <CountUpMoney
            value={deposit}
            currency={currency}
            className="mt-1 block text-5xl font-extrabold leading-none text-foreground"
            durationMs={520}
          />
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {goal * CHALLENGE_WEEKS} workouts over {CHALLENGE_WEEKS} weeks, {formatMoney(REWARD_PER_WORKOUT, currency)}{" "}
            earned back for each one.
          </p>
        </div>
      </div>

      <ScreenActions>
        <Button size="xl" className="h-16 w-full rounded-full text-lg font-bold" onClick={onNext}>
          Continue
        </Button>
      </ScreenActions>
    </Screen>
  );
}

function StepperButton({
  label,
  icon: Icon,
  onClick,
  disabled,
}: {
  label: string;
  icon: typeof Minus;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex h-16 w-16 items-center justify-center rounded-full bg-card text-foreground transition-all active:scale-[0.94] disabled:opacity-30"
    >
      <Icon className="h-7 w-7" strokeWidth={2.5} aria-hidden="true" />
    </button>
  );
}

/** The commitment, with the real maths — but the button charges nothing. */
function Commit({
  goal,
  currency,
  deposit,
  onNext,
}: {
  goal: WeeklyGoal;
  currency: CurrencyCode;
  deposit: number;
  onNext: () => void;
}) {
  const total = goal * CHALLENGE_WEEKS;

  return (
    <Screen className="flex-1">
      <h1 className="mx-auto mt-10 max-w-[18ch] text-center text-[2rem] font-bold leading-[1.2] tracking-[-0.02em] text-foreground animate-rise-in">
        Now put something behind it.
      </h1>

      <div className="mt-10 animate-rise-in [animation-delay:80ms]">
        <dl className="divide-y divide-border overflow-hidden rounded-xl bg-card">
          <Row label="Your goal" value={`${goal} workouts a week`} />
          <Row label="For" value={`${CHALLENGE_WEEKS} weeks`} />
          <Row label="Total" value={`${total} workouts`} />
          <Row label="Each worth" value={formatMoney(REWARD_PER_WORKOUT, currency)} />
        </dl>

        <div className="mt-4 rounded-xl border-2 border-accent/40 bg-accent/25 p-5">
          <p className="text-sm font-medium text-success-ink">Your commitment</p>
          <p className="tabular mt-1 text-4xl font-extrabold text-foreground">{formatMoney(deposit, currency)}</p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Complete a workout and {formatMoney(REWARD_PER_WORKOUT, currency)} is earned back. Miss one and it's
            forfeited. Finish all four weeks and every penny comes home.
          </p>
        </div>
      </div>

      <ScreenActions>
        <Button size="xl" className="h-16 w-full rounded-full text-lg font-bold" onClick={onNext}>
          Pay {formatMoney(deposit, currency)} deposit
        </Button>
      </ScreenActions>
    </Screen>
  );
}

/** A beat of confirmation between paying and the dashboard, like the real app. */
function Confirming({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, 1800);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center py-16 text-center">
      <div className="relative flex h-24 w-24 items-center justify-center">
        <Loader2 className="absolute h-24 w-24 animate-spin text-accent" strokeWidth={1.5} aria-hidden="true" />
        <ShieldCheck className="h-10 w-10 text-foreground" aria-hidden="true" />
      </div>
      <h1 className="mt-8 text-[2rem] font-bold leading-[1.2] tracking-[-0.02em] text-foreground animate-rise-in">
        Confirming your deposit.
      </h1>
    </div>
  );
}

/**
 * The dashboard, mirroring the real one closely enough that footage reads as
 * the product: navy money card, the week's ticks, the deadline, recent
 * workouts, one large verify button.
 */
function Dashboard({
  currency,
  deposit,
  goal,
  verified,
  didVerify,
  workouts,
  onVerified,
  onFinish,
}: {
  currency: CurrencyCode;
  deposit: number;
  goal: WeeklyGoal;
  verified: number;
  didVerify: boolean;
  workouts: DemoWorkout[];
  onVerified: () => void;
  onFinish: () => void;
}) {
  const [isCameraOpen, setIsCameraOpen] = useState<boolean>(false);
  const [showPayoff, setShowPayoff] = useState<boolean>(false);

  const earned = verified * REWARD_PER_WORKOUT;
  const remaining = deposit - earned;

  // The payoff overlay clears itself; the count-up happens underneath it, in
  // the money card, because that's the shot: the number moving on its own.
  useEffect(() => {
    if (!showPayoff) return;
    const timer = setTimeout(() => setShowPayoff(false), 2400);
    return () => clearTimeout(timer);
  }, [showPayoff]);

  return (
    <>
      <Screen className="flex-1">
        <header className="flex items-baseline justify-between py-4">
          <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            Week <span className="tabular">1</span> of <span className="tabular">{CHALLENGE_WEEKS}</span>
          </p>
          <p className="text-sm font-medium text-muted-foreground">GymTaxx Challenge</p>
        </header>

        <section className="rounded-lg bg-primary p-6 animate-rise-in">
          <p className="text-sm font-medium text-primary-foreground/70">Earned back</p>
          <div className="mt-1 flex items-baseline gap-3">
            <CountUpMoney
              value={earned}
              currency={currency}
              className="text-[3.25rem] font-extrabold leading-none text-accent"
            />
            <span className="text-base font-medium text-primary-foreground/60">
              of {formatMoney(deposit, currency)}
            </span>
          </div>
          <p className="mt-2 text-sm text-primary-foreground/70">
            {formatMoney(remaining, currency)} still to earn
          </p>
        </section>

        <section className="mt-4 rounded-lg bg-card p-5 animate-rise-in [animation-delay:80ms]">
          <div className="flex items-baseline justify-between">
            <p className="font-semibold text-foreground">This week</p>
            <p className="tabular text-sm font-medium text-muted-foreground">
              {verified} / {goal} done
            </p>
          </div>

          <div className="mt-4">
            <WeekDots goal={goal} verified={verified} pending={0} />
          </div>

          <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" aria-hidden="true" />
            <span>Week closes Sunday</span>
          </div>
        </section>

        <div className="mt-4 animate-rise-in [animation-delay:140ms]">
          <Button size="xl" className="w-full" disabled={didVerify} onClick={() => setIsCameraOpen(true)}>
            <Camera className="h-5 w-5" aria-hidden="true" />
            {didVerify ? "Logged for today" : "Verify a workout"}
          </Button>
          {didVerify ? (
            <p className="mt-3 text-center text-xs text-muted-foreground">
              One workout a day counts. Come back tomorrow.
            </p>
          ) : null}
        </div>

        <section className="mt-8 animate-rise-in [animation-delay:200ms]">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-foreground">Recent workouts</h2>
          </div>

          <ul className="mt-3 space-y-2">
            {workouts.map((workout) => (
              <li key={workout.id} className="flex items-center justify-between rounded-md bg-card px-4 py-3">
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{workout.day}</p>
                  <p className="text-xs text-muted-foreground">{workout.time}</p>
                </div>
                <span className="rounded-full bg-accent px-3 py-1 text-xs font-semibold text-success-ink">
                  Verified
                </span>
              </li>
            ))}
          </ul>
        </section>

        <ScreenActions className="bg-transparent">
          <button
            type="button"
            onClick={onFinish}
            className="w-full py-2 text-sm font-medium text-muted-foreground underline-offset-4 hover:underline"
          >
            Finish the demo
          </button>
        </ScreenActions>
      </Screen>

      {isCameraOpen ? (
        <CameraCapture
          onClose={() => setIsCameraOpen(false)}
          onUse={() => {
            setIsCameraOpen(false);
            onVerified();
            setShowPayoff(true);
          }}
        />
      ) : null}

      {showPayoff ? <VerifiedPayoff currency={currency} /> : null}
    </>
  );
}

/**
 * The payoff, on the moment: workout verified, money earned back. In the real
 * app this waits on review; here it is instant because it is the thing being
 * filmed. The dashboard behind it animates the money up on its own.
 */
function VerifiedPayoff({ currency }: { currency: CurrencyCode }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background px-8 text-center">
      <div className="flex h-24 w-24 items-center justify-center rounded-full bg-accent animate-pop-in">
        <Check className="h-12 w-12 text-success-ink" strokeWidth={3} aria-hidden="true" />
      </div>
      <h2 className="mt-8 text-[2rem] font-bold leading-[1.2] tracking-[-0.02em] text-foreground animate-rise-in">
        Workout verified
      </h2>
      <p className="tabular mt-2 text-3xl font-extrabold text-success-ink animate-rise-in [animation-delay:120ms]">
        +{formatMoney(REWARD_PER_WORKOUT, currency)} earned back
      </p>
    </div>
  );
}

/**
 * A real camera, because the footage has to look right. Falls back to a skip
 * when no camera exists (desktop preview, denied permission) so the demo can
 * never dead-end mid-filming.
 */
function CameraCapture({ onUse, onClose }: { onUse: () => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [shot, setShot] = useState<string | null>(null);
  const [hasCamera, setHasCamera] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;

    async function start(): Promise<void> {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
      } catch {
        if (!cancelled) setHasCamera(false);
      }
    }

    void start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  function capture(): void {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    setShot(canvas.toDataURL("image/jpeg", 0.85));
  }

  function submit(): void {
    setIsSubmitting(true);
    // A beat of submitting, the way the real upload reads on camera.
    setTimeout(onUse, 900);
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center justify-between p-4 pt-safe">
        <p className="text-sm font-semibold text-white">Gym proof</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close camera"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      <div className="relative flex-1 overflow-hidden">
        {shot ? (
          <img src={shot} alt="Your gym proof" className="h-full w-full object-contain" />
        ) : (
          <video ref={videoRef} playsInline muted autoPlay className="h-full w-full object-cover" />
        )}

        {!hasCamera ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-neutral-900 px-8 text-center">
            <Camera className="h-10 w-10 text-white/60" aria-hidden="true" />
            <p className="text-sm leading-relaxed text-white/80">
              No camera here. On a phone this is the live viewfinder — but the demo can carry on without a photo.
            </p>
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-center gap-4 p-6 pb-safe">
        {shot ? (
          <>
            <Button
              variant="outline"
              className="h-14 flex-1 border-white/30 bg-transparent text-white hover:bg-white/10"
              onClick={() => setShot(null)}
              disabled={isSubmitting}
            >
              Retake
            </Button>
            <Button className="h-14 flex-1" onClick={submit} disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : null}
              Use photo
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="outline"
              className="h-14 border-white/30 bg-transparent text-white hover:bg-white/10"
              onClick={onClose}
            >
              Cancel
            </Button>
            <button
              type="button"
              onClick={capture}
              disabled={!hasCamera}
              aria-label="Take photo"
              className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-white bg-white/20 disabled:opacity-30"
            >
              <span className="h-14 w-14 rounded-full bg-white" />
            </button>
            <Button
              variant="outline"
              className={cn(
                "h-14 border-white/30 bg-transparent text-white hover:bg-white/10",
                hasCamera ? "invisible" : "",
              )}
              onClick={() => submit()}
            >
              Skip
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

/** The wrap card: what was filmed, and where the real thing lives. */
function End({ onRestart }: { onRestart: () => void }) {
  const moments = [
    "The install — it goes on the home screen",
    "The goal — the deposit climbing with it",
    "The commitment — money on the line",
    "The payoff — verified, and the money counting up",
  ];

  return (
    <Screen className="flex-1">
      <div className="flex flex-1 flex-col justify-center py-10">
        <h1 className="text-[2rem] font-bold leading-[1.2] tracking-[-0.02em] text-foreground animate-rise-in">
          That's the whole story.
        </h1>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground animate-rise-in [animation-delay:60ms]">
          The four moments worth filming, in order:
        </p>

        <ul className="mt-8 space-y-3 animate-rise-in [animation-delay:120ms]">
          {moments.map((moment, index) => (
            <li key={moment} className="flex items-center gap-3 rounded-xl bg-card px-4 py-3.5">
              <span className="tabular flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-success-ink">
                {index + 1}
              </span>
              <span className="text-sm font-medium text-foreground">{moment}</span>
            </li>
          ))}
        </ul>
      </div>

      <ScreenActions>
        <Button
          size="xl"
          className="h-16 w-full rounded-full text-lg font-bold"
          onClick={() => (window.location.href = "/install")}
        >
          Start for real
          <ChevronRight className="h-5 w-5" aria-hidden="true" />
        </Button>
        <button
          type="button"
          onClick={onRestart}
          className="mt-3 w-full py-2 text-sm font-medium text-muted-foreground underline-offset-4 hover:underline"
        >
          Film another take
        </button>
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
