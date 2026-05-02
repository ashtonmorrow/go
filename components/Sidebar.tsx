// Server Component sidebar — fetches city + country counts from Notion
// (cached via React.cache() in lib/notion so no extra API calls beyond what
// the page already does) and hands them to the interactive client shell.
//
// Performance contract: this runs on every page render across the entire
// site, including chrome-less surfaces (about, privacy, articles, posts,
// admin). Without route-aware fetching we'd pay for the full 5k-pin /
// 1.5k-city / 250-country corpus on every hit just to render the sidebar
// chrome. We read x-pathname (set by middleware) to decide which fetches
// the current route actually needs, and skip the heavy ones otherwise.

import { headers } from 'next/headers';
import { fetchAllCities, fetchAllCountries } from '@/lib/notion';
import { fetchAllPins } from '@/lib/pins';
import { CANONICAL_LISTS } from '@/lib/pinLists';
import { getAllArticleEntries } from '@/lib/articles';
import SidebarShell from './SidebarShell';

/** Routes that need the full pin corpus to derive sidebar filter options
 *  (country / category / list / tag / saved-list chips). Everything else
 *  gets a stub — the sidebar still renders, just without those chips. */
function needsPinCorpus(pathname: string): boolean {
  return pathname === '/pins' || pathname.startsWith('/pins/');
}

/** Routes that need the city corpus for the city-filter cockpit OR for
 *  the read-only Collections counts in the bottom block. The Collections
 *  counts only show on routes that don't otherwise mount a cockpit, so
 *  the cheap fetch is fine. */
function needsCityCorpus(pathname: string): boolean {
  return (
    pathname === '/' ||
    pathname === '/cities' ||
    pathname.startsWith('/cities/') ||
    pathname === '/world' ||
    pathname === '/map'
  );
}

function needsCountryCorpus(pathname: string): boolean {
  return (
    pathname === '/' ||
    pathname === '/countries' ||
    pathname.startsWith('/countries/') ||
    pathname === '/world'
  );
}

/** Routes where the Collections bottom-block (the always-visible
 *  Cities/Countries/Pins/Been/Go/Saved counter list) renders. When we're
 *  on a route with a real cockpit (city/country/pin filters), the bottom
 *  block is suppressed in SidebarShell, so we can skip those fetches. */
function needsCollectionsBlock(pathname: string): boolean {
  // Suppressed when on any of the three filter-cockpit routes — see
  // showCityFilters / showPinFilters / showCountryFilters in SidebarShell.
  // Mirrors the visibility logic there to keep server + client aligned.
  if (pathname.startsWith('/cities/cards')) return false;
  if (pathname.startsWith('/cities/map')) return false;
  if (pathname.startsWith('/cities/table')) return false;
  if (pathname.startsWith('/cities/stats')) return false;
  if (pathname.startsWith('/countries/cards')) return false;
  if (pathname.startsWith('/countries/map')) return false;
  if (pathname.startsWith('/countries/table')) return false;
  if (pathname.startsWith('/countries/stats')) return false;
  if (pathname.startsWith('/pins')) return false;
  return true;
}

const ZERO_COUNTS = {
  cities: 0, countries: 0, been: 0, go: 0, saved: 0, pins: 0,
};

export default async function Sidebar() {
  // Pathname is stamped by middleware.ts on every non-static request. If
  // it's missing (local dev edge cases, prerender phase), we conservatively
  // fall back to "fetch everything" so nothing is silently broken.
  const h = await headers();
  const pathname = h.get('x-pathname') ?? '/';

  const wantsPins = needsPinCorpus(pathname);
  const wantsCities = needsCityCorpus(pathname);
  const wantsCountries = needsCountryCorpus(pathname);
  const wantsCounts = needsCollectionsBlock(pathname);

  // Only fetch what the current route actually consumes. Each fetcher is
  // already module-cached, so when we DO need the data and another part
  // of the page already pulled it, this is free.
  const [cities, countries, pins, articleEntries] = await Promise.all([
    wantsCities || wantsCounts ? fetchAllCities() : Promise.resolve([]),
    wantsCountries || wantsCounts ? fetchAllCountries() : Promise.resolve([]),
    wantsPins || wantsCounts ? fetchAllPins() : Promise.resolve([]),
    getAllArticleEntries(),
  ]);

  // Counts only get computed when the bottom-block is going to render.
  // Skipping the .filter() walks shaves milliseconds on hot paths.
  const counts = wantsCounts
    ? {
        cities: cities.length,
        countries: countries.length,
        been: cities.filter(c => c.been).length,
        go: cities.filter(c => c.go).length,
        saved: cities.filter(c => !!c.myGooglePlaces).length,
        pins: pins.length,
      }
    : ZERO_COUNTS;

  // City-side filter options — only meaningful on a city cockpit page.
  const countryOptions = wantsCities
    ? Array.from(
        new Set(cities.map(c => c.country).filter((s): s is string => !!s)),
      ).sort((a, b) => a.localeCompare(b))
    : [];

  // Pin-side filter options — only meaningful on a pin cockpit page.
  // Skipping these saves 5 passes over the 5k-pin array on non-pin routes.
  let pinCountryOptions: string[] = [];
  let pinCategoryOptions: string[] = [];
  let pinListOptions: string[] = [];
  let pinTagOptions: string[] = [];
  let pinSavedListOptions: string[] = [];

  if (wantsPins) {
    pinCountryOptions = Array.from(
      new Set(pins.map(p => p.statesNames[0]).filter((s): s is string => !!s)),
    ).sort((a, b) => a.localeCompare(b));

    pinCategoryOptions = Array.from(
      new Set(pins.map(p => p.category).filter((s): s is string => !!s)),
    ).sort((a, b) => a.localeCompare(b));

    const seenLists = new Set<string>();
    for (const p of pins) for (const l of p.lists) seenLists.add(l);
    pinListOptions = (CANONICAL_LISTS as readonly string[]).filter(l => seenLists.has(l));

    const tagCounts = new Map<string, number>();
    for (const p of pins) for (const t of p.tags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
    pinTagOptions = Array.from(tagCounts.entries())
      .filter(([, n]) => n > 1)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([t]) => t);

    const savedListCounts = new Map<string, number>();
    for (const p of pins) for (const l of p.savedLists) {
      savedListCounts.set(l, (savedListCounts.get(l) ?? 0) + 1);
    }
    pinSavedListOptions = Array.from(savedListCounts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 50)
      .map(([name]) => name);
  }

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
