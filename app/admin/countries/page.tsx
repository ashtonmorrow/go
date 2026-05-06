import Link from 'next/link';
import { fetchAllCities, fetchAllCountries } from '@/lib/notion';
import CountriesAdminClient, { type AdminCountryRow } from './CountriesAdminClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// === /admin/countries ======================================================
// Index page for the country hero curation flow. Listing + filtering
// pattern mirrors /admin/cities; the country status (visited /
// short-list / researching) is derived from member-city flags the same
// way /countries/cards does.

export default async function AdminCountriesIndexPage() {
  const [countries, cities] = await Promise.all([
    fetchAllCountries(),
    fetchAllCities(),
  ]);

  // Aggregate been + go counts per country via the city.country link.
  const beenByCountry = new Map<string, number>();
  const goByCountry = new Map<string, number>();
  for (const c of cities) {
    if (!c.country) continue;
    if (c.been) beenByCountry.set(c.country, (beenByCountry.get(c.country) ?? 0) + 1);
    if (c.go) goByCountry.set(c.country, (goByCountry.get(c.country) ?? 0) + 1);
  }

  const tier = (beenCount: number, goCount: number) =>
    beenCount > 0 ? 0 : goCount > 0 ? 1 : 2;

  const rows: AdminCountryRow[] = countries
    .slice()
    .map(c => {
      const beenCount = beenByCountry.get(c.name) ?? 0;
      const goCount = goByCountry.get(c.name) ?? 0;
      return {
        slug: c.slug,
        name: c.name,
        flag: c.flag,
        beenCount,
        goCount,
        heroPhotoUrls: c.heroPhotoUrls,
        coverUrl: c.heroPhotoUrls?.[0] ?? null,
      };
    })
    .sort(
      (a, b) =>
        tier(a.beenCount, a.goCount) - tier(b.beenCount, b.goCount) ||
        a.name.localeCompare(b.name),
    );

  return (
    <div className="max-w-page mx-auto px-5 py-8">
      <header className="mb-6">
        <div className="text-small text-muted mb-2">
          <Link href="/admin" className="hover:text-teal">
            ← Admin
          </Link>
        </div>
        <h1 className="text-h1 text-ink-deep leading-tight">Countries admin</h1>
        <p className="mt-2 text-small text-muted">
          Pick hero photos for each country. Curated countries use a
          no-crop <code>HeroGallery</code> on the public detail page;
          uncurated ones fall back to the auto-pick collage. Status
          (visited / short list / researching) reflects whether any
          member city is been-ticked or go-ticked.
        </p>
      </header>
      <CountriesAdminClient rows={rows} />
    </div>
  );
}
