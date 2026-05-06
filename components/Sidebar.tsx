// Server Component sidebar — fetches only the data the current route needs
// and hands it to the interactive client shell.
//
// Performance contract: this runs on every page render across the entire
// site, including chrome-less surfaces (about, privacy, articles, posts,
// admin). Without route-aware fetching we'd pay for the full 5k-pin /
// 1.5k-city / 250-country corpus on every hit just to render the sidebar
// chrome. We read x-pathname (set by middleware) to decide which fetches
// the current route actually needs, and skip the heavy ones otherwise.

import { headers } from 'next/headers';
import { unstable_cache } from 'next/cache';
import { fetchAllCities, fetchAllCountries, TABLE_CITIES, TABLE_COUNTRIES } from '@/lib/notion';
import { fetchAllPins } from '@/lib/pins';
import { fetchAllSavedListsMeta } from '@/lib/savedLists';
import { CANONICAL_LISTS } from '@/lib/pinLists';
import { getAllArticleEntries } from '@/lib/articles';
import { supabase } from '@/lib/supabase';
import SidebarShell from './SidebarShell';

/** Routes that need the full pin corpus to derive sidebar filter options
 *  (country / category / list / tag / saved-list chips). Only the four
 *  pin-cockpit routes show the chips, so detail pages (/pins/[slug]) and
 *  curated views (/pins/views/[view]) don't pay for the 5k-pin fetch.
 *  Skipping it here was the difference between detail pages 500-ing on
 *  Vercel (the corpus size + the per-page heavy fetches stacked over the
 *  function timeout) and rendering. Everything else gets a stub — the
 *  sidebar still renders, just without filter chips. */
function needsPinCorpus(pathname: string): boolean {
  return (
    pathname === '/pins' ||
    pathname === '/pins/cards' ||
    pathname === '/pins/map' ||
    pathname === '/pins/table' ||
    pathname === '/pins/stats'
  );
}

/** Routes that need the city corpus for the city-filter cockpit.
 *  Detail pages only need the read-only Collections counts, which come
 *  from lightweight count queries instead of the full city table. */
function needsCityCorpus(pathname: string): boolean {
  return (
    pathname === '/cities/cards' ||
    pathname === '/cities/map' ||
    pathname === '/cities/table' ||
    pathname === '/cities/stats' ||
    pathname === '/countries/map'
  );
}

function needsCountryCorpus(pathname: string): boolean {
  return (
    pathname === '/countries/cards' ||
    pathname === '/countries/table' ||
    pathname === '/countries/stats'
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
  if (pathname === '/cities/cards') return false;
  if (pathname === '/cities/map') return false;
  if (pathname === '/cities/table') return false;
  if (pathname === '/cities/stats') return false;
  if (pathname === '/countries/cards') return false;
  if (pathname === '/countries/map') return false;
  if (pathname === '/countries/table') return false;
  if (pathname === '/countries/stats') return false;
  if (pathname === '/pins/cards') return false;
  if (pathname === '/pins/map') return false;
  if (pathname === '/pins/table') return false;
  if (pathname === '/pins/stats') return false;
  return true;
}

const ZERO_COUNTS = {
  cities: 0, countries: 0, been: 0, go: 0, saved: 0, pins: 0, lists: 0,
};

const fetchSidebarCounts = unstable_cache(
  async () => {
    const [cities, countries, been, go, saved, pins] = await Promise.all([
      supabase.from(TABLE_CITIES).select('id', { count: 'exact', head: true }),
      supabase.from(TABLE_COUNTRIES).select('id', { count: 'exact', head: true }),
      supabase.from(TABLE_CITIES).select('id', { count: 'exact', head: true }).eq('been', true),
      supabase.from(TABLE_CITIES).select('id', { count: 'exact', head: true }).eq('go', true),
      supabase
        .from(TABLE_CITIES)
        .select('id', { count: 'exact', head: true })
        .gt('my_google_places', ''),
      supabase.from('pins').select('id', { count: 'exact', head: true }),
    ]);

    const countOrZero = (
      label: string,
      result: { count: number | null; error: unknown },
    ) => {
      if (result.error) {
        console.error(`[Sidebar] ${label} count failed:`, result.error);
        return 0;
      }
      return result.count ?? 0;
    };

    return {
      cities: countOrZero('cities', cities),
      countries: countOrZero('countries', countries),
      been: countOrZero('been cities', been),
      go: countOrZero('go cities', go),
      saved: countOrZero('saved cities', saved),
      pins: countOrZero('pins', pins),
    };
  },
  ['sidebar-counts-v2'],
  {
    revalidate: 300,
    tags: ['supabase-cities', 'supabase-countries', 'supabase-pins'],
  },
);

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
  // of the page already pulled it, this is free. Each fetcher has its own
  // catch so a single Supabase hiccup degrades counts instead of killing
  // the whole sidebar (which would 500 the entire app).
  const [cities, countries, pins, articleEntries, listsMeta, compactCounts] = await Promise.all([
    wantsCities
      ? fetchAllCities().catch(err => {
          console.error('[Sidebar] fetchAllCities failed:', err);
          return [];
        })
      : Promise.resolve([]),
    wantsCountries
      ? fetchAllCountries().catch(err => {
          console.error('[Sidebar] fetchAllCountries failed:', err);
          return [];
        })
      : Promise.resolve([]),
    wantsPins
      ? fetchAllPins().catch(err => {
          console.error('[Sidebar] fetchAllPins failed:', err);
          return [];
        })
      : Promise.resolve([]),
    getAllArticleEntries().catch(err => {
      console.error('[Sidebar] getAllArticleEntries failed:', err);
      return [];
    }),
    // Lists meta is small (one row per saved list, ~150 rows) and the
    // primary cost on a cold cache is one Supabase round-trip. Fetching
    // it unconditionally keeps the Lists nav row showing a count on
    // every route — discoverability is the win we're after.
    fetchAllSavedListsMeta().catch(err => {
      console.error('[Sidebar] fetchAllSavedListsMeta failed:', err);
      return new Map();
    }),
    wantsCounts
      ? fetchSidebarCounts().catch(err => {
          console.error('[Sidebar] fetchSidebarCounts failed:', err);
          return { cities: 0, countries: 0, been: 0, go: 0, saved: 0, pins: 0 };
        })
      : Promise.resolve({ cities: 0, countries: 0, been: 0, go: 0, saved: 0, pins: 0 }),
  ]);

  // Counts only get computed when the bottom-block is going to render.
  // Skipping the .filter() walks shaves milliseconds on hot paths.
  const counts = wantsCounts
    ? {
        cities: cities.length || compactCounts.cities,
        countries: countries.length || compactCounts.countries,
        been: cities.length ? cities.filter(c => c.been).length : compactCounts.been,
        go: cities.length ? cities.filter(c => c.go).length : compactCounts.go,
        saved: cities.length ? cities.filter(c => !!c.myGooglePlaces).length : compactCounts.saved,
        pins: pins.length || compactCounts.pins,
        lists: listsMeta.size,
      }
    : { ...ZERO_COUNTS, lists: listsMeta.size };

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
