import { Loader2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { Logo } from "@/components/Logo";
import { Screen, ScreenActions, ScreenSubtitle, ScreenTitle } from "@/components/Screen";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/context/AuthProvider";

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

  const skippedInstall = params.get("browser") === "1";

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (isSubmitting) return;

    setError(null);
    setIsSubmitting(true);
    try {
      if (mode === "signUp") {
        await signUp(email, password);
      } else {
        await signIn(email, password);
      }
      navigate("/reminders", { replace: true });
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
