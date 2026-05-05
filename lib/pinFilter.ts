// === Shared pin filter + sort logic ========================================
// Lives outside any one view component so PinsGrid (cards), PinsTable, and
// PinsMap all run the same axes — search, visited, UNESCO, category,
// country — without duplicating the predicates. Callers pass the
// PinFilterState from PinFiltersContext and receive a filtered + sorted
// list back.
//
// Generic over T so each view can shape its data however it wants, as
// long as the structural fields the filters need are present.
import type { PinFilterState } from '@/components/PinFiltersContext';
import { continentOfCountry } from './countryContinent';

export type PinFilterable = {
  name: string;
  description?: string | null;
  cityNames?: string[];
  statesNames?: string[];
  category?: string | null;
  visited: boolean;
  unescoId?: number | null;
  lists?: string[];
  tags?: string[];
  inceptionYear?: number | null;
  priceAmount?: number | null;
  priceText?: string | null;
  /** Curated traveler-enrichment fields (sections 1-8). All optional so
   *  pre-enrichment views still type-check. */
  free?: boolean | null;
  freeToVisit?: boolean | null;
  foodOnSite?: string | null;
  wheelchairAccessible?: string | null;
  kidFriendly?: boolean | null;
  bring?: string[];
  airtableModifiedAt?: string | null;
  updatedAt?: string | null;
  /** Distinct from `visited` — a pin is "reviewed" only when Mike actually
   *  wrote about it. Optional so callers without the field still typecheck;
   *  treated as false when missing. */
  personalReview?: string | null;
  personalRating?: number | null;
  /** Mike's personal Google Maps saved-list memberships (Madrid, Bangkok,
   *  Coffee Shops, etc). Populated by the saved-list import. */
  savedLists?: string[];
  /** Set by the page after a personal_photos lookup. Truthy means Mike
   *  has uploaded at least one photo for this pin — the strongest
   *  "personal investment" signal we have, ahead of even a written review. */
  personalCoverUrl?: string | null;
  /** Curated images attached to the pin (Wikipedia thumbnails, source
   *  photos, etc). Distinct from personal photos — a pin can have one
   *  without the other. Used as a tier-3 signal in default sort. */
  images?: { url: string }[];
};

/** Personal-investment tier used by sortPins() to lead the default sort.
 *  Lower number wins. The ladder is:
 *    0 — Mike wrote a review AND uploaded a photo
 *    1 — Mike wrote a review (no personal photo yet)
 *    2 — Mike uploaded a photo (no written review)
 *    3 — At least one curated image attached (Wikipedia/source/etc)
 *    4 — Visited but no review/photo/image
 *    5 — Everything else
 *  Within a tier we fall through to the secondary sort (recent/name).
 *  This gives /pins/cards a "what Mike has actually engaged with" feel
 *  on first paint without the user having to touch a sort dropdown. */
export function pinPersonalTier(p: PinFilterable): number {
  const hasReview = !!(p.personalReview && p.personalReview.trim());
  const hasPersonalPhoto = !!p.personalCoverUrl;
  const hasCuratedImage = !!(p.images && p.images.length > 0);
  if (hasReview && hasPersonalPhoto) return 0;
  if (hasReview) return 1;
  if (hasPersonalPhoto) return 2;
  if (hasCuratedImage) return 3;
  if (p.visited) return 4;
  return 5;
}

// Words/phrases in the priceText field that imply free admission. Used
// alongside `priceAmount === 0` to identify the free-entry subset. The
// regex is permissive but anchored on word boundaries so "freezing" (in
// a description) wouldn't match here — and we only run it on priceText.
const FREE_PRICE_TEXT = /\b(free|no charge|no admission|no entry fee|complimentary|gratis|gratuit)\b/i;

function isFreeAdmission(p: PinFilterable): boolean {
  if (p.freeToVisit === true) return true;
  if (p.free === true) return true;
  if (p.priceAmount === 0) return true;
  if (p.priceText && FREE_PRICE_TEXT.test(p.priceText)) return true;
  return false;
}

export function filterPins<T extends PinFilterable>(pins: T[], state: PinFilterState): T[] {
  const needle = state.q.trim().toLowerCase();
  const out: T[] = [];
  for (const p of pins) {
    // q match — name, description, city, country names
    if (needle) {
      const hay = (
        p.name + '\n' +
        (p.description ?? '') + '\n' +
        (p.cityNames ?? []).join(' ') + '\n' +
        (p.statesNames ?? []).join(' ')
      ).toLowerCase();
      if (!hay.includes(needle)) continue;
    }
    if (state.visitedFilter === 'visited' && !p.visited) continue;
    if (state.visitedFilter === 'not-visited' && p.visited) continue;
    if (state.unescoOnly && p.unescoId == null) continue;
    // No admission fee — strict. A pin only qualifies when we have
    // EVIDENCE it's free: priceAmount is exactly 0, OR priceText
    // explicitly says so ("Free", "No charge", "Complimentary").
    // Pins with unknown price are excluded; otherwise the filter
    // would be a no-op (the dataset is overwhelmingly null-priced).
    if (state.freeOnly && !isFreeAdmission(p)) continue;
    if (state.foodOnSiteOnly) {
      const f = p.foodOnSite;
      if (!f || f === 'none' || f === 'unknown') continue;
    }
    if (state.wheelchairOnly) {
      const w = p.wheelchairAccessible;
      if (w !== 'fully' && w !== 'partially') continue;
    }
    if (state.kidFriendlyOnly && p.kidFriendly !== true) continue;
    // Reviewed-only narrows to pins Mike has actually written a review for —
    // distinct from `visited`. The pin must carry non-empty review text or a
    // star rating; either is enough to be "reviewed."
    if (state.reviewedOnly) {
      const hasText = !!(p.personalReview && p.personalReview.trim().length > 0);
      const hasRating = p.personalRating != null && p.personalRating > 0;
      if (!hasText && !hasRating) continue;
    }
    // "Mike's List" — pin appears in at least one of Mike's saved-list
    // collections. Distinct from picking specific saved lists in the
    // My Lists section: this is the broader "anything I've curated"
    // filter rather than "places on this exact list."
    if (state.mikesListOnly && (p.savedLists?.length ?? 0) === 0) continue;
    if (state.bring.size > 0) {
      const pinBring = p.bring ?? [];
      let hasAll = true;
      for (const b of state.bring) {
        if (!pinBring.includes(b)) { hasAll = false; break; }
      }
      if (!hasAll) continue;
    }
    // Saved lists — OR semantics (any selected list matches). Mirrors the
    // `lists` filter semantics elsewhere in the cockpit. The 230 saved
    // lists are mostly geographic so picking "madrid" + "barcelona" should
    // surface every place across both, not just intersection.
    if (state.savedLists.size > 0) {
      const pinSaved = p.savedLists ?? [];
      let hit = false;
      for (const s of state.savedLists) {
        if (pinSaved.includes(s)) { hit = true; break; }
      }
      if (!hit) continue;
    }
    if (state.categories.size > 0 && (!p.category || !state.categories.has(p.category))) continue;
    if (state.countries.size > 0) {
      const country = (p.statesNames ?? [])[0];
      if (!country || !state.countries.has(country)) continue;
    }
    // Continent — derived from the pin's country via Natural Earth.
    // Pins whose country can't be resolved are excluded when the filter
    // is active (rather than guessed at), matching the conservative
    // policy used by the country and category facets above.
    if (state.continents.size > 0) {
      const country = (p.statesNames ?? [])[0];
      const continent = continentOfCountry(country);
      if (!continent || !state.continents.has(continent)) continue;
    }
    // List multi-select — pin must be on every selected list (AND).
    // Switch to .some(...) for OR semantics if the chip count gets noisy.
    if (state.lists.size > 0) {
      const pinLists = p.lists ?? [];
      let hasAll = true;
      for (const l of state.lists) {
        if (!pinLists.includes(l)) { hasAll = false; break; }
      }
      if (!hasAll) continue;
    }
    // Tag multi-select — OR semantics (any of the selected tags). Tags
    // are noisier and more granular than lists, so OR keeps the cockpit
    // useful when the user clicks a few related types like
    // "archaeological site" + "old town".
    if (state.tags.size > 0) {
      const pinTags = p.tags ?? [];
      let any = false;
      for (const t of state.tags) {
        if (pinTags.includes(t)) { any = true; break; }
      }
      if (!any) continue;
    }
    // Inception year range — inclusive, both ends optional.
    if (state.inceptionMin != null) {
      if (p.inceptionYear == null || p.inceptionYear < state.inceptionMin) continue;
    }
    if (state.inceptionMax != null) {
      if (p.inceptionYear == null || p.inceptionYear > state.inceptionMax) continue;
    }
    out.push(p);
  }
  return out;
}

export function sortPins<T extends PinFilterable>(pins: T[], state: PinFilterState): T[] {
  const out = [...pins];
  out.sort((a, b) => {
    // Personal-investment tier always leads the sort. The user's
    // explicit picks (name, recent) become a within-tier tiebreaker.
    // This means the default landing on /pins/cards leads with pins
    // Mike has reviewed and photographed, then reviews-only, then
    // photos-only, then visited, then everything else. The existing
    // `desc` toggle still flips the secondary order; the tier order
    // itself is fixed (it never makes sense to push neglected pins
    // to the top).
    const tierA = pinPersonalTier(a);
    const tierB = pinPersonalTier(b);
    if (tierA !== tierB) return tierA - tierB;

    let cmp = 0;
    if (state.sort === 'name') {
      cmp = a.name.localeCompare(b.name);
    } else {
      // 'recent' — by updated_at (auto-bumped on every edit + has a NOT NULL
      // default of now()), with airtable_modified_at as a final fallback.
      const A = a.updatedAt ?? a.airtableModifiedAt ?? '';
      const B = b.updatedAt ?? b.airtableModifiedAt ?? '';
      if (!A && !B) cmp = 0;
      else if (!A) cmp = 1;
      else if (!B) cmp = -1;
      else cmp = A < B ? -1 : A > B ? 1 : 0;
    }
    return state.desc ? -cmp : cmp;
  });
  return out;
}
