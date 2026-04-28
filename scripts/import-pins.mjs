#!/usr/bin/env node
// === scripts/import-pins.mjs ==============================================
// One-shot (re-runnable) importer that pulls every record from the Airtable
// Framer / Attractions table and upserts it into the public.pins table in
// Stray's Supabase project.
//
// Idempotent: each Airtable record's stable `rec…` id is stored as
// `airtable_id` and used as the ON CONFLICT key, so re-runs update existing
// rows in place rather than creating duplicates.
//
// Usage:
//   AIRTABLE_PAT=pat... \
//   SUPABASE_URL=https://pdjrvlhepiwkshxerkpz.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
//   node scripts/import-pins.mjs
//
// Optional flags:
//   --dry-run          Pull from Airtable, transform, log a summary; skip writes.
//   --limit=N          Stop after N records. Useful for smoke-testing.
//   --delete-stale     After upsert, hard-delete pins whose airtable_id is no
//                      longer present in Airtable. OFF by default.
//
// Notes on the source data
//   * 1,342 records as of last check; mostly UNESCO World Heritage sites.
//   * Lat/lng arrives as one comma-separated string field ("12.34,56.78");
//     we split it into numeric lat/lng and keep the raw form for archeology.
//   * `category` is a singleSelect ('Cultural'|'Natural'|'Mixed'|...).
//   * Image URLs are Airtable signed URLs that expire — fine for the first
//     pass but worth migrating to Supabase Storage before going live.
//
// Notes on the destination
//   * RLS on `pins` allows anon SELECT and admin-only writes. We use the
//     service role key here, which bypasses RLS entirely.
//
import { createClient } from '@supabase/supabase-js';

// ----- Config ---------------------------------------------------------------
const AIRTABLE_PAT = process.env.AIRTABLE_PAT;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const BASE_ID  = 'appTZVjV5zHYkVmOl';   // Framer base
const TABLE_ID = 'tblfgw3Qji19QSBYR';   // Attractions

const DRY_RUN       = process.argv.includes('--dry-run');
const DELETE_STALE  = process.argv.includes('--delete-stale');
const LIMIT_ARG     = process.argv.find(a => a.startsWith('--limit='));
const LIMIT         = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1], 10) : Infinity;

// Airtable's REST API allows up to 100 records per page and ~5 req/s. We
// sleep a beat between pages to stay polite even though we're well under.
const PAGE_SIZE   = 100;
const PAGE_PAUSE  = 250; // ms

// Supabase upsert batch size — keeps each PostgREST call comfortably small.
const UPSERT_BATCH = 200;

// ----- Field-id map (cellValuesByFieldId is the only stable interface) ------
const F = {
  name:              'fldHTp25w5ilkBoLZ',
  slug:              'fldXnFfX0b0tclYxo',
  website:           'fldB9mwoUyWDBo842',
  description:       'fldMVeIztnMR2Jc6c',
  priceLong:         'fldVL4FuzUaXOzHU7',
  images:            'fld8iyCBgL5uJumq6',
  price:             'fld1bWVcJv7YUPlNy',
  // currency:        'fldbfHIymArUaElJD',  // record link; resolve later
  autonumberA:       'fldR7Ciy6BRLAQMIe',
  unesco:            'fldyDTY7Ld3XGtwmq',
  states:            'fldXpl2BGkfkyyAhM',
  cities:            'fldr0eA3itnow2mlX',
  category:          'fld7CmLBtdQrUP6rI',
  visited:           'fldiFGnYxO8cfDe5d',
  hours:             'fldILAmYNgY1UMp8e',
  latLong:           'fld8eCKQwcvUtvYD9',
  lastModified:      'fldHqzgnOD42rKhLJ',
  autonumberB:       'fldc9Oc3yEJDHisOP',
};

// ----- Helpers --------------------------------------------------------------
function die(msg, code = 1) {
  console.error(`error: ${msg}`);
  process.exit(code);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/** Parse "lat,lng" → { lat, lng }. Returns nulls when malformed. */
function parseLatLong(raw) {
  if (!raw || typeof raw !== 'string') return { lat: null, lng: null };
  const parts = raw.split(',').map(s => parseFloat(s.trim()));
  if (parts.length !== 2 || parts.some(n => !Number.isFinite(n))) {
    return { lat: null, lng: null };
  }
  return { lat: parts[0], lng: parts[1] };
}

/** Pull names out of a multipleRecordLinks cell. */
function namesFromLinks(cell) {
  if (!Array.isArray(cell)) return [];
  return cell.map(o => o?.name).filter(Boolean);
}

/** Compact image array — drop the fat `thumbnails` blobs Airtable inlines. */
function compactImages(cell) {
  if (!Array.isArray(cell)) return [];
  return cell.map(a => ({
    url:      a.url,
    width:    a.width  ?? null,
    height:   a.height ?? null,
    filename: a.filename ?? null,
    type:     a.type ?? null,
  }));
}

/** Map an Airtable record onto a pins-table row. */
function transform(rec) {
  const v = rec.cellValuesByFieldId || {};
  const { lat, lng } = parseLatLong(v[F.latLong]);
  return {
    airtable_id:          rec.id,
    airtable_autonumber:  v[F.autonumberB] ?? v[F.autonumberA] ?? null,
    name:                 (v[F.name] ?? '').trim() || rec.id,
    slug:                 v[F.slug] ?? null,
    lat,
    lng,
    lat_long_raw:         v[F.latLong] ?? null,
    city_names:           namesFromLinks(v[F.cities]),
    states_names:         namesFromLinks(v[F.states]),
    category:             v[F.category]?.name ?? null,
    description:          v[F.description] ?? null,
    hours:                v[F.hours] ?? null,
    price_text:           v[F.priceLong] ?? null,
    price_amount:         typeof v[F.price] === 'number' ? v[F.price] : null,
    price_currency:       null, // currency is a record link; resolve in pass 2 if we want it
    unesco_id:            typeof v[F.unesco] === 'number' ? v[F.unesco] : null,
    website:              v[F.website] ?? null,
    images:               compactImages(v[F.images]),
    visited:              !!v[F.visited],
    source:               'airtable',
    airtable_modified_at: v[F.lastModified] ?? null,
  };
}

// ----- Airtable pagination --------------------------------------------------
async function fetchAllAttractions() {
  const records = [];
  let cursor = null;
  let page = 0;
  while (records.length < LIMIT) {
    page += 1;
    const url = new URL(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`);
    url.searchParams.set('pageSize', String(Math.min(PAGE_SIZE, LIMIT - records.length)));
    url.searchParams.set('returnFieldsByFieldId', 'true');
    if (cursor) url.searchParams.set('offset', cursor);

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${AIRTABLE_PAT}` },
    });
    if (!res.ok) {
      const body = await res.text();
      die(`Airtable ${res.status}: ${body.slice(0, 400)}`);
    }
    const data = await res.json();
    const batch = data.records.map(r => ({
      id: r.id,
      cellValuesByFieldId: r.fields, // returnFieldsByFieldId=true puts ids in `fields`
    }));
    records.push(...batch);
    process.stdout.write(`\rfetched ${records.length} / ~1342 (page ${page})`);
    if (!data.offset) break;
    cursor = data.offset;
    await sleep(PAGE_PAUSE);
  }
  process.stdout.write('\n');
  return records.slice(0, LIMIT);
}

// ----- Supabase upsert ------------------------------------------------------
async function upsertPins(rows) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false },
  });

  let written = 0;
  for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
    const slice = rows.slice(i, i + UPSERT_BATCH);
    const { error } = await supabase
      .from('pins')
      .upsert(slice, { onConflict: 'airtable_id' });
    if (error) die(`Supabase upsert failed at batch ${i}: ${error.message}`);
    written += slice.length;
    process.stdout.write(`\rupserted ${written} / ${rows.length}`);
  }
  process.stdout.write('\n');
  return { supabase, written };
}

async function deleteStale(supabase, liveAirtableIds) {
  // Pull every airtable_id we currently have, diff against the live set,
  // and delete the strays. Done in one round-trip via NOT IN — for a few
  // thousand rows this is fine; if pins ever grows past ~50k consider a
  // server-side anti-join via execute_sql instead.
  const { data: existing, error: e1 } = await supabase
    .from('pins').select('airtable_id');
  if (e1) die(`Supabase select for stale-check failed: ${e1.message}`);
  const live = new Set(liveAirtableIds);
  const stale = existing
    .map(r => r.airtable_id)
    .filter(id => id && !live.has(id));
  if (!stale.length) {
    console.log('no stale pins to delete');
    return 0;
  }
  const { error: e2 } = await supabase
    .from('pins').delete().in('airtable_id', stale);
  if (e2) die(`Supabase delete-stale failed: ${e2.message}`);
  console.log(`deleted ${stale.length} stale pins`);
  return stale.length;
}

// ----- Main -----------------------------------------------------------------
async function main() {
  if (!AIRTABLE_PAT) die('AIRTABLE_PAT env var is required');
  if (!DRY_RUN) {
    if (!SUPABASE_URL) die('SUPABASE_URL env var is required (or pass --dry-run)');
    if (!SUPABASE_KEY) die('SUPABASE_SERVICE_ROLE_KEY env var is required (or pass --dry-run)');
  }

  console.log(`fetching Airtable Attractions (limit=${Number.isFinite(LIMIT) ? LIMIT : 'all'})…`);
  const records = await fetchAllAttractions();
  const rows = records.map(transform);

  // Quick health summary so the operator sees what's about to land.
  const haveLatLng = rows.filter(r => r.lat != null && r.lng != null).length;
  const haveUnesco = rows.filter(r => r.unesco_id != null).length;
  const visited    = rows.filter(r => r.visited).length;
  console.log(
    `transformed ${rows.length}: ${haveLatLng} with coords, ` +
    `${haveUnesco} UNESCO sites, ${visited} marked Visited`
  );

  if (DRY_RUN) {
    console.log('--dry-run: skipping Supabase write. Sample row 0:');
    console.log(JSON.stringify(rows[0], null, 2));
    return;
  }

  const { supabase, written } = await upsertPins(rows);
  console.log(`✓ ${written} pins upserted`);

  if (DELETE_STALE) {
    await deleteStale(supabase, rows.map(r => r.airtable_id));
  }
}

main().catch(err => die(err?.stack || String(err)));
