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

export const env = {
  supabaseUrl: required("EXPO_PUBLIC_SUPABASE_URL"),
  supabaseAnonKey: required("EXPO_PUBLIC_SUPABASE_ANON_KEY"),
  functionsUrl: required("EXPO_PUBLIC_RORK_FUNCTIONS_URL"),
} as const;
