import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { MetadataRoute } from 'next';
import matter from 'gray-matter';
import { fetchAllCities, fetchAllCountries } from '@/lib/notion';
import { fetchAllPins } from '@/lib/pins';
import { listPinViews } from '@/lib/pinViews';
import { SITE_URL } from '@/lib/seo';
import { getAllArticleEntries } from '@/lib/articles';
import { fetchAllSavedListsMeta, listNameToSlug } from '@/lib/savedLists';

/** Read /content/<scope>/<slug>.md frontmatter and return the indexable
 *  flag. Returns false when the file is missing or `indexable !== true`.
 *  Mirrors the per-page metadata gate in /cities/[slug] and
 *  /countries/[slug] so sitemap entries match noindex policy exactly:
 *  no editorial file, no sitemap entry. */
async function placeIndexable(scope: 'cities' | 'countries', slug: string): Promise<boolean> {
  const file = path.join(process.cwd(), 'content', scope, `${slug}.md`);
  try {
    const raw = await fs.readFile(file, 'utf8');
    const { data } = matter(raw);
    return data?.indexable === true;
  } catch {
    return false;
  }
}

// Dynamic sitemap. Includes:
//   • static routes  — /cities, /map, /about (and / which redirects)
//   • every city detail page (/cities/<slug>)
//   • every country detail page (/countries/<slug>)
//
// Built at request time and ISR-cached for 1 hour, same window as the page
// data. Search engines fetch this rarely so the per-build cost is fine.
export const dynamic = 'force-dynamic';
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [cities, countries, pins, articleEntries, listsMeta] = await Promise.all([
    fetchAllCities(),
    fetchAllCountries(),
    fetchAllPins(),
    getAllArticleEntries(),
    fetchAllSavedListsMeta(),
  ]);
  const now = new Date();

  // Object × View matrix — every cell is a real page in the new nav.
  // Cards views get the highest priority (the canonical default for each
  // object); map and table follow.
  // Only the canonical card view of each corpus ships in the sitemap.
  // /pins/{map,table,stats} (and the city / country equivalents) are
  // canonical-tagged + noindex'd against the cards URL — listing them
  // here would be inconsistent with that signal and waste crawl
  // budget.
  // Top-level URLs in priority order. The home page (/) ships at 1.0
  // because the May 2026 IA refactor turned it from a redirect into a
  // real magazine-style landing; it's the canonical entry point and
  // distributes link authority to the editorial pages below it.
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: SITE_URL,                      lastModified: now, changeFrequency: 'daily',  priority: 1.0 },
    { url: `${SITE_URL}/lists`,           lastModified: now, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${SITE_URL}/articles`,        lastModified: now, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${SITE_URL}/cities/map`,      lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${SITE_URL}/cities/cards`,    lastModified: now, changeFrequency: 'daily',  priority: 0.7 },
    { url: `${SITE_URL}/countries/cards`, lastModified: now, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${SITE_URL}/pins/cards`,      lastModified: now, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${SITE_URL}/about`,           lastModified: '2026-04-25', changeFrequency: 'monthly', priority: 0.6 },
    { url: `${SITE_URL}/privacy`,         lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
  ];

  // City detail pages: indexable iff /content/cities/<slug>.md exists
  // with `indexable: true` in frontmatter. The page's own metadata
  // emits `robots: noindex` for the rest. Listing thin pages in the
  // sitemap would tell Google the opposite of the page directive —
  // filter to match.
  const cityIndexability = await Promise.all(
    cities.map(async c => ({ city: c, indexable: await placeIndexable('cities', c.slug) })),
  );
  const cityRoutes: MetadataRoute.Sitemap = cityIndexability
    .filter(({ indexable }) => indexable)
    .map(({ city: c }) => ({
      url: `${SITE_URL}/cities/${c.slug}`,
      lastModified: now,
      changeFrequency: 'weekly',
      // Curated cities (Been / Go) get higher priority than other
      // indexable ones so search engines pick them up first.
      priority: c.been || c.go ? 0.8 : 0.6,
    }));

  // Per-city /things-to-do landing pages. Listed only for curated
  // cities (been or go); placeholder cities almost never have enough
  // pins to clear the page's MIN_INDEXABLE_PIN_COUNT gate, so listing
  // them in the sitemap would just add noindex URLs.
  const thingsToDoRoutes: MetadataRoute.Sitemap = cities
    .filter(c => c.been || c.go)
    .map(c => ({
      url: `${SITE_URL}/cities/${c.slug}/things-to-do`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.7,
    }));

  // Per-city /hotels hub pages. Same gate logic as the page itself
  // (MIN_INDEXABLE_HOTEL_COUNT = 3) — only cities with at least 3
  // visited hotels in the atlas ship in the sitemap, so we don't
  // contradict the page's own noindex on thin clusters.
  const HOTEL_HUB_MIN = 3;
  const hotelCountByCity = new Map<string, number>();
  for (const p of pins) {
    if (p.kind !== 'hotel') continue;
    for (const cityName of p.cityNames ?? []) {
      hotelCountByCity.set(cityName, (hotelCountByCity.get(cityName) ?? 0) + 1);
    }
  }
  const hotelHubRoutes: MetadataRoute.Sitemap = cities
    .filter(c => (hotelCountByCity.get(c.name) ?? 0) >= HOTEL_HUB_MIN)
    .map(c => ({
      url: `${SITE_URL}/cities/${c.slug}/hotels`,
      lastModified: now,
      changeFrequency: 'weekly',
      // Hotel hubs are higher-intent than things-to-do (commercial
      // booking-adjacent search), so prioritize them slightly.
      priority: 0.75,
    }));

  // Same gate as cities — only countries with an indexable content
  // file ship in the sitemap.
  const countryIndexability = await Promise.all(
    countries.map(async c => ({ country: c, indexable: await placeIndexable('countries', c.slug) })),
  );
  const countryRoutes: MetadataRoute.Sitemap = countryIndexability
    .filter(({ indexable }) => indexable)
    .map(({ country: c }) => ({
      url: `${SITE_URL}/countries/${c.slug}`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.6,
    }));

  const pinRoutes: MetadataRoute.Sitemap = pins
    .filter(p => p.slug)
    .map(p => ({
      url: `${SITE_URL}/pins/${p.slug}`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: p.visited ? 0.7 : 0.5,
    }));

  // Curated /pins/views/<slug> landings — high-intent SEO surfaces with
  // their own editorial copy + Article schema. Bumped to 0.8 because each
  // is a hand-tuned destination, not just a filter permutation.
  const viewRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/pins/views`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    ...listPinViews().map(v => ({
      url: `${SITE_URL}/pins/views/${v.slug}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
  ];

  const articleRoutes: MetadataRoute.Sitemap = articleEntries.map(entry => ({
    url: `${SITE_URL}${entry.href}`,
    lastModified: entry.publishedAt ?? now,
    changeFrequency: 'monthly',
    priority: entry.href.startsWith('/posts/') ? 0.6 : 0.7,
  }));

  const listRoutes: MetadataRoute.Sitemap = Array.from(listsMeta.values()).map(list => ({
    // Prefer the saved_lists.slug column over the derived form. Falls
    // back to derived for any row that somehow missed the May 2026
    // backfill so the sitemap stays exhaustive.
    url: `${SITE_URL}/lists/${list.slug ?? listNameToSlug(list.name)}`,
    lastModified: list.updatedAt ?? now,
    changeFrequency: 'monthly',
    priority: list.description ? 0.7 : 0.5,
  }));

  return [
    ...staticRoutes,
    ...articleRoutes,
    ...listRoutes,
    ...cityRoutes,
    ...thingsToDoRoutes,
    ...hotelHubRoutes,
    ...countryRoutes,
    ...pinRoutes,
    ...viewRoutes,
  ];
}
