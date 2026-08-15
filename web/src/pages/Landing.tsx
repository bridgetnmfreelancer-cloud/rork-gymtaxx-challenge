import { ArrowRight, Banknote, Camera, Check, Clock, MapPin, ShieldCheck, Target } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Wordmark } from "@/components/Logo";
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
 *
 * Laid out for phones first, then widened for desktop. Roughly half the traffic
 * from a link in a Meta feed opens on a laptop, and a phone-width column
 * stranded in the middle of a large screen reads as a broken page.
 */
export default function Landing() {
  const navigate = useNavigate();
  const { session } = useAuth();

  const currency = useMemo(() => currencyForRegion(), []);
  const symbol = currencySymbol(currency);
  const exampleDeposit = formatMoney(depositFor(EXAMPLE_GOAL), currency);
  const perWorkout = `${symbol}${REWARD_PER_WORKOUT}`;
  const exampleWorkouts = EXAMPLE_GOAL * CHALLENGE_WEEKS;

  const heroCta = useRef<HTMLDivElement | null>(null);
  const [showStickyCta, setShowStickyCta] = useState<boolean>(false);

  useEffect(() => {
    document.title = "GymTaxx | Finally stay consistent with the gym";
  }, []);

  /**
   * Show the sticky bar only once the hero button has scrolled away, so there's
   * never a second button competing with the first one.
   */
  useEffect(() => {
    const target = heroCta.current;
    if (!target || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(([entry]) => setShowStickyCta(!entry.isIntersecting), {
      rootMargin: "-8px 0px 0px 0px",
    });
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
      {/* ---------------------------------------------------------------- hero
          Centred, roomy, nothing but the message and one button — matching the
          marketing site's opening screen. The glow is a single soft radial wash
          so the navy has some depth without becoming a decorated panel. */}
      <header className="relative overflow-hidden bg-primary text-primary-foreground">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-[70%] bg-[radial-gradient(ellipse_60%_55%_at_50%_0%,rgba(134,239,172,0.10),transparent_70%)]"
        />

        <div className="relative mx-auto flex min-h-[78svh] w-full max-w-md flex-col items-center justify-center px-6 py-20 pt-safe text-center lg:min-h-[80svh] lg:max-w-4xl">
          <h1 className="text-[2.6rem] font-extrabold leading-[1.05] tracking-tight animate-rise-in sm:text-5xl lg:text-6xl xl:text-7xl">
            Finally stay consistent with the gym
          </h1>

          <p className="mt-6 max-w-xl text-lg leading-relaxed text-primary-foreground/70 animate-rise-in [animation-delay:80ms] lg:mt-7 lg:text-xl">
            Stick with your gym routine without relying on motivation, discipline, or willpower.
          </p>

          <div ref={heroCta} className="mt-10 w-full animate-rise-in [animation-delay:160ms]">
            <Button
              size="xl"
              onClick={start}
              className="w-full rounded-full bg-accent text-success-ink hover:bg-accent/90 lg:w-auto lg:px-14"
            >
              Download the app
              <ArrowRight className="h-5 w-5" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </header>

      {/* ------------------------------------------------------- the mechanic */}
      <Section>
        <div className="lg:grid lg:grid-cols-[1fr_1.15fr] lg:items-start lg:gap-16">
          <div>
            <Heading>Your own money. Nobody else's.</Heading>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground lg:text-lg">
              You hold {exampleDeposit} behind a {EXAMPLE_GOAL}-workout week. Every workout you verify earns {perWorkout}{" "}
              of it back. Complete all {exampleWorkouts} and the whole deposit is yours again.
            </p>
          </div>

          <div className="mt-6 grid gap-3 lg:mt-0 lg:grid-cols-2">
            <Assurance icon={ShieldCheck} title="Fully refundable">
              The most you can ever get back is exactly what you put in. There's nothing to gain beyond your own deposit,
              and nobody else's money is involved.
            </Assurance>
            <Assurance icon={Clock} title="Paid up front, earned back">
              The deposit is taken once, when you join. You're never charged at the moment you miss a workout.
            </Assurance>
          </div>
        </div>
      </Section>

      {/* -------------------------------------------------------- how it works */}
      <div className="bg-card">
        <Section>
          <Heading>How it works</Heading>

          <ol className="mt-6 grid gap-3 lg:mt-10 lg:grid-cols-2 lg:gap-4">
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
        </Section>
      </div>

      {/* ------------------------------------------------------- verification */}
      <Section>
        <div className="lg:grid lg:grid-cols-[1fr_1.15fr] lg:items-start lg:gap-16">
          <div>
            <Heading>Proof, not promises</Heading>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground lg:text-lg">
              A workout only counts once it's verified. That's what stops this being another goal you quietly drop in
              week two.
            </p>
          </div>

          <div className="mt-6 grid gap-3 lg:mt-0 lg:grid-cols-2">
            <Assurance icon={Camera} title="Live camera only">
              You take the photo at the gym, there and then. There's no way to upload an old picture from your library.
            </Assurance>
            <Assurance icon={MapPin} title="Time and place recorded">
              Each photo is stamped with when and where it was taken. No signal in the basement? The time still counts
              and we check it by hand.
            </Assurance>
          </div>
        </div>
      </Section>

      {/* ---------------------------------------------------------------- faq */}
      <div className="bg-card">
        <Section>
          <Heading>Questions</Heading>

          <Accordion type="single" collapsible className="mx-auto mt-4 lg:mt-8 lg:max-w-3xl">
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
        </Section>
      </div>

      {/* --------------------------------------------------------- closing cta */}
      <Section>
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-display text-foreground lg:text-6xl">
            {CHALLENGE_WEEKS} weeks from now, you'll wish you'd started.
          </h2>
          <Button size="xl" className="mt-8 w-full lg:w-auto lg:px-14" onClick={start}>
            Download the app
          </Button>
          <p className="mt-3 text-sm text-muted-foreground">Takes about a minute to set up.</p>
        </div>
      </Section>

      <footer className="border-t border-border py-8">
        <div className="mx-auto w-full max-w-md px-5 lg:max-w-6xl lg:px-10">
          <div className="lg:flex lg:items-center lg:justify-between lg:gap-8">
            <Wordmark />
            <nav className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground lg:mt-0">
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
          </div>
          <p className="mt-4 max-w-3xl text-xs leading-relaxed text-muted-foreground">
            GymTaxx is an accountability tool, not a game of chance. Your deposit is refundable in full by completing
            your own goal, and the maximum return is the amount you deposited.
          </p>
        </div>
        {/* Clears the sticky bar so the small print is never trapped behind it. */}
        <div aria-hidden="true" className={showStickyCta ? "h-24 lg:h-0" : "h-0"} />
      </footer>

      {/* Reappears once the hero button is gone, so the offer is always one tap
          away however far down someone has read. Phones only — on a desktop the
          buttons in the page are never far from the pointer. */}
      <div
        className={`fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-5 pb-safe pt-3 backdrop-blur transition-all duration-300 lg:hidden ${
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

/** Shared page gutter: a phone column on small screens, a real page on large. */
function Section({ children }: { children: React.ReactNode }) {
  return (
    <section className="mx-auto w-full max-w-md px-5 py-12 lg:max-w-6xl lg:px-10 lg:py-20">{children}</section>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return <h2 className="text-title text-foreground lg:text-4xl xl:text-5xl">{children}</h2>;
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
    <li className="flex items-start gap-4 rounded-lg bg-background p-4 lg:p-6">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-accent">
        <Icon className="h-5 w-5 text-success-ink" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-base font-bold leading-snug text-foreground lg:text-lg">
          <span className="tabular-nums text-muted-foreground">{index}. </span>
          {title}
        </p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground lg:text-base">{detail}</p>
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
    <div className="flex items-start gap-4 rounded-lg bg-card p-4 lg:h-full lg:flex-col lg:gap-3 lg:p-6">
      <Icon className="mt-0.5 h-5 w-5 shrink-0 text-foreground" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-base font-bold leading-snug text-foreground lg:text-lg">{title}</p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{children}</p>
      </div>
    </div>
  );
}

function Faq({ question, children }: { question: string; children: React.ReactNode }) {
  return (
    <AccordionItem value={question} className="border-border">
      <AccordionTrigger className="text-left text-base font-bold text-foreground lg:text-lg">{question}</AccordionTrigger>
      <AccordionContent className="text-sm leading-relaxed text-muted-foreground lg:text-base">
        {children}
      </AccordionContent>
    </AccordionItem>
  );
}
