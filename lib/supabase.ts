// === Supabase client =======================================================
// Server-side Supabase client used by /pins. The pins table lives in the
// Stray Supabase project, behind RLS that allows SELECT for anon. The
// "publishable" key is intentionally public (Supabase's own term for it)
// so we hard-code it here rather than gating the build on Vercel env
// vars. Set NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY
// only if you want to point a fork at a different project.
//
// NB: the *service-role* key is a different beast and never lives in
// this repo — it bypasses RLS and is fetched from the Supabase
// dashboard for one-off ETL scripts (see scripts/import-pins.mjs).
//
import { createClient } from '@supabase/supabase-js';

const DEFAULT_URL = 'https://pdjrvlhepiwkshxerkpz.supabase.co';
const DEFAULT_KEY = 'sb_publishable_NrfBsFhfj0DSKqDEKeUCMQ_H5oDG-Zv';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_KEY;

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});
