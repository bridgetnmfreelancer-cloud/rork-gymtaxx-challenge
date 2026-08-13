import type { Session, User } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { supabase } from "@/lib/supabase";

type AuthState = {
  session: Session | null;
  user: User | null;
  /** True until the stored session has been read — routes must not redirect before this. */
  isLoading: boolean;
  signUp: (email: string, password: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Email a one-time reset code. Never reveals whether the account exists. */
  requestPasswordReset: (email: string) => Promise<void>;
  /** Exchange the emailed code for a session, then set the new password. */
  confirmPasswordReset: (email: string, code: string, password: string) => Promise<void>;
  /** Set a new password when a recovery session already exists (link path). */
  setPassword: (password: string) => Promise<void>;
  /** True once a recovery email link has signed this person in to change it. */
  isRecovering: boolean;
};

const AuthContext = createContext<AuthState | null>(null);

/** Turns Supabase's error strings into something a person can act on. */
function friendlyAuthError(message: string): string {
  const text = message.toLowerCase();
  if (text.includes("invalid login credentials")) return "That email and password don't match.";
  if (text.includes("already registered")) return "You already have an account. Log in instead.";
  if (text.includes("password should be")) return "Passwords need to be at least 6 characters.";
  if (text.includes("unable to validate email")) return "That doesn't look like a valid email address.";
  if (text.includes("network")) return "No connection. Check your signal and try again.";

  // Reset-specific. The code is one-time and hour-limited, so "expired" and
  // "already used" both surface as the same token error and need the same fix.
  if (text.includes("expired") || text.includes("invalid") || text.includes("otp")) {
    return "That code has expired or has already been used. Ask for a new one.";
  }
  if (text.includes("rate limit") || text.includes("too many")) {
    return "Too many attempts just now. Wait a minute, then try again.";
  }
  if (text.includes("not authorized")) {
    return "We can't send email to that address yet. Contact support and we'll sort it.";
  }
  if (text.includes("same as the old") || text.includes("should be different")) {
    return "That's the password you already have. Choose a different one.";
  }
  return "Something went wrong. Try again in a moment.";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRecovering, setIsRecovering] = useState<boolean>(false);

  useEffect(() => {
    let active = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return;
        setSession(data.session);
      })
      .catch((error: unknown) => {
        console.error("auth: could not restore session", error);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    const { data: listener } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      // Landing from a reset link signs them in with a recovery session. That is
      // not a normal login — they must set a password before going anywhere.
      if (event === "PASSWORD_RECOVERY") setIsRecovering(true);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      session,
      user: session?.user ?? null,
      isLoading,
      signUp: async (email: string, password: string) => {
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });
        if (error) throw new Error(friendlyAuthError(error.message));
      },
      signIn: async (email: string, password: string) => {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw new Error(friendlyAuthError(error.message));
      },
      signOut: async () => {
        const { error } = await supabase.auth.signOut();
        if (error) console.error("auth: sign out failed", error.message);
      },
      requestPasswordReset: async (email: string) => {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          // Only used if they tap the link instead of typing the code. Landing
          // here means the page can put them straight on the password step.
          redirectTo: `${window.location.origin}/forgot-password`,
        });
        if (error) throw new Error(friendlyAuthError(error.message));
      },
      confirmPasswordReset: async (email: string, code: string, password: string) => {
        // Verifying the code is what proves they own the inbox; it returns a
        // session, which is what makes the password change below permissible.
        const { error: verifyError } = await supabase.auth.verifyOtp({
          email: email.trim(),
          token: code.trim(),
          type: "recovery",
        });
        if (verifyError) throw new Error(friendlyAuthError(verifyError.message));

        const { error: updateError } = await supabase.auth.updateUser({ password });
        if (updateError) throw new Error(friendlyAuthError(updateError.message));
        setIsRecovering(false);
      },
      setPassword: async (password: string) => {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw new Error(friendlyAuthError(error.message));
        setIsRecovering(false);
      },
      isRecovering,
    }),
    [session, isLoading, isRecovering],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
