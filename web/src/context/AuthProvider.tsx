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
  return "Something went wrong. Try again in a moment.";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

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

    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
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
    }),
    [session, isLoading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
