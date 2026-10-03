import { createClient } from "@supabase/supabase-js";

// Accept the project URL with or without a pasted "/rest/v1" path or trailing slash.
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim().replace(/\/+$/, "").replace(/\/rest\/v1$/, "");
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfigured = Boolean(url && key);

// Public key: reads are allowed by row level security, writes go through /api. Auth sessions are kept in the browser.
export const supabase = createClient(url ?? "https://missing.supabase.co", key ?? "missing", { auth: { persistSession: true, autoRefreshToken: true } });
