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

  return <SidebarShell counts={counts} />;
}
