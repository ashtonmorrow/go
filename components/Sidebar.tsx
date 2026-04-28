// Server Component sidebar — fetches city + country counts from Notion
// (cached via React.cache() in lib/notion so no extra API calls beyond what
// the page already does) and hands them to the interactive client shell.
import { fetchAllCities, fetchAllCountries } from '@/lib/notion';
import { fetchAllPins } from '@/lib/pins';
import SidebarShell from './SidebarShell';

export default async function Sidebar() {
  // Pins fetch piggybacks on React.cache() so /pins (which also calls
  // fetchAllPins) doesn't double-hit Supabase. Same with cities/countries.
  const [cities, countries, pins] = await Promise.all([
    fetchAllCities(),
    fetchAllCountries(),
    fetchAllPins(),
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

  // Lists — bubble curated lists (UNESCO, Atlas Obscura, wonders) in a
  // friendly order rather than alphabetical. Anything else falls in
  // alphabetically afterwards.
  const PRIMARY_LIST_ORDER = [
    'UNESCO World Heritage',
    'Atlas Obscura',
    'New 7 Wonders',
    '7 Natural Wonders',
    '7 Ancient Wonders',
  ];
  const seenLists = new Set<string>();
  for (const p of pins) for (const l of p.lists) seenLists.add(l);
  const pinListOptions = [
    ...PRIMARY_LIST_ORDER.filter(l => seenLists.has(l)),
    ...Array.from(seenLists)
      .filter(l => !PRIMARY_LIST_ORDER.includes(l))
      .sort((a, b) => a.localeCompare(b)),
  ];

  // Tags — Wikidata "instance of" labels. Hide singletons (only one pin
  // has them) since they don't help anyone narrow down.
  const tagCounts = new Map<string, number>();
  for (const p of pins) for (const t of p.tags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
  const pinTagOptions = Array.from(tagCounts.entries())
    .filter(([, n]) => n > 1)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([t]) => t);

  return (
    <SidebarShell
      counts={counts}
      countryOptions={countryOptions}
      pinCountryOptions={pinCountryOptions}
      pinCategoryOptions={pinCategoryOptions}
      pinListOptions={pinListOptions}
      pinTagOptions={pinTagOptions}
    />
  );
}
