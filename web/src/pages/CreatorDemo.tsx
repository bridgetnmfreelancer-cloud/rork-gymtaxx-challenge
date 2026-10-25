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
import { Bell, CreditCard, Dumbbell, Wallet } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { ChoiceButton } from "@/components/ChoiceButton";
import { CountUpMoney } from "@/components/CountUp";
import { Logo } from "@/components/Logo";
import { Screen, ScreenActions } from "@/components/Screen";
import { WeekDots } from "@/components/WeekDots";
import { Button } from "@/components/ui/button";
import {
  CHALLENGE_WEEKS,
  currencyForRegion,
  currencySymbol,
  formatMoney,
  REWARD_PER_WORKOUT,
  type CurrencyCode,
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
 * Two shorter side stories film the other beats: a skipped workout taking its
 * £5, and the weekly challenge — one week's goal and stake, paid, then the
 * first workout earned back from a standing start.
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
type DemoStep =
  | "intro"
  | "ask"
  | "penalty"
  | "install"
  | "goal"
  | "stake"
  | "commit"
  | "w_goal"
  | "w_stake"
  | "w_commit"
  | "w_home"
  | "w_ask"
  | "w_penalty"
  | "allin"
  | "home"
  | "end";

type DemoWorkout = { id: string; day: string; time: string };

/**
 * Where the counters open: at one, never on a pre-chosen answer.
 *
 * The real screen offers 3–5 as tiles; the demo counts up from one so a
 * creator is visibly choosing on camera, and the taps buy a viewer time
 * to read the question before the final number lands.
 */
const DEFAULT_GOAL = 1;
const MIN_GOAL = 1;
/** The same ceiling the real screen offers — nobody films a promise the product can't take. */
const MAX_GOAL = 5;

/**
 * What one workout can be worth, in whole pounds or dollars.
 *
 * Capped at the product's own £5: the stake is what the deposit is built from,
 * and footage of someone staking £10 a session would be selling a challenge
 * that costs twice what GymTaxx actually charges.
 */
const MIN_STAKE = 1;
const MAX_STAKE = REWARD_PER_WORKOUT;

/** The steps a creator can walk back through, in order — install after payment,
 *  matching the real flow since 22 Oct 2026. The w_ steps are the weekly
 *  challenge's own run of the same story. */
const BACKABLE: DemoStep[] = ["goal", "stake", "commit", "install", "w_goal", "w_stake", "w_commit"];

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

/** The fixed price of a skipped session in the demo, matching the product's £5 stake. */
const SKIP_PENALTY = REWARD_PER_WORKOUT;
/** The balance the penalty screen starts from, and what the skip leaves. */
const BALANCE_BEFORE = 80;
const BALANCE_AFTER = BALANCE_BEFORE - SKIP_PENALTY;
/** The weekly story's balance: one week's stake pot, £5 lighter after a skip. */
const WEEKLY_BALANCE_BEFORE = 20;
const WEEKLY_BALANCE_AFTER = WEEKLY_BALANCE_BEFORE - SKIP_PENALTY;

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
  const [goal, setGoal] = useState<number>(DEFAULT_GOAL);
  const [stake, setStake] = useState<number>(MIN_STAKE);
  const [didVerify, setDidVerify] = useState<boolean>(false);
  const [workouts, setWorkouts] = useState<DemoWorkout[]>(seedWorkouts);
  // The weekly challenge's own picks — one week, so the total is goal × stake.
  // It starts with nothing banked: the story is earning the first £5 back.
  const [weeklyGoal, setWeeklyGoal] = useState<number>(DEFAULT_GOAL);
  const [weeklyStake, setWeeklyStake] = useState<number>(MIN_STAKE);
  const [weeklyWorkouts, setWeeklyWorkouts] = useState<DemoWorkout[]>([]);
  const [weeklyLogged, setWeeklyLogged] = useState<boolean>(false);

  // The same sum the server does, with the stake chosen rather than fixed.
  const deposit = goal * CHALLENGE_WEEKS * stake;
  const weeklyTotal = weeklyGoal * weeklyStake;
  // Two banked before filming starts, three once the camera moment lands.
  const verified = didVerify ? 3 : 2;

  /** Restarts the whole story — the fastest way to film a second take. All counters rewind to one. */
  function restart(): void {
    setGoal(DEFAULT_GOAL);
    setStake(MIN_STAKE);
    setWeeklyGoal(DEFAULT_GOAL);
    setWeeklyStake(MIN_STAKE);
    setWeeklyWorkouts([]);
    setWeeklyLogged(false);
    setDidVerify(false);
    setWorkouts(seedWorkouts());
    setStep("intro");
  }

  /** One step back, for re-filming a single screen without starting over. */
  function back(): void {
    const index = BACKABLE.indexOf(step);
    if (index <= 0) return;
    // The weekly story never crosses into the monthly one: walking back from
    // the weekly goal leaves that story, not the four-week one.
    setStep(step === "w_goal" ? "intro" : BACKABLE[index - 1]);
  }

  function handleVerified(): void {
    setDidVerify(true);
    const { day, time } = nowLabel();
    setWorkouts((current) => [{ id: `demo-now-${Date.now()}`, day, time }, ...current]);
  }

  /** Same moment for the weekly challenge, but onto its own empty list. */
  function handleWeeklyVerified(): void {
    setWeeklyLogged(true);
    const { day, time } = nowLabel();
    setWeeklyWorkouts((current) => [{ id: `demo-weekly-now-${Date.now()}`, day, time }, ...current]);
  }

  return (
    <div className="min-h-full bg-background">
      <div className="relative mx-auto flex min-h-full w-full max-w-md flex-col px-5 pt-safe pb-safe">
        {/* The filming controls, kept deliberately small — discreet enough to
            crop out of a recording, present enough to find on take three.
            Back re-films one screen; restart re-films the whole story. On the
            question screen they float clear of the content, so the question
            centres in the whole screen rather than the space below them. */}
        {step === "ask" || step === "w_ask" ? (
          <button
            type="button"
            onClick={restart}
            className="absolute right-5 top-3 z-10 flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground"
          >
            <RotateCcw className="h-3 w-3" aria-hidden="true" />
            Restart demo
          </button>
        ) : step !== "intro" && step !== "end" ? (
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

        {step === "intro" ? (
          <Intro
            onStart={() => setStep("goal")}
            onSkipped={() => setStep("ask")}
            onWeekly={() => setStep("w_goal")}
            onWeeklySkipped={() => setStep("w_ask")}
          />
        ) : null}
        {step === "ask" ? (
          <GymCheck onYes={() => setStep("intro")} onNo={() => setStep("penalty")} />
        ) : null}
        {step === "penalty" ? (
          <SkippedPenalty
            currency={currency}
            before={BALANCE_BEFORE}
            after={BALANCE_AFTER}
            onDone={() => setStep("intro")}
          />
        ) : null}
        {step === "w_ask" ? (
          <GymCheck onYes={() => setStep("intro")} onNo={() => setStep("w_penalty")} />
        ) : null}
        {step === "w_penalty" ? (
          <SkippedPenalty
            currency={currency}
            before={WEEKLY_BALANCE_BEFORE}
            after={WEEKLY_BALANCE_AFTER}
            onDone={() => setStep("intro")}
          />
        ) : null}
        {step === "install" ? <InstallSteps onNext={() => setStep("allin")} /> : null}
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
            onPaid={() => setStep("install")}
          />
        ) : null}
        {step === "w_goal" ? (
          <WeeklyCounter
            heading="Next week's gym goal."
            caption="times next week"
            value={weeklyGoal}
            withSymbol={false}
            currency={currency}
            onChange={setWeeklyGoal}
            onNext={() => setStep("w_stake")}
          />
        ) : null}
        {step === "w_stake" ? (
          <WeeklyCounter
            heading="Consequence for skipping."
            caption="per skipped session"
            value={weeklyStake}
            withSymbol={true}
            currency={currency}
            onChange={setWeeklyStake}
            onNext={() => setStep("w_commit")}
          />
        ) : null}
        {step === "w_commit" ? (
          <WeeklyCommit
            goal={weeklyGoal}
            stake={weeklyStake}
            currency={currency}
            total={weeklyTotal}
            onPaid={() => setStep("w_home")}
          />
        ) : null}
        {step === "w_home" ? (
          <Dashboard
            currency={currency}
            deposit={weeklyTotal}
            goal={weeklyGoal}
            stake={weeklyStake}
            verified={weeklyWorkouts.length}
            didVerify={weeklyLogged}
            workouts={weeklyWorkouts}
            headerLeft="Weekly challenge"
            headerRight="GymTaxx"
            emptyWorkouts="Nothing logged yet. The first verified workout starts the money coming home."
            onVerified={handleWeeklyVerified}
            onFinish={restart}
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
            headerLeft={
              <>
                Week <span className="tabular">1</span> of <span className="tabular">{CHALLENGE_WEEKS}</span>
              </>
            }
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
function Intro({
  onStart,
  onSkipped,
  onWeekly,
  onWeeklySkipped,
}: {
  onStart: () => void;
  onSkipped: () => void;
  onWeekly: () => void;
  onWeeklySkipped: () => void;
}) {
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
        <Button
          size="xl"
          variant="outline"
          className="mt-3 h-14 w-full rounded-full text-base font-semibold"
          onClick={onSkipped}
        >
          Skipped workout
        </Button>
        <Button
          size="xl"
          variant="outline"
          className="mt-3 h-14 w-full rounded-full text-base font-semibold"
          onClick={onWeekly}
        >
          Weekly challenges
        </Button>
        <Button
          size="xl"
          variant="outline"
          className="mt-3 h-14 w-full rounded-full text-base font-semibold"
          onClick={onWeeklySkipped}
        >
          Skipped a weekly workout
        </Button>
      </ScreenActions>
    </Screen>
  );
}

/**
 * The morning question, leading into the skip penalty.
 *
 * A separate little story from the main walkthrough — filmed on its own, so it
 * gets its own entry point on the intro and no camera controls of its own.
 * "Yes" walks back to the intro; the penalty only ever follows a "No".
 */
function GymCheck({ onYes, onNo }: { onYes: () => void; onNo: () => void }) {
  return (
    <Screen className="flex-1">
      {/* Everything centred — icon, question and both options on the middle
          of the screen, not crowded up against the camera controls above. */}
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-accent animate-pop-in">
          <Dumbbell className="h-7 w-7 text-success-ink" aria-hidden="true" />
        </div>

        <h1 className="mt-6 text-[2rem] font-bold leading-[1.2] tracking-[-0.02em] text-foreground animate-rise-in">
          Going to the gym today?
        </h1>

        <div className="mt-10 w-full space-y-3">
          <ChoiceButton label="Yes" isSelected={false} onSelect={onYes} delayMs={80} />
          <ChoiceButton label="No" isSelected={false} onSelect={onNo} delayMs={160} />
        </div>
      </div>
    </Screen>
  );
}

/**
 * Counts a balance down from one figure to another, once, on film.
 *
 * The countdown is the shot the creator asked for: the number visibly moving
 * rather than a before-and-after. It waits for `delayMs` (the notification
 * lands first), then eases out over `durationMs`, and reports `done` exactly
 * once so the rest of the screen can react to the money having landed.
 */
function useCountDown(from: number, to: number, durationMs: number, delayMs: number, onDone: () => void): number {
  const [value, setValue] = useState<number>(from);

  useEffect(() => {
    let raf = 0;
    let finished = false;
    const timer = setTimeout(() => {
      const start = performance.now();
      const tick = (now: number): void => {
        const t = Math.min((now - start) / durationMs, 1);
        const eased = 1 - Math.pow(1 - t, 3);
        // Whole pounds, so the countdown reads 80, 79, 78… and lands on 75.
        setValue(Math.round(from + (to - from) * eased));
        if (t < 1) {
          raf = requestAnimationFrame(tick);
        } else if (!finished) {
          finished = true;
          onDone();
        }
      };
      raf = requestAnimationFrame(tick);
    }, delayMs);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, [from, to, durationMs, delayMs, onDone]);

  return value;
}

/**
 * The charge, played as three beats on one screen: the notification drops in
 * the way a system notification does, the balance counts down in whole
 * pounds, and the −£5 chip and the ledger line land once the money has. The
 * starting balance is passed in — £80 for the monthly story, £20 for the
 * weekly one — but the skip always costs the same £5.
 */
function SkippedPenalty({
  currency,
  before,
  after,
  onDone,
}: {
  currency: CurrencyCode;
  before: number;
  after: number;
  onDone: () => void;
}) {
  const [settled, setSettled] = useState<boolean>(false);
  const symbol = currencySymbol(currency);

  const handleSettled = useCallback(() => setSettled(true), []);
  const balance = useCountDown(before, after, 1600, 1100, handleSettled);

  const today = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" }).format(new Date());

  return (
    <Screen className="flex-1">
      {/* Beat one: the notification, dropping from the top the way iOS
          presents its own — the creator asked for exactly this. */}
      <div className="mt-6 rounded-xl bg-card p-6 shadow-lg shadow-black/5 animate-drop-in">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary">
            <Bell className="h-5 w-5 text-accent" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-base font-bold leading-snug text-foreground">Payment notification</p>
            <p className="text-sm text-muted-foreground">GymTaxx · Now</p>
          </div>
          <Wallet className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        </div>
        <p className="mt-4 text-lg font-semibold leading-snug text-foreground">
          {formatMoney(SKIP_PENALTY, currency)} charged for skipping the gym
        </p>
      </div>

      {/* Beat two: the balance, counting down on its own. */}
      <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">Your balance</p>
        <div className="mt-4 flex items-center gap-3">
          <span className="tabular text-[4rem] font-extrabold leading-none tracking-[-0.03em] text-foreground">
            {symbol}
            {balance}
          </span>
          {settled ? (
            <span className="rounded-full bg-destructive/15 px-2.5 py-1 text-sm font-bold text-danger-ink animate-pop-in">
              −{formatMoney(SKIP_PENALTY, currency)}
            </span>
          ) : null}
        </div>
        <p className="mt-4 text-base text-muted-foreground">
          Previous balance {symbol}
          {before}
        </p>
      </div>

      {/* Beat three: the ledger. */}
      {settled ? (
        <div className="space-y-5 pb-4">
          <div className="flex items-center justify-between rounded-xl bg-card px-6 py-5 animate-rise-in">
            <div>
              <p className="font-semibold text-foreground">Missed workout</p>
              <p className="text-sm text-muted-foreground">{today}</p>
            </div>
            <span className="tabular text-lg font-bold text-danger-ink">
              −{formatMoney(SKIP_PENALTY, currency)}
            </span>
          </div>

          <Button size="xl" className="h-14 w-full rounded-full text-base font-bold" onClick={onDone}>
            <CreditCard className="h-5 w-5" aria-hidden="true" />
            Done
          </Button>
        </div>
      ) : null}
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

/**
 * Choosing the weekly commitment — a counter, not the real screen's grid.
 *
 * Three tiles are one tap and gone. A counter opening at one makes the choice
 * itself the shot: the creator thumbs it up to three, four or five, and every
 * tap is a beat in which the question above has time to be read.
 */function GoalPicker({
  goal,
  onChange,
  onNext,
}: {
  goal: number;
  onChange: (goal: number) => void;
  onNext: () => void;
}) {
  function nudge(by: number): void {
    const next = goal + by;
    if (next < MIN_GOAL || next > MAX_GOAL) return;
    onChange(next);
  }

  return (
    <Screen className="flex-1">
      <h1 className="mx-auto mt-10 max-w-[18ch] text-center text-[2rem] font-bold leading-[1.2] tracking-[-0.02em] text-foreground animate-rise-in">
        How many times will you go to the gym?
      </h1>

      <div className="relative flex flex-1 flex-col items-center justify-center py-10">
        {/* The same soft bloom as the stake screen, so the two counters read
            as one repeated gesture rather than two different screens. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_55%_40%_at_50%_45%,rgba(134,239,172,0.22),transparent_70%)]"
        />

        <div className="relative flex items-center justify-center gap-8 animate-rise-in [animation-delay:160ms]">
          <StepperButton label="Fewer workouts a week" onClick={() => nudge(-1)} disabled={goal <= MIN_GOAL} icon={Minus} />
          <span
            className="tabular flex w-[2ch] items-center justify-center text-[5rem] font-extrabold leading-none tracking-[-0.03em] text-foreground"
            role="status"
            aria-label={`${goal} workouts a week`}
          >
            {goal}
          </span>
          <StepperButton label="More workouts a week" onClick={() => nudge(1)} disabled={goal >= MAX_GOAL} icon={Plus} filled />
        </div>

        <p className="relative mt-8 text-base font-medium text-muted-foreground animate-rise-in [animation-delay:160ms]">
          times per week
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

/**
 * What one workout is worth — the stake.
 *
 * This runs ahead of the product: today every workout is worth a flat £5 and
 * the deposit follows from the goal. Choosing it is planned for later this
 * year, and it's in the demo now so footage shot today is still true when it
 * ships. Capped at £5 so nobody films a challenge dearer than the real one.
 *
 * A dial rather than a grid on purpose: three tiles are one tap and gone,
 * while thumbing a number up and watching money appear is a shot. It opens
 * at £1, not £5, so that thumb-up journey is always filmed, never skipped.
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
          <StepperButton label="Raise the stake" onClick={() => nudge(1)} disabled={stake >= MAX_STAKE} icon={Plus} filled />
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
  filled = false,
}: {
  label: string;
  icon: typeof Minus;
  onClick: () => void;
  disabled: boolean;
  /** The raise side is filled, the lower side outlined — the way forward is the louder control. */
  filled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(
        "flex h-14 w-14 items-center justify-center rounded-full border transition-all active:scale-[0.94] disabled:opacity-25",
        filled ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground",
      )}
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
  goal: number;
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
 * The weekly challenge's two counters, one component for both.
 *
 * Same gesture as the monthly pickers — a counter opening at one, a soft
 * bloom behind it, Continue — but with the weekly wording, and the money
 * counter carries a currency symbol where the goal counter shows a bare
 * number. The stake stays capped at the product's £5, for the same reason
 * the monthly one does.
 */
function WeeklyCounter({
  heading,
  caption,
  value,
  withSymbol,
  currency,
  onChange,
  onNext,
}: {
  heading: string;
  caption: string;
  value: number;
  withSymbol: boolean;
  currency: CurrencyCode;
  onChange: (value: number) => void;
  onNext: () => void;
}) {
  const min = withSymbol ? MIN_STAKE : MIN_GOAL;
  const max = withSymbol ? MAX_STAKE : MAX_GOAL;

  function nudge(by: number): void {
    const next = value + by;
    if (next < min || next > max) return;
    onChange(next);
  }

  return (
    <Screen className="flex-1">
      <h1 className="mx-auto mt-14 max-w-[20ch] text-center text-[2rem] font-bold leading-[1.2] tracking-[-0.02em] text-foreground animate-rise-in">
        {heading}
      </h1>

      <div className="relative flex flex-1 flex-col items-center justify-center py-14">
        {/* The same soft mint bloom as the monthly counters, so the repeated
            gesture reads as the product, not as two different screens. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_55%_40%_at_50%_45%,rgba(134,239,172,0.22),transparent_70%)]"
        />

        <div className="relative flex items-center justify-center gap-8 animate-rise-in [animation-delay:80ms]">
          <StepperButton
            label={withSymbol ? "Lower the stake" : "Fewer workouts next week"}
            onClick={() => nudge(-1)}
            disabled={value <= min}
            icon={Minus}
          />
          {withSymbol ? (
            <span className="tabular flex w-[3.5ch] items-start justify-center text-[5rem] font-extrabold leading-none tracking-[-0.03em] text-foreground">
              <span className="mt-2 text-[2.5rem] font-bold">{currencySymbol(currency)}</span>
              {value}
            </span>
          ) : (
            <span
              className="tabular flex w-[2ch] items-center justify-center text-[5rem] font-extrabold leading-none tracking-[-0.03em] text-foreground"
              role="status"
              aria-label={`${value} times next week`}
            >
              {value}
            </span>
          )}
          <StepperButton
            label={withSymbol ? "Raise the stake" : "More workouts next week"}
            onClick={() => nudge(1)}
            disabled={value >= max}
            icon={Plus}
            filled
          />
        </div>

        <p className="relative mt-8 text-base font-medium text-muted-foreground animate-rise-in [animation-delay:160ms]">
          {caption}
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

/**
 * The weekly total, and the payment.
 *
 * The same hero-number moment as the monthly Commit, but the sum is one
 * week's arithmetic — goal × stake — and the button says Pay, since there is
 * no four-week stake to spell out. Payment runs through the same simulated
 * Apple Pay sheet, and paying runs into the dashboard at zero: the money is
 * on the line, and the next thing worth filming is earning the first stake
 * back.
 */
function WeeklyCommit({
  goal,
  stake,
  currency,
  total,
  onPaid,
}: {
  goal: number;
  stake: number;
  currency: CurrencyCode;
  total: number;
  onPaid: () => void;
}) {
  const [isSheetOpen, setIsSheetOpen] = useState<boolean>(false);

  return (
    <>
      <Screen className="flex-1">
        <div className="flex flex-1 flex-col justify-center pb-6 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground animate-rise-in">
            Total stake
          </p>
          <CountUpMoney
            value={total}
            currency={currency}
            className="mt-3 block text-[4.5rem] font-extrabold leading-none tracking-tight text-foreground animate-rise-in [animation-delay:60ms]"
          />

          <div className="mx-auto mt-8 w-full rounded-xl bg-card px-5 py-5 animate-rise-in [animation-delay:140ms]">
            <p className="tabular text-xl font-semibold text-foreground">
              {goal} × {formatMoney(stake, currency)}
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              workouts next week × what each skip costs
            </p>
          </div>

          <p className="mx-auto mt-8 max-w-[32ch] text-sm leading-relaxed text-muted-foreground animate-rise-in [animation-delay:200ms]">
            Every workout you prove earns {formatMoney(stake, currency)} back. Finish the week and the whole
            {" "}
            {formatMoney(total, currency)} comes home.
          </p>
        </div>

        <ScreenActions>
          <Button
            size="xl"
            className="h-16 w-full rounded-full text-lg font-bold"
            onClick={() => setIsSheetOpen(true)}
          >
            Pay
          </Button>
        </ScreenActions>
      </Screen>

      {isSheetOpen ? (
        <ApplePaySheet amount={total} currency={currency} onCancel={() => setIsSheetOpen(false)} onDone={onPaid} />
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
 *
 * Both stories end here. The monthly one opens with two workouts banked; the
 * weekly one opens at zero and earns its first stake back on camera, so the
 * header wording and the empty-workouts note are passed in per story.
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
  headerLeft,
  headerRight = "GymTaxx Challenge",
  emptyWorkouts,
}: {
  currency: CurrencyCode;
  deposit: number;
  goal: number;
  stake: number;
  verified: number;
  didVerify: boolean;
  workouts: DemoWorkout[];
  onVerified: () => void;
  onFinish: () => void;
  /** The headline over the money card — "Week 1 of 4" for the monthly story,
   *  "Weekly challenge" for the one-week one. */
  headerLeft: ReactNode;
  headerRight?: string;
  /** Shown in place of an empty recent-workouts list; omitted when the story
   *  already has banked workouts on arrival. */
  emptyWorkouts?: string;
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
          <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">{headerLeft}</p>
          <p className="text-sm font-medium text-muted-foreground">{headerRight}</p>
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

          {workouts.length > 0 ? (
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
          ) : emptyWorkouts ? (
            <p className="mt-3 rounded-md bg-card px-4 py-3 text-sm leading-relaxed text-muted-foreground">
              {emptyWorkouts}
            </p>
          ) : null}
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
    "The stake — thumbing it up to £5 a session",
    "The payment — Face ID, and the money is on the line",
    "The install — it goes on the home screen",
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
