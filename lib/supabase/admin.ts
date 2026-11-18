import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "@/lib/env";

let client: SupabaseClient | null = null;

/**
 * Service-role client. Bypasses RLS — only ever used inside server code that
 * has already performed its own admin / guest authorization.
 */
export function getServiceClient(): SupabaseClient {
  if (client) return client;
  const { url, serviceRoleKey } = getSupabaseConfig();
  client = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { "x-application-name": "gatherly" } },
  });
  return client;
}
