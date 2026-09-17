import {
  Camera,
  Check,
  ChevronRight,
  Clock,
  Loader2,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { CountUpMoney } from "@/components/CountUp";
import { FourWeekCalendar } from "@/components/FourWeekCalendar";
import { Screen, ScreenActions } from "@/components/Screen";
import { WeekDots } from "@/components/WeekDots";
import { Button } from "@/components/ui/button";
import {
  CHALLENGE_WEEKS,
  currencyForRegion,
  depositFor,
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
 * Kept to one file on purpose: the demo deliberately drifts from the product
 * (simulated payment, instant approval) and that difference should be easy to
 * find rather than sprinkled through the real screens behind a flag.
 */
type DemoStep = "intro" | "problem" | "how" | "comparison" | "commit" | "confirming" | "home" | "end";

type DemoWorkout = { id: string; day: string; time: string };

/** The story a creator tells on camera: currently 2 a week, wants 4. */
const DEMO_GOAL = 4;
const DEMO_NOW = 2;

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

export default function CreatorDemo() {
  const currency = useMemo(() => currencyForRegion(), []);
  const deposit = depositFor(DEMO_GOAL, CHALLENGE_WEEKS);

  const [step, setStep] = useState<DemoStep>("intro");
  const [verified, setVerified] = useState<number>(2);
  const [workouts, setWorkouts] = useState<DemoWorkout[]>(seedWorkouts);

  /** Restarts the whole story — the fastest way to film a second take. */
  function restart(): void {
    setVerified(2);
    setWorkouts(seedWorkouts());
    setStep("intro");
  }

  function handleVerified(): void {
    setVerified(3);
    const { day, time } = nowLabel();
    setWorkouts((current) => [
      { id: `demo-now-${Date.now()}`, day, time },
      ...current,
    ]);
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

        {step === "intro" ? <Intro onStart={() => setStep("problem")} /> : null}
        {step === "problem" ? <Problem onNext={() => setStep("how")} /> : null}
        {step === "how" ? <HowItWorks onNext={() => setStep("comparison")} /> : null}
        {step === "comparison" ? <Comparison onNext={() => setStep("commit")} /> : null}
        {step === "commit" ? <Commit currency={currency} deposit={deposit} onNext={() => setStep("confirming")} /> : null}
        {step === "confirming" ? <Confirming onDone={() => setStep("home")} /> : null}
        {step === "home" ? (
          <Dashboard
            currency={currency}
            deposit={deposit}
            verified={verified}
            workouts={workouts}
            onVerified={handleVerified}
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

        <ul className="mt-8 space-y-3 text-sm text-muted-foreground animate-rise-in [animation-delay:120ms]">
          <li className="flex gap-2.5">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-success-ink" aria-hidden="true" />
            Film in order, or jump around with Restart demo
          </li>
          <li className="flex gap-2.5">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-success-ink" aria-hidden="true" />
            The money counts up on camera when a workout verifies
          </li>
          <li className="flex gap-2.5">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-success-ink" aria-hidden="true" />
            No account, no payment, nothing stored
          </li>
        </ul>
      </div>

      <ScreenActions>
        <Button size="xl" className="h-16 w-full rounded-full text-lg font-bold" onClick={onStart}>
          Start the demo
        </Button>
      </ScreenActions>
    </Screen>
  );
}

/** Tap anywhere to carry on, exactly like the real onboarding. */
function Problem({ onNext }: { onNext: () => void }) {
  return (
    <button
      type="button"
      onClick={onNext}
      className="flex flex-1 cursor-default flex-col items-center justify-center py-16 text-center"
    >
      <h1 className="max-w-[19ch] text-[2rem] font-bold leading-[1.2] tracking-[-0.02em] text-foreground animate-rise-in">
        You know how you've been telling yourself you'll be consistent with the gym, but somehow it never happens?
      </h1>
      <p className="mt-8 max-w-[30ch] text-base leading-relaxed text-muted-foreground animate-rise-in [animation-delay:400ms]">
        You're not alone. 90% of people stop going consistently after only three months.
      </p>
      <p className="mt-16 animate-pulse text-xs font-medium uppercase tracking-widest text-muted-foreground animate-rise-in [animation-delay:700ms]">
        Tap anywhere to carry on
      </p>
    </button>
  );
}

function HowItWorks({ onNext }: { onNext: () => void }) {
  const steps = [
    { title: "Put money on your workouts", body: "A refundable deposit, held — not taken." },
    { title: "Prove you went with a photo", body: "Time-stamped and location-stamped." },
    { title: "Earn it back, one workout at a time", body: "Complete a workout, get £5 back. Miss one, £5 is forfeited." },
  ];

  return (
    <Screen className="flex-1">
      <h1 className="mt-10 text-center text-[2rem] font-bold leading-[1.2] tracking-[-0.02em] text-foreground animate-rise-in">
        How it works
      </h1>

      <div className="mt-10 space-y-4">
        {steps.map((step, index) => (
          <div
            key={step.title}
            className="rounded-xl bg-card p-5 animate-rise-in"
            style={{ animationDelay: `${index * 90}ms` }}
          >
            <p className="tabular text-sm font-bold text-success-ink">{index + 1}</p>
            <p className="mt-1 text-lg font-bold text-foreground">{step.title}</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
          </div>
        ))}
      </div>

      <ScreenActions>
        <Button size="xl" className="h-16 w-full rounded-full text-lg font-bold" onClick={onNext}>
          Continue
        </Button>
      </ScreenActions>
    </Screen>
  );
}

/** The pivot of the real flow, reused outright: the gap, made visible. */
function Comparison({ onNext }: { onNext: () => void }) {
  return (
    <Screen className="flex-1">
      <h1 className="mx-auto mt-10 max-w-[18ch] text-center text-[2rem] font-bold leading-[1.2] tracking-[-0.02em] text-foreground animate-rise-in">
        Here's the next four weeks. Twice.
      </h1>

      <div className="mt-10 flex flex-1 flex-col justify-center pb-10">
        <FourWeekCalendar currentPerWeek={DEMO_NOW} goalPerWeek={DEMO_GOAL} />
      </div>

      <ScreenActions>
        <Button size="xl" className="h-16 w-full rounded-full text-lg font-bold" onClick={onNext}>
          Continue
        </Button>
      </ScreenActions>
    </Screen>
  );
}

/** The commitment, with the real maths — but the button charges nothing. */
function Commit({ currency, deposit, onNext }: { currency: CurrencyCode; deposit: number; onNext: () => void }) {
  const total = DEMO_GOAL * CHALLENGE_WEEKS;

  return (
    <Screen className="flex-1">
      <h1 className="mx-auto mt-10 max-w-[18ch] text-center text-[2rem] font-bold leading-[1.2] tracking-[-0.02em] text-foreground animate-rise-in">
        Now put something behind it.
      </h1>

      <div className="mt-10 animate-rise-in [animation-delay:80ms]">
        <dl className="divide-y divide-border overflow-hidden rounded-xl bg-card">
          <Row label="Your goal" value={`${DEMO_GOAL} workouts a week`} />
          <Row label="For" value="4 weeks" />
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
        <p className="mt-3 text-center text-xs text-muted-foreground">
          Demo — nothing is charged, this screen just carries on.
        </p>
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
      <p className="mt-3 max-w-[30ch] text-base leading-relaxed text-muted-foreground animate-rise-in [animation-delay:60ms]">
        Demo — in the app this is the moment the card is really charged.
      </p>
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
  verified,
  workouts,
  onVerified,
}: {
  currency: CurrencyCode;
  deposit: number;
  verified: number;
  workouts: DemoWorkout[];
  onVerified: () => void;
}) {
  const [isCameraOpen, setIsCameraOpen] = useState<boolean>(false);
  const [showPayoff, setShowPayoff] = useState<boolean>(false);

  const earned = verified * REWARD_PER_WORKOUT;
  const remaining = deposit - earned;
  const loggedToday = verified >= 3;

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
            Week <span className="tabular">1</span> of <span className="tabular">4</span>
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
              {verified} / {DEMO_GOAL} done
            </p>
          </div>

          <div className="mt-4">
            <WeekDots goal={DEMO_GOAL} verified={verified} pending={0} />
          </div>

          <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" aria-hidden="true" />
            <span>Week closes Sunday</span>
          </div>
        </section>

        <div className="mt-4 animate-rise-in [animation-delay:140ms]">
          <Button
            size="xl"
            className="w-full"
            disabled={loggedToday}
            onClick={() => setIsCameraOpen(true)}
          >
            <Camera className="h-5 w-5" aria-hidden="true" />
            {loggedToday ? "Logged for today" : "Verify a workout"}
          </Button>
          {loggedToday ? (
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
      <p
        className={cn(
          "tabular mt-2 text-3xl font-extrabold text-success-ink animate-rise-in [animation-delay:120ms]",
        )}
      >
        +{formatMoney(REWARD_PER_WORKOUT, currency)} earned back
      </p>
      <p className="mt-6 text-sm text-muted-foreground animate-rise-in [animation-delay:300ms]">
        In the app, a workout waits in review until it's approved. This one pays instantly — it's the demo.
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
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className="h-full w-full object-cover"
          />
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
            <Button
              className="h-14 flex-1"
              onClick={submit}
              disabled={isSubmitting}
            >
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
    "The comparison — the gap, made visible",
    "The commitment — money on the line",
    "The dashboard — the number counting up",
    "The payoff — workout verified",
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
        <Button size="xl" className="h-16 w-full rounded-full text-lg font-bold" onClick={() => (window.location.href = "/install")}>
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
