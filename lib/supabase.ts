// === Supabase client =======================================================
// Server-side Supabase client used by /pins. The pins table lives in the
// Stray Supabase project (we already pay for it), behind RLS that allows
// SELECT for anon, so the publishable / anon key is fine to ship in the
// browser. We still default to using this on the server (in RSCs) so the
// query lives in the Next.js cache and the client gets a static page.
//
import { createClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!URL || !KEY) {
  // Fail loudly at boot — Vercel build catches this in dev/preview.
  throw new Error(
    'Missing Supabase env vars. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.'
  );
}

export const supabase = createClient(URL, KEY, {
  auth: { persistSession: false },
});
