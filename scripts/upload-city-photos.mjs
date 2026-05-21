// === scripts/upload-city-photos.mjs ==========================================
// Bulk-upload a city's photo folder to the personal-photos Supabase bucket
// AND register each upload in the personal_photos table so the cover picker
// surfaces them under that city's lists.
//
// Personal_photos.pin_id is NOT NULL, so every photo attaches to an "anchor
// pin" — typically the city's most representative pin. Photos then appear in
// the cover picker's "Related places" tab on any list whose name word-matches
// that pin's city. They also render on that pin's own /pins/<slug> gallery,
// which is intentional: a few extra cityscape shots on a flagship city pin
// reads fine.
//
// Usage:
//   node --env-file=.env.local scripts/upload-city-photos.mjs \
//     <directory> <anchor-pin-slug> [--caption "..."]
//
// Example:
//   node --env-file=.env.local scripts/upload-city-photos.mjs \
//     "/Users/mike/Desktop/Travel Photos/tbilisi" narikala-fortress
//
// Idempotent on re-runs: bucket uploads use upsert, and personal_photos
// has a unique index on (hash), so already-uploaded photos get skipped.
//
// Recursively walks the directory so subfolders (e.g. Madrid/location tagged/)
// get included. Skips non-image files.

import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import { readFile, readdir, stat } from 'fs/promises';
import { join, basename } from 'path';

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  'https://pdjrvlhepiwkshxerkpz.supabase.co';
const KEY = process.env.STRAY_SUPABASE_SERVICE_ROLE_KEY;
if (!KEY) {
  console.error('STRAY_SUPABASE_SERVICE_ROLE_KEY not set');
  process.exit(1);
}

const [, , dirArg, pinSlugArg, ...rest] = process.argv;
if (!dirArg || !pinSlugArg) {
  console.error(
    'usage: node --env-file=.env.local scripts/upload-city-photos.mjs <dir> <anchor-pin-slug> [--caption "..."]',
  );
  process.exit(1);
}

const captionFlagIdx = rest.indexOf('--caption');
const explicitCaption =
  captionFlagIdx >= 0 ? rest[captionFlagIdx + 1] : null;
const defaultCaption = basename(dirArg.replace(/\/$/, ''));

const sb = createClient(SUPABASE_URL, KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Resolve anchor pin from slug.
const { data: pin, error: pinErr } = await sb
  .from('pins')
  .select('id, name, slug, city_names')
  .eq('slug', pinSlugArg)
  .maybeSingle();
if (pinErr) {
  console.error('lookup error:', pinErr.message);
  process.exit(1);
}
if (!pin) {
  console.error(`anchor pin not found: ${pinSlugArg}`);
  process.exit(1);
}
console.log(
  `anchor pin: ${pin.name} (${pin.slug})  city_names=${JSON.stringify(pin.city_names)}`,
);

// Walk the directory recursively, gathering image files.
const files = [];
async function walk(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (e) {
    console.error(`  cannot read ${dir}: ${e.message}`);
    return;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      await walk(p);
    } else if (/\.(jpe?g|png)$/i.test(e.name)) {
      files.push(p);
    }
  }
}
await walk(dirArg);
console.log(`found ${files.length} image file(s)`);
if (files.length === 0) process.exit(0);

let ok = 0;
let dup = 0;
let fail = 0;
for (const path of files) {
  const name = basename(path);
  try {
    const buf = await readFile(path);
    const hash = createHash('sha256').update(buf).digest('hex');
    const storageKey = `${hash.slice(0, 2)}/${hash}.jpg`;
    const url = `${SUPABASE_URL}/storage/v1/object/public/personal-photos/${storageKey}`;

    // Bucket upload. upsert: true means re-runs are safe.
    const { error: upErr } = await sb.storage
      .from('personal-photos')
      .upload(storageKey, buf, { contentType: 'image/jpeg', upsert: true });
    if (upErr) throw new Error(`storage: ${upErr.message}`);

    const fileStat = await stat(path);
    const { error: insErr } = await sb.from('personal_photos').insert({
      pin_id: pin.id,
      url,
      hash,
      caption: explicitCaption ?? defaultCaption,
      bytes: buf.length,
      taken_at: fileStat.mtime.toISOString(),
      media_type: 'image',
      hidden: false,
    });
    if (insErr) {
      // 23505 = unique_violation on the hash index. Photo already exists.
      if (insErr.code === '23505') {
        dup++;
        continue;
      }
      throw new Error(`db: ${insErr.message}`);
    }
    ok++;
    if (ok % 20 === 0) console.log(`  ${ok} uploaded so far...`);
  } catch (e) {
    console.error(`  FAIL ${name}: ${e.message}`);
    fail++;
  }
}
console.log(
  `\ndone. ${ok} inserted, ${dup} already existed, ${fail} failed`,
);
