import { fetchAllCities, fetchAllCountries } from '@/lib/notion';
import WorldMap from '@/components/WorldMap';

export const revalidate = 3600;
export const metadata = { title: 'Map · go.mike-lee' };

// Server component: fetches cities + countries from Notion, filters to Been
// (and optionally Go), then hands a minimal payload to the client map.
export default async function MapPage() {
  const [cities, countries] = await Promise.all([fetchAllCities(), fetchAllCountries()]);
  const countryById = new Map(countries.map(c => [c.id, c]));

  const pins = cities
    .filter(c => (c.been || c.go) && c.lat != null && c.lng != null)
    .map(c => {
      const country = c.countryPageId ? countryById.get(c.countryPageId) : null;
      return {
        id: c.id,
        name: c.name,
        slug: c.slug,
        country: country?.name || c.country || '',
        countryFlag: country?.flag || null,
        been: c.been,
        go: c.go,
        lat: c.lat as number,
        lng: c.lng as number,
      };
    });

  return (
    <section className="max-w-page mx-auto px-5 py-10">
      <div className="max-w-prose">
        <h1 className="text-h1 text-ink-deep">Map</h1>
        <p className="text-slate mt-3 leading-relaxed">
          Every city pinned here is somewhere I&apos;ve been or am planning to
          visit. Hover a pin for the city name; click to open the postcard.
          This is an outline view — the world is drawn loosely from a
          simplified country outline so the focus stays on the pins.
        </p>
        <p className="text-slate mt-3 text-small">
          {pins.filter(p => p.been).length} visited · {pins.filter(p => p.go && !p.been).length} planned
        </p>
      </div>

      <WorldMap pins={pins} />
    </section>
  );
}
