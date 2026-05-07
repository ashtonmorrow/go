// Server Component sidebar — fetches the full city / country / pin corpora
// once, derives the chip option lists, and hands them to the interactive
// client shell. SidebarShell decides what to render based on usePathname,
// so this server component stays route-agnostic.
//
// Performance contract: this runs on every page render across the entire
// site. The three corpus fetches (fetchAllCities, fetchAllCountries,
// fetchAllPins) are all unstable_cache'd at the lib/ layer, so the cost
// after the first warm hit is one cache lookup per route render. Chip
// arrays passed to the client are small — deduped country/category/tag
// strings, not the underlying 5k-pin payload. Previously this component
// read x-pathname via headers() to skip fetches on chrome-less routes;
// that made the entire layout force-dynamic and broke ISR for every
// route on the site. The current always-fetch model trades a few
// milliseconds of per-request iteration for a static layout cache.

import { fetchAllCities, fetchAllCountries } from '@/lib/notion';
import { fetchAllPins } from '@/lib/pins';
import { fetchAllSavedListsMeta } from '@/lib/savedLists';
import { CANONICAL_LISTS } from '@/lib/pinLists';
import { getAllArticleEntries } from '@/lib/articles';
import SidebarShell from './SidebarShell';

const ZERO_COUNTS = {
  cities: 0, countries: 0, been: 0, go: 0, saved: 0, pins: 0, lists: 0,
};

export default async function Sidebar() {
  // Sidebar is rendered from the root layout. If THIS server component
  // throws, the App Router's per-route error.tsx can't catch it (those
  // run at the route segment level, below the layout). The whole tree
  // tips into the pages-router default 500.html — exactly the symptom
  // we've been seeing on /pins/[slug] and /cities/[slug]. So every
  // network call below is wrapped in its own try/catch, and the whole
  // body sits behind a SafeSidebar wrapper that returns a stub on any
  // unexpected throw rather than tearing down the page.
  return <SafeSidebar />;
}

async function SafeSidebar() {
  try {
    return await SidebarBody();
  } catch (err) {
    console.error('[Sidebar] failed:', err);
    // Stub render — same shell with empty data. Keeps the layout
    // navigable instead of 500-ing the page.
    return (
      <SidebarShell
        counts={ZERO_COUNTS}
        countryOptions={[]}
        pinCountryOptions={[]}
        pinCategoryOptions={[]}
        pinListOptions={[]}
        pinTagOptions={[]}
        pinSavedListOptions={[]}
        articleEntries={[]}
      />
    );
  }
}

async function SidebarBody() {
  // Always fetch the full corpora. Each call is unstable_cache'd in lib/
  // (24h TTL) so the warm-cache cost is a single in-memory lookup. We
  // used to skip these on non-cockpit routes via x-pathname/headers(),
  // but that read was the only thing forcing the whole layout dynamic.
  const [cities, countries, pins, articleEntries, listsMeta] = await Promise.all([
    fetchAllCities().catch(err => {
      console.error('[Sidebar] fetchAllCities failed:', err);
      return [];
    }),
    fetchAllCountries().catch(err => {
      console.error('[Sidebar] fetchAllCountries failed:', err);
      return [];
    }),
    fetchAllPins().catch(err => {
      console.error('[Sidebar] fetchAllPins failed:', err);
      return [];
    }),
    getAllArticleEntries().catch(err => {
      console.error('[Sidebar] getAllArticleEntries failed:', err);
      return [];
    }),
    fetchAllSavedListsMeta().catch(err => {
      console.error('[Sidebar] fetchAllSavedListsMeta failed:', err);
      return new Map();
    }),
  ]);

  const counts = {
    cities: cities.length,
    countries: countries.length,
    been: cities.filter(c => c.been).length,
    go: cities.filter(c => c.go).length,
    saved: cities.filter(c => !!c.myGooglePlaces).length,
    pins: pins.length,
    lists: listsMeta.size,
  };

  // City-side filter options for the cockpit panel.
  const countryOptions = Array.from(
    new Set(cities.map(c => c.country).filter((s): s is string => !!s)),
  ).sort((a, b) => a.localeCompare(b));

  // Pin-side filter options. Each pass is a single O(n) walk over the
  // pin array, fast enough that doing it on every render is fine.
  const pinCountryOptions = Array.from(
    new Set(pins.map(p => p.statesNames[0]).filter((s): s is string => !!s)),
  ).sort((a, b) => a.localeCompare(b));

  const pinCategoryOptions = Array.from(
    new Set(pins.map(p => p.category).filter((s): s is string => !!s)),
  ).sort((a, b) => a.localeCompare(b));

  const seenLists = new Set<string>();
  for (const p of pins) for (const l of p.lists) seenLists.add(l);
  const pinListOptions = (CANONICAL_LISTS as readonly string[]).filter(l => seenLists.has(l));

  const tagCounts = new Map<string, number>();
  for (const p of pins) for (const t of p.tags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
  const pinTagOptions = Array.from(tagCounts.entries())
    .filter(([, n]) => n > 1)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([t]) => t);

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
