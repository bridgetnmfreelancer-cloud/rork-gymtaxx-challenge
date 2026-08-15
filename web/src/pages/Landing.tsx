import { Banknote, Camera, Check, Clock, MapPin, ShieldCheck, Target } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Logo, Wordmark } from "@/components/Logo";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthProvider";
import {
  CHALLENGE_WEEKS,
  REWARD_PER_WORKOUT,
  currencyForRegion,
  currencySymbol,
  depositFor,
  formatMoney,
} from "@/lib/money";
import { isStandalone } from "@/lib/pwa";

/** The example goal every figure on the page is worked out from. */
const EXAMPLE_GOAL = 4;

/**
 * The paid-traffic landing page, living inside the app rather than on the
 * marketing site.
 *
 * It exists here for one reason: Meta will only accept a landing page that
 * carries the pixel, and the pixel lives in this app's HTML. Because that tag
 * is in the static document rather than added by script, it fires on this route
 * without anything extra being wired up.
 *
 * Deliberately currency-neutral — the old `/5poundchallenge` slug can't
 * describe a dollar deposit, so every amount here is derived from the reader's
 * own region using the same pricing rule the server charges on.
 */
export default function Landing() {
  const navigate = useNavigate();
  const { session } = useAuth();

  const currency = useMemo(() => currencyForRegion(), []);
  const symbol = currencySymbol(currency);
  const exampleDeposit = formatMoney(depositFor(EXAMPLE_GOAL), currency);
  const perWorkout = `${symbol}${REWARD_PER_WORKOUT}`;

  const heroCta = useRef<HTMLDivElement | null>(null);
  const [showStickyCta, setShowStickyCta] = useState<boolean>(false);

  useEffect(() => {
    document.title = "GymTaxx | Put money behind every workout";
  }, []);

  /**
   * Show the sticky bar only once the hero button has scrolled away, so there's
   * never a second button competing with the first one.
   */
  useEffect(() => {
    const target = heroCta.current;
    if (!target || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      ([entry]) => setShowStickyCta(!entry.isIntersecting),
      { rootMargin: "-8px 0px 0px 0px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  /**
   * Send them wherever they actually need to go.
   *
   * Most arrivals are cold Safari traffic that needs the install steps, but the
   * same link gets shared and reopened, so someone already signed in shouldn't
   * be told to install an app they're standing inside.
   */
  const start = useCallback((): void => {
    if (session) navigate("/home");
    else if (isStandalone()) navigate("/welcome");
    else navigate("/install");
  }, [navigate, session]);

  return (
    <div className="min-h-full bg-background">
      {/* ---------------------------------------------------------------- hero */}
      <header className="bg-primary text-primary-foreground">
        <div className="mx-auto w-full max-w-md px-5 pt-safe">
          <div className="flex items-center gap-2.5 py-5">
            <Logo size={32} />
            <span className="text-lg font-extrabold tracking-tight text-primary-foreground">
              GYM<span className="text-primary-foreground/50">TAXX</span>
            </span>
          </div>

          <div className="pb-10 pt-4">
            <p className="inline-flex items-center gap-2 rounded-full bg-primary-foreground/10 px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-accent animate-rise-in">
              The {CHALLENGE_WEEKS} week challenge
            </p>

            <h1 className="mt-5 text-[2.75rem] font-extrabold leading-[1.03] tracking-tight animate-rise-in [animation-delay:60ms]">
              Put {perWorkout} behind
              <br />
              every workout.
            </h1>

            <p className="mt-5 text-lg leading-relaxed text-primary-foreground/70 animate-rise-in [animation-delay:120ms]">
              Motivation runs out. Money doesn't. Commit your own {exampleDeposit}, prove each gym visit, and earn every{" "}
              {perWorkout} of it back.
            </p>

            <div ref={heroCta} className="mt-8 animate-rise-in [animation-delay:180ms]">
              <Button
                size="xl"
                onClick={start}
                className="w-full bg-accent text-success-ink hover:bg-accent/90"
              >
                Download the app
              </Button>
              <p className="mt-3 text-center text-sm text-primary-foreground/60">
                Free to install on iPhone. No App Store needed.
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* ------------------------------------------------------- the mechanic */}
      <section className="mx-auto w-full max-w-md px-5 py-12">
        <h2 className="text-title text-foreground">Your own money. Nobody else's.</h2>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground">
          You hold {exampleDeposit} behind a {EXAMPLE_GOAL}-workout week. Every workout you verify earns {perWorkout} of
          it back. Complete all {EXAMPLE_GOAL * CHALLENGE_WEEKS} and the whole deposit is yours again.
        </p>

        <div className="mt-6 space-y-3">
          <Assurance icon={ShieldCheck} title="Fully refundable">
            The most you can ever get back is exactly what you put in. There's nothing to gain beyond your own deposit,
            and nobody else's money is involved.
          </Assurance>
          <Assurance icon={Clock} title="Paid up front, earned back">
            The deposit is taken once, when you join. You're never charged at the moment you miss a workout.
          </Assurance>
        </div>
      </section>

      {/* -------------------------------------------------------- how it works */}
      <section className="bg-card py-12">
        <div className="mx-auto w-full max-w-md px-5">
          <h2 className="text-title text-foreground">How it works</h2>

          <ol className="mt-6 space-y-3">
            <Step
              icon={Target}
              index={1}
              title="Choose your weekly goal"
              detail={`3, 4 or 5 workouts a week for ${CHALLENGE_WEEKS} weeks.`}
            />
            <Step
              icon={Banknote}
              index={2}
              title={`Put ${perWorkout} behind each workout`}
              detail="Your own money, held up front. That's what makes it real."
            />
            <Step
              icon={Camera}
              index={3}
              title="Verify each workout"
              detail="A quick photo from the gym, stamped with the time and place."
            />
            <Step
              icon={Check}
              index={4}
              title="Complete your goal, earn your deposit back"
              detail={`Every workout you prove earns ${perWorkout} of your money back.`}
            />
          </ol>
        </div>
      </section>

      {/* ------------------------------------------------------- verification */}
      <section className="mx-auto w-full max-w-md px-5 py-12">
        <h2 className="text-title text-foreground">Proof, not promises</h2>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground">
          A workout only counts once it's verified. That's what stops this being another goal you quietly drop in week
          two.
        </p>

        <div className="mt-6 space-y-3">
          <Assurance icon={Camera} title="Live camera only">
            You take the photo at the gym, there and then. There's no way to upload an old picture from your library.
          </Assurance>
          <Assurance icon={MapPin} title="Time and place recorded">
            Each photo is stamped with when and where it was taken. No signal in the basement? The time still counts and
            we check it by hand.
          </Assurance>
        </div>
      </section>

      {/* ---------------------------------------------------------------- faq */}
      <section className="bg-card py-12">
        <div className="mx-auto w-full max-w-md px-5">
          <h2 className="text-title text-foreground">Questions</h2>

          <Accordion type="single" collapsible className="mt-4">
            <Faq question="How much do I have to put behind it?">
              Your weekly goal, times {CHALLENGE_WEEKS} weeks, times {perWorkout}. A {EXAMPLE_GOAL}-workout week comes
              to {exampleDeposit}. You see the exact figure before you pay anything.
            </Faq>
            <Faq question={`Can I really get all ${exampleDeposit} back?`}>
              Yes. Verify every workout in your goal and the full deposit returns to you, {perWorkout} at a time. That's
              also the ceiling — you can never end up with more than you put in.
            </Faq>
            <Faq question="What happens if I miss one?">
              The {perWorkout} behind that workout is forfeited. Nothing else changes, and the rest of your deposit is
              still yours to earn.
            </Faq>
            <Faq question="How do you know I actually went?">
              Every submission is a live photo from the gym with the time and place attached, and each one is checked by
              hand before the money moves.
            </Faq>
            <Faq question="Do I need the App Store?">
              No. GymTaxx installs straight onto your iPhone home screen from Safari, and opens like any other app.
            </Faq>
            <Faq question="How do I get my money back?">
              Your deposit is returned to the card you paid with, in the currency you paid in. Email{" "}
              <a href="mailto:support@gymtaxx.com" className="font-semibold text-foreground underline">
                support@gymtaxx.com
              </a>{" "}
              any time and a person will answer.
            </Faq>
          </Accordion>
        </div>
      </section>

      {/* --------------------------------------------------------- closing cta */}
      <section className="mx-auto w-full max-w-md px-5 py-14 text-center">
        <h2 className="text-display text-foreground">
          {CHALLENGE_WEEKS} weeks from now,
          <br />
          you'll wish you'd started.
        </h2>
        <Button size="xl" className="mt-8 w-full" onClick={start}>
          Download the app
        </Button>
        <p className="mt-3 text-sm text-muted-foreground">Takes about a minute to set up.</p>
      </section>

      <footer className="border-t border-border py-8">
        <div className="mx-auto w-full max-w-md px-5">
          <Wordmark />
          <nav className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
            <a href="https://www.gymtaxx.com/terms" className="underline-offset-4 hover:underline">
              Terms
            </a>
            <a href="https://www.gymtaxx.com/privacy" className="underline-offset-4 hover:underline">
              Privacy
            </a>
            <a href="https://www.gymtaxx.com/support" className="underline-offset-4 hover:underline">
              Support
            </a>
          </nav>
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
            GymTaxx is an accountability tool, not a game of chance. Your deposit is refundable in full by completing
            your own goal, and the maximum return is the amount you deposited.
          </p>
        </div>
        {/* Clears the sticky bar so the small print is never trapped behind it. */}
        <div aria-hidden="true" className={showStickyCta ? "h-24" : "h-0"} />
      </footer>

      {/* Reappears once the hero button is gone, so the offer is always one tap
          away however far down someone has read. */}
      <div
        className={`fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-5 pb-safe pt-3 backdrop-blur transition-all duration-300 ${
          showStickyCta ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-full opacity-0"
        }`}
      >
        <div className="mx-auto w-full max-w-md">
          <Button size="xl" className="w-full" onClick={start}>
            Download the app
          </Button>
        </div>
      </div>
    </div>
  );
}

function Step({
  icon: Icon,
  index,
  title,
  detail,
}: {
  icon: typeof Target;
  index: number;
  title: string;
  detail: string;
}) {
  return (
    <li className="flex items-start gap-4 rounded-lg bg-background p-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-accent">
        <Icon className="h-5 w-5 text-success-ink" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-base font-bold leading-snug text-foreground">
          <span className="tabular text-muted-foreground">{index}. </span>
          {title}
        </p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{detail}</p>
      </div>
    </li>
  );
}

function Assurance({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof ShieldCheck;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-4 rounded-lg bg-card p-4">
      <Icon className="mt-0.5 h-5 w-5 shrink-0 text-foreground" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-base font-bold leading-snug text-foreground">{title}</p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{children}</p>
      </div>
    </div>
  );
}

function Faq({ question, children }: { question: string; children: React.ReactNode }) {
  return (
    <AccordionItem value={question} className="border-border">
      <AccordionTrigger className="text-left text-base font-bold text-foreground">{question}</AccordionTrigger>
      <AccordionContent className="text-sm leading-relaxed text-muted-foreground">{children}</AccordionContent>
    </AccordionItem>
  );
}
