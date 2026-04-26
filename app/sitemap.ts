import type { MetadataRoute } from 'next';
import { fetchAllCities, fetchAllCountries } from '@/lib/notion';
import { fetchAllPins } from '@/lib/pins';
import { SITE_URL } from '@/lib/seo';

// Dynamic sitemap. Includes:
//   • static routes  — /cities, /map, /about (and / which redirects)
//   • every city detail page (/cities/<slug>)
//   • every country detail page (/countries/<slug>)
//
// Built at request time and ISR-cached for 1 hour, same window as the page
// data. Search engines fetch this rarely so the per-build cost is fine.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [cities, countries, pins] = await Promise.all([
    fetchAllCities(),
    fetchAllCountries(),
    fetchAllPins(),
  ]);
  const now = new Date();

  // Object × View matrix — every cell is a real page in the new nav.
  // Cards views get the highest priority (the canonical default for each
  // object); map and table follow.
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/cities/cards`,    lastModified: now, changeFrequency: 'daily',  priority: 1.0 },
    { url: `${SITE_URL}/cities/map`,      lastModified: now, changeFrequency: 'daily',  priority: 0.9 },
    { url: `${SITE_URL}/cities/table`,    lastModified: now, changeFrequency: 'daily',  priority: 0.8 },
    { url: `${SITE_URL}/countries/cards`, lastModified: now, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${SITE_URL}/countries/map`,   lastModified: now, changeFrequency: 'daily',  priority: 0.9 },
    { url: `${SITE_URL}/countries/table`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${SITE_URL}/pins/cards`,      lastModified: now, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${SITE_URL}/pins/map`,        lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${SITE_URL}/pins/table`,      lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${SITE_URL}/about`,           lastModified: '2026-04-25', changeFrequency: 'monthly', priority: 0.7 },
  ];

  const cityRoutes: MetadataRoute.Sitemap = cities.map(c => ({
    url: `${SITE_URL}/cities/${c.slug}`,
    lastModified: now,
    changeFrequency: 'weekly',
    // Curated cities (Been / Go) get higher priority than placeholders
    // so search engines pick them up first.
    priority: c.been || c.go ? 0.8 : 0.5,
  }));

  const countryRoutes: MetadataRoute.Sitemap = countries.map(c => ({
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

  return [...staticRoutes, ...cityRoutes, ...countryRoutes, ...pinRoutes];
}
