import type { MetadataRoute } from 'next';
import { fetchAllCities, fetchAllCountries } from '@/lib/notion';
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
  const [cities, countries] = await Promise.all([fetchAllCities(), fetchAllCountries()]);
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: `${SITE_URL}/cities`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${SITE_URL}/map`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/about`,
      lastModified: '2026-04-25',
      changeFrequency: 'monthly',
      priority: 0.7,
    },
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

  return [...staticRoutes, ...cityRoutes, ...countryRoutes];
}
