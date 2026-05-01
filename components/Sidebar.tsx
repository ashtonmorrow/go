// Server Component sidebar — fetches city + country counts from Notion
// (cached via React.cache() in lib/notion so no extra API calls beyond what
// the page already does) and hands them to the interactive client shell.
import { fetchAllCities, fetchAllCountries } from '@/lib/notion';
import { fetchAllPins } from '@/lib/pins';
import { CANONICAL_LISTS } from '@/lib/pinLists';
import { getAllArticleEntries } from '@/lib/articles';
import SidebarShell from './SidebarShell';

export default async function Sidebar() {
  // Pins fetch piggybacks on React.cache() so /pins (which also calls
  // fetchAllPins) doesn't double-hit Supabase. Same with cities/countries.
  // Article entries (hand-coded + file-based posts) are read here so the
  // client SidebarShell stays a pure presentation component.
  const [cities, countries, pins, articleEntries] = await Promise.all([
    fetchAllCities(),
    fetchAllCountries(),
    fetchAllPins(),
    getAllArticleEntries(),
  ]);

  const counts = {
    cities: cities.length,
    countries: countries.length,
    been: cities.filter(c => c.been).length,
    go: cities.filter(c => c.go).length,
    saved: cities.filter(c => !!c.myGooglePlaces).length,
    pins: pins.length,
  };

  // Country options for the city filter — derived from cities' own data
  // so we never offer a country with no cities to filter to.
  const countryOptions = Array.from(
    new Set(cities.map(c => c.country).filter((s): s is string => !!s))
  ).sort((a, b) => a.localeCompare(b));

  // (WorldMapPicker no longer needs iso3->continent threaded through —
  // the baked Natural Earth GeoJSON ships with continent on each feature.)

  // Pin-side filter options — derived from the pin set itself rather than
  // the global country list, for the same reason as above. Categories are
  // also unique-and-sorted so the chip group is stable.
  const pinCountryOptions = Array.from(
    new Set(
      pins
        .map(p => p.statesNames[0])
        .filter((s): s is string => !!s)
    )
  ).sort((a, b) => a.localeCompare(b));

  const pinCategoryOptions = Array.from(
    new Set(pins.map(p => p.category).filter((s): s is string => !!s))
  ).sort((a, b) => a.localeCompare(b));

  // Lists — derived from the curated CANONICAL_LISTS source of truth in
  // lib/pinLists.ts. Order matches the canonical declaration (UNESCO →
  // Atlas Obscura → wonders → niche). Only lists that actually appear
  // on at least one pin are surfaced as filter options.
  const seenLists = new Set<string>();
  for (const p of pins) for (const l of p.lists) seenLists.add(l);
  const pinListOptions = (CANONICAL_LISTS as readonly string[]).filter(l => seenLists.has(l));

  // Tags — Wikidata "instance of" labels. Hide singletons (only one pin
  // has them) since they don't help anyone narrow down.
  const tagCounts = new Map<string, number>();
  for (const p of pins) for (const t of p.tags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
  const pinTagOptions = Array.from(tagCounts.entries())
    .filter(([, n]) => n > 1)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([t]) => t);

  // Saved lists — Mike's personal Google Maps collections (Madrid, Bangkok,
  // Coffee Shops, etc), populated by the Takeout import. Sorted by member
  // count desc so the lists with the most pins surface first; lists with
  // only 1 pin are kept (filtering them out would hide a real list with a
  // single match). Cap at 50 in the cockpit so the chip group doesn't
  // wallpaper the rail — the rare long tail can still be filter-targeted
  // by passing the value through search later.
  const savedListCounts = new Map<string, number>();
  for (const p of pins) for (const l of p.savedLists) {
    savedListCounts.set(l, (savedListCounts.get(l) ?? 0) + 1);
  }
  const pinSavedListOptions = Array.from(savedListCounts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 50)
    .map(([name]) => name);

  return (
    <SidebarShell
      counts={counts}
      countryOptions={countryOptions}
      pinCountryOptions={pinCountryOptions}
      pinCategoryOptions={pinCategoryOptions}
      pinListOptions={pinListOptions}
      pinTagOptions={pinTagOptions}
      pinSavedListOptions={pinSavedListOptions}
      articleEntries={articleEntries}
    />
  );
}
