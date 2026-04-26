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
import ViewSwitcher from './ViewSwitcher';
import { COLORS } from '@/lib/colors';
import { useFilteredCities } from '@/lib/useFilteredCities';
import type { City } from '@/lib/cityShape';

// Country metadata indexed by ISO 3166-1 alpha-3.
type CountryMeta = {
  name: string;
  slug: string;
  flag: string | null;
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

  const [projection, setProjection] = useState<Projection>('globe');
  const [hovered, setHovered] = useState<{
    iso3: string;
    lng: number;
    lat: number;
  } | null>(null);

  // === Apply sidebar filters to the city list ============================
  // useFilteredCities reads from CityFiltersContext, so toggling Continent /
  // Climate / Country / Visa etc. in the sidebar narrows the cities, and
  // therefore narrows which countries get shaded on the globe.
  const filtered = useFilteredCities(cities);

  // === Derive matched countries from filtered cities =====================
  // A country is 'matched' if it has at least one city in the active
  // filter set. One bucket, one colour. The earlier visited / planned /
  // matched-no-status split was confusing — the user already controls
  // which subset shows by toggling Been / Want to go / Has saved places
  // in the sidebar, so the globe just needs to reflect the result.
  const { matchedIso3, perCountry } = useMemo(() => {
    const beenByIso3 = new Map<string, number>();
    const goByIso3 = new Map<string, number>();
    const cityByIso3 = new Map<string, number>();

    for (const c of filtered) {
      // Resolve via the country page id → ISO3 map built server-side.
      // Cities without a linked country are skipped (their country
      // free-text might exist but isn't indexed for the globe).
      if (!c.countryPageId) continue;
      const iso3 = countryIdToIso3[c.countryPageId];
      if (!iso3) continue;

      cityByIso3.set(iso3, (cityByIso3.get(iso3) || 0) + 1);
      if (c.been) beenByIso3.set(iso3, (beenByIso3.get(iso3) || 0) + 1);
      else if (c.go) goByIso3.set(iso3, (goByIso3.get(iso3) || 0) + 1);
    }

    // Per-country stats stay (used by the hover popup) — but the fill
    // expression only needs one array now.
    const matched: string[] = [];
    const perCountryStats: Record<string, { been: number; go: number; total: number }> = {};
    for (const [iso3, total] of cityByIso3) {
      perCountryStats[iso3] = {
        been: beenByIso3.get(iso3) || 0,
        go: goByIso3.get(iso3) || 0,
        total,
      };
      matched.push(iso3);
    }
    return { matchedIso3: matched, perCountry: perCountryStats };
  }, [filtered, countryIdToIso3]);

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
          {/* Fill layer — single colour. A country is shaded if any of
              its cities passes the active filter set; otherwise no fill.
              Hover bumps the opacity so the target country lights up. */}
          <Layer
            id="countries-fill"
            type="fill"
            paint={{
              'fill-color': COLORS.teal,
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
                COLORS.teal,
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

        {/* Hover popup */}
        {hovered && countriesByIso3[hovered.iso3] && (
          <Popup
            longitude={hovered.lng}
            latitude={hovered.lat}
            closeButton={false}
            closeOnClick={false}
            anchor="top"
            offset={12}
            className="!p-0"
          >
            <div className="px-2.5 py-1.5 flex items-center gap-2">
              {countriesByIso3[hovered.iso3].flag && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={countriesByIso3[hovered.iso3].flag!}
                  alt=""
                  className="w-4 h-auto rounded-sm border border-sand"
                />
              )}
              <div>
                <div className="text-ink-deep font-medium leading-tight text-small">
                  {countriesByIso3[hovered.iso3].name}
                </div>
                <div className="text-muted text-[10px] leading-tight tabular-nums">
                  {(() => {
                    const stats = perCountry[hovered.iso3];
                    if (!stats) return 'Not in current filter';
                    if (stats.been > 0) {
                      return `${stats.been} of ${stats.total} cities visited`;
                    }
                    if (stats.go > 0) {
                      return `${stats.total} cities · planning`;
                    }
                    return `${stats.total} cities match filters`;
                  })()}
                </div>
              </div>
            </div>
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

      <ViewSwitcher />
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
