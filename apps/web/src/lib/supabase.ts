import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://placeholder-project.supabase.co";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "placeholder-anon-key";

export const missingSupabaseConfig = [
  !import.meta.env.VITE_SUPABASE_URL ? "VITE_SUPABASE_URL" : null,
  !import.meta.env.VITE_SUPABASE_ANON_KEY ? "VITE_SUPABASE_ANON_KEY" : null,
].filter(Boolean) as string[];

export const isSupabaseConfigured = missingSupabaseConfig.length === 0;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
