// Supabase client — clean backend for cross-device keys, data and auth.
// Falls back to null when env vars are missing (app keeps working on localStorage).
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export function isSupabaseReady(): boolean {
  return Boolean(url && anonKey);
}

// The server-side provider dispatcher (Supabase Edge Function + pg_cron + the
// owner-RLS migration) is an opt-in, separately-deployed feature. Until the
// operator sets VITE_DISPATCH_READY=true, orders always run in simulation mode
// and the UI must say so. This keeps the panel working even when only the base
// schema / localStorage are present.
export function isDispatchReady(): boolean {
  return isSupabaseReady() && import.meta.env.VITE_DISPATCH_READY === "true";
}

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseReady()) return null;
  if (!client) {
    client = createClient(url!, anonKey!, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }
  return client;
}
