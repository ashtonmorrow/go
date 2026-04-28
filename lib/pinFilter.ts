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

export type PinFilterable = {
  name: string;
  description?: string | null;
  cityNames?: string[];
  statesNames?: string[];
  category?: string | null;
  visited: boolean;
  unescoId?: number | null;
  /** Wikidata-derived: notable lists membership (UNESCO, Atlas Obscura, etc.) */
  lists?: string[];
  /** Wikidata-derived: type-of labels (archaeological site, national park, etc.) */
  tags?: string[];
  /** Year established. Negative = BCE. */
  inceptionYear?: number | null;
  /** Numeric price; 0 means free, null means unknown. */
  priceAmount?: number | null;
  /** Free-text price string from the source ("Free", "$15 adult", "Donation"). */
  priceText?: string | null;
  airtableModifiedAt?: string | null;
  updatedAt?: string | null;
};

// Words/phrases in the priceText field that imply free admission. Used
// alongside `priceAmount === 0` to identify the free-entry subset. The
// regex is permissive but anchored on word boundaries so "freezing" (in
// a description) wouldn't match here — and we only run it on priceText.
const FREE_PRICE_TEXT = /\b(free|no charge|no admission|no entry fee|complimentary|gratis|gratuit)\b/i;

function isFreeAdmission(p: PinFilterable): boolean {
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
    if (state.categories.size > 0 && (!p.category || !state.categories.has(p.category))) continue;
    if (state.countries.size > 0) {
      const country = (p.statesNames ?? [])[0];
      if (!country || !state.countries.has(country)) continue;
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
    let cmp = 0;
    if (state.sort === 'name') {
      cmp = a.name.localeCompare(b.name);
    } else {
      // 'recent' — by airtable_modified_at, fall back to updated_at;
      // missing values sort last regardless of direction.
      const A = a.airtableModifiedAt ?? a.updatedAt ?? '';
      const B = b.airtableModifiedAt ?? b.updatedAt ?? '';
      if (!A && !B) cmp = 0;
      else if (!A) cmp = 1;
      else if (!B) cmp = -1;
      else cmp = A < B ? -1 : A > B ? 1 : 0;
    }
    return state.desc ? -cmp : cmp;
  });
  return out;
}
