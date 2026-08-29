// Standard @supabase/supabase-js client for an EXTERNAL Supabase project
// (not Lovable Cloud). Portable to Vercel: override with VITE_SUPABASE_URL /
// VITE_SUPABASE_PUBLISHABLE_KEY env vars if needed. The publishable (anon)
// key is safe to embed in the client bundle — row access is gated by RLS.
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ??
  "https://twwiwjufgtzwiosmbnkj.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ??
  "sb_publishable_GkYWLslBdCLWFq6vcIncWg_WdwMKrWN";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export const PIN_CUTOUTS_BUCKET = "pin-cutouts";
