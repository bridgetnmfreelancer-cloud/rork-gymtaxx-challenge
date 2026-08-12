import { createClient } from "@supabase/supabase-js";

import { env } from "./env";
import type { Database } from "./database.types";

/**
 * Shared Supabase client.
 *
 * `persistSession` matters more here than on native: an installed web app is
 * killed aggressively by iOS, and losing the session on every relaunch would
 * make people re-enter a password just to log a workout.
 */
export const supabase = createClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: "gymtaxx.auth",
  },
});

/**
 * Call a Supabase edge function with the signed-in user's access token.
 *
 * The deposit functions authenticate the caller themselves, so an unauthenticated
 * call is a bug rather than a recoverable state.
 */
export async function callFunction<T>(name: string, body?: unknown): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("not_signed_in");

  const response = await fetch(`${env.functionsUrl}/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      // Supabase's gateway rejects the request before it reaches the function
      // without this, even when the user's token is perfectly valid.
      apikey: env.supabaseAnonKey,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const payload = (await response.json().catch(() => null)) as T | { error?: string } | null;

  if (!response.ok) {
    const reason =
      payload && typeof payload === "object" && "error" in payload && payload.error
        ? String(payload.error)
        : `request_failed_${response.status}`;
    throw new Error(reason);
  }

  return payload as T;
}
