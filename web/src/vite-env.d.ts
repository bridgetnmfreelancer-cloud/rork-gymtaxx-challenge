/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly EXPO_PUBLIC_SUPABASE_URL: string;
  readonly EXPO_PUBLIC_SUPABASE_ANON_KEY: string;
  readonly EXPO_PUBLIC_RORK_FUNCTIONS_URL: string;
  readonly EXPO_PUBLIC_VAPID_PUBLIC_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
