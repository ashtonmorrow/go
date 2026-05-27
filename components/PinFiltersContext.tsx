'use client';

import { makeFiltersContext, toggleSet } from '@/lib/filtersContext';
import type { Continent } from './CityFiltersContext';

// === Pin filter state ======================================================
// Mirrors the shape of CityFiltersContext but with pin-relevant dimensions.
// Reasons for a second context (rather than one shared filter store):
//   * Different sort keys (no population / founded / avgHigh on a pin)
//   * Different boolean toggles (Visited rather than Been/Go/Saved trio)
//   * Different multi-selects (category + UNESCO; no Köppen, voltage, etc.)
//
// Provider boilerplate lives in lib/filtersContext.tsx — this file just
// declares the domain-specific state shape and the active-filter counter.

export type PinSortKey = 'name' | 'recent';

export type PinFilterState = {
  q: string;
  visitedFilter: 'all' | 'visited' | 'not-visited';
  unescoOnly: boolean;
  freeOnly: boolean;
  /** Pin must have food on site (any non-'none' food_on_site value). */
  foodOnSiteOnly: boolean;
  /** Pin must be wheelchair-accessible ('fully' or 'partially'). */
  wheelchairOnly: boolean;
  /** Pin must be flagged kid_friendly = true. */
  kidFriendlyOnly: boolean;
  /** Pin must carry a personal_review (Mike actually wrote about it).
   *  Distinct from `visitedFilter='visited'`: visited = "I've been", reviewed
   *  = "I've been AND wrote a review you can read". The pins matrix has both
   *  because Mike has 1,400+ visited places but only ~600 reviews. */
  reviewedOnly: boolean;
  /** "Mike's List" — pin appears in at least one of Mike's personal
   *  saved-list collections (saved_lists is non-empty). The shortcut
   *  for "anything Mike has actively curated into a list," rather than
   *  letting the user pick a specific list from the My Lists section.
   *  Future: also include pins referenced by content/posts/*.md when
   *  posts grow a pin-link frontmatter field. */
  mikesListOnly: boolean;
  categories: Set<string>;
  countries: Set<string>;
  continents: Set<Continent>;
  lists: Set<string>;
  tags: Set<string>;
  /** Pin's bring[] must include every selected token (AND). */
  bring: Set<string>;
  /** Pin's saved_lists[] must include at least one selected list (OR).
   *  Saved lists are Mike's personal Google Maps collections (Madrid,
   *  Bangkok, Coffee Shops, etc) — distinct from the canonical UNESCO /
   *  Atlas Obscura lists already covered by `lists`. */
  savedLists: Set<string>;
  inceptionMin: number | null;
  inceptionMax: number | null;
  sort: PinSortKey;
  desc: boolean;
};

// Curated landing — pins is mostly a personal "places I've been" list, so the
// default narrows to visited. Reset() returns to NEUTRAL_STATE for a real
// escape hatch (visitedFilter='all') so the user can break out of the
// curation lens with one click.
const DEFAULT_STATE: PinFilterState = {
  q: '',
  visitedFilter: 'visited',
  unescoOnly: false,
  freeOnly: false,
  foodOnSiteOnly: false,
  wheelchairOnly: false,
  kidFriendlyOnly: false,
  reviewedOnly: false,
  mikesListOnly: false,
  categories: new Set(),
  countries: new Set(),
  continents: new Set(),
  lists: new Set(),
  tags: new Set(),
  bring: new Set(),
  savedLists: new Set(),
  inceptionMin: null,
  inceptionMax: null,
  sort: 'recent',
  desc: true,
};

const { Provider, useFilters } = makeFiltersContext<PinFilterState>({
  defaultState: DEFAULT_STATE,
  countActive: state => {
    let n = 0;
    if (state.visitedFilter !== DEFAULT_STATE.visitedFilter) n++;
    if (state.unescoOnly !== DEFAULT_STATE.unescoOnly) n++;
    if (state.freeOnly !== DEFAULT_STATE.freeOnly) n++;
    if (state.foodOnSiteOnly !== DEFAULT_STATE.foodOnSiteOnly) n++;
    if (state.wheelchairOnly !== DEFAULT_STATE.wheelchairOnly) n++;
    if (state.kidFriendlyOnly !== DEFAULT_STATE.kidFriendlyOnly) n++;
    if (state.reviewedOnly !== DEFAULT_STATE.reviewedOnly) n++;
    if (state.mikesListOnly !== DEFAULT_STATE.mikesListOnly) n++;
    n += state.categories.size > 0 ? 1 : 0;
    n += state.countries.size > 0 ? 1 : 0;
    n += state.continents.size > 0 ? 1 : 0;
    n += state.lists.size > 0 ? 1 : 0;
    n += state.tags.size > 0 ? 1 : 0;
    n += state.bring.size > 0 ? 1 : 0;
    n += state.savedLists.size > 0 ? 1 : 0;
    if (state.inceptionMin != null || state.inceptionMax != null) n++;
    return n;
  },
  // Reset clears EVERYTHING including the curated visited='visited'
  // default so the user has a true "show me all 1300+ pins" escape hatch.
  resetState: () => ({ ...DEFAULT_STATE, visitedFilter: 'all' }),
});

export const PinFiltersProvider = Provider;
export const usePinFilters = useFilters;
export const togglePinSet = toggleSet;
