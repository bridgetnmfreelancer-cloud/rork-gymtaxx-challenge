/**
 * Public configuration, read once at module load.
 *
 * These are all client-safe values (Supabase anon key, function base URL).
 * Nothing secret belongs here — the Stripe secret key and webhook secret stay
 * server-side in the edge functions.
 */

function required(name: keyof ImportMetaEnv): string {
  const value = import.meta.env[name];
  if (!value) {
    // Surfaced loudly at boot rather than as a confusing network error later.
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

const supabaseUrl = required("EXPO_PUBLIC_SUPABASE_URL");

export const env = {
  supabaseUrl,
  supabaseAnonKey: required("EXPO_PUBLIC_SUPABASE_ANON_KEY"),
  /**
   * Derived from the Supabase URL rather than configured separately.
   *
   * This used to read `EXPO_PUBLIC_RORK_FUNCTIONS_URL`, which still pointed at
   * the old iOS backend host. That host is gone, so every deposit call failed
   * with "we couldn't open the payment page" while the functions themselves
   * were healthy. Deriving it means the two can never drift apart again.
   */
  functionsUrl: `${supabaseUrl}/functions/v1`,
} as const;
