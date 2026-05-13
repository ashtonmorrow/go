/**
 * scripts/fix-broken-images.ts
 *
 * Apply data fixes for the broken image classes the audit surfaced:
 *
 *   1. go_cities.city_flag has ~1000+ rows where the URL was DOUBLE-encoded
 *      (`%2520` instead of `%20`). Commons returns 404 for those because it
 *      looks for a file literally named with `%20` in the title. Decoding
 *      once restores them to working state.
 *
 *   2. go_cities.personal_photo has ~18 rows pointing at Notion's
 *      `prod-files-secure.s3.us-west-2.amazonaws.com` short-lived signed
 *      URLs that have expired (403). Null them so the cover fallback chain
 *      (personal photos from pins in the city → wiki hero → null) kicks in.
 *
 *   3. pins.images has ~23 rows whose JSONB array contains entries pointing
 *      at Supabase Storage paths that 400. Remove those bad entries from
 *      the array, keep the rest. Most pins have multiple images; we only
 *      drop the broken ones.
 *
 *   4. /content/lists/cape-town.md frontmatter has hero_image pointing at
 *      /images/posts/cape-town-travel-brief.jpg which doesn't exist on
 *      disk. Strip the field.
 *
 * Usage:
 *   STRAY_SUPABASE_SERVICE_ROLE_KEY=<key> npx tsx scripts/fix-broken-images.ts [--dry-run]
 *
 * Idempotent: re-running after a clean pass is a no-op because the
 * "broken" detection regenerates from the live DB each run.
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.STRAY_SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('[fix] Missing env. Need NEXT_PUBLIC_SUPABASE_URL + STRAY_SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const DRY_RUN = process.argv.includes('--dry-run');
const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// Matches the double-encoding tells: `%25` followed by what looks like
// the start of another percent-encoded byte (`%2520`, `%252C`, `%2528`,
// etc). Don't catch `%25` followed by anything else because there are
// legitimate URLs that contain literal '%' (rare, but possible).
const DOUBLE_ENCODED_RE = /%25(?:[0-9A-Fa-f]{2})/;

function decodeOnce(url: string): string {
  // `decodeURIComponent` on the whole URL would mangle the protocol
  // separator, so we only decode the path component AFTER the host.
  try {
    const u = new URL(url);
    u.pathname = decodeURIComponent(u.pathname);
    // Reconstruct without re-encoding ASCII paths. URL.toString() re-encodes,
    // but only what wasn't already valid in pathname syntax. The net effect
    // is one layer of decoding stripped off.
    return u.toString();
  } catch {
    return url;
  }
}

// --- 1. city_flag double-encoding fix -------------------------------------

async function fixCityFlags() {
  console.log('\n--- Fixing double-encoded go_cities.city_flag ---');
  const PAGE = 1000;
  let totalChecked = 0;
  let totalFixed = 0;
  const samples: string[] = [];
  for (let start = 0; ; start += PAGE) {
    const { data, error } = await sb
      .from('go_cities')
      .select('id, slug, city_flag')
      .not('city_flag', 'is', null)
      .range(start, start + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    totalChecked += data.length;

    const updates: { id: string; city_flag: string }[] = [];
    for (const row of data as Array<{ id: string; slug: string | null; city_flag: string | null }>) {
      const url = row.city_flag;
      if (!url || !DOUBLE_ENCODED_RE.test(url)) continue;
      const decoded = decodeOnce(url);
      // Sanity: only update if we actually changed something AND the result
      // still looks like a commons.wikimedia.org URL.
      if (decoded === url) continue;
      if (!decoded.includes('commons.wikimedia.org') && !decoded.includes('wikimedia.org')) continue;
      updates.push({ id: row.id, city_flag: decoded });
      if (samples.length < 5) samples.push(`  ${row.slug ?? row.id}: ${url} -> ${decoded}`);
    }

    if (updates.length > 0) {
      console.log(`  page starting ${start}: ${updates.length} rows need fix`);
      if (!DRY_RUN) {
        // Supabase doesn't support batch update with different values per
        // row in one call without RPC; loop with Promise.all for parallelism.
        const results = await Promise.all(
          updates.map((u) =>
            sb.from('go_cities').update({ city_flag: u.city_flag }).eq('id', u.id),
          ),
        );
        const failed = results.filter((r) => r.error);
        if (failed.length > 0) console.error('  update errors:', failed.length);
      }
      totalFixed += updates.length;
    }
    if (data.length < PAGE) break;
  }
  console.log(`  checked ${totalChecked} cities, ${totalFixed} flags ${DRY_RUN ? 'would be ' : ''}fixed`);
  if (samples.length > 0) {
    console.log('  samples:');
    for (const s of samples) console.log(s);
  }
}

// --- 2. city.personal_photo stale Notion URLs -----------------------------

async function nullExpiredCityPersonalPhotos() {
  console.log('\n--- Nulling expired go_cities.personal_photo Notion S3 URLs ---');
  const PATTERN = 'prod-files-secure.s3.us-west-2.amazonaws.com';
  const { data, error } = await sb
    .from('go_cities')
    .select('id, slug, personal_photo')
    .like('personal_photo', `%${PATTERN}%`);
  if (error) throw error;
  const rows = (data ?? []) as Array<{ id: string; slug: string | null; personal_photo: string | null }>;
  console.log(`  ${rows.length} cities have stale Notion S3 personal_photo URLs`);
  for (const r of rows.slice(0, 5)) {
    console.log(`    ${r.slug}: ${r.personal_photo?.slice(0, 70)}...`);
  }
  if (!DRY_RUN && rows.length > 0) {
    const results = await Promise.all(
      rows.map((r) => sb.from('go_cities').update({ personal_photo: null }).eq('id', r.id)),
    );
    const failed = results.filter((r) => r.error);
    if (failed.length > 0) console.error('  errors:', failed.length);
    console.log(`  nulled ${rows.length - failed.length} rows`);
  }
}

// --- 2b. city_flag stale Notion URLs -------------------------------------
//
// Same class of stale-signed-URL as the personal_photo case: Notion's S3
// presigned URLs expire after an hour or so and have been pasted into
// city_flag rows for hand-drawn city flags (Bath, Brighton, Eastbourne,
// Galapagos Islands, plus the delete-wallonia row that is itself a
// scheduled cleanup target). Null them so the runtime <Flag> component's
// fallback chain renders the country flag instead.

async function nullExpiredCityFlags() {
  console.log('\n--- Nulling expired go_cities.city_flag Notion S3 URLs ---');
  const PATTERN = 'prod-files-secure.s3.us-west-2.amazonaws.com';
  const { data, error } = await sb
    .from('go_cities')
    .select('id, slug, city_flag')
    .like('city_flag', `%${PATTERN}%`);
  if (error) throw error;
  const rows = (data ?? []) as Array<{ id: string; slug: string | null; city_flag: string | null }>;
  console.log(`  ${rows.length} cities have stale Notion S3 city_flag URLs`);
  for (const r of rows) {
    console.log(`    ${r.slug}: ${r.city_flag?.slice(0, 80)}...`);
  }
  if (!DRY_RUN && rows.length > 0) {
    // Also null the city_flag_attribution since it's no longer pointing at
    // the real source.
    const results = await Promise.all(
      rows.map((r) =>
        sb.from('go_cities').update({ city_flag: null, city_flag_attribution: null }).eq('id', r.id),
      ),
    );
    const failed = results.filter((r) => r.error);
    if (failed.length > 0) console.error('  errors:', failed.length);
    console.log(`  nulled ${rows.length - failed.length} rows`);
  }
}

// --- 3. pin.images bad-URL filter -----------------------------------------

async function filterBrokenPinImageUrls() {
  console.log('\n--- Filtering broken Supabase Storage URLs out of pins.images ---');
  // Read the audit output to know exactly which URLs are broken so we
  // don't have to re-HEAD-check during this run.
  const auditPath = path.join(process.cwd(), 'scripts/_broken-images.json');
  let auditRaw: string;
  try {
    auditRaw = await fs.readFile(auditPath, 'utf8');
  } catch {
    console.log('  no audit output found; skipping (run audit-broken-images.ts first)');
    return;
  }
  const audit = JSON.parse(auditRaw) as Array<{ surface: string; url: string; owner: string }>;
  const brokenPinUrls = new Set(audit.filter((a) => a.surface === 'pin.images').map((a) => a.url));
  if (brokenPinUrls.size === 0) {
    console.log('  no broken pin.images URLs in audit');
    return;
  }
  console.log(`  audit lists ${brokenPinUrls.size} broken pin.images URLs`);

  // Pull pins that have at least one image whose URL matches one we know
  // is broken. Postgres JSONB containment makes this clean: filter where
  // images @> '[{"url": "<broken-url>"}]'. But Supabase JS doesn't have a
  // built-in contains-array helper; simplest is to fetch all pins with
  // non-null images and filter in JS. Fast enough for ~3k pins.
  const PAGE = 1000;
  let touched = 0;
  for (let start = 0; ; start += PAGE) {
    const { data, error } = await sb
      .from('pins')
      .select('id, slug, images')
      .not('images', 'is', null)
      .range(start, start + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    type PinRow = { id: string; slug: string | null; images: Array<{ url?: string; [k: string]: unknown }> | null };
    for (const row of data as PinRow[]) {
      if (!Array.isArray(row.images)) continue;
      const before = row.images.length;
      const filtered = row.images.filter((img) => !(img?.url && brokenPinUrls.has(img.url)));
      if (filtered.length === before) continue;
      console.log(`  ${row.slug}: ${before} -> ${filtered.length} images`);
      if (!DRY_RUN) {
        const { error: upErr } = await sb.from('pins').update({ images: filtered }).eq('id', row.id);
        if (upErr) console.error(`    update error:`, upErr.message);
      }
      touched++;
    }
    if (data.length < PAGE) break;
  }
  console.log(`  ${touched} pin rows ${DRY_RUN ? 'would be ' : ''}cleaned`);
}

// --- 4. cape-town.md frontmatter -----------------------------------------

async function fixCapeTownFrontmatter() {
  console.log('\n--- Fixing /content/lists/cape-town.md hero_image ---');
  const file = path.join(process.cwd(), 'content/lists/cape-town.md');
  let raw: string;
  try {
    raw = await fs.readFile(file, 'utf8');
  } catch (e) {
    console.log('  cape-town.md not found, skipping');
    return;
  }
  const parsed = matter(raw);
  const hi = parsed.data.hero_image;
  if (!hi || (typeof hi === 'string' && !hi.startsWith('/'))) {
    console.log('  cape-town.md hero_image already clean, skipping');
    return;
  }
  if (typeof hi === 'string' && hi.startsWith('/')) {
    // Confirm the file doesn't exist on disk; if it does, leave alone.
    const onDisk = path.join(process.cwd(), 'public', hi.replace(/^\//, ''));
    try {
      await fs.stat(onDisk);
      console.log(`  cape-town.md hero_image exists on disk (${onDisk}), leaving alone`);
      return;
    } catch {
      /* expected - file missing */
    }
    console.log(`  cape-town.md hero_image points at missing file: ${hi}`);
    if (!DRY_RUN) {
      // Empty-string the field so the YAML stays parseable but no image
      // loads. (Removing it entirely from the YAML would require structural
      // edits.) The list-page hero precedence will pick up the next
      // fallback in the chain.
      const next = raw.replace(/^hero_image:.*$/m, 'hero_image: ""');
      await fs.writeFile(file, next);
      console.log('  cleared');
    }
  }
}

async function main() {
  console.log(`Running image data fixes${DRY_RUN ? ' (DRY RUN)' : ''}...`);
  await fixCityFlags();
  await nullExpiredCityPersonalPhotos();
  await nullExpiredCityFlags();
  await filterBrokenPinImageUrls();
  await fixCapeTownFrontmatter();
  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
