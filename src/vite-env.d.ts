/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** e.g. https://abcdefgh.supabase.co: leave unset to run the offline demo */
  readonly VITE_SUPABASE_URL?: string;
  /** the project's anon / publishable key (safe for the browser; RLS protects the data) */
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
