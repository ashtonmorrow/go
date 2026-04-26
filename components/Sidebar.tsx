// Server Component sidebar — fetches city + country counts from Notion
// (cached via React.cache() in lib/notion so no extra API calls beyond what
// the page already does) and hands them to the interactive client shell.
import { fetchAllCities, fetchAllCountries } from '@/lib/notion';
import { fetchAllPins } from '@/lib/pins';
import SidebarShell from './SidebarShell';

export default async function Sidebar() {
  // Pins fetch piggybacks on React.cache() so /pins (which also calls
  // fetchAllPins) doesn't double-hit Supabase. Same with cities/countries.
  const [cities, countries, pins] = await Promise.all([
    fetchAllCities(),
    fetchAllCountries(),
    fetchAllPins(),
  ]);

  const counts = {
    cities: cities.length,
    countries: countries.length,
    been: cities.filter(c => c.been).length,
    go: cities.filter(c => c.go).length,
    saved: cities.filter(c => !!c.myGooglePlaces).length,
    pins: pins.length,
  };

  // Country options for the city filter — derived from cities' own data
  // so we never offer a country with no cities to filter to.
  const countryOptions = Array.from(
    new Set(cities.map(c => c.country).filter((s): s is string => !!s))
  ).sort((a, b) => a.localeCompare(b));

  // Pin-side filter options — derived from the pin set itself rather than
  // the global country list, for the same reason as above. Categories are
  // also unique-and-sorted so the chip group is stable.
  const pinCountryOptions = Array.from(
    new Set(
      pins
        .map(p => p.statesNames[0])
        .filter((s): s is string => !!s)
    )
  ).sort((a, b) => a.localeCompare(b));

  const pinCategoryOptions = Array.from(
    new Set(pins.map(p => p.category).filter((s): s is string => !!s))
  ).sort((a, b) => a.localeCompare(b));

  return (
    <SidebarShell
      counts={counts}
      countryOptions={countryOptions}
      pinCountryOptions={pinCountryOptions}
      pinCategoryOptions={pinCategoryOptions}
    />
  );
}
