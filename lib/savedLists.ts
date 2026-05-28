// === Saved-list slug helpers =================================================
// Saved-list names in the DB are lowercased + emoji-stripped at import
// time (see scripts/import-google-takeout.ts → slugify_list_name). So a
// name like "Bangkok 🇹🇭" is stored as "bangkok"; "Coffee Shops" stored
// as "coffee shops". As of May 2026 saved_lists.slug is a real column,
// so the URL identifier can be edited independently of the display name
// without forcing an admin redirect every time a name is changed.
//
// The R2 migration (May 2026) unified list-membership identifiers
// around saved_lists.slug:
//   • saved_lists meta table is keyed by slug (this module's Map).
//   • pins.saved_lists[] holds slugs (scripts/migrate-saved-lists-to-slugs.mjs).
//   • All URL routing keys on saved_lists.slug.
//
// `listNameToSlug` survives as a soft fallback for orphan entries that
// somehow lack a meta row (e.g., hand-edited pin.saved_lists, mid-import
// state) and inside the admin API where callers still pass display names.

import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { supabase } from './supabase';

/** Convert a saved-list name to a URL slug.
 *
 *  Use `meta.slug` (the saved_lists.slug column) when you have a
 *  SavedListMeta row in hand; this helper exists for bucket names that
 *  aren't backed by a metadata row yet. */
export function listNameToSlug(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '-');
}

/** Trim a personal-review string to roughly the first sentence-or-two so it
 *  fits two lines on a card. The card itself line-clamps; this just keeps us
 *  from shipping 800-character reviews into every card on a 184-pin list.
 *  Returns null on empty input so the card can hide the review block
 *  entirely instead of rendering empty space. */
export function snippet(text: string | null | undefined, max = 140): string | null {
  if (!text) return null;
  const t = text.trim();
  if (!t) return null;
  if (t.length <= max) return t;
  // Prefer breaking at the first sentence boundary; fall back to word.
  const sentence = t.slice(0, max).match(/^.+?[.!?](?=\s|$)/);
  if (sentence) return sentence[0];
  const cut = t.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max - 30 ? cut.slice(0, lastSpace) : cut).trim() + '…';
}

export type SavedListMeta = {
  name: string;
  /** URL identifier. Editable independently of `name` since May 2026.
   *  Falls back to `listNameToSlug(name)` for bucket names with no
   *  metadata row. */
  slug: string;
  googleShareUrl: string | null;
  description: string | null;
  coverPinId: string | null;
  /** Curated cover photo (Flavor-2 picker on /admin/lists/[slug]). When set,
   *  this URL wins over coverPinId / city-photo / first-pin-photo on the
   *  /lists index. Resolved by JOINing personal_photos at fetch time so
   *  consumers don't need to do a second round-trip. */
  coverPhotoId: string | null;
  coverPhotoUrl: string | null;
  /** Direct image URL chosen via the cover picker — used when the source
   *  is anything other than a personal_photos row (codex-generated pin
   *  art, a Wikidata image on a pin, a city or country hero photo).
   *  Wins over coverPhotoId / coverPinId in the resolution chain so the
   *  picker can commit any URL without touching personal_photos. */
  coverImageUrl: string | null;
  /** Curated pin ordering for this list. Pins listed here render in this
   *  order on /lists/<slug>; members NOT in the array fall to the end
   *  in the user's default sort order. Maintained server-side by the
   *  saved-list admin endpoints so it stays in sync with pin
   *  membership. Empty array = "no curation, sort however the page
   *  decides." */
  pinOrder: string[];
  updatedAt: string | null;
};

/** Pull every saved-list metadata row in one go. The set is small (hundreds
 *  at most) so we cache aggressively. We must return an array (not a Map)
 *  from `unstable_cache` because Next's data cache serializes via JSON, and
 *  Maps round-trip as `{}`. The Map is reconstructed in the React.cache
 *  wrapper so consumers still get a fast .get(name) API.
 *
 *  This is the same gotcha task #161 fixed for fetchAllPins. */
const _fetchAllSavedListsMetaArray = unstable_cache(
  async (): Promise<SavedListMeta[]> => {
    // We JOIN personal_photos via PostgREST embedding so the cover photo
    // URL travels with the row. cover_photo_id has ON DELETE SET NULL so a
    // dangling reference is impossible — if the JOIN comes back null, it
    // just means no cover was picked.
    const { data, error } = await supabase
      .from('saved_lists')
      .select(
        'name, slug, google_share_url, description, cover_pin_id, cover_photo_id, cover_image_url, pin_order, updated_at, ' +
        'cover_photo:personal_photos!cover_photo_id(url)'
      );
    if (error) {
      console.error('[savedLists] fetch failed:', error);
      return [];
    }
    return (data ?? []).map(rawRow => {
      // supabase-js types the per-row result as `GenericStringError | T`
      // when an embedded JOIN is involved. Property access on every field
      // (not just the embed) trips against the GenericStringError half of
      // the union. Double-cast through `unknown` once at the top so the
      // rest of this function reads cleanly. Same pattern as
      // app/api/admin/personal-photos/route.ts.
      const row = rawRow as unknown as Record<string, unknown>;
      // PostgREST embedding returns a single object (or null) when the FK
      // is one-to-one. Be defensive in case it ever ships an array form.
      const photo = row.cover_photo;
      const photoUrl =
        Array.isArray(photo)
          ? (photo[0] as { url?: string } | undefined)?.url ?? null
          : (photo as { url?: string } | null)?.url ?? null;
      const name = row.name as string;
      return {
        name,
        // saved_lists.slug is NOT NULL with a backfill, but we fall back
        // to the derived form just in case the JOIN ever ships a row that
        // missed the migration (e.g., concurrent writes during the
        // backfill window).
        slug: (row.slug as string | null) ?? listNameToSlug(name),
        googleShareUrl: (row.google_share_url as string | null) ?? null,
        description: (row.description as string | null) ?? null,
        coverPinId: (row.cover_pin_id as string | null) ?? null,
        coverPhotoId: (row.cover_photo_id as string | null) ?? null,
        coverPhotoUrl: photoUrl,
        coverImageUrl: (row.cover_image_url as string | null) ?? null,
        pinOrder: (row.pin_order as string[] | null) ?? [],
        updatedAt: (row.updated_at as string | null) ?? null,
      };
    });
  },
  // v9: SavedListMeta gained `slug` (separate from derived). v8 entries
  // miss the field; URL resolution would silently fall back to derived
  // values for all lists until TTL expiry, hiding the new column.
  ['saved-lists-meta-v9'],
  { revalidate: 300, tags: ['saved-lists-meta'] },
);

/** Wrapped in React.cache so the Map reconstruction happens once per render.
 *  Keyed by SLUG since the May 2026 R2 migration unified list-membership
 *  identifiers around saved_lists.slug — both pins.saved_lists[] and the
 *  meta map now key on the same string. */
export const fetchAllSavedListsMeta = cache(async (): Promise<Map<string, SavedListMeta>> => {
  const arr = await _fetchAllSavedListsMetaArray();
  const map = new Map<string, SavedListMeta>();
  for (const row of arr) map.set(row.slug, row);
  return map;
});

// === City / country → saved-list matching ===================================
// Heuristic: a list is "for" a place if its name contains the place name as
// a whole word. Bangkok 🇹🇭 → "bangkok" matches city "Bangkok"; "Madrid"
// matches city "Madrid"; "🇫🇷 Rennes" → "rennes" matches city "Rennes".
// Themed lists ("coffee shops", "want to go") don't match anything by
// design — the user can still see them via the /lists index.

function normalizeCandidate(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Return saved-list slugs whose normalized form contains any of the
 *  place names as a whole-word match. The `places` argument lets a
 *  city pass [name, slug, alternates] so we catch all reasonable
 *  matches without a full fuzzy search. The result is dedup'd.
 *
 *  Use this when feeding the result to fetchPinsForLists, which
 *  queries pins.saved_lists (the membership column that holds slugs
 *  as of the May 2026 R2 migration). The meta map is keyed by slug
 *  too, so iterating its keys gives slugs; word-boundary matching
 *  works the same on slugs (hyphens normalize to spaces inside
 *  normalizeCandidate) as it did on display names. */
export function listSlugsMatchingPlace(
  listsMeta: Map<string, { slug: string }>,
  places: (string | null | undefined)[],
): string[] {
  const targets = places
    .filter((p): p is string => !!p)
    .map(normalizeCandidate)
    .filter(p => p.length >= 3);
  if (targets.length === 0) return [];

  const matches = new Set<string>();
  for (const slug of listsMeta.keys()) {
    const norm = normalizeCandidate(slug);
    for (const t of targets) {
      // Whole-word containment so "rio" matches "rio botanical garden"
      // but "ri" doesn't match anything spurious.
      const re = new RegExp(`(?:^|\\s)${t.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}(?:\\s|$)`);
      if (re.test(norm)) {
        matches.add(slug);
        break;
      }
    }
  }
  return Array.from(matches);
}
