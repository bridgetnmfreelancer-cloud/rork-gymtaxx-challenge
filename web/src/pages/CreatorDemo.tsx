import {
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flame,
  Loader2,
  Minus,
  MoreHorizontal,
  Plus,
  RotateCcw,
  ScanFace,
  Share,
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
  currencySymbol,
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
 * It also runs slightly AHEAD of the product. Choosing what each workout is
 * worth is a feature planned for later this year; it is here now because the
 * footage shot today has to still be true when it ships. Same for the Apple Pay
 * sheet: the real one is Stripe's hosted page, which can't be filmed safely.
 *
 * Kept to one file on purpose: the demo deliberately drifts from the product
 * (a chosen stake, a simulated payment, instant approval) and that difference
 * should be easy to find rather than sprinkled through the real screens.
 */
type DemoStep = "intro" | "install" | "goal" | "stake" | "commit" | "allin" | "home" | "end";

type DemoWorkout = { id: string; day: string; time: string };

/** Where the goal picker opens — the goal most people choose. */
const DEFAULT_GOAL: WeeklyGoal = 4;

/**
 * What one workout can be worth, in whole pounds or dollars.
 *
 * Capped at the product's own £5: the stake is what the deposit is built from,
 * and footage of someone staking £10 a session would be selling a challenge
 * that costs twice what GymTaxx actually charges.
 */
const MIN_STAKE = 1;
const MAX_STAKE = REWARD_PER_WORKOUT;

/** The steps a creator can walk back through, in order. */
const BACKABLE: DemoStep[] = ["install", "goal", "stake", "commit"];

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
  const [stake, setStake] = useState<number>(MAX_STAKE);
  const [didVerify, setDidVerify] = useState<boolean>(false);
  const [workouts, setWorkouts] = useState<DemoWorkout[]>(seedWorkouts);

  // The same sum the server does, with the stake chosen rather than fixed.
  const deposit = goal * CHALLENGE_WEEKS * stake;
  // Two banked before filming starts, three once the camera moment lands.
  const verified = didVerify ? 3 : 2;

  /** Restarts the whole story — the fastest way to film a second take. */
  function restart(): void {
    setGoal(DEFAULT_GOAL);
    setStake(MAX_STAKE);
    setDidVerify(false);
    setWorkouts(seedWorkouts());
    setStep("intro");
  }

  /** One step back, for re-filming a single screen without starting over. */
  function back(): void {
    const index = BACKABLE.indexOf(step);
    if (index <= 0) return;
    setStep(BACKABLE[index - 1]);
  }

  function handleVerified(): void {
    setDidVerify(true);
    const { day, time } = nowLabel();
    setWorkouts((current) => [{ id: `demo-now-${Date.now()}`, day, time }, ...current]);
  }

  return (
    <div className="min-h-full bg-background">
      <div className="mx-auto flex min-h-full w-full max-w-md flex-col px-5 pt-safe pb-safe">
        {/* The filming controls, kept deliberately small — discreet enough to
            crop out of a recording, present enough to find on take three.
            Back re-films one screen; restart re-films the whole story. */}
        {step !== "intro" && step !== "end" ? (
          <div className="flex items-center justify-between pt-2">
            {BACKABLE.indexOf(step) > 0 ? (
              <button
                type="button"
                onClick={back}
                aria-label="Back a step"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground transition-transform active:scale-90"
              >
                <ChevronLeft className="h-5 w-5" aria-hidden="true" />
              </button>
            ) : (
              <span />
            )}
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
          <GoalPicker goal={goal} onChange={setGoal} onNext={() => setStep("stake")} />
        ) : null}
        {step === "stake" ? (
          <StakePicker stake={stake} currency={currency} onChange={setStake} onNext={() => setStep("commit")} />
        ) : null}
        {step === "commit" ? (
          <Commit
            goal={goal}
            stake={stake}
            currency={currency}
            deposit={deposit}
            onPaid={() => setStep("allin")}
          />
        ) : null}
        {step === "allin" ? <AllIn onNext={() => setStep("home")} /> : null}
        {step === "home" ? (
          <Dashboard
            currency={currency}
            deposit={deposit}
            goal={goal}
            stake={stake}
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
 * What one workout is worth — the stake.
 *
 * This runs ahead of the product: today every workout is worth a flat £5 and
 * the deposit follows from the goal. Choosing it is planned for later this
 * year, and it's in the demo now so footage shot today is still true when it
 * ships. Capped at £5 so nobody films a challenge dearer than the real one.
 *
 * A dial rather than a grid on purpose: three tiles are one tap and gone,
 * while thumbing a number up and watching money appear is a shot.
 */
function StakePicker({
  stake,
  currency,
  onChange,
  onNext,
}: {
  stake: number;
  currency: CurrencyCode;
  onChange: (stake: number) => void;
  onNext: () => void;
}) {
  function nudge(by: number): void {
    const next = stake + by;
    if (next < MIN_STAKE || next > MAX_STAKE) return;
    onChange(next);
  }

  return (
    <Screen className="flex-1">
      {/* Three things on this screen, each with a clear band of air around it:
          the question, the amount, the action. An earlier version stacked a
          coin badge, a heading, the dial and a caption into the same space and
          read as cramped. */}
      <h1 className="mx-auto mt-14 max-w-[20ch] text-center text-[2rem] font-bold leading-[1.2] tracking-[-0.02em] text-foreground animate-rise-in">
        Choose your consequence when you skip the gym.
      </h1>

      <div className="relative flex flex-1 flex-col items-center justify-center py-14">
        {/* A soft mint bloom behind the figure, so the number sits on something
            rather than floating in white. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_55%_40%_at_50%_45%,rgba(134,239,172,0.22),transparent_70%)]"
        />

        <div className="relative flex items-center justify-center gap-8 animate-rise-in [animation-delay:80ms]">
          <StepperButton label="Lower the stake" onClick={() => nudge(-1)} disabled={stake <= MIN_STAKE} icon={Minus} />
          <span className="tabular flex w-[3.5ch] items-start justify-center text-[5rem] font-extrabold leading-none tracking-[-0.03em] text-foreground">
            <span className="mt-2 text-[2.5rem] font-bold">{currencySymbol(currency)}</span>
            {stake}
          </span>
          <StepperButton label="Raise the stake" onClick={() => nudge(1)} disabled={stake >= MAX_STAKE} icon={Plus} />
        </div>

        <p className="relative mt-8 text-base font-medium text-muted-foreground animate-rise-in [animation-delay:160ms]">
          per skipped session
        </p>
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
      className="flex h-14 w-14 items-center justify-center rounded-full border border-border bg-background text-foreground transition-all active:scale-[0.94] disabled:opacity-25"
    >
      <Icon className="h-6 w-6" strokeWidth={2.5} aria-hidden="true" />
    </button>
  );
}

/**
 * The total, and the payment.
 *
 * One hero number with the sum that produced it underneath, because the whole
 * point of the two screens before this was watching that figure get built. The
 * Apple Pay sheet is a reproduction: the real payment leaves for Stripe's
 * hosted page, which can't be filmed without real card details, and a creator
 * cannot be walked up to a screen that takes actual money.
 */
function Commit({
  goal,
  stake,
  currency,
  deposit,
  onPaid,
}: {
  goal: WeeklyGoal;
  stake: number;
  currency: CurrencyCode;
  deposit: number;
  onPaid: () => void;
}) {
  const [isSheetOpen, setIsSheetOpen] = useState<boolean>(false);

  return (
    <>
      <Screen className="flex-1">
        <div className="flex flex-1 flex-col justify-center pb-6 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground animate-rise-in">
            Your total stake
          </p>
          <CountUpMoney
            value={deposit}
            currency={currency}
            className="mt-3 block text-[4.5rem] font-extrabold leading-none tracking-tight text-foreground animate-rise-in [animation-delay:60ms]"
          />

          <div className="mx-auto mt-8 w-full rounded-xl bg-card px-5 py-5 animate-rise-in [animation-delay:140ms]">
            <p className="tabular text-xl font-semibold text-foreground">
              {goal} × {CHALLENGE_WEEKS} weeks × {formatMoney(stake, currency)}
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              workouts per week × challenge length × what each one is worth
            </p>
          </div>

          <p className="mx-auto mt-8 max-w-[32ch] text-sm leading-relaxed text-muted-foreground animate-rise-in [animation-delay:200ms]">
            Every workout you prove earns {formatMoney(stake, currency)} back. Finish all four weeks and the whole
            {" "}
            {formatMoney(deposit, currency)} comes home.
          </p>
        </div>

        <ScreenActions>
          <Button
            size="xl"
            className="h-16 w-full rounded-full text-lg font-bold"
            onClick={() => setIsSheetOpen(true)}
          >
            Pay {formatMoney(deposit, currency)} with Apple Pay
          </Button>
        </ScreenActions>
      </Screen>

      {isSheetOpen ? (
        <ApplePaySheet
          amount={deposit}
          currency={currency}
          onCancel={() => setIsSheetOpen(false)}
          onDone={onPaid}
        />
      ) : null}
    </>
  );
}

/**
 * A reproduction of the Apple Pay sheet, in its three beats: double-click to
 * pay, Face ID, confirmed. Each one advances on a timer once started, so a
 * creator holds the phone naturally through the payment rather than tapping
 * through a mock-up.
 */
type PayPhase = "confirm" | "faceid" | "done";

function ApplePaySheet({
  amount,
  currency,
  onCancel,
  onDone,
}: {
  amount: number;
  currency: CurrencyCode;
  onCancel: () => void;
  onDone: () => void;
}) {
  const [phase, setPhase] = useState<PayPhase>("confirm");

  useEffect(() => {
    if (phase === "faceid") {
      const timer = setTimeout(() => setPhase("done"), 1500);
      return () => clearTimeout(timer);
    }
    if (phase === "done") {
      const timer = setTimeout(onDone, 1600);
      return () => clearTimeout(timer);
    }
  }, [phase, onDone]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/30">
      <div className="rounded-t-[1.75rem] bg-background px-6 pb-safe pt-3 animate-sheet-up">
        <div className="mx-auto h-1 w-9 rounded-full bg-border" aria-hidden="true" />

        {phase === "confirm" ? (
          <div className="pb-6 pt-7 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Apple Pay</p>
            <p className="tabular mt-2 text-[2.75rem] font-extrabold leading-none text-foreground">
              {formatMoney(amount, currency)}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">GymTaxx · Refundable deposit</p>

            <Button
              size="xl"
              className="mt-7 h-14 w-full rounded-full text-base font-bold"
              onClick={() => setPhase("faceid")}
            >
              Double-click to Pay {formatMoney(amount, currency)}
            </Button>
            <button
              type="button"
              onClick={onCancel}
              className="mt-3 w-full py-3 text-sm font-medium text-muted-foreground"
            >
              Cancel
            </button>
          </div>
        ) : null}

        {phase === "faceid" ? (
          <div className="flex flex-col items-center py-14 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-border animate-pop-in">
              <ScanFace className="h-10 w-10 text-foreground" strokeWidth={1.75} aria-hidden="true" />
            </div>
            <p className="mt-6 text-lg font-semibold text-foreground">Authenticate with Face ID</p>
            <p className="mt-1 text-sm text-muted-foreground">Look at your iPhone</p>
          </div>
        ) : null}

        {phase === "done" ? (
          <div className="flex flex-col items-center py-14 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-accent animate-pop-in">
              <Check className="h-10 w-10 text-success-ink" strokeWidth={3} aria-hidden="true" />
            </div>
            <p className="mt-6 text-lg font-semibold text-foreground">Payment confirmed</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {formatMoney(amount, currency)} staked on your challenge
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** The beat after paying: they're committed, and there's one thing to do. */
function AllIn({ onNext }: { onNext: () => void }) {
  return (
    <Screen className="flex-1">
      <div className="flex flex-1 flex-col items-center justify-center pb-10 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-accent animate-pop-in">
          <Flame className="h-10 w-10 text-success-ink" aria-hidden="true" />
        </div>
        <h1 className="mt-7 text-[2.5rem] font-extrabold leading-[1.1] tracking-tight text-foreground animate-rise-in">
          You're all in.
        </h1>
        <p className="mx-auto mt-3 max-w-[30ch] text-base leading-relaxed text-muted-foreground animate-rise-in [animation-delay:60ms]">
          Prove a workout to start earning it back. Every session brings more of it home.
        </p>
      </div>

      <ScreenActions>
        <Button size="xl" className="h-16 w-full rounded-full text-lg font-bold" onClick={onNext}>
          Log a workout
        </Button>
      </ScreenActions>
    </Screen>
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
  stake,
  verified,
  didVerify,
  workouts,
  onVerified,
  onFinish,
}: {
  currency: CurrencyCode;
  deposit: number;
  goal: WeeklyGoal;
  stake: number;
  verified: number;
  didVerify: boolean;
  workouts: DemoWorkout[];
  onVerified: () => void;
  onFinish: () => void;
}) {
  const [isCameraOpen, setIsCameraOpen] = useState<boolean>(false);
  const [showPayoff, setShowPayoff] = useState<boolean>(false);

  const earned = verified * stake;
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
        <DemoCameraCapture
          onClose={() => setIsCameraOpen(false)}
          onUse={() => {
            setIsCameraOpen(false);
            onVerified();
            setShowPayoff(true);
          }}
        />
      ) : null}

      {showPayoff ? <VerifiedPayoff currency={currency} stake={stake} /> : null}
    </>
  );
}

/**
 * The payoff, on the moment: workout verified, money earned back. In the real
 * app this waits on review; here it is instant because it is the thing being
 * filmed. The dashboard behind it animates the money up on its own.
 */
function VerifiedPayoff({ currency, stake }: { currency: CurrencyCode; stake: number }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background px-8 text-center">
      <div className="flex h-24 w-24 items-center justify-center rounded-full bg-accent animate-pop-in">
        <Check className="h-12 w-12 text-success-ink" strokeWidth={3} aria-hidden="true" />
      </div>
      <h2 className="mt-8 text-[2rem] font-bold leading-[1.2] tracking-[-0.02em] text-foreground animate-rise-in">
        Workout verified
      </h2>
      <p className="tabular mt-2 text-3xl font-extrabold text-success-ink animate-rise-in [animation-delay:120ms]">
        +{formatMoney(stake, currency)} earned back
      </p>
    </div>
  );
}

/**
 * A real camera, because the footage has to look right. Falls back to a skip
 * when no camera exists (desktop preview, denied permission) so the demo can
 * never dead-end mid-filming.
 */
function DemoCameraCapture({ onUse, onClose }: { onUse: () => void; onClose: () => void }) {
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
    "The stake — thumbing it up to £5 a session",
    "The payment — Face ID, and the money is on the line",
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
