import 'server-only';
import type { supabaseAdmin } from '@/lib/supabaseAdmin';

// === Pin photo recency =====================================================
// Helper for the upload pickers: given a list of pin ids, return a
// Map<pinId, isoString> of the most recent personal_photos.created_at
// per pin. Used to sort search/anchor results so pins Mike just
// uploaded photos to bubble to the top.
//
// Implementation: one indexed query against personal_photos.pin_id for
// the candidate set, then a JS reduction. PostgREST doesn't expose
// GROUP BY directly, so we pull the rows we need and aggregate in
// memory. The candidate set is small (≤25 for search, hundreds for a
// city's pin pool) so this is cheap.

type Sb = ReturnType<typeof supabaseAdmin>;

export async function fetchLastPhotoAtByPin(
  sb: Sb,
  pinIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (pinIds.length === 0) return out;

  const { data, error } = await sb
    .from('personal_photos')
    .select('pin_id, created_at')
    .in('pin_id', pinIds);
  if (error) {
    console.warn('[pinPhotoRecency] fetch failed:', error.message);
    return out;
  }
  for (const row of data ?? []) {
    const pinId = row.pin_id as string | null;
    const createdAt = row.created_at as string | null;
    if (!pinId || !createdAt) continue;
    const prev = out.get(pinId);
    if (!prev || createdAt > prev) out.set(pinId, createdAt);
  }
  return out;
}

/** Sort a list of pin objects by recency of their last attached photo
 *  (newest first), with a name fallback for pins that have never had
 *  a photo or are tied. Mutates the input array in place and returns
 *  it for chaining. */
export function sortByPhotoRecency<T extends { id: string; name: string }>(
  pins: T[],
  lastPhotoAt: Map<string, string>,
): T[] {
  pins.sort((a, b) => {
    const ta = lastPhotoAt.get(a.id);
    const tb = lastPhotoAt.get(b.id);
    if (ta && tb) return ta < tb ? 1 : ta > tb ? -1 : a.name.localeCompare(b.name);
    if (ta) return -1; // a has photos, b doesn't → a first
    if (tb) return 1;
    return a.name.localeCompare(b.name);
  });
  return pins;
}
