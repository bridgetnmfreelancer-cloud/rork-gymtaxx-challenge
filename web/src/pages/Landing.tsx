import { ArrowRight, Camera, Star, Target, Trophy, Wallet } from "lucide-react";
import { useCallback, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";

import { Logo, Wordmark } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthProvider";
import {
  CHALLENGE_WEEKS,
  REWARD_PER_WORKOUT,
  WEEKLY_GOALS,
  currencyForRegion,
  currencySymbol,
  depositFor,
  formatMoney,
  totalWorkouts,
} from "@/lib/money";
import { isStandalone } from "@/lib/pwa";

/**
 * The smallest goal, used for the worked example in step two — the same one the
 * marketing site quotes.
 */
const EXAMPLE_GOAL = WEEKLY_GOALS[0];

type Testimonial = {
  quote: string;
  name: string;
};

/**
 * Real members, quoted as they wrote it — including the pound amounts, since
 * these are UK members and rewriting their words into dollars would be putting
 * figures in their mouths.
 */
const TESTIMONIALS: readonly Testimonial[] = [
  {
    quote:
      "I've joined so many accountability groups before and they always die after a few days. What surprised me was that we barely even talked in the chat, but I still went to the gym because I didn't want to lose my £50.",
    name: "June, Essex",
  },
  {
    quote:
      "I used to go to the gym maybe once every couple of weeks. This was the first month in a long time where I actually stuck to what I said I was going to do.",
    name: "Dee, London",
  },
  {
    quote:
      "I was travelling and normally I would've taken a break from the gym. Instead I found a gym while I was away because I didn't want to break my streak and lose my deposit.",
    name: "Afshan, Oxford",
  },
] as const;

/**
 * The paid-traffic landing page, living inside the app rather than on the
 * marketing site so the ad's destination URL matches the app's domain.
 *
 * Mirrors the marketing site's page section for section, with two deliberate
 * differences: no month is named anywhere (this page has to stay accurate in
 * September), and money is written in the reader's own currency using the same
 * pricing rule the server charges on.
 */
export default function Landing() {
  const navigate = useNavigate();
  const { session } = useAuth();

  const currency = useMemo(() => currencyForRegion(), []);
  const symbol = currencySymbol(currency);
  const perWorkout = `${symbol}${REWARD_PER_WORKOUT}`;
  const exampleWorkouts = totalWorkouts(EXAMPLE_GOAL);
  const exampleDeposit = formatMoney(depositFor(EXAMPLE_GOAL), currency);

  useEffect(() => {
    document.title = "GymTaxx | Finally stay consistent with the gym";
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
      {/* ----------------------------------------------------------------- nav
          Sticks to the top so the join button is always within reach however
          far down the page someone has read. White against the navy hero, so
          the mint pill is the loudest thing on the opening screen. */}
      <nav className="sticky top-0 z-50 border-b border-border bg-background/90 pt-safe backdrop-blur">
        <div className="mx-auto flex w-full max-w-md items-center gap-4 px-5 py-3 lg:max-w-6xl lg:px-10">
          <a href="https://www.gymtaxx.com" className="flex shrink-0 items-center gap-2.5" aria-label="GymTaxx home">
            <Logo size={28} />
            <Wordmark />
          </a>

          {/* Room for more links as they're needed — they'll sit alongside Blog
              without the join pill moving. */}
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <a
              href="https://www.gymtaxx.com/blog"
              className="rounded-full px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:px-4 sm:text-base"
            >
              Blog
            </a>

            <Button
              onClick={start}
              className="h-11 rounded-full bg-accent px-5 text-base font-semibold text-success-ink hover:bg-accent/90 sm:px-6"
            >
              Join Now
            </Button>
          </div>
        </div>
      </nav>

      {/* ---------------------------------------------------------------- hero */}
      <header className="relative overflow-hidden bg-primary text-primary-foreground">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-[70%] bg-[radial-gradient(ellipse_60%_55%_at_50%_0%,rgba(134,239,172,0.10),transparent_70%)]"
        />

        <div className="relative mx-auto flex min-h-[74svh] w-full max-w-md flex-col items-center justify-center px-6 py-20 text-center lg:min-h-[76svh] lg:max-w-4xl">
          <h1 className="text-[2.6rem] font-extrabold leading-[1.05] tracking-tight animate-rise-in sm:text-5xl lg:text-6xl xl:text-7xl">
            Finally stay consistent with the gym
          </h1>

          <p className="mt-6 max-w-xl text-lg leading-relaxed text-primary-foreground/70 animate-rise-in [animation-delay:80ms] lg:mt-7 lg:text-xl">
            Stick with your gym routine without relying on motivation, discipline, or willpower.
          </p>

          <div className="mt-10 w-full animate-rise-in [animation-delay:160ms]">
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

      {/* -------------------------------------------------------- how it works */}
      <section className="bg-card py-16 lg:py-24">
        <div className="mx-auto w-full max-w-md px-5 lg:max-w-3xl lg:px-0">
          <SectionHeading>How it works</SectionHeading>

          <ol className="mt-8 space-y-4 lg:mt-12">
            <Step icon={Target} index="01" title="Set your weekly goal">
              Choose how many times you'll go to the gym each week.
            </Step>
            <Step icon={Wallet} index="02" title={`Deposit ${perWorkout} per workout`}>
              We'll calculate your refundable deposit. Complete a workout and earn back {perWorkout}. For example:{" "}
              {EXAMPLE_GOAL} workouts/week = {exampleWorkouts} workouts per month = {exampleDeposit} deposit.
            </Step>
            <Step icon={Camera} index="03" title="Verify your workouts">
              Every workout must be verified with a gym photo and location before it counts.
            </Step>
            <Step icon={Trophy} index="04" title="Get your money back">
              Every verified workout earns back {perWorkout}. Miss a workout and you lose {perWorkout}.
            </Step>
          </ol>
        </div>
      </section>

      {/* ---------------------------------------------------------- why it works */}
      <section className="bg-primary py-16 text-primary-foreground lg:py-24">
        <div className="mx-auto w-full max-w-md px-5 text-center lg:max-w-4xl">
          <h2 className="text-title lg:text-4xl xl:text-5xl">Why It Works</h2>

          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-primary-foreground/60 lg:text-xl">
            Most people don't fail because they don't know what to do.
          </p>
          <p className="mx-auto mt-4 max-w-2xl text-lg font-medium leading-relaxed text-primary-foreground lg:text-xl">
            They fail because nothing happens when they don't do it.
          </p>

          <dl className="mt-12 grid gap-10 sm:grid-cols-3 sm:gap-6 lg:mt-16">
            <Stat value="456">women have used our accountability system</Stat>
            <Stat value="97%">completed their challenge</Stat>
            <Stat value="<1×">per month — how often most were going to the gym before joining</Stat>
          </dl>
        </div>
      </section>

      {/* --------------------------------------------------------- testimonials */}
      <section className="py-16 lg:py-24">
        <div className="mx-auto w-full max-w-md px-5 lg:max-w-6xl lg:px-10">
          <SectionHeading>What our members say</SectionHeading>

          <div className="mt-8 grid gap-4 lg:mt-14 lg:grid-cols-3 lg:gap-6">
            {TESTIMONIALS.map((item) => (
              <figure key={item.name} className="flex flex-col rounded-lg bg-card p-6">
                <Stars />
                <blockquote className="mt-4 flex-1 text-base leading-relaxed text-muted-foreground">
                  {item.quote}
                </blockquote>
                <figcaption className="mt-5 text-base font-bold text-foreground">{item.name}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------- closing cta */}
      <section className="bg-card py-16 lg:py-24">
        <div className="mx-auto w-full max-w-md px-5 text-center lg:max-w-3xl">
          <h2 className="text-title text-foreground lg:text-4xl xl:text-5xl">The Challenge Is Open</h2>

          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-muted-foreground lg:text-lg">
            If your current approach was working, you probably wouldn't be here.
          </p>

          <div className="mt-8 space-y-2 text-base text-foreground lg:text-lg">
            <p>Choose a challenge.</p>
            <p>Commit to it for a month.</p>
            <p>See what happens.</p>
          </div>

          <Button
            size="xl"
            onClick={start}
            className="mt-10 w-full rounded-full bg-accent uppercase tracking-wide text-success-ink hover:bg-accent/90 lg:w-auto lg:px-14"
          >
            Join the challenge
            <ArrowRight className="h-5 w-5" aria-hidden="true" />
          </Button>
        </div>
      </section>

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
        </div>
      </footer>
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="text-center text-title text-foreground lg:text-4xl xl:text-5xl">{children}</h2>;
}

function Step({
  icon: Icon,
  index,
  title,
  children,
}: {
  icon: typeof Target;
  index: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-4 rounded-lg bg-background p-5 lg:gap-5 lg:p-6">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-accent/25">
        <Icon className="h-5 w-5 text-success-ink" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-base font-bold leading-snug text-foreground lg:text-lg">
          <span className="mr-2 text-sm font-bold tracking-widest text-success-ink">{index}</span>
          {title}
        </p>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground lg:text-base">{children}</p>
      </div>
    </li>
  );
}

function Stat({ value, children }: { value: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-4xl font-extrabold tracking-tight text-accent lg:text-5xl">{value}</dt>
      <dd className="mx-auto mt-2 max-w-[16rem] text-sm leading-relaxed text-primary-foreground/60">{children}</dd>
    </div>
  );
}

/** Five filled stars. Decorative — the rating is carried by the words beside it. */
function Stars() {
  return (
    <div className="flex gap-1" aria-hidden="true">
      {Array.from({ length: 5 }, (_, i) => (
        <Star key={i} className="h-4 w-4 fill-accent text-accent" />
      ))}
    </div>
  );
}
