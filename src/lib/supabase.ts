import { createClient } from "@supabase/supabase-js";

// Accept the project URL with or without a pasted "/rest/v1" path or trailing slash.
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim().replace(/\/+$/, "").replace(/\/rest\/v1$/, "");
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfigured = Boolean(url && key);

// Read-only access with the public key. Row level security only allows select.
export const supabase = createClient(url ?? "https://missing.supabase.co", key ?? "missing", { auth: { persistSession: false } });
