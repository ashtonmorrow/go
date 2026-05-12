// === SkyPanel ==============================================================
// "In the air near {city}" — a live aircraft map driven by the OpenSky
// Network ADS-B receiver network. Server component wrapper around the
// client-only SkyMap; the live fetch runs in the visitor's browser, so
// no API key is needed and the server quota stays untouched.
//
// Coverage varies by region. Dense receiver coverage in Europe and the
// US gives near-complete view; rural areas and oceans show fewer aircraft.
//
import SkyMapLoader from './SkyMapLoader';

type Props = {
  cityName: string;
  cityLat: number;
  cityLng: number;
};

export default function SkyPanel({ cityName, cityLat, cityLng }: Props) {
  return (
    <section className="mt-8">
      <h2 className="text-h2 text-ink-deep mb-2">In the air near {cityName}</h2>
      <p className="text-small text-slate mb-4">
        Live commercial flight positions within 50 km of the city, refreshed
        every minute while this tab is open. Aircraft data from OpenSky
        Network&rsquo;s volunteer ADS-B receivers. Coverage is dense over
        Europe and North America, patchier elsewhere.
      </p>
      <SkyMapLoader cityName={cityName} cityLat={cityLat} cityLng={cityLng} />
    </section>
  );
}
