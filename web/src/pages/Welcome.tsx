import { Loader2 } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { Logo } from "@/components/Logo";
import { Screen, ScreenActions, ScreenSubtitle, ScreenTitle } from "@/components/Screen";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/context/AuthProvider";
import { suggestEmailFix } from "@/lib/email";

type Mode = "signUp" | "logIn";

/**
 * Step 3 of the funnel. Kept deliberately short — they arrived from an ad and
 * an install screen, so this is a gate, not a pitch.
 */
export default function Welcome() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { signIn, signUp } = useAuth();

  const [mode, setMode] = useState<Mode>("signUp");
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  /** The exact address they've insisted is right, so we stop asking about it. */
  const [confirmedEmail, setConfirmedEmail] = useState<string | null>(null);

  const skippedInstall = params.get("browser") === "1";

  // A mistyped address can't be reset and can't be reminded, so it's worth
  // catching here rather than discovering it when someone needs their account
  // back. Only offered on sign-up: an existing account is proof enough.
  const suggestion = useMemo<string | null>(
    () => (mode === "signUp" ? suggestEmailFix(email) : null),
    [mode, email],
  );
  const isUnresolved = suggestion !== null && confirmedEmail !== email.trim().toLowerCase();

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (isSubmitting) return;

    // One tap to accept or wave off, and only for the small number of people
    // whose address looks wrong.
    if (isUnresolved) return;

    setError(null);
    setIsSubmitting(true);
    try {
      if (mode === "signUp") {
        await signUp(email, password);
        // A brand new account has seen nothing yet, so it starts at the top of
        // the funnel: the reminder ask, then the questions.
        navigate("/reminders", { replace: true });
      } else {
        await signIn(email, password);
        // Someone logging back in has already been through all of that. Home
        // reads their actual state and shows the dashboard if they've paid, or
        // the start screen if they haven't — so it's the only correct landing
        // place for a returning account.
        navigate("/home", { replace: true });
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Screen>
      <div className="pt-10 animate-rise-in">
        <Logo size={56} />
        <ScreenTitle className="mt-8">Let's get you consistent.</ScreenTitle>
        <ScreenSubtitle>
          {mode === "signUp"
            ? "Create an account to build your challenge."
            : "Welcome back. Log in to pick up where you left off."}
        </ScreenSubtitle>
      </div>

      <form onSubmit={handleSubmit} className="mt-8 space-y-4 animate-rise-in [animation-delay:80ms]">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
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

          {isUnresolved && suggestion ? (
            <div className="rounded-md bg-destructive/15 px-4 py-3 animate-rise-in">
              <p className="text-sm leading-snug text-foreground">
                Did you mean <span className="font-semibold break-all">{suggestion}</span>?
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-md bg-foreground px-3 py-2 text-sm font-semibold text-background"
                  onClick={() => {
                    setEmail(suggestion);
                    setConfirmedEmail(suggestion);
                  }}
                >
                  Yes, use that
                </button>
                <button
                  type="button"
                  className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground underline-offset-4 hover:underline"
                  onClick={() => setConfirmedEmail(email.trim().toLowerCase())}
                >
                  No, mine is right
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete={mode === "signUp" ? "new-password" : "current-password"}
            required
            minLength={6}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={mode === "signUp" ? "At least 6 characters" : "Your password"}
            className="h-14 rounded-lg bg-card text-base"
          />
        </div>

        {error ? (
          <p role="alert" className="rounded-md bg-destructive/15 px-4 py-3 text-sm font-medium text-danger-ink">
            {error}
          </p>
        ) : null}

        {skippedInstall ? (
          <p className="text-xs leading-relaxed text-muted-foreground">
            You're in the browser, so reminders are off. Add GymTaxx to your Home Screen any time to turn them on.
          </p>
        ) : null}

        <ScreenActions>
          <Button type="submit" size="xl" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : null}
            {mode === "signUp" ? "Create account" : "Log in"}
          </Button>
          <button
            type="button"
            className="mt-3 w-full py-2 text-sm font-medium text-muted-foreground underline-offset-4 hover:underline"
            onClick={() => {
              setMode(mode === "signUp" ? "logIn" : "signUp");
              setError(null);
            }}
          >
            {mode === "signUp" ? "I already have an account" : "I need to create an account"}
          </button>
          {mode === "logIn" ? (
            <button
              type="button"
              className="mt-1 w-full py-2 text-sm font-medium text-muted-foreground underline-offset-4 hover:underline"
              onClick={() => navigate("/forgot-password")}
            >
              I've forgotten my password
            </button>
          ) : null}
        </ScreenActions>
      </form>
    </Screen>
  );
}
