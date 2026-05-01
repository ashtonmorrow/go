// === Shared city filter + layer + sort logic ===============================
// Three concerns now cleanly separated (see CityFiltersContext for the
// design rationale):
//
//   1. filterCities — applies NARROWING facets only (search, country,
//      continent, climate, visa, tap water, drive, population). Status
//      (Been/Go/Saved) is NOT a filter axis here.
//   2. cityLayer    — assigns a layer label to a city based on its status.
//      Priority: Been > Go > Saved > Other. One layer per city.
//   3. applyLayerVisibility — drops cities whose layer is currently hidden
//      via the showX flags in FilterState. Composes after filterCities.
//
// Standard pipeline used by every consumer:
//
//     const matched   = filterCities(cities, state);
//     const visible   = applyLayerVisibility(matched, state);
//     const sorted    = sortCities(visible, state);
//
// Generic over T so callers can shape data however they want as long as
// the structural fields each function needs are present.
import type { FilterState as CityFilterState, KoppenGroup, CityLayer } from '@/components/CityFiltersContext';

export type CityFilterable = {
  name: string;
  country?: string | null;
  continent?: string | null;
  koppen?: string | null;
  currency?: string | null;
  language?: string | null;
  founded?: string | null;
  visa?: string | null;
  tapWater?: string | null;
  driveSide?: 'L' | 'R' | null;
  been: boolean;
  go: boolean;
  savedPlaces?: string | null;
  /** A photo I personally took (uploaded via /admin/upload). Tier 2 in the
   *  curated sort. Optional because some callers don't carry it. */
  personalPhoto?: string | null;
  /** AI-generated, Codex-supplied, or Wikimedia-Commons-sourced image.
   *  Tier 3 in the curated sort. Optional + nullable. */
  heroImage?: string | null;
  population?: number | null;
  elevation?: number | null;
  avgHigh?: number | null;
  avgLow?: number | null;
  rainfall?: number | null;
};

/**
 * Assign one status to a city. Three buckets, mutually exclusive:
 * Visited > Planning > Researching. Maps from the Notion source columns
 * `been` (true → visited) and `go` (true → planning). Anything that's
 * neither is "researching" — in the atlas but no commitment yet.
 *
 * Saved-places is intentionally NOT in this priority chain — a visited
 * city can also have saved places, and a priority chain that put Saved
 * before Researching would erase the Saved-and-Visited signal silently.
 * Saved is its own facet (filterCities applies it) plus a map overlay
 * (WorldGlobe draws an accent ring around saved-places dots regardless
 * of which status they're in).
 *
 * Mike's atlas convention: been and go are mutually exclusive in the
 * source data — you don't "want to go" somewhere you've already been.
 * The priority hardens that invariant against any future data drift.
 */
export function cityLayer(c: CityFilterable): CityLayer {
  if (c.been) return 'visited';
  if (c.go) return 'planning';
  return 'researching';
}

/**
 * Apply NARROWING facets only — search, geography, practicality, population.
 * Layer visibility is intentionally out of scope; chain into
 * applyLayerVisibility next if you want the visible set.
 */
export function filterCities<T extends CityFilterable>(cities: T[], state: CityFilterState): T[] {
  const {
    q,
    countries, continents, koppenGroups,
    visa, tapWater, drive,
  } = state;

  let list = cities;

  if (q.trim()) {
    const needle = q.trim().toLowerCase();
    list = list.filter(c => {
      const driveText = c.driveSide === 'L' ? 'left' : c.driveSide === 'R' ? 'right' : '';
      const haystack = [
        c.name, c.country, c.continent, c.koppen,
        c.currency, c.language, c.founded,
        c.visa, c.tapWater, driveText,
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(needle);
    });
  }

  if (countries.size > 0) {
    list = list.filter(c => c.country && countries.has(c.country));
  }
  if (continents.size > 0) {
    list = list.filter(c => c.continent && continents.has(c.continent as never));
  }
  if (koppenGroups.size > 0) {
    list = list.filter(c => {
      const g = c.koppen?.[0]?.toUpperCase();
      return g && koppenGroups.has(g as KoppenGroup);
    });
  }
  if (visa.size > 0) {
    list = list.filter(c => c.visa && visa.has(c.visa as never));
  }
  if (tapWater.size > 0) {
    list = list.filter(c => c.tapWater && tapWater.has(c.tapWater as never));
  }
  if (drive.size > 0) {
    list = list.filter(c => c.driveSide && drive.has(c.driveSide as never));
  }

  // Population range — inclusive, both ends optional. Cities without a
  // population value are filtered out when EITHER bound is set, since
  // the user is asking for cities of a specific size.
  const { populationMin, populationMax } = state;
  if (populationMin != null || populationMax != null) {
    list = list.filter(c => {
      if (c.population == null) return false;
      if (populationMin != null && c.population < populationMin) return false;
      if (populationMax != null && c.population > populationMax) return false;
      return true;
    });
  }

  // Saved-places tri-state. 'any' = unfiltered; 'with' / 'without' apply.
  // Truthy savedPlaces means there's a curated annotation (a Google Maps
  // list URL, in practice).
  const { hasSavedPlaces } = state;
  if (hasSavedPlaces === 'with') {
    list = list.filter(c => !!c.savedPlaces);
  } else if (hasSavedPlaces === 'without') {
    list = list.filter(c => !c.savedPlaces);
  }

  // Status focus — single-select narrowing replacing the old
  // showBeen/showGo/showOther multi-toggle layers.
  const { statusFocus } = state;
  if (statusFocus !== null) {
    list = list.filter(c => cityLayer(c) === statusFocus);
  }

  return list;
}

/**
 * Legacy helper kept as a no-op so any straggler consumer doesn't break
 * during the migration. Status filtering now happens inside filterCities
 * via state.statusFocus.
 */
export function applyLayerVisibility<T extends CityFilterable>(
  cities: T[],
  _state: CityFilterState,
): T[] {
  return cities;
}

/** Curated tier: 0 = has a Google saved-places URL, 1 = has a personal
 *  photo, 2 = has a hero image (Codex / AI / Wikimedia), 3 = nothing.
 *  Lower tier = higher priority. Within a tier, the standard sort
 *  comparator (alphabetical by name) takes over for stable ordering. */
function curatedTier<T extends CityFilterable>(c: T): number {
  if (c.savedPlaces) return 0;
  if (c.personalPhoto) return 1;
  if (c.heroImage) return 2;
  return 3;
}

export function sortCities<T extends CityFilterable>(cities: T[], state: CityFilterState): T[] {
  const { sort, desc } = state;

  // 'curated' is special: tier-based primary sort, alphabetical secondary.
  // The desc flag is ignored — flipping curatedness backward (least-curated
  // first) isn't a useful view.
  if (sort === 'curated') {
    return [...cities].sort((a, b) => {
      const ta = curatedTier(a);
      const tb = curatedTier(b);
      if (ta !== tb) return ta - tb;
      const an = (a.name ?? '').toLowerCase();
      const bn = (b.name ?? '').toLowerCase();
      return an < bn ? -1 : an > bn ? 1 : 0;
    });
  }

  const get = (c: T): unknown => {
    if (sort === 'name') return c.name?.toLowerCase() ?? '';
    if (sort === 'founded') {
      const m = (c.founded || '').match(/\d+/);
      const n = m ? parseInt(m[0], 10) : null;
      return c.founded?.includes('BC') && n ? -n : n;
    }
    return (c as unknown as Record<string, unknown>)[sort];
  };
  return [...cities].sort((a, b) => {
    const av = get(a) as number | string | null | undefined;
    const bv = get(b) as number | string | null | undefined;
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (av < bv) return desc ? 1 : -1;
    if (av > bv) return desc ? -1 : 1;
    return 0;
  });
}

/**
 * Count cities in each layer within the given (already-filtered) set.
 * Used by FilterPanel to show "Been (47) · Go (12) · Saved (3) · Other (188)"
 * counts on the layer toggles, so the user sees how many records each
 * layer would reveal. Counts are computed over the FILTERED set, not the
 * full atlas — they should reflect "how much will this toggle add to my
 * current view" rather than the global tally.
 */
export function layerCounts<T extends CityFilterable>(filtered: T[]): Record<CityLayer, number> {
  const counts: Record<CityLayer, number> = { visited: 0, planning: 0, researching: 0 };
  for (const c of filtered) counts[cityLayer(c)]++;
  return counts;
}
