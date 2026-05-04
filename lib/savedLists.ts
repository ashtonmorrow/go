// === Saved-list slug helpers =================================================
// Saved-list names in the DB are already lowercased + emoji-stripped at import
// time (see scripts/import-google-takeout.ts → slugify_list_name). So a name
// like "Bangkok 🇹🇭" is stored as "bangkok"; "Coffee Shops" stored as
// "coffee shops". For URL slugs we only need to swap spaces for dashes and
// percent-encode anything weird. The reverse mapping is the simple inverse.
//
// We don't try to disambiguate collision cases (two lists that slugify to the
// same value); the import script's normalize already collapses duplicates.

import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { supabase } from './supabase';

/** Convert a saved-list name to a URL slug. */
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

/** Convert a URL slug back to a saved-list name (best-effort reverse). */
export function slugToListName(slug: string): string {
  return decodeURIComponent(slug).replace(/-/g, ' ').toLowerCase();
}

export type SavedListMeta = {
  name: string;
  googleShareUrl: string | null;
  description: string | null;
  coverPinId: string | null;
  /** Curated cover photo (Flavor-2 picker on /admin/lists/[slug]). When set,
   *  this URL wins over coverPinId / city-photo / first-pin-photo on the
   *  /lists index. Resolved by JOINing personal_photos at fetch time so
   *  consumers don't need to do a second round-trip. */
  coverPhotoId: string | null;
  coverPhotoUrl: string | null;
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
        'name, google_share_url, description, cover_pin_id, cover_photo_id, updated_at, ' +
        'cover_photo:personal_photos!cover_photo_id(url)'
      );
    if (error) {
      console.error('[savedLists] fetch failed:', error);
      return [];
    }
    return (data ?? []).map(row => {
      // PostgREST embedding returns a single object (or null) when the FK
      // is one-to-one. Be defensive in case it ever ships an array form.
      // Double-cast through unknown because supabase-js types the joined
      // cell as GenericStringError | T, which doesn't overlap with Record.
      const photo = (row as unknown as Record<string, unknown>).cover_photo;
      const photoUrl =
        Array.isArray(photo)
          ? (photo[0] as { url?: string } | undefined)?.url ?? null
          : (photo as { url?: string } | null)?.url ?? null;
      return {
        name: row.name as string,
        googleShareUrl: (row.google_share_url as string | null) ?? null,
        description: (row.description as string | null) ?? null,
        coverPinId: (row.cover_pin_id as string | null) ?? null,
        coverPhotoId: (row.cover_photo_id as string | null) ?? null,
        coverPhotoUrl: photoUrl,
        updatedAt: (row.updated_at as string | null) ?? null,
      };
    });
  },
  // v3: schema gained `cover_photo_id` + JOIN on personal_photos. Bumping
  // the key evicts every cached row that was missing those fields.
  ['saved-lists-meta-v3'],
  { revalidate: 300, tags: ['saved-lists-meta'] },
);

/** Wrapped in React.cache so the Map reconstruction happens once per render.
 *  Callers see the same Map shape they did before this fix. */
export const fetchAllSavedListsMeta = cache(async (): Promise<Map<string, SavedListMeta>> => {
  const arr = await _fetchAllSavedListsMetaArray();
  const map = new Map<string, SavedListMeta>();
  for (const row of arr) map.set(row.name, row);
  return map;
});

/** Convenience for a single name. */
export async function fetchSavedListMeta(name: string): Promise<SavedListMeta | null> {
  const all = await fetchAllSavedListsMeta();
  return all.get(name) ?? null;
}

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

/** Return saved-list names whose normalized form contains the place name as
 *  a word boundary. The `places` argument lets a city pass [name, slug,
 *  alternates] so we catch all reasonable matches without a full fuzzy
 *  search. The result is dedup'd. */
export function listsMatchingPlace(
  allListNames: Iterable<string>,
  places: (string | null | undefined)[],
): string[] {
  const targets = places
    .filter((p): p is string => !!p)
    .map(normalizeCandidate)
    .filter(p => p.length >= 3);
  if (targets.length === 0) return [];

  const matches = new Set<string>();
  for (const list of allListNames) {
    const norm = normalizeCandidate(list);
    for (const t of targets) {
      // Whole-word containment so "rio" matches "rio botanical garden" but
      // "ri" doesn't match anything spurious.
      const re = new RegExp(`(?:^|\\s)${t.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}(?:\\s|$)`);
      if (re.test(norm)) {
        matches.add(list);
        break;
      }
    }
  }
  return Array.from(matches);
}
