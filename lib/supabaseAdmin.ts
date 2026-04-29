import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  'https://pdjrvlhepiwkshxerkpz.supabase.co';

let cached: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (cached) return cached;
  const key = process.env.STRAY_SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      'STRAY_SUPABASE_SERVICE_ROLE_KEY is not set. Required for admin routes.',
    );
  }
  cached = createClient(SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
