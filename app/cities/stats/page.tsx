// === /cities/stats =========================================================
// Filter-aware breakdowns over the city atlas. The page is a thin
// server shell that loads the data; CityStatsClient does the actual
// filter consumption and recomputes every aggregate from the cockpit-
// filtered set on each render.
//
// Coverage framing — when a filter is active the headline KPIs show
// both "X% of these" (within filter) and "Y% of atlas" (global) so
// the user can read coverage either way.
//
import type { Metadata } from 'next';
import { fetchCitiesCardData } from '@/lib/citiesCardData';
import { fetchAllCountries } from '@/lib/notion';
import JsonLd from '@/components/JsonLd';
import CityStatsClient from '@/components/CityStatsClient';
import ActiveFilters from '@/components/ActiveFilters';
import { SITE_URL, webPageJsonLd } from '@/lib/seo';

export const revalidate = 604800; // 7 days — bust via /api/revalidate when Notion/Supabase data changes

const DESCRIPTION =
  'Filter-aware breakdowns over the 1,341-city atlas — by continent, climate, visa, drive-side; top countries; oldest, hottest, coldest. Numbers update as you change filters in the sidebar.';

export const metadata: Metadata = {
  title: 'City Stats',
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/cities/stats` },
  openGraph: {
    type: 'website',
    url: `${SITE_URL}/cities/stats`,
    title: 'City Stats · Mike Lee',
    description: DESCRIPTION,
  },
};

export default async function CityStatsPage() {
  // fetchCitiesCardData carries every filter / sort axis CityStatsClient
  // touches, plus the countryPageId via the slim shape — same data the
  // /cities/cards + /cities/table pages already use. Cached at the lib
  // layer so we don't refetch the 2.2 MB raw city corpus per render.
  // fetchAllCountries is small enough (~250 rows) to call directly.
  const [cities, countries] = await Promise.all([
    fetchCitiesCardData(),
    fetchAllCountries(),
  ]);

  // Slim country lookup — only what the breakdown needs (name, slug,
  // continent for grouping). Avoids shipping the full country list.
  const countriesByPageId: Record<string, { name: string; slug: string; continent: string | null }> = {};
  for (const c of countries) {
    countriesByPageId[c.id] = { name: c.name, slug: c.slug, continent: c.continent };
  }

  return (
    <div className="max-w-page mx-auto px-5 py-6">
      <JsonLd
        data={webPageJsonLd({
          url: `${SITE_URL}/cities/stats`,
          name: 'City Stats',
          description: DESCRIPTION,
        })}
      />

      <section className="max-w-page mx-auto px-5 pt-6"><h1 className="text-h2 text-ink-deep">City Stats</h1></section>

      <ActiveFilters className="mb-4" />

      <CityStatsClient cities={cities} countriesByPageId={countriesByPageId} />
    </div>
  );
}
