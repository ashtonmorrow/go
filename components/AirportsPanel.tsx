// === AirportsPanel =========================================================
// Server component wrapper for the airports-near-this-city section.
// Renders the heading, a one-line description with the closest airport
// callout, and hands the interactive map + list off to AirportsViewLoader.
//
// Returns null when no commercial airport is within range; we don't want
// to render an empty section.
//
import AirportsViewLoader from './AirportsViewLoader';
import type { AirportWithDistance } from '@/lib/airports';

type Props = {
  cityName: string;
  cityLat: number;
  cityLng: number;
  airports: AirportWithDistance[];
};

export default function AirportsPanel({
  cityName,
  cityLat,
  cityLng,
  airports,
}: Props) {
  if (airports.length === 0) return null;
  const closest = airports[0];

  return (
    <section className="mt-8">
      <h2 className="text-h2 text-ink-deep mb-2">Airports near {cityName}</h2>
      <p className="text-small text-slate mb-4">
        {airports.length} commercial {airports.length === 1 ? 'airport' : 'airports'}{' '}
        within 100 km. Closest is {closest.name}
        {closest.iata && <> ({closest.iata})</>} at {closest.distanceKm.toFixed(0)} km.
      </p>
      <AirportsViewLoader
        cityName={cityName}
        cityLat={cityLat}
        cityLng={cityLng}
        airports={airports}
      />
    </section>
  );
}
