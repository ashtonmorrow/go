// Server Component sidebar — fetches city + country counts from Notion
// (cached via React.cache() in lib/notion so no extra API calls beyond what
// the page already does) and hands them to the interactive client shell.
import { fetchAllCities, fetchAllCountries } from '@/lib/notion';
import SidebarShell from './SidebarShell';

export default async function Sidebar() {
  const [cities, countries] = await Promise.all([
    fetchAllCities(),
    fetchAllCountries(),
  ]);

  const counts = {
    cities: cities.length,
    countries: countries.length,
    been: cities.filter(c => c.been).length,
    go: cities.filter(c => c.go).length,
    saved: cities.filter(c => !!c.myGooglePlaces).length,
  };

  // Country options for the searchable multi-select in the FilterPanel.
  // Use the unique set of country names that actually appear on cities,
  // sorted alphabetically. This way the picker can never offer a country
  // that has no cities to filter to.
  const countryOptions = Array.from(
    new Set(cities.map(c => c.country).filter((s): s is string => !!s))
  ).sort((a, b) => a.localeCompare(b));

  return <SidebarShell counts={counts} countryOptions={countryOptions} />;
}
