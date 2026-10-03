import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfigured = Boolean(url && key);

// Read-only access with the public key. Row level security only allows select.
export const supabase = createClient(url ?? "https://missing.supabase.co", key ?? "missing", { auth: { persistSession: false } });
