/**
 * One-shot migration: read every city + country page from Notion,
 * upsert into the matching Supabase tables.
 *
 * Run from the project root:
 *   npx tsx scripts/migrate-notion-to-supabase.ts
 *
 * Required env (read from .env.local automatically when invoked through
 * `tsx --env-file=.env.local`, or set in the shell):
 *   NOTION_TOKEN
 *   NEXT_PUBLIC_SUPABASE_URL
 *   STRAY_SUPABASE_SERVICE_ROLE_KEY
 *
 * Idempotent: every row is upserted by primary key (the Notion page id),
 * so running again refreshes Supabase to whatever Notion currently looks
 * like. notion_synced_at is bumped on every run.
 *
 * Two passes for cities so the country FK lands cleanly:
 *   pass 1 — upsert all countries
 *   pass 2 — upsert all cities, mapping the Notion "Country (linked)"
 *            relation to the matching country uuid.
 */

import { createClient } from '@supabase/supabase-js';
import { Client, APIResponseError } from '@notionhq/client';
import { GO_CITIES_TABLE, GO_COUNTRIES_TABLE, type GoGeoTable } from '../lib/goTables';

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY  = process.env.STRAY_SUPABASE_SERVICE_ROLE_KEY;

if (!NOTION_TOKEN || !SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    '[migrate] Missing env. Need NOTION_TOKEN, NEXT_PUBLIC_SUPABASE_URL, STRAY_SUPABASE_SERVICE_ROLE_KEY.',
  );
  process.exit(1);
}

const CITIES_DB    = '2d3fdea3fd4b8080b8e4fc674cdf8cd4';
const COUNTRIES_DB = 'a925032ca4da48fa952e9dde3713955f';

const notion = new Client({ auth: NOTION_TOKEN });
const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// ---------------------------------------------------------------------------
// Notion property helpers — same shape the runtime uses, lifted into the
// script so we don't have to import from lib/ which pulls in Next.js.
// ---------------------------------------------------------------------------

function text(prop: any): string | null {
  if (!prop) return null;
  if (prop.type === 'title')     return prop.title.map((t: any) => t.plain_text).join('').trim() || null;
  if (prop.type === 'rich_text') return prop.rich_text.map((t: any) => t.plain_text).join('').trim() || null;
  if (prop.type === 'select')    return prop.select?.name || null;
  if (prop.type === 'url')       return prop.url || null;
  return null;
}
function num(prop: any): number | null {
  return prop?.type === 'number' ? prop.number : null;
}
function check(prop: any): boolean {
  return prop?.type === 'checkbox' ? !!prop.checkbox : false;
}
function file(prop: any): string | null {
  if (prop?.type !== 'files' || !prop.files?.length) return null;
  const f = prop.files[0];
  if (f.type === 'external') return f.external.url;
  if (f.type === 'file')     return f.file.url;
  return null;
}
function multi(prop: any): string[] {
  return prop?.type === 'multi_select' ? prop.multi_select.map((s: any) => s.name) : [];
}
function rel(prop: any): string[] {
  return prop?.type === 'relation' ? prop.relation.map((r: any) => r.id) : [];
}
function parseLatLng(s: string | null): { lat: number | null; lng: number | null } {
  if (!s) return { lat: null, lng: null };
  const m = s.match(/(-?\d+\.?\d*)/g);
  if (!m || m.length < 2) return { lat: null, lng: null };
  const lat = parseFloat(m[0]);
  const lng = parseFloat(m[1]);
  if (isNaN(lat) || isNaN(lng)) return { lat: null, lng: null };
  const upper = s.toUpperCase();
  return {
    lat: upper.match(/[NS]/)?.[0] === 'S' ? -Math.abs(lat) : lat,
    lng: upper.match(/[EW]/)?.[0] === 'W' ? -Math.abs(lng) : lng,
  };
}
const BROKEN_FLAGCDN = /\/flagcdn\.com\/[^/]+\/(?:\.|_+\.)/;
function isBrokenFlagcdn(url: string | null): boolean {
  return !url || BROKEN_FLAGCDN.test(url);
}

/**
 * Slug fallback: when a Notion row has no Slug filled in (mostly placeholder
 * cities seeded before the field was enforced), derive one from the name and
 * append a row-ID hash so two unslugged rows with the same name can both
 * land cleanly. Keeps the unique-on-(slug) constraint intact.
 *
 * Once the user fills in a real Slug in Notion / Supabase, the next migration
 * run replaces the fallback with the curated value.
 */
function fallbackSlug(name: string, rowId: string): string {
  const idSuffix = rowId.replace(/-/g, '').slice(-6);
  const fromName = (name || '')
    .toLowerCase()
    .normalize('NFD')
    // Strip combining-diacritical marks (Unicode block U+0300–U+036F).
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 70);
  return fromName ? `${fromName}-${idSuffix}` : `unnamed-${idSuffix}`;
}

// ---------------------------------------------------------------------------
// Notion fetch with retry/backoff for 429s.
// ---------------------------------------------------------------------------

async function withRetry<T>(fn: () => Promise<T>, tries = 5): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); } catch (e) {
      lastErr = e;
      if (e instanceof APIResponseError && e.code === 'rate_limited') {
        const hdr = (e as any).headers?.get?.('retry-after');
        const ms = hdr ? parseFloat(hdr) * 1000 : Math.min(1000 * 2 ** i, 10000);
        await new Promise(r => setTimeout(r, ms));
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

async function fetchAllPages(databaseId: string): Promise<any[]> {
  const rows: any[] = [];
  let cursor: string | undefined;
  do {
    const res: any = await withRetry(() =>
      notion.databases.query({ database_id: databaseId, start_cursor: cursor, page_size: 100 }),
    );
    rows.push(...res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return rows;
}

// ---------------------------------------------------------------------------
// Row builders — Notion page → Supabase row shape.
// ---------------------------------------------------------------------------

function buildCountryRow(row: any) {
  const p = row.properties;
  const iso2 = text(p['ISO2']);
  const curated = file(p['Flag']);
  const flag = !isBrokenFlagcdn(curated)
    ? curated
    : iso2
    ? `https://flagcdn.com/${iso2.toLowerCase()}.svg`
    : null;
  const name = text(p['Name']) || '';
  return {
    id:                row.id,
    name,
    slug:              text(p['Slug']) || fallbackSlug(name, row.id),
    iso2,
    iso3:              text(p['ISO3']),
    continent:         text(p['Continent']),
    capital:           text(p['Capital']),
    language:          text(p['Language']),
    currency:          text(p['Currency']),
    calling_code:      text(p['Calling Code']),
    schengen:          check(p['Schengen?']),
    plug_types:        multi(p['Plug Types']),
    voltage:           text(p['Voltage']),
    tap_water:         text(p['Tap Water']),
    tipping:           text(p['Tipping']),
    emergency_number:  text(p['Emergency Number']),
    visa_us:           text(p['Visa (US Passport)']),
    wikidata_id:       text(p['Wikidata ID']),
    wikipedia_summary: text(p['Wikipedia Summary']),
    flag,
    notion_synced_at:  new Date().toISOString(),
    updated_at:        new Date().toISOString(),
  };
}

function buildCityRow(row: any) {
  const p = row.properties;
  const { lat, lng } = parseLatLng(text(p['Lat & Long']));
  const name = text(p['Name']) || '';
  return {
    id:                       row.id,
    name,
    slug:                     text(p['Slug']) || fallbackSlug(name, row.id),
    country:                  text(p['Country']),
    country_id:               rel(p['Country (linked)'])[0] || null,
    local_name:               text(p['Local Name']),
    been:                     check(p['Been?']),
    go:                       check(p['Go?']),
    lat,
    lng,
    population:               num(p['Population']),
    area:                     num(p['Area (km²)']),
    elevation:                num(p['Elevation (m)']),
    mayor:                    text(p['Mayor']),
    founded:                  text(p['Founded']),
    demonym:                  text(p['Demonym']),
    time_zone:                text(p['Time Zone']),
    utc_offset:               text(p['UTC Offset']),
    avg_high:                 num(p['Avg High (°C)']),
    avg_low:                  num(p['Avg Low (°C)']),
    rainfall:                 num(p['Annual Rainfall (mm)']),
    koppen:                   text(p['Köppen Climate']),
    nicknames:                text(p['Nicknames']),
    motto:                    text(p['City Motto']),
    iata_airports:            text(p['IATA Airports']),
    sister_cities:            rel(p['Sister Cities']),
    hero_image:               file(p['Hero Image']),
    personal_photo:           file(p['Personal Photo']),
    city_flag:                file(p['Flag']),
    wikidata_id:              text(p['Wikidata ID']),
    wikipedia_url:            text(p['Wikipedia URL']),
    wikipedia_summary:        text(p['Wikipedia Summary']),
    quote:                    text(p['Quote']),
    about:                    text(p['about']),
    why_visit:                text(p['Why Visit?']),
    avoid:                    text(p['avoid']),
    plac:                     text(p['Plac']),
    hot_season_name:          text(p['hot/dry season name']),
    hot_season_description:   text(p['hot/dry season description']),
    cold_season_name:         text(p['cold/wet season name']),
    cooler_wetter_season:     text(p['Cooler/Wetter Season']),
    my_google_places:         text(p['My Saved Places']),
    notion_synced_at:         new Date().toISOString(),
    updated_at:               new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Main.
// ---------------------------------------------------------------------------

/**
 * In-batch slug dedup. Notion is happy to let multiple rows share a slug
 * (e.g. Cartagena, Spain + Cartagena, Colombia both with `Slug = "cartagena"`),
 * but the Supabase tables enforce uniqueness. First row to claim a slug
 * keeps the clean form; subsequent collisions get a 6-char row-ID suffix.
 *
 * Logged so the user can fix in Notion afterwards if they want pretty URLs.
 */
function dedupeSlugs(table: GoGeoTable, rows: any[]): any[] {
  const seen = new Set<string>();
  for (const r of rows) {
    if (!seen.has(r.slug)) {
      seen.add(r.slug);
      continue;
    }
    const idSuffix = String(r.id).replace(/-/g, '').slice(-6);
    const newSlug = `${r.slug}-${idSuffix}`;
    console.warn(`[migrate] ${table}: slug "${r.slug}" already taken; "${r.name}" (${r.id}) gets "${newSlug}"`);
    r.slug = newSlug;
    seen.add(newSlug);
  }
  return rows;
}

async function chunkedUpsert(table: GoGeoTable, rows: any[]) {
  // Supabase has request-size limits; chunk to avoid 413s with rich payloads.
  const CHUNK = 200;
  let written = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await sb.from(table).upsert(chunk, { onConflict: 'id' });
    if (error) {
      console.error(`[migrate] ${table} upsert failed at offset ${i}:`, error);
      throw error;
    }
    written += chunk.length;
    process.stdout.write(`  ${table}: ${written}/${rows.length}\r`);
  }
  process.stdout.write('\n');
}

async function main() {
  console.log('[migrate] Fetching countries from Notion…');
  const countryPages = await fetchAllPages(COUNTRIES_DB);
  const countryRows = dedupeSlugs(GO_COUNTRIES_TABLE, countryPages.map(buildCountryRow));
  console.log(`[migrate] Got ${countryRows.length} countries. Upserting…`);
  await chunkedUpsert(GO_COUNTRIES_TABLE, countryRows);

  console.log('[migrate] Fetching cities from Notion…');
  const cityPages = await fetchAllPages(CITIES_DB);
  const cityRows = dedupeSlugs(GO_CITIES_TABLE, cityPages.map(buildCityRow));
  // Drop city rows that would foreign-key to a country we don't have
  // (shouldn't happen in practice, but defensive).
  const countryIds = new Set(countryRows.map(c => c.id));
  for (const r of cityRows) {
    if (r.country_id && !countryIds.has(r.country_id)) {
      console.warn(`[migrate] city "${r.name}" points at unknown country ${r.country_id}; clearing FK`);
      r.country_id = null;
    }
  }
  console.log(`[migrate] Got ${cityRows.length} cities. Upserting…`);
  await chunkedUpsert(GO_CITIES_TABLE, cityRows);

  console.log('[migrate] Done.');
}

main().catch(err => {
  console.error('[migrate] FATAL:', err);
  process.exit(1);
});
