// scripts/audit-broken-images.ts
//
// Find every image URL referenced from the database and HEAD-check each to
// see which ones are broken. Reports a structured breakdown by surface so
// we can prioritize the cleanup.
//
// Surfaces checked:
//   - cities.hero_image       (Wikipedia hero, retired from rendering)
//   - cities.personal_photo   (single curated city cover)
//   - cities.hero_photo_urls  (curated gallery)
//   - cities.city_flag        (city's own flag, falls back to country)
//   - countries.flag          (country flag URL)
//   - countries.hero_photo_urls
//   - pins.images[].url       (general pin photos incl. Wikipedia + codex)
//   - pins.hero_photo_urls    (curated pin hero picks)
//   - personal_photos.url     (Mike's uploaded photos)
//   - saved_lists.cover_image_url and cover_photo_url
//   - /content/lists/*.md frontmatter hero_image
//
// Usage:
//   npx tsx scripts/audit-broken-images.ts             # full audit
//   npx tsx scripts/audit-broken-images.ts --skip-personal  # skip the
//                                                            largest set
//
// HEAD requests run in batches of 25 concurrent with a 10s timeout each.
// On a fresh check this takes 5-10 minutes for ~10k URLs. Subsequent runs
// can use --skip-personal if Mike's photos are known-good.

import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://pdjrvlhepiwkshxerkpz.supabase.co';
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  'sb_publishable_NrfBsFhfj0DSKqDEKeUCMQ_H5oDG-Zv';
const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

// Global concurrency cap for the fetch pool. Wikimedia rate-limits
// anonymous clients aggressively — 429 false positives dominated the
// first audit run. Two countermeasures:
//   1. Identify ourselves with a real User-Agent + contact info per
//      Wikimedia's policy: https://meta.wikimedia.org/wiki/User-Agent_policy
//   2. Throttle Wikimedia hosts to a small concurrent budget on top of
//      the global cap.
const CONCURRENCY = 25;
const WIKIMEDIA_CONCURRENCY = 4;
const TIMEOUT_MS = 12_000;
const USER_AGENT =
  'go.mike-lee.me/1.0 image-audit (contact: mikeyle3@gmail.com)';

const WIKIMEDIA_HOSTS = new Set([
  'commons.wikimedia.org',
  'upload.wikimedia.org',
  'en.wikipedia.org',
]);

function isWikimedia(url: string): boolean {
  try {
    return WIKIMEDIA_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

type Surface =
  | 'city.hero_image'
  | 'city.personal_photo'
  | 'city.hero_photo_urls'
  | 'city.city_flag'
  | 'country.flag'
  | 'country.hero_photo_urls'
  | 'pin.images'
  | 'pin.hero_photo_urls'
  | 'personal_photos'
  | 'saved_list.cover_image_url'
  | 'saved_list.cover_photo_url'
  | 'list.frontmatter.hero_image';

type Ref = {
  surface: Surface;
  url: string;
  /** What identifies the row (slug, id, list-file). */
  ownerLabel: string;
};

type CheckResult = {
  ref: Ref;
  status: number | 'timeout' | 'error' | 'ok';
  detail?: string;
};

const args = new Set(process.argv.slice(2));
const SKIP_PERSONAL = args.has('--skip-personal');

async function collectRefs(): Promise<Ref[]> {
  const refs: Ref[] = [];

  // ---- Cities -----------------------------------------------------------
  const PAGE = 1000;
  console.error('Collecting cities...');
  for (let start = 0; ; start += PAGE) {
    const { data, error } = await sb
      .from('go_cities')
      .select(
        'slug, hero_image, personal_photo, hero_photo_urls, city_flag',
      )
      .range(start, start + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const c of data as any[]) {
      const ownerLabel = `city:${c.slug ?? '?'}`;
      if (c.hero_image) refs.push({ surface: 'city.hero_image', url: c.hero_image, ownerLabel });
      if (c.personal_photo)
        refs.push({ surface: 'city.personal_photo', url: c.personal_photo, ownerLabel });
      if (Array.isArray(c.hero_photo_urls))
        for (const u of c.hero_photo_urls)
          if (u) refs.push({ surface: 'city.hero_photo_urls', url: u, ownerLabel });
      if (c.city_flag) refs.push({ surface: 'city.city_flag', url: c.city_flag, ownerLabel });
    }
    if (data.length < PAGE) break;
  }

  // ---- Countries --------------------------------------------------------
  console.error('Collecting countries...');
  {
    const { data, error } = await sb.from('go_countries').select('slug, flag, hero_photo_urls');
    if (error) throw error;
    for (const c of (data as any[]) ?? []) {
      const ownerLabel = `country:${c.slug ?? '?'}`;
      if (c.flag) refs.push({ surface: 'country.flag', url: c.flag, ownerLabel });
      if (Array.isArray(c.hero_photo_urls))
        for (const u of c.hero_photo_urls)
          if (u) refs.push({ surface: 'country.hero_photo_urls', url: u, ownerLabel });
    }
  }

  // ---- Pins -------------------------------------------------------------
  console.error('Collecting pins...');
  for (let start = 0; ; start += PAGE) {
    const { data, error } = await sb
      .from('pins')
      .select('slug, images, hero_photo_urls')
      .range(start, start + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const p of data as any[]) {
      const ownerLabel = `pin:${p.slug ?? '?'}`;
      if (Array.isArray(p.images))
        for (const img of p.images)
          if (img && typeof img === 'object' && img.url)
            refs.push({ surface: 'pin.images', url: img.url as string, ownerLabel });
      if (Array.isArray(p.hero_photo_urls))
        for (const u of p.hero_photo_urls)
          if (u) refs.push({ surface: 'pin.hero_photo_urls', url: u, ownerLabel });
    }
    if (data.length < PAGE) break;
  }

  // ---- Personal photos --------------------------------------------------
  if (!SKIP_PERSONAL) {
    console.error('Collecting personal_photos...');
    for (let start = 0; ; start += PAGE) {
      const { data, error } = await sb
        .from('personal_photos')
        .select('id, url, pin_id')
        .eq('hidden', false)
        .range(start, start + PAGE - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      for (const r of data as any[]) {
        if (r.url) refs.push({ surface: 'personal_photos', url: r.url, ownerLabel: `photo:${r.id}` });
      }
      if (data.length < PAGE) break;
    }
  }

  // ---- Saved lists ------------------------------------------------------
  console.error('Collecting saved_lists...');
  {
    const { data, error } = await sb
      .from('saved_lists')
      .select('name, cover_image_url, cover_photo_url');
    if (error) {
      console.error('  saved_lists query failed:', error.message);
    } else {
      for (const l of (data as any[]) ?? []) {
        const ownerLabel = `list:${l.name ?? '?'}`;
        if (l.cover_image_url)
          refs.push({ surface: 'saved_list.cover_image_url', url: l.cover_image_url, ownerLabel });
        if (l.cover_photo_url)
          refs.push({ surface: 'saved_list.cover_photo_url', url: l.cover_photo_url, ownerLabel });
      }
    }
  }

  // ---- /content/lists/*.md frontmatter ---------------------------------
  console.error('Collecting list frontmatter heroes...');
  const listsDir = path.join(process.cwd(), 'content/lists');
  const files = (await fs.readdir(listsDir)).filter((f) => f.endsWith('.md'));
  for (const f of files) {
    const raw = await fs.readFile(path.join(listsDir, f), 'utf8');
    const parsed = matter(raw);
    const hi = parsed.data.hero_image;
    if (typeof hi === 'string' && hi.trim())
      refs.push({
        surface: 'list.frontmatter.hero_image',
        url: hi.trim(),
        ownerLabel: `list-md:${f}`,
      });
  }

  return refs;
}

async function headCheck(url: string): Promise<CheckResult['status']> {
  const baseHeaders: Record<string, string> = {
    'User-Agent': USER_AGENT,
    Accept: 'image/*,*/*;q=0.8',
  };

  // Run a single fetch attempt with its own AbortController + timeout.
  // Reusing one controller across the initial HEAD + retries would cause
  // every retry after a timeout to fail immediately on the already-aborted
  // signal — the bug fixed here.
  async function attempt(
    method: 'HEAD' | 'GET',
    headers: Record<string, string>,
  ): Promise<Response | 'timeout' | 'error'> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      return await fetch(url, {
        method,
        signal: ctrl.signal,
        redirect: 'follow',
        headers,
      });
    } catch (err) {
      if ((err as Error).name === 'AbortError') return 'timeout';
      return 'error';
    } finally {
      clearTimeout(timer);
    }
  }

  let resp = await attempt('HEAD', baseHeaders);
  if (resp === 'timeout' || resp === 'error') return resp;
  // Some hosts (Wikimedia) reject HEAD with 405 but accept GET. Retry GET
  // with a Range header so we don't pull the whole file.
  if (resp.status === 405 || resp.status === 403) {
    const next = await attempt('GET', { ...baseHeaders, Range: 'bytes=0-0' });
    if (next === 'timeout' || next === 'error') return next;
    resp = next;
  }
  if (resp.status === 429) {
    // Pause and retry once. Wikimedia's hint is in the Retry-After
    // header when present.
    const retryAfter = Number(resp.headers.get('retry-after') ?? '2');
    const wait = Math.min(8000, Math.max(1000, retryAfter * 1000));
    await new Promise((r) => setTimeout(r, wait));
    const next = await attempt('GET', { ...baseHeaders, Range: 'bytes=0-0' });
    if (next === 'timeout' || next === 'error') return next;
    resp = next;
  }
  if (resp.ok || resp.status === 206) return 'ok';
  return resp.status;
}

async function runWithConcurrency<T, R>(
  items: T[],
  worker: (item: T) => Promise<R>,
  limit: number,
  onProgress?: (done: number, total: number) => void,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  let done = 0;
  async function pump() {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i]);
      done++;
      if (onProgress && done % 100 === 0) onProgress(done, items.length);
    }
  }
  await Promise.all(new Array(limit).fill(0).map(() => pump()));
  return results;
}

/**
 * Run URL checks across two pools so Wikimedia hosts can use a much
 * smaller concurrent budget. Returns results in the same order as input.
 */
async function checkUrlsSplitPools(
  urls: string[],
  onProgress: (done: number, total: number) => void,
): Promise<Array<{ url: string; status: CheckResult['status'] }>> {
  const wikiIdxs: number[] = [];
  const otherIdxs: number[] = [];
  for (let i = 0; i < urls.length; i++) {
    (isWikimedia(urls[i]!) ? wikiIdxs : otherIdxs).push(i);
  }
  const results = new Array(urls.length) as Array<{
    url: string;
    status: CheckResult['status'];
  }>;
  let done = 0;
  const tick = () => {
    done++;
    if (done % 100 === 0 || done === urls.length) onProgress(done, urls.length);
  };
  // Run the two pools concurrently. Wikimedia pool is throttled.
  await Promise.all([
    runWithConcurrency(
      wikiIdxs,
      async (i) => {
        results[i] = { url: urls[i]!, status: await headCheck(urls[i]!) };
        tick();
      },
      WIKIMEDIA_CONCURRENCY,
    ),
    runWithConcurrency(
      otherIdxs,
      async (i) => {
        results[i] = { url: urls[i]!, status: await headCheck(urls[i]!) };
        tick();
      },
      CONCURRENCY,
    ),
  ]);
  return results;
}

async function main() {
  const refs = await collectRefs();
  console.error(`Collected ${refs.length} refs.`);

  // Dedupe URL checks (a single Wikimedia URL could be referenced by many
  // pins). We check each URL once and reattach the status to every ref.
  const uniqUrls = Array.from(new Set(refs.map((r) => r.url)));
  console.error(`Deduped to ${uniqUrls.length} unique URLs. Checking...`);
  const t0 = Date.now();
  const statuses = await checkUrlsSplitPools(uniqUrls, (done, total) =>
    console.error(
      `  ${done}/${total} checked (${((Date.now() - t0) / 1000).toFixed(0)}s)`,
    ),
  );
  const byUrl = new Map(statuses.map((s) => [s.url, s.status] as const));

  // Per-surface roll-up.
  type Tally = { ok: number; bad: number; samples: { url: string; status: string; owner: string }[] };
  const bySurface = new Map<Surface, Tally>();
  let badRefs = 0;
  for (const r of refs) {
    const status = byUrl.get(r.url) ?? 'error';
    const ok = status === 'ok';
    if (!ok) badRefs++;
    const t = bySurface.get(r.surface) ?? { ok: 0, bad: 0, samples: [] };
    if (ok) t.ok++;
    else {
      t.bad++;
      if (t.samples.length < 8)
        t.samples.push({ url: r.url, status: String(status), owner: r.ownerLabel });
    }
    bySurface.set(r.surface, t);
  }

  console.log('\n=== Audit roll-up (by surface) ===\n');
  console.log('Surface'.padEnd(34) + 'OK'.padStart(8) + 'BAD'.padStart(8));
  console.log('-'.repeat(50));
  const surfaces: Surface[] = [
    'city.hero_image',
    'city.personal_photo',
    'city.hero_photo_urls',
    'city.city_flag',
    'country.flag',
    'country.hero_photo_urls',
    'pin.images',
    'pin.hero_photo_urls',
    'personal_photos',
    'saved_list.cover_image_url',
    'saved_list.cover_photo_url',
    'list.frontmatter.hero_image',
  ];
  for (const s of surfaces) {
    const t = bySurface.get(s);
    if (!t) continue;
    console.log(s.padEnd(34) + String(t.ok).padStart(8) + String(t.bad).padStart(8));
  }
  console.log(`\nTotal refs: ${refs.length}  bad: ${badRefs}\n`);

  // Sample broken URLs per surface.
  console.log('=== Sample broken URLs ===\n');
  for (const s of surfaces) {
    const t = bySurface.get(s);
    if (!t || t.bad === 0) continue;
    console.log(`--- ${s} (${t.bad} broken) ---`);
    for (const sm of t.samples) {
      console.log(
        `  ${sm.owner.padEnd(40)} [${sm.status}]  ${sm.url.slice(0, 100)}${sm.url.length > 100 ? '...' : ''}`,
      );
    }
    console.log('');
  }

  // Write the full bad-URL list to disk for follow-on repair.
  const badRows = refs
    .filter((r) => (byUrl.get(r.url) ?? 'error') !== 'ok')
    .map((r) => ({
      surface: r.surface,
      owner: r.ownerLabel,
      url: r.url,
      status: String(byUrl.get(r.url) ?? 'error'),
    }));
  const outPath = path.join(process.cwd(), 'scripts/_broken-images.json');
  await fs.writeFile(outPath, JSON.stringify(badRows, null, 2));
  console.log(`Wrote ${badRows.length} broken refs to ${path.relative(process.cwd(), outPath)}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
