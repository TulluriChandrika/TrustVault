import { createClient, SupabaseClient } from "@supabase/supabase-js";

let supabaseAdmin: SupabaseClient | null = null;

/**
 * Returns a server-side Supabase admin client configured with SUPABASE_URL and SUPABASE_SECRET_KEY.
 * Used exclusively on the backend for verifying JWT access tokens and administrative tasks.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (supabaseAdmin) {
    return supabaseAdmin;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "Supabase server configuration missing: SUPABASE_URL and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) must be set."
    );
  }

  supabaseAdmin = createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return supabaseAdmin;
}

/**
 * Allows injecting a mock or custom SupabaseClient during unit and integration tests.
 */
export function setSupabaseAdminForTesting(client: SupabaseClient | null): void {
  supabaseAdmin = client;
}
