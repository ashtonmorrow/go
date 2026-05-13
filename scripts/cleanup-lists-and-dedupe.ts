// === Cleanup lists & dedupe ================================================
//
// Three surgical fixes against the live Supabase DB. Read-only by default;
// pass --apply to write.
//
//   Fix 1 — Detach the 15 DC hotels from the `the hague` saved_list.
//           They got mis-tagged during a city-name typo pass and their
//           lat/lng were already zeroed. We scrub `the hague` from their
//           saved_lists[] and, where the row's name/address clearly
//           reads as Washington DC, also fix city_names.
//
//   Fix 2 — Roll up `hcmc` into `ho chi minh city`. Mike's older curated
//           subset (51 pins) is a strict subset of the canonical-name
//           list (75 pins); we ensure overlap, strip `hcmc` from pins,
//           preserve any curation columns (cover_*, pin_order) onto the
//           canonical row only if it doesn't already have them set,
//           then drop the `hcmc` metadata row.
//
//   Fix 3 — Roll up `den haag` into `the hague`, same pattern as Fix 2.
//           Runs AFTER Fix 1 (so the bbox-bad DC hotels are already gone
//           from `the hague` before any counts are reported here).
//
// Run order: Fix 1 → Fix 2 → Fix 3 (sequential, reported sequentially).
//
// Usage:
//   npx tsx --env-file=.env.local scripts/cleanup-lists-and-dedupe.ts
//   npx tsx --env-file=.env.local scripts/cleanup-lists-and-dedupe.ts --apply

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.STRAY_SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    '[cleanup] Missing NEXT_PUBLIC_SUPABASE_URL or STRAY_SUPABASE_SERVICE_ROLE_KEY.',
  );
  process.exit(1);
}

const APPLY = process.argv.includes('--apply');
const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type PinRow = {
  id: string;
  slug: string | null;
  name: string;
  lat: number | null;
  lng: number | null;
  address: string | null;
  google_place_id: string | null;
  saved_lists: string[] | null;
  city_names: string[] | null;
};

type SavedListRow = {
  name: string;
  slug: string | null;
  cover_image_url: string | null;
  cover_pin_id: string | null;
  cover_photo_id: string | null;
  pin_order: string[] | null;
};

const HAGUE_VARIANTS = new Set(['the hague', 'den haag']);
function isHagueCityName(s: string): boolean {
  return HAGUE_VARIANTS.has(s.trim().toLowerCase());
}

/** Heuristic: does this pin's name/address clearly read as Washington DC?
 *  Conservative — we'd rather leave city_names alone than wrongly relabel
 *  a row. Requires an explicit DC / Washington signal in name OR address. */
function looksWashingtonDC(row: PinRow): boolean {
  const hay = [row.name ?? '', row.address ?? ''].join(' ').toLowerCase();
  // Require "washington" or " dc" (with boundary) or ", dc" appearance.
  if (hay.includes('washington')) return true;
  if (/\b(d\.?c\.?)\b/.test(hay)) return true;
  return false;
}

function dedupePush(arr: string[] | null | undefined, val: string): string[] {
  const set = new Set(arr ?? []);
  set.add(val);
  return Array.from(set);
}

function removeAll(arr: string[] | null | undefined, values: Set<string>): string[] {
  return (arr ?? []).filter(v => !values.has(v));
}

// === Fix 1 ==================================================================
async function fix1_detachDCHotelsFromHague(): Promise<void> {
  console.log('\n=== Fix 1: detach 15 DC hotels from `the hague` ===');

  const cols = 'id, slug, name, lat, lng, address, google_place_id, saved_lists, city_names';
  const { data, error } = await sb
    .from('pins')
    .select(cols)
    .contains('saved_lists', ['the hague'])
    .is('lat', null)
    .is('lng', null);
  if (error) {
    console.error('[fix1] query failed:', error.message);
    return;
  }

  const rows = (data ?? []) as PinRow[];
  console.log(`[fix1] matched ${rows.length} pins (expected 15)`);
  if (rows.length !== 15) {
    console.warn(`[fix1] WARNING: row count (${rows.length}) does not match expected 15.`);
    console.warn('[fix1] Proceeding anyway — each row will be evaluated individually.');
  }

  const changes: Array<{
    slug: string | null;
    name: string;
    removedSavedList: boolean;
    cityNamesAction: string;
  }> = [];

  for (const row of rows) {
    const newSaved = removeAll(row.saved_lists, new Set(['the hague']));
    const isDC = looksWashingtonDC(row);
    const hadHagueCity = (row.city_names ?? []).some(isHagueCityName);

    let newCityNames: string[] | null = null;
    let cityAction = 'untouched';
    if (isDC && hadHagueCity) {
      // Strip any Hague variant from city_names, add Washington if missing.
      const stripped = (row.city_names ?? []).filter(c => !isHagueCityName(c));
      const hasWashington = stripped.some(c => c.trim().toLowerCase() === 'washington');
      newCityNames = hasWashington ? stripped : [...stripped, 'Washington'];
      cityAction = hasWashington
        ? 'removed-hague-variant'
        : 'removed-hague-variant + added Washington';
    } else if (!isDC) {
      cityAction = 'unsure (no clear DC signal) — skipped';
    } else if (!hadHagueCity) {
      cityAction = 'no hague variant present — skipped';
    }

    const patch: Record<string, unknown> = {
      saved_lists: newSaved,
      updated_at: new Date().toISOString(),
    };
    if (newCityNames) patch.city_names = newCityNames;

    if (APPLY) {
      const { error: updErr } = await sb.from('pins').update(patch).eq('id', row.id);
      if (updErr) {
        console.error(`[fix1] update failed for ${row.slug ?? row.id}: ${updErr.message}`);
        continue;
      }
    }
    changes.push({
      slug: row.slug,
      name: row.name,
      removedSavedList: true,
      cityNamesAction: cityAction,
    });
  }

  console.log(`[fix1] ${APPLY ? 'applied' : 'would apply'} changes to ${changes.length} pins:`);
  for (const c of changes) {
    console.log(`  - ${c.slug ?? '(no slug)'} | ${c.name} | city_names: ${c.cityNamesAction}`);
  }
}

// === Generic consolidation helper ==========================================
async function consolidateList(
  fromName: string,
  toName: string,
  label: string,
): Promise<void> {
  console.log(`\n=== ${label}: consolidate \`${fromName}\` → \`${toName}\` ===`);

  // Before counts: pins per list (membership).
  const fromCount = await countPinsInList(fromName);
  const toCount = await countPinsInList(toName);
  console.log(`[${label}] before: \`${fromName}\`=${fromCount} pins, \`${toName}\`=${toCount} pins`);

  // Fetch all pins in fromName.
  const cols = 'id, slug, name, saved_lists';
  const { data, error } = await sb
    .from('pins')
    .select(cols)
    .contains('saved_lists', [fromName]);
  if (error) {
    console.error(`[${label}] fetch failed: ${error.message}`);
    return;
  }
  const pins = (data ?? []) as Pick<PinRow, 'id' | 'slug' | 'name' | 'saved_lists'>[];

  let ensuredOverlap = 0;
  let alreadyOverlap = 0;
  let rewriteFailed = 0;

  for (const p of pins) {
    const current = p.saved_lists ?? [];
    const hasTo = current.includes(toName);
    if (hasTo) alreadyOverlap++;
    else ensuredOverlap++;

    const next = removeAll(current, new Set([fromName]));
    const finalArr = next.includes(toName) ? next : [...next, toName];

    if (APPLY) {
      const { error: updErr } = await sb
        .from('pins')
        .update({ saved_lists: finalArr, updated_at: new Date().toISOString() })
        .eq('id', p.id);
      if (updErr) {
        rewriteFailed++;
        console.error(`[${label}] rewrite failed for ${p.slug ?? p.id}: ${updErr.message}`);
      }
    }
  }
  console.log(
    `[${label}] rewrote ${pins.length} pins (already in target: ${alreadyOverlap}, newly added: ${ensuredOverlap}, failed: ${rewriteFailed})`,
  );

  // Merge curation columns from from-row to to-row if to-row is missing them.
  const { data: fromMetaArr, error: fromMetaErr } = await sb
    .from('saved_lists')
    .select('name, slug, cover_image_url, cover_pin_id, cover_photo_id, pin_order')
    .eq('name', fromName)
    .maybeSingle();
  if (fromMetaErr) {
    console.error(`[${label}] fetch from-meta failed: ${fromMetaErr.message}`);
  }
  const fromMeta = (fromMetaArr ?? null) as SavedListRow | null;

  const { data: toMetaArr, error: toMetaErr } = await sb
    .from('saved_lists')
    .select('name, slug, cover_image_url, cover_pin_id, cover_photo_id, pin_order')
    .eq('name', toName)
    .maybeSingle();
  if (toMetaErr) {
    console.error(`[${label}] fetch to-meta failed: ${toMetaErr.message}`);
  }
  const toMeta = (toMetaArr ?? null) as SavedListRow | null;

  if (fromMeta && toMeta) {
    const patch: Record<string, unknown> = {};
    if (fromMeta.cover_image_url && !toMeta.cover_image_url) {
      patch.cover_image_url = fromMeta.cover_image_url;
    }
    if (fromMeta.cover_pin_id && !toMeta.cover_pin_id) {
      patch.cover_pin_id = fromMeta.cover_pin_id;
    }
    if (fromMeta.cover_photo_id && !toMeta.cover_photo_id) {
      patch.cover_photo_id = fromMeta.cover_photo_id;
    }
    if (
      fromMeta.pin_order && fromMeta.pin_order.length > 0 &&
      (!toMeta.pin_order || toMeta.pin_order.length === 0)
    ) {
      patch.pin_order = fromMeta.pin_order;
    }
    if (Object.keys(patch).length > 0) {
      console.log(`[${label}] preserving curation columns from \`${fromName}\` → \`${toName}\`: ${Object.keys(patch).join(', ')}`);
      if (APPLY) {
        patch.updated_at = new Date().toISOString();
        const { error: mergeErr } = await sb
          .from('saved_lists')
          .update(patch)
          .eq('name', toName);
        if (mergeErr) {
          console.error(`[${label}] curation merge failed: ${mergeErr.message}`);
        }
      }
    } else {
      console.log(`[${label}] no curation columns to preserve.`);
    }
  } else if (fromMeta && !toMeta) {
    console.warn(`[${label}] WARNING: \`${toName}\` has no saved_lists row — curation columns from \`${fromName}\` cannot be preserved without creating one. Skipping merge.`);
  } else if (!fromMeta) {
    console.log(`[${label}] no \`${fromName}\` saved_lists row to merge from.`);
  }

  // Drop the from-row.
  if (fromMeta) {
    if (APPLY) {
      const { error: delErr } = await sb
        .from('saved_lists')
        .delete()
        .eq('name', fromName);
      if (delErr) {
        console.error(`[${label}] delete \`${fromName}\` row failed: ${delErr.message}`);
      } else {
        console.log(`[${label}] deleted \`${fromName}\` saved_lists row.`);
      }
    } else {
      console.log(`[${label}] would delete \`${fromName}\` saved_lists row.`);
    }
  } else {
    console.log(`[${label}] no \`${fromName}\` saved_lists row to delete.`);
  }

  // After counts.
  const fromAfter = await countPinsInList(fromName);
  const toAfter = await countPinsInList(toName);
  console.log(`[${label}] after: \`${fromName}\`=${fromAfter} pins, \`${toName}\`=${toAfter} pins`);
  if (APPLY && fromAfter !== 0) {
    console.warn(`[${label}] WARNING: \`${fromName}\` still has ${fromAfter} pins after rewrite.`);
  }

  // Confirm metadata row gone.
  const { data: afterMeta } = await sb
    .from('saved_lists')
    .select('name')
    .eq('name', fromName)
    .maybeSingle();
  if (APPLY) {
    if (afterMeta) console.warn(`[${label}] WARNING: \`${fromName}\` saved_lists row still present.`);
    else console.log(`[${label}] confirmed: \`${fromName}\` saved_lists row gone.`);
  }
}

async function countPinsInList(name: string): Promise<number> {
  const { count, error } = await sb
    .from('pins')
    .select('id', { count: 'exact', head: true })
    .contains('saved_lists', [name]);
  if (error) {
    console.error(`[count] ${name} failed: ${error.message}`);
    return -1;
  }
  return count ?? 0;
}

// === Main ===================================================================
async function main() {
  console.log(`[cleanup] Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}`);

  await fix1_detachDCHotelsFromHague();
  await consolidateList('hcmc', 'ho chi minh city', 'Fix 2');
  await consolidateList('den haag', 'the hague', 'Fix 3');

  console.log('\n[cleanup] done.');
}

main().catch(err => {
  console.error('[cleanup] FATAL:', err);
  process.exit(1);
});
