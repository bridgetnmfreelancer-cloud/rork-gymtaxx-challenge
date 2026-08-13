import { ArrowLeft, Loader2, MailCheck } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import { Screen, ScreenActions, ScreenSubtitle, ScreenTitle } from "@/components/Screen";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/context/AuthProvider";

/**
 * Step: ask for the code, then use it.
 *
 * `link` is the path taken when someone taps the link in the email rather than
 * typing the code — Supabase has already signed them in by then, so there is
 * nothing left to verify and they go straight to choosing a password.
 */
type Step = "request" | "code" | "link";

const CODE_LENGTH = 6;

/**
 * Forgot password, by code rather than by link.
 *
 * Reset links are single-use, and inbox security scanners open every link in a
 * message before it reaches the person. That "click" spends the link, so by the
 * time the real person taps it the reset is already dead — which is exactly the
 * failure this flow is built to avoid. A six digit code cannot be spent by a
 * scanner, because there is nothing to click.
 *
 * The link path is still handled, since the code and the link arrive in the
 * same email and either one should work.
 */
export default function ForgotPassword() {
  const navigate = useNavigate();
  const { requestPasswordReset, confirmPasswordReset, setPassword, isRecovering } = useAuth();

  const [step, setStep] = useState<Step>("request");
  const [email, setEmail] = useState<string>("");
  const [code, setCode] = useState<string>("");
  const [password, setPasswordValue] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Arriving from the emailed link: the session already proves who they are.
  useEffect(() => {
    if (isRecovering) setStep("link");
  }, [isRecovering]);

  async function handleRequest(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (isSubmitting) return;

    setError(null);
    setIsSubmitting(true);
    try {
      await requestPasswordReset(email);
      setNotice(null);
      setStep("code");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResend(): Promise<void> {
    if (isSubmitting) return;
    setError(null);
    setNotice(null);
    setIsSubmitting(true);
    try {
      await requestPasswordReset(email);
      setNotice("Sent again. The newest code is the one that works.");
      setCode("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleConfirm(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (isSubmitting) return;

    setError(null);
    setIsSubmitting(true);
    try {
      if (step === "link") {
        await setPassword(password);
      } else {
        await confirmPasswordReset(email, code, password);
      }
      // They are signed in at this point, so the dashboard is the right landing.
      navigate("/home", { replace: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (step === "request") {
    return (
      <Screen>
        <div className="pt-10 animate-rise-in">
          <button
            type="button"
            onClick={() => navigate("/welcome", { replace: true })}
            className="mb-8 flex h-11 w-11 items-center justify-center rounded-full bg-card text-foreground"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </button>

          <ScreenTitle>Forgot your password?</ScreenTitle>
          <ScreenSubtitle>
            Put in your email and we'll send you a six digit code to get back in.
          </ScreenSubtitle>
        </div>

        <form onSubmit={handleRequest} className="mt-8 animate-rise-in [animation-delay:80ms]">
          <div className="space-y-2">
            <Label htmlFor="reset-email">Email</Label>
            <Input
              id="reset-email"
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

          {error ? (
            <p role="alert" className="mt-4 rounded-md bg-destructive/15 px-4 py-3 text-sm font-medium text-danger-ink">
              {error}
            </p>
          ) : null}

          <ScreenActions>
            <Button type="submit" size="xl" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : null}
              Send me a code
            </Button>
          </ScreenActions>
        </form>
      </Screen>
    );
  }

  const isLinkPath = step === "link";

  return (
    <Screen>
      <div className="pt-10 animate-rise-in">
        <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-accent animate-pop-in">
          <MailCheck className="h-8 w-8 text-success-ink" aria-hidden="true" />
        </div>

        <ScreenTitle className="mt-8">{isLinkPath ? "Choose a new password" : "Check your email"}</ScreenTitle>
        <ScreenSubtitle>
          {isLinkPath
            ? "You're verified. Set the password you'll use from now on."
            : `If there's an account for ${email}, a reset is on its way. It works for one hour.`}
        </ScreenSubtitle>

        {!isLinkPath ? (
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Enter the code from the email below, or tap the link in it instead. Either one works.
          </p>
        ) : null}
      </div>

      <form onSubmit={handleConfirm} className="mt-8 space-y-4 animate-rise-in [animation-delay:80ms]">
        {!isLinkPath ? (
          <div className="space-y-2">
            <Label htmlFor="reset-code">Six digit code</Label>
            <Input
              id="reset-code"
              type="text"
              inputMode="numeric"
              // Lets iOS offer the code straight from the email, so most people
              // never type it at all.
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={CODE_LENGTH}
              required
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
              placeholder="123456"
              className="h-16 rounded-lg bg-card text-center text-2xl font-bold tracking-[0.4em] tabular"
            />
          </div>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="reset-password">New password</Label>
          <Input
            id="reset-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={6}
            value={password}
            onChange={(event) => setPasswordValue(event.target.value)}
            placeholder="At least 6 characters"
            className="h-14 rounded-lg bg-card text-base"
          />
        </div>

        {notice ? (
          <p role="status" className="rounded-md bg-accent/40 px-4 py-3 text-sm font-medium text-success-ink">
            {notice}
          </p>
        ) : null}

        {error ? (
          <p role="alert" className="rounded-md bg-destructive/15 px-4 py-3 text-sm font-medium text-danger-ink">
            {error}
          </p>
        ) : null}

        <ScreenActions>
          <Button
            type="submit"
            size="xl"
            className="w-full"
            disabled={isSubmitting || (!isLinkPath && code.length < CODE_LENGTH)}
          >
            {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : null}
            Set new password
          </Button>

          {!isLinkPath ? (
            <button
              type="button"
              onClick={() => void handleResend()}
              disabled={isSubmitting}
              className="mt-3 w-full py-2 text-sm font-medium text-muted-foreground underline-offset-4 hover:underline disabled:opacity-60"
            >
              Send it again
            </button>
          ) : null}
        </ScreenActions>
      </form>
    </Screen>
  );
}
