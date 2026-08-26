import { ArrowRight, CalendarCheck, Camera, Check, Loader2, Wallet } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import { Logo, Wordmark } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/context/AuthProvider";
import { suggestEmailFix } from "@/lib/email";
import { currencyForRegion, currencySymbol, formatMoney } from "@/lib/money";
import { supabase } from "@/lib/supabase";
import { visitorContext } from "@/lib/visitor";

/** Length of the challenge, in days. Named here because nothing else knows it yet. */
const CHALLENGE_DAYS = 75;

/** The daily amounts under consideration — 1, 2 or 3 a day. */
const TIERS = [1, 2, 3] as const;
type Tier = (typeof TIERS)[number];

/** Postgres unique violation. A repeat signup is a success, not a failure. */
const UNIQUE_VIOLATION = "23505";

/**
 * Waiting list for the 75 Day Challenge.
 *
 * Deliberately sells nothing and takes no money: the challenge does not exist
 * yet, and the point of this page is to find out whether it should before any
 * of it gets built. The daily amount question is the useful half — it is the
 * open product decision, and asking is cheaper than guessing.
 *
 * Never call this "75 Hard" anywhere. That name belongs to somebody else.
 */
export default function Waitlist() {
  const { session } = useAuth();

  const currency = useMemo(() => currencyForRegion(), []);
  const symbol = currencySymbol(currency);

  const [email, setEmail] = useState<string>("");
  const [tier, setTier] = useState<Tier | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [hasJoined, setHasJoined] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = "GymTaxx | The 75 Day Challenge";
  }, []);

  // A member reading this is already known; making them retype their address
  // is friction for no reason.
  useEffect(() => {
    const known = session?.user?.email;
    if (known) setEmail((current) => (current.length > 0 ? current : known));
  }, [session]);

  // Only ever a suggestion — a real address that looks unusual must still go
  // through untouched.
  const suggestion = useMemo(() => (email.includes("@") ? suggestEmailFix(email) : null), [email]);

  const join = useCallback(
    async (event: FormEvent<HTMLFormElement>): Promise<void> => {
      event.preventDefault();
      if (isSubmitting) return;

      setError(null);
      setIsSubmitting(true);
      try {
        const { visitorId, source, campaign, referrerHost } = visitorContext();

        const { error: insertError } = await supabase.from("waitlist_signups").insert({
          email: email.trim().toLowerCase(),
          tier,
          currency,
          user_id: session?.user?.id ?? null,
          visitor_id: visitorId,
          source,
          campaign,
          referrer_host: referrerHost,
        });

        // Already on the list. Saying so would only make someone think they
        // had done something wrong.
        if (insertError && insertError.code !== UNIQUE_VIOLATION) throw new Error(insertError.message);

        setHasJoined(true);
      } catch (caught) {
        console.warn("waitlist signup failed", caught);
        setError("We couldn't add you just then. Try again in a moment.");
      } finally {
        setIsSubmitting(false);
      }
    },
    [currency, email, isSubmitting, session, tier],
  );

  return (
    <div className="min-h-full bg-background">
      <nav className="sticky top-0 z-50 border-b border-border bg-background/90 pt-safe backdrop-blur">
        <div className="mx-auto flex w-full max-w-md items-center gap-4 px-5 py-3 lg:max-w-6xl lg:px-10">
          <a href="https://www.gymtaxx.com" className="flex shrink-0 items-center gap-2.5" aria-label="GymTaxx home">
            <Logo size={28} />
            <Wordmark />
          </a>

          <a
            href="#join"
            className="ml-auto rounded-full bg-accent px-5 py-2.5 text-base font-semibold text-success-ink transition-colors hover:bg-accent/90 sm:px-6"
          >
            Get early access
          </a>
        </div>
      </nav>

      {/* ---------------------------------------------------------------- hero */}
      <header className="relative overflow-hidden bg-primary text-primary-foreground">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-[70%] bg-[radial-gradient(ellipse_60%_55%_at_50%_0%,rgba(134,239,172,0.10),transparent_70%)]"
        />

        <div className="relative mx-auto flex min-h-[70svh] w-full max-w-md flex-col items-center justify-center px-6 py-20 text-center lg:min-h-[72svh] lg:max-w-4xl">
          <span className="rounded-full border border-accent/30 bg-accent/10 px-4 py-1.5 text-sm font-semibold tracking-wide text-accent animate-rise-in">
            Coming soon
          </span>

          <h1 className="mt-6 text-[2.6rem] font-extrabold leading-[1.05] tracking-tight animate-rise-in [animation-delay:60ms] sm:text-5xl lg:text-6xl xl:text-7xl">
            The 75 Day Challenge
          </h1>

          <p className="mt-6 max-w-xl text-lg leading-relaxed text-primary-foreground/70 animate-rise-in [animation-delay:120ms] lg:mt-7 lg:text-xl">
            Seventy-five days. One workout a day. Your own refundable deposit behind every single one of them.
          </p>

          <div className="mt-10 w-full animate-rise-in [animation-delay:200ms]">
            <a
              href="#join"
              className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-full bg-accent px-8 text-lg font-semibold text-success-ink transition-colors hover:bg-accent/90 lg:w-auto lg:px-14"
            >
              Join the waiting list
              <ArrowRight className="h-5 w-5" aria-hidden="true" />
            </a>
            <p className="mt-4 text-sm text-primary-foreground/50">
              No payment. We'll email you once, when it opens.
            </p>
          </div>
        </div>
      </header>

      {/* -------------------------------------------------------- how it works */}
      <section className="bg-card py-16 lg:py-24">
        <div className="mx-auto w-full max-w-md px-5 lg:max-w-3xl lg:px-0">
          <h2 className="text-center text-title text-foreground lg:text-4xl xl:text-5xl">How it would work</h2>

          <ol className="mt-8 space-y-4 lg:mt-12">
            <Step icon={CalendarCheck} index="01" title="Show up every day for 75 days">
              One workout a day, every day. No rest days built in — that's the point of it.
            </Step>
            <Step icon={Wallet} index="02" title="Put a small amount behind each day">
              Choose {symbol}1, {symbol}2 or {symbol}3 a day. That becomes your refundable deposit for the whole
              seventy-five.
            </Step>
            <Step icon={Camera} index="03" title="Verify each one from the gym">
              A live photo and your location, checked by us before the day counts. No uploading old pictures.
            </Step>
            <Step icon={Check} index="04" title="Earn it back a day at a time">
              Every verified day earns that day's money back. The most you can get back is your own deposit — this
              isn't a competition and there's nothing to be won.
            </Step>
          </ol>
        </div>
      </section>

      {/* ------------------------------------------------------- the honest bit */}
      <section className="bg-primary py-16 text-primary-foreground lg:py-24">
        <div className="mx-auto w-full max-w-md px-5 text-center lg:max-w-3xl">
          <h2 className="text-title lg:text-4xl xl:text-5xl">Miss a day? Keep going.</h2>

          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-primary-foreground/70 lg:text-xl">
            Missing day 40 doesn't send you back to day 1. You lose that day's money, and you carry straight on the
            next morning.
          </p>

          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-primary-foreground/50">
            Seventy-five days is long enough that one bad day is going to happen. A challenge that punishes it by
            wiping out your progress is a challenge most people quietly abandon in week six.
          </p>
        </div>
      </section>

      {/* ---------------------------------------------------------------- form */}
      <section id="join" className="scroll-mt-20 py-16 lg:py-24">
        <div className="mx-auto w-full max-w-md px-5 lg:max-w-xl">
          {hasJoined ? (
            <div className="text-center animate-rise-in">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-lg bg-accent animate-pop-in">
                <Check className="h-8 w-8 text-success-ink" aria-hidden="true" />
              </div>

              <h2 className="mt-8 text-title text-foreground lg:text-4xl">You're on the list</h2>
              <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                We'll email you the moment the 75 Day Challenge opens, and not about anything else.
              </p>

              <a
                href="/4weekchallenge"
                className="mt-8 inline-flex items-center gap-2 text-base font-semibold text-foreground underline-offset-4 hover:underline"
              >
                Meanwhile, there's the 4 week challenge
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </a>
            </div>
          ) : (
            <>
              <h2 className="text-center text-title text-foreground lg:text-4xl">Get early access</h2>
              <p className="mt-4 text-center text-base leading-relaxed text-muted-foreground">
                We're building this now. Tell us where to reach you and we'll open it to this list first.
              </p>

              <form onSubmit={join} className="mt-8">
                <div className="space-y-2">
                  <Label htmlFor="waitlist-email">Email</Label>
                  <Input
                    id="waitlist-email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    autoCapitalize="none"
                    autoCorrect="off"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@example.com"
                    className="h-14 rounded-lg bg-card text-base"
                  />

                  {suggestion ? (
                    <button
                      type="button"
                      onClick={() => setEmail(suggestion)}
                      className="text-sm text-muted-foreground underline-offset-4 hover:underline"
                    >
                      Did you mean <span className="font-semibold text-foreground">{suggestion}</span>?
                    </button>
                  ) : null}
                </div>

                <fieldset className="mt-8">
                  <legend className="text-base font-bold text-foreground">
                    If it opened tomorrow, what would you put behind each day?
                  </legend>
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    Optional, and it doesn't hold you to anything. It tells us where to set it.
                  </p>

                  <div className="mt-4 grid grid-cols-3 gap-3">
                    {TIERS.map((option) => {
                      const isSelected = tier === option;
                      return (
                        <button
                          key={option}
                          type="button"
                          aria-pressed={isSelected}
                          onClick={() => setTier(isSelected ? null : option)}
                          className={`rounded-lg border-2 p-4 text-center transition-all active:scale-[0.97] ${
                            isSelected
                              ? "border-accent bg-accent/20"
                              : "border-transparent bg-card hover:border-border"
                          }`}
                        >
                          <span className="block text-2xl font-extrabold tracking-tight text-foreground tabular">
                            {symbol}
                            {option}
                          </span>
                          <span className="mt-1 block text-xs text-muted-foreground">a day</span>
                          <span className="mt-2 block text-xs font-semibold text-muted-foreground tabular">
                            {formatMoney(option * CHALLENGE_DAYS, currency)} deposit
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </fieldset>

                {error ? (
                  <p
                    role="alert"
                    className="mt-6 rounded-md bg-destructive/15 px-4 py-3 text-sm font-medium text-danger-ink"
                  >
                    {error}
                  </p>
                ) : null}

                <Button type="submit" size="xl" className="mt-8 w-full rounded-full" disabled={isSubmitting}>
                  {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : null}
                  Add me to the list
                </Button>

                <p className="mt-4 text-center text-sm text-muted-foreground">
                  One email, when it opens. Nothing else.
                </p>
              </form>
            </>
          )}
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

function Step({
  icon: Icon,
  index,
  title,
  children,
}: {
  icon: typeof Wallet;
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
