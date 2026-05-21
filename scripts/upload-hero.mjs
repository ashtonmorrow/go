// === scripts/upload-hero.mjs =================================================
// Uploads a local image to the Supabase `personal-photos` bucket using the
// content-addressed convention the rest of the atlas uses:
//   personal-photos/<sha256[0:2]>/<sha256>.jpg
//
// Usage:
//   node --env-file=.env.local scripts/upload-hero.mjs <local-image-path>
//
// Prints the public URL on success.
//
// Requires STRAY_SUPABASE_SERVICE_ROLE_KEY (service-role key, bypasses RLS).

import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';

const url =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  'https://pdjrvlhepiwkshxerkpz.supabase.co';
const key = process.env.STRAY_SUPABASE_SERVICE_ROLE_KEY;
if (!key) {
  console.error('STRAY_SUPABASE_SERVICE_ROLE_KEY not set');
  process.exit(1);
}

const localPath = process.argv[2];
if (!localPath) {
  console.error('usage: node --env-file=.env.local scripts/upload-hero.mjs <path>');
  process.exit(1);
}

const sb = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const data = readFileSync(localPath);
const hash = createHash('sha256').update(data).digest('hex');
const prefix = hash.slice(0, 2);
const storageKey = `${prefix}/${hash}.jpg`;

const { error } = await sb.storage
  .from('personal-photos')
  .upload(storageKey, data, { contentType: 'image/jpeg', upsert: true });

if (error) {
  console.error('upload failed:', error.message);
  process.exit(1);
}

console.log(`${url}/storage/v1/object/public/personal-photos/${storageKey}`);
