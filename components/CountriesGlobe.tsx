'use client';

import { useMemo, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Map as MapView,
  Source,
  Layer,
  Popup,
  NavigationControl,
  type MapRef,
  type MapMouseEvent,
} from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { COLORS } from '@/lib/colors';
import { useFilteredCities } from '@/lib/useFilteredCities';
import { cityLayer } from '@/lib/cityFilter';
import { useCityFilters, type CityLayer } from './CityFiltersContext';
import ActiveFilters from './ActiveFilters';
import type { City } from '@/lib/cityShape';

// Country metadata indexed by ISO 3166-1 alpha-3. Carries every field the
// hover tile needs so the popup can render a real fact sheet without
// follow-up fetches.
type CountryMeta = {
  name: string;
  slug: string;
  flag: string | null;
  iso2: string | null;
  capital: string | null;
  language: string | null;
  currency: string | null;
  callingCode: string | null;
  schengen: boolean;
  voltage: string | null;
  plugTypes: string[];
  tapWater: string | null;
  visa: string | null;
  driveSide: 'L' | 'R' | null;
};

type Props = {
  cities: City[];
  // ISO3 → country metadata lookup (built server-side from the Notion
  // countries table). Drives the popup + click navigation.
  countriesByIso3: Record<string, CountryMeta>;
  // Mapping from countryPageId (Notion id) → ISO3, used to bridge cities
  // (which reference country by page id) to the GeoJSON (which keys on ISO3).
  countryIdToIso3: Record<string, string>;
};

type Projection = 'globe' | 'mercator';

// Public-domain Natural-Earth-derived country boundaries (datasets/
// geo-countries on GitHub via jsDelivr). License: PDDL 1.0. ~250 KB
// runtime fetch — Next ISR caches it after the first hit per window.
const COUNTRY_GEOJSON = 'https://cdn.jsdelivr.net/gh/datasets/geo-countries@master/data/countries.geojson';

export default function CountriesGlobe({ cities, countriesByIso3, countryIdToIso3 }: Props) {
  const router = useRouter();
  const mapRef = useRef<MapRef | null>(null);
  const ctx = useCityFilters();

  const [projection, setProjection] = useState<Projection>('globe');
  const [hovered, setHovered] = useState<{
    iso3: string;
    lng: number;
    lat: number;
  } | null>(null);

  // useFilteredCities runs the FULL pipeline (facets + layer visibility +
  // sort), so when the user toggles a layer off the cities in that layer
  // disappear from the globe altogether.
  const filtered = useFilteredCities(cities);

  // === Derive country shading from the filtered set ======================
  // Every country with at least one filtered city gets a fill color. The
  // color is chosen by the country's DOMINANT layer using priority
  // Been > Go > Saved > Other — so a country with 3 visited cities and
  // 1 planned city shades teal (Been), not slate (Go). This mirrors the
  // map-layer pattern from Strava / Kepler.gl: a place reads as the
  // strongest signal it carries, not the average.
  //
  // perCountry keeps the per-bucket counts for the hover tile so users
  // can still see "5 visited, 2 planned, 1 saved" when they mouse over.
  const { layerByIso3, perCountry } = useMemo(() => {
    type Buckets = Record<CityLayer, number>;
    const buckets = new Map<string, Buckets>();

    for (const c of filtered) {
      if (!c.countryPageId) continue;
      const iso3 = countryIdToIso3[c.countryPageId];
      if (!iso3) continue;
      let b = buckets.get(iso3);
      if (!b) {
        b = { been: 0, go: 0, saved: 0, other: 0 };
        buckets.set(iso3, b);
      }
      b[cityLayer(c)]++;
    }

    const layers: Record<string, CityLayer> = {};
    const perCountryStats: Record<string, Buckets & { total: number }> = {};
    for (const [iso3, b] of buckets) {
      // Priority: Been > Go > Saved > Other. A bucket with at least one
      // city in a higher-priority layer wins, regardless of count.
      const dominant: CityLayer =
        b.been > 0 ? 'been'
          : b.go > 0 ? 'go'
          : b.saved > 0 ? 'saved'
          : 'other';
      layers[iso3] = dominant;
      perCountryStats[iso3] = { ...b, total: b.been + b.go + b.saved + b.other };
    }
    return { layerByIso3: layers, perCountry: perCountryStats };
  }, [filtered, countryIdToIso3]);

  // Group ISO3s by layer for the MapLibre fill expression. Each layer
  // gets its own color via a series of `match` branches in the paint.
  const isoByLayer = useMemo(() => {
    const byLayer: Record<CityLayer, string[]> = { been: [], go: [], saved: [], other: [] };
    for (const [iso3, l] of Object.entries(layerByIso3)) {
      byLayer[l].push(iso3);
    }
    return byLayer;
  }, [layerByIso3]);

  const matchedIso3 = useMemo(() => Object.keys(layerByIso3), [layerByIso3]);

  const hoveredIso = hovered?.iso3 ?? '__none__';

  // === Click + hover handlers ===
  const handleClick = useCallback(
    (e: MapMouseEvent) => {
      const feat = e.features?.[0];
      if (!feat) return;
      const iso3 = feat.properties?.['ISO3166-1-Alpha-3'] as string | undefined;
      if (!iso3) return;
      const entry = countriesByIso3[iso3];
      if (entry) router.push(`/countries/${entry.slug}`);
    },
    [countriesByIso3, router]
  );

  const handleMouseMove = useCallback((e: MapMouseEvent) => {
    const feat = e.features?.[0];
    if (feat) {
      const iso3 = feat.properties?.['ISO3166-1-Alpha-3'] as string | undefined;
      if (iso3) {
        setHovered({ iso3, lng: e.lngLat.lng, lat: e.lngLat.lat });
        return;
      }
    }
    setHovered(null);
  }, []);

  const handleMouseLeave = useCallback(() => setHovered(null), []);

  return (
    <div className="relative w-full h-[calc(100svh-56px)] md:h-screen bg-cream-soft">
      <MapView
        ref={mapRef}
        mapStyle="https://tiles.openfreemap.org/styles/positron"
        initialViewState={{ longitude: 10, latitude: 30, zoom: 1.4, pitch: 0, bearing: 0 }}
        projection={{ type: projection }}
        attributionControl={false}
        style={{ width: '100%', height: '100%', cursor: hovered ? 'pointer' : 'grab' }}
        dragRotate
        touchPitch
        interactiveLayerIds={['countries-fill']}
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <Source id="countries" type="geojson" data={COUNTRY_GEOJSON}>
          {/* Fill layer — color by dominant layer (Been=teal, Go=slate,
              Saved=accent, Other=muted). Each layer's ISO3 list is matched
              independently so toggling a layer off in the cockpit instantly
              clears countries whose dominant signal was that layer. Hover
              bumps the opacity so the target country lights up. */}
          <Layer
            id="countries-fill"
            type="fill"
            paint={{
              'fill-color': [
                'case',
                ['in', ['get', 'ISO3166-1-Alpha-3'], ['literal', isoByLayer.been]],  COLORS.teal,
                ['in', ['get', 'ISO3166-1-Alpha-3'], ['literal', isoByLayer.go]],    COLORS.slate,
                ['in', ['get', 'ISO3166-1-Alpha-3'], ['literal', isoByLayer.saved]], COLORS.accent,
                ['in', ['get', 'ISO3166-1-Alpha-3'], ['literal', isoByLayer.other]], COLORS.pinIdle,
                'transparent',
              ] as unknown as string,
              'fill-opacity': [
                'case',
                ['==', ['get', 'ISO3166-1-Alpha-3'], hoveredIso],
                0.8,
                ['in', ['get', 'ISO3166-1-Alpha-3'], ['literal', matchedIso3]],
                0.55,
                0,
              ] as unknown as number,
            }}
          />
          {/* Outline layer — every country gets a faint line so unfilled
              ones still read as shapes. Matched countries get a darker
              outline so the boundary stays crisp against the fill. */}
          <Layer
            id="countries-outline"
            type="line"
            paint={{
              'line-color': [
                'case',
                ['in', ['get', 'ISO3166-1-Alpha-3'], ['literal', matchedIso3]],
                COLORS.inkDeep,
                COLORS.inkDeep,
              ] as unknown as string,
              'line-width': [
                'case',
                ['==', ['get', 'ISO3166-1-Alpha-3'], hoveredIso],
                1.6,
                ['in', ['get', 'ISO3166-1-Alpha-3'], ['literal', matchedIso3]],
                0.9,
                0.4,
              ] as unknown as number,
              'line-opacity': [
                'case',
                ['==', ['get', 'ISO3166-1-Alpha-3'], hoveredIso],
                0.85,
                ['in', ['get', 'ISO3166-1-Alpha-3'], ['literal', matchedIso3]],
                0.7,
                0.22,
              ] as unknown as number,
            }}
          />
        </Source>

        {/* Hover popup — rich fact tile.
            Width-locked to ~280px so the layout is consistent across
            countries with very long or very short names. Headline row
            has flag + name + ISO2 badge; a dl rows section follows
            with the practicalities (capital, language, currency, visa,
            tap water, drive, voltage, plug types); footer surfaces the
            cities-visited breakdown for the active filter. */}
        {hovered && countriesByIso3[hovered.iso3] && (
          <Popup
            longitude={hovered.lng}
            latitude={hovered.lat}
            closeButton={false}
            closeOnClick={false}
            anchor="top"
            offset={12}
            className="!p-0"
            maxWidth="320px"
          >
            <CountryHoverTile country={countriesByIso3[hovered.iso3]} stats={perCountry[hovered.iso3]} />
          </Popup>
        )}

        <NavigationControl position="bottom-left" showCompass={projection === 'globe'} />
      </MapView>

      {/* === Count badge (top-left) ===
          Single colour means no key is needed — shaded == matches the
          current filter. The badge just gives the user feedback as
          filters narrow / widen the result set. */}
      <div className="absolute top-3 left-3 z-10 bg-white/90 backdrop-blur border border-sand rounded-md shadow-sm px-2.5 py-1.5 text-[11px] text-slate">
        <span className="text-ink-deep font-medium tabular-nums">
          {matchedIso3.length}
        </span>
        <span className="ml-1">{matchedIso3.length === 1 ? 'country' : 'countries'}</span>
      </div>

      {/* === Projection toggle === top-right */}
      <div className="absolute top-3 right-3 z-10">
        <div className="inline-flex rounded-full bg-white/90 backdrop-blur border border-sand p-1 shadow-sm">
          <ProjectionPill
            active={projection === 'globe'}
            onClick={() => setProjection('globe')}
            icon="🌐"
            label="Globe"
          />
          <ProjectionPill
            active={projection === 'mercator'}
            onClick={() => setProjection('mercator')}
            icon="🗺️"
            label="Flat"
          />
        </div>
      </div>

      {/* Active-filter chip ribbon — floats top-center. Hidden when no
          facets are active. */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 max-w-[60vw]">
        <div className="bg-white/90 backdrop-blur border border-sand rounded-md shadow-sm px-2 py-1 empty:hidden">
          <ActiveFilters />
        </div>
      </div>

      {/* View switcher lives at the page level (app/countries/map/page.tsx). */}
    </div>
  );
}

function ProjectionPill({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: string;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-small font-medium transition-colors ' +
        (active ? 'bg-ink-deep text-cream-soft' : 'text-slate hover:text-ink-deep')
      }
    >
      <span aria-hidden>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

// === CountryHoverTile ======================================================
// Pop-up tile shown when the user hovers any country on the globe.
// Headline + practicalities + city stats. Field rows follow the same
// 'label small caps · value mono / sans' pattern the city detail page
// sidebar uses, so the visual language stays consistent across views.
function CountryHoverTile({
  country,
  stats,
}: {
  country: CountryMeta;
  stats?: { been: number; go: number; saved: number; other: number; total: number };
}) {
  // Build the row list — only include rows where there's a value, so a
  // sparsely-populated country (some islands etc) renders cleanly without
  // 'em-dash placeholders'.
  const rows: { label: string; value: string }[] = [];
  if (country.capital) rows.push({ label: 'Capital', value: country.capital });
  if (country.language) rows.push({ label: 'Language', value: country.language });
  if (country.currency) rows.push({ label: 'Currency', value: country.currency });
  if (country.callingCode) rows.push({ label: 'Phone', value: country.callingCode });
  if (country.visa) rows.push({ label: 'Visa', value: country.visa });
  if (country.tapWater) rows.push({ label: 'Water', value: country.tapWater });
  if (country.driveSide)
    rows.push({ label: 'Drive', value: country.driveSide === 'L' ? 'left' : 'right' });
  if (country.voltage) rows.push({ label: 'Voltage', value: country.voltage });
  if (country.plugTypes.length > 0)
    rows.push({ label: 'Plugs', value: country.plugTypes.join(' · ') });
  if (country.schengen) rows.push({ label: 'Schengen', value: 'Yes' });

  const cityLine = stats
    ? stats.been > 0
      ? `${stats.been} of ${stats.total} cities visited`
      : stats.go > 0
        ? `${stats.total} planned · not visited yet`
        : `${stats.total} cities match filters`
    : 'No cities in current filter';

  return (
    <div className="w-[280px]">
      {/* Header — flag + name + ISO badge */}
      <div className="flex items-center gap-2.5 px-3 py-2 border-b border-sand">
        {country.flag && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={country.flag}
            alt=""
            className="w-7 h-auto rounded-sm border border-sand flex-shrink-0"
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="text-ink-deep font-semibold leading-tight truncate">
            {country.name}
          </div>
        </div>
        {country.iso2 && (
          <span className="text-[9px] font-mono text-muted tracking-[0.14em]">
            {country.iso2}
          </span>
        )}
      </div>

      {/* Practicalities */}
      {rows.length > 0 && (
        <dl className="px-3 py-2 text-[11px] leading-tight space-y-0.5">
          {rows.map(r => (
            <div key={r.label} className="flex items-baseline justify-between gap-3">
              <dt className="text-[9px] uppercase tracking-[0.14em] text-muted font-medium flex-shrink-0">
                {r.label}
              </dt>
              <dd
                className="text-ink-deep font-mono truncate text-right text-[11px]"
                title={r.value}
              >
                {r.value}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {/* Footer — city stats from the active filter */}
      <div className="px-3 py-1.5 border-t border-sand text-[10px] text-slate tabular-nums flex items-center justify-between gap-2">
        <span>{cityLine}</span>
        <span className="text-muted text-[9px]">click → open</span>
      </div>
    </div>
  );
}
