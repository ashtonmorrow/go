/**
 * One canonical cover-image resolution for a saved list.
 *
 * A list's cover should be the same image whether it is seen as a card on
 * /lists or as the hero on /lists/<slug>. Both pages previously carried
 * their own copy of this fallback chain (with a subtle ordering drift), so
 * this module is the single source of truth.
 *
 * Precedence, strongest first:
 *   1. heroImage    — the guide's authored `hero_image`; an editor's
 *                     deliberate pick wins unconditionally.
 *   2. coverImageUrl — curated raw URL (codex art, Wikidata pin image,
 *                     a city/country hero) from the cover picker.
 *   3. coverPhotoUrl — curated personal photo from the cover picker.
 *   4. coverPinId    — the curated cover pin's first image.
 *   5. cityCover     — the matching atlas city's personal photo.
 *   6. pin pile      — first usable image across the list's pins,
 *                     visited pins preferred (drafts often have none).
 *   7. null          — the card falls back to a "no photo" placeholder.
 *
 * Note: the /admin/lists index intentionally does NOT use this — it shows
 * only the curated cover so an editor sees what is actually pinned, not an
 * auto-fallback. That divergence is deliberate; leave it.
 */

export type CoverPin = {
  id: string;
  visited: boolean;
  images?: ({ url?: string | null } | null)[] | null;
};

export type ListCoverInputs = {
  heroImage?: string | null;
  coverImageUrl?: string | null;
  coverPhotoUrl?: string | null;
  coverPinId?: string | null;
  cityCover?: string | null;
  /** The list's pins — used for the curated-cover-pin lookup and the
   *  final pin-pile fallback. */
  pins: readonly CoverPin[];
};

export function resolveListCover(i: ListCoverInputs): string | null {
  if (i.heroImage) return i.heroImage;
  if (i.coverImageUrl) return i.coverImageUrl;
  if (i.coverPhotoUrl) return i.coverPhotoUrl;
  if (i.coverPinId) {
    const url = i.pins.find(p => p.id === i.coverPinId)?.images?.[0]?.url;
    if (url) return url;
  }
  if (i.cityCover) return i.cityCover;
  const visitedFirst = i.pins
    .slice()
    .sort((a, b) => (a.visited === b.visited ? 0 : a.visited ? -1 : 1));
  for (const p of visitedFirst) {
    const url = p.images?.[0]?.url;
    if (url) return url;
  }
  return null;
}
