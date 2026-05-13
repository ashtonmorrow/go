// scripts/scan-list-pin-photos.ts
//
// Scan every /content/lists/*.md guide, pull out the [Name](/pins/<slug>)
// references in the body, and report which referenced pins have personal
// photos available (Mike's own uploads via personal_photos) vs only have
// generic images in pins.images[].
//
// The goal is to find guides where we can enhance the copy with photos
// Mike has actually taken.
//
// Usage: npx tsx scripts/scan-list-pin-photos.ts
//
// Output:
//   - Per-guide summary: pins referenced, pins with personal photos, %
//   - Per-pin detail: slug, photo count, first photo URL
//   - Top opportunities: guides with the most personal-photo coverage

import fs from 'node:fs/promises';
import path from 'node:path';

import matter from 'gray-matter';
import { createClient } from '@supabase/supabase-js';

const ROOT = process.cwd();
const LISTS_DIR = path.join(ROOT, 'content/lists');
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://pdjrvlhepiwkshxerkpz.supabase.co';
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  'sb_publishable_NrfBsFhfj0DSKqDEKeUCMQ_H5oDG-Zv';

const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

type PinPhotoRow = {
  slug: string;
  pin_id: string | null;
  personal_count: number;
  generic_count: number;
  first_personal_url: string | null;
  hero_photo_urls: string[] | null;
};

type GuideCoverage = {
  file: string;
  slug: string;
  pinRefs: Set<string>;
  withPersonal: string[];
  withGenericOnly: string[];
  missing: string[];
};

const PIN_LINK_RE = /\]\(\/pins\/([a-z0-9-]+)\)/g;

async function readAllLists() {
  const files = (await fs.readdir(LISTS_DIR)).filter((f) => f.endsWith('.md'));
  const guides: { file: string; slug: string; body: string }[] = [];
  for (const f of files) {
    const p = path.join(LISTS_DIR, f);
    const raw = await fs.readFile(p, 'utf8');
    const parsed = matter(raw);
    guides.push({ file: f, slug: f.replace(/\.md$/, ''), body: parsed.content });
  }
  return guides;
}

function extractPinSlugs(body: string): Set<string> {
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  PIN_LINK_RE.lastIndex = 0;
  while ((m = PIN_LINK_RE.exec(body))) {
    out.add(m[1]);
  }
  return out;
}

async function fetchPinPhotoCoverage(slugs: string[]): Promise<Map<string, PinPhotoRow>> {
  const map = new Map<string, PinPhotoRow>();
  if (slugs.length === 0) return map;

  // Batch into 100-slug chunks for the .in() query
  const chunkSize = 100;
  type PinRow = {
    id: string;
    slug: string;
    images: { url: string }[] | null;
    hero_photo_urls: string[] | null;
  };
  const pins: PinRow[] = [];
  for (let i = 0; i < slugs.length; i += chunkSize) {
    const chunk = slugs.slice(i, i + chunkSize);
    const { data, error } = await sb
      .from('pins')
      .select('id, slug, images, hero_photo_urls')
      .in('slug', chunk);
    if (error) throw error;
    if (data) pins.push(...(data as PinRow[]));
  }

  // Build map keyed by slug
  for (const p of pins) {
    map.set(p.slug, {
      slug: p.slug,
      pin_id: p.id,
      personal_count: 0,
      generic_count: Array.isArray(p.images) ? p.images.length : 0,
      first_personal_url: null,
      hero_photo_urls: p.hero_photo_urls ?? null,
    });
  }

  // Now query personal_photos for all the pin_ids we just got
  const pinIds = pins.map((p) => p.id);
  type PhotoRow = { pin_id: string; url: string; taken_at: string | null };
  const photos: PhotoRow[] = [];
  for (let i = 0; i < pinIds.length; i += chunkSize) {
    const chunk = pinIds.slice(i, i + chunkSize);
    const { data, error } = await sb
      .from('personal_photos')
      .select('pin_id, url, taken_at')
      .in('pin_id', chunk)
      .order('taken_at', { ascending: false });
    if (error) throw error;
    if (data) photos.push(...(data as PhotoRow[]));
  }

  // Aggregate by pin_id
  const byPinId = new Map<string, PhotoRow[]>();
  for (const ph of photos) {
    const arr = byPinId.get(ph.pin_id) ?? [];
    arr.push(ph);
    byPinId.set(ph.pin_id, arr);
  }

  // Back-fill counts into the slug map
  for (const row of map.values()) {
    if (!row.pin_id) continue;
    const list = byPinId.get(row.pin_id) ?? [];
    row.personal_count = list.length;
    row.first_personal_url = list[0]?.url ?? null;
  }

  return map;
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

async function main() {
  console.log('Scanning /content/lists/*.md for pin references...');
  const guides = await readAllLists();
  console.log(`Read ${guides.length} guides.\n`);

  // Build the union of all pin slugs across all guides for a single batch query
  const allSlugs = new Set<string>();
  const perGuide = new Map<string, Set<string>>();
  for (const g of guides) {
    const slugs = extractPinSlugs(g.body);
    perGuide.set(g.slug, slugs);
    for (const s of slugs) allSlugs.add(s);
  }
  console.log(`Found ${allSlugs.size} unique pin slugs across all guides.`);

  console.log('Fetching pin + personal_photo coverage from Supabase...');
  const coverage = await fetchPinPhotoCoverage([...allSlugs]);
  console.log(`Resolved ${coverage.size} pins (${allSlugs.size - coverage.size} slugs not in DB).\n`);

  // Per-guide rollup
  const rollups: GuideCoverage[] = [];
  for (const g of guides) {
    const slugs = perGuide.get(g.slug)!;
    const withPersonal: string[] = [];
    const withGenericOnly: string[] = [];
    const missing: string[] = [];
    for (const s of slugs) {
      const row = coverage.get(s);
      if (!row) {
        missing.push(s);
      } else if (row.personal_count > 0) {
        withPersonal.push(s);
      } else if (row.generic_count > 0) {
        withGenericOnly.push(s);
      } else {
        missing.push(s);
      }
    }
    rollups.push({
      file: g.file,
      slug: g.slug,
      pinRefs: slugs,
      withPersonal,
      withGenericOnly,
      missing,
    });
  }

  // Sort by personal-photo coverage descending
  rollups.sort((a, b) => b.withPersonal.length - a.withPersonal.length);

  console.log('=== Per-guide coverage (sorted by personal-photo pins) ===');
  console.log(
    pad('Guide', 36) + pad('Pins', 6) + pad('Personal', 10) + pad('Generic', 9) + 'Missing',
  );
  console.log('-'.repeat(80));
  for (const r of rollups) {
    if (r.pinRefs.size === 0) continue;
    console.log(
      pad(r.slug, 36) +
        pad(String(r.pinRefs.size), 6) +
        pad(String(r.withPersonal.length), 10) +
        pad(String(r.withGenericOnly.length), 9) +
        String(r.missing.length),
    );
  }

  console.log('\n=== Top 15 guides by personal-photo coverage ===');
  for (const r of rollups.slice(0, 15)) {
    if (r.withPersonal.length === 0) break;
    console.log(`\n--- ${r.slug} (${r.withPersonal.length} pins with personal photos) ---`);
    for (const s of r.withPersonal) {
      const row = coverage.get(s)!;
      console.log(`  ${pad(s, 50)}  ${row.personal_count} photo(s)`);
    }
  }

  // Totals
  const totalPersonal = rollups.reduce((acc, r) => acc + r.withPersonal.length, 0);
  const totalGenericOnly = rollups.reduce((acc, r) => acc + r.withGenericOnly.length, 0);
  const totalMissing = rollups.reduce((acc, r) => acc + r.missing.length, 0);
  console.log(
    `\nTotals: ${totalPersonal} pin references with personal photos, ` +
      `${totalGenericOnly} with generic-only, ${totalMissing} missing/no-photo.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
