import Link from 'next/link';
import { fetchAllCities } from '@/lib/notion';
import CitiesAdminClient, { type AdminCityRow } from './CitiesAdminClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// === /admin/cities =========================================================
// Index page for the city hero curation flow. Lists every city with its
// curation status (X / N picks vs auto-pick) and a thumbnail of the
// current cover so Mike can scan for cities that need a hand-pick.
// Click any row → /admin/cities/[slug] (the per-city HeroPicker).

export default async function AdminCitiesIndexPage() {
  const cities = await fetchAllCities();

  // Sort: cities Mike has actually been to lead, then short-list, then the
  // long tail. Within each tier, alphabetical by name. Most useful for
  // curation since visited cities are the ones with personal photos
  // available to pick from.
  const tier = (c: { been: boolean; go: boolean }) =>
    c.been ? 0 : c.go ? 1 : 2;

  const rows: AdminCityRow[] = cities
    .slice()
    .sort(
      (a, b) =>
        tier(a) - tier(b) || a.name.localeCompare(b.name),
    )
    .map(c => ({
      slug: c.slug,
      name: c.name,
      country: c.country ?? null,
      been: c.been,
      go: c.go,
      heroPhotoUrls: c.heroPhotoUrls,
      // Cover precedence: curated first pick → personalPhoto → heroImage.
      // Index page just needs *some* thumbnail to anchor the row visually.
      coverUrl:
        (c.heroPhotoUrls && c.heroPhotoUrls[0]) ||
        c.personalPhoto ||
        c.heroImage ||
        null,
    }));

  return (
    <div className="max-w-page mx-auto px-5 py-8">
      <header className="mb-6">
        <div className="text-small text-muted mb-2">
          <Link href="/admin" className="hover:text-teal">
            ← Admin
          </Link>
        </div>
        <h1 className="text-h1 text-ink-deep leading-tight">Cities admin</h1>
        <p className="mt-2 text-small text-muted">
          Pick hero photos for each city. Curated cities use a no-crop{' '}
          <code>HeroGallery</code> on the public detail page; uncurated
          ones fall back to the auto-pick collage. Visited cities are
          listed first since they're the ones with personal photos to
          pick from.
        </p>
      </header>
      <CitiesAdminClient rows={rows} />
    </div>
  );
}
