import { Loader2 } from "lucide-react";
import { useState } from "react";

import { useAuth, type OAuthProvider } from "@/context/AuthProvider";
import { isIOS, isStandalone } from "@/lib/pwa";

/**
 * Apple and Google sign-in.
 *
 * Apple goes first and carries the black treatment because this is an iPhone
 * audience and Apple's own guidelines expect it to be at least as prominent as
 * any other option.
 *
 * A caveat worth knowing about the installed app: iOS gives a home-screen web
 * app its own private storage, and sending someone out to Apple or Google can
 * land the return trip in Safari instead. When that happens they are signed in
 * *in Safari* and still signed out in the installed app. The note below only
 * appears in that exact situation, and email and password stay available
 * underneath as the path that cannot break.
 */
export function SocialAuthButtons({ onError }: { onError: (message: string) => void }) {
  const { signInWithProvider } = useAuth();
  const [pending, setPending] = useState<OAuthProvider | null>(null);

  const mayLeaveTheApp = isIOS() && isStandalone();

  async function start(provider: OAuthProvider): Promise<void> {
    if (pending) return;
    setPending(provider);
    try {
      // Resolves by navigating away, so there is no success branch to handle.
      await signInWithProvider(provider);
    } catch (caught) {
      console.error("auth: social sign-in failed", caught);
      onError(caught instanceof Error ? caught.message : "That didn't work. Try again.");
      setPending(null);
    }
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => void start("apple")}
        disabled={pending !== null}
        className="flex h-14 w-full items-center justify-center gap-2.5 rounded-lg bg-foreground text-base font-semibold text-background transition-transform active:scale-[0.98] disabled:opacity-60"
      >
        {pending === "apple" ? (
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
        ) : (
          <AppleMark />
        )}
        Continue with Apple
      </button>

      <button
        type="button"
        onClick={() => void start("google")}
        disabled={pending !== null}
        className="flex h-14 w-full items-center justify-center gap-2.5 rounded-lg border border-border bg-white text-base font-semibold text-foreground transition-transform active:scale-[0.98] disabled:opacity-60"
      >
        {pending === "google" ? (
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
        ) : (
          <GoogleMark />
        )}
        Continue with Google
      </button>

      {mayLeaveTheApp ? (
        <p className="text-xs leading-relaxed text-muted-foreground">
          Apple and Google open in Safari. If you end up signed in there but not here, come back and use your email
          and password instead.
        </p>
      ) : null}
    </div>
  );
}

/** Apple's mark, drawn rather than loaded so it can inherit the button colour. */
function AppleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.05 12.54c-.02-2.2 1.8-3.26 1.88-3.31-1.02-1.5-2.62-1.7-3.19-1.72-1.36-.14-2.65.8-3.34.8-.69 0-1.75-.78-2.87-.76-1.48.02-2.84.86-3.6 2.18-1.53 2.66-.39 6.6 1.1 8.76.73 1.06 1.6 2.25 2.74 2.2 1.1-.04 1.52-.71 2.85-.71 1.33 0 1.7.71 2.87.69 1.18-.02 1.93-1.08 2.65-2.14.83-1.22 1.18-2.41 1.2-2.47-.03-.01-2.3-.88-2.32-3.52zM14.88 5.9c.6-.74 1.01-1.75.9-2.77-.87.04-1.93.58-2.56 1.31-.56.65-1.05 1.69-.92 2.68.97.08 1.96-.49 2.58-1.22z" />
    </svg>
  );
}

/** Google's four-colour mark. Fixed colours: Google's brand rules require them. */
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.46a5.52 5.52 0 0 1-2.4 3.62v3.01h3.89c2.27-2.09 3.57-5.17 3.57-8.82z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.08 7.95-2.91l-3.89-3.01c-1.08.72-2.45 1.15-4.06 1.15-3.13 0-5.78-2.11-6.72-4.95H1.26v3.1A12 12 0 0 0 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.28a7.2 7.2 0 0 1 0-4.56v-3.1H1.26a12 12 0 0 0 0 10.76l4.02-3.1z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.35.61 4.6 1.8l3.44-3.44C17.95 1.18 15.24 0 12 0A12 12 0 0 0 1.26 6.62l4.02 3.1C6.22 6.88 8.87 4.77 12 4.77z"
      />
    </svg>
  );
}

/** The "or" rule between the social buttons and the email form. */
export function AuthDivider() {
  return (
    <div className="flex items-center gap-3" aria-hidden="true">
      <span className="h-px flex-1 bg-border" />
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">or</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
