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

  // === Derive country status from filtered cities ========================
  // Same primary-status priority used everywhere (Been > Go > Saved).
  // A country counts as 'visited' if any of ITS filtered cities is Been;
  // 'planned' if it has Go cities but no Been; 'matched' (lighter shade)
  // if it has cities passing the filter at all but no status.
  const { visitedIso3, plannedIso3, matchedIso3, perCountry } = useMemo(() => {
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

    const visited: string[] = [];
    const planned: string[] = [];
    const matched: string[] = [];
    const perCountryStats: Record<string, { been: number; go: number; total: number }> = {};

    for (const [iso3, total] of cityByIso3) {
      const been = beenByIso3.get(iso3) || 0;
      const go = goByIso3.get(iso3) || 0;
      perCountryStats[iso3] = { been, go, total };
      if (been > 0) visited.push(iso3);
      else if (go > 0) planned.push(iso3);
      else matched.push(iso3);
    }
    return { visitedIso3: visited, plannedIso3: planned, matchedIso3: matched, perCountry: perCountryStats };
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
          {/* Fill layer — visited countries punch through with a strong
              teal so the visited footprint reads at a glance. Planned
              countries get a quieter slate. Cities-without-status (just
              filter-matched) get a faint cream highlight so the user can
              see the filter results without confusing them with visited. */}
          <Layer
            id="countries-fill"
            type="fill"
            paint={{
              'fill-color': [
                'case',
                ['in', ['get', 'ISO3166-1-Alpha-3'], ['literal', visitedIso3]],
                COLORS.teal,
                ['in', ['get', 'ISO3166-1-Alpha-3'], ['literal', plannedIso3]],
                COLORS.slate,
                ['in', ['get', 'ISO3166-1-Alpha-3'], ['literal', matchedIso3]],
                COLORS.accent,
                'rgba(0,0,0,0)',
              ] as unknown as string,
              'fill-opacity': [
                'case',
                ['==', ['get', 'ISO3166-1-Alpha-3'], hoveredIso],
                0.85,
                ['in', ['get', 'ISO3166-1-Alpha-3'], ['literal', visitedIso3]],
                0.65,
                ['in', ['get', 'ISO3166-1-Alpha-3'], ['literal', plannedIso3]],
                0.32,
                ['in', ['get', 'ISO3166-1-Alpha-3'], ['literal', matchedIso3]],
                0.18,
                0,
              ] as unknown as number,
            }}
          />
          {/* Outline layer — every country gets a faint line so unfilled
              ones still read as shapes. Visited countries get a darker,
              thicker outline so the boundary pops next to neighbours. */}
          <Layer
            id="countries-outline"
            type="line"
            paint={{
              'line-color': [
                'case',
                ['in', ['get', 'ISO3166-1-Alpha-3'], ['literal', visitedIso3]],
                COLORS.teal,
                COLORS.inkDeep,
              ] as unknown as string,
              'line-width': [
                'case',
                ['==', ['get', 'ISO3166-1-Alpha-3'], hoveredIso],
                1.6,
                ['in', ['get', 'ISO3166-1-Alpha-3'], ['literal', visitedIso3]],
                1.0,
                0.4,
              ] as unknown as number,
              'line-opacity': [
                'case',
                ['==', ['get', 'ISO3166-1-Alpha-3'], hoveredIso],
                0.85,
                ['in', ['get', 'ISO3166-1-Alpha-3'], ['literal', visitedIso3]],
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

      {/* === Legend (top-left) === */}
      <div className="absolute top-3 left-3 z-10 bg-white/90 backdrop-blur border border-sand rounded-lg shadow-sm p-2.5 text-[11px] text-slate">
        <div className="flex items-center gap-2 mb-1">
          <span
            className="inline-block w-3 h-3 rounded-sm"
            style={{ background: COLORS.teal, opacity: 0.7 }}
          />
          Visited
        </div>
        <div className="flex items-center gap-2 mb-1">
          <span
            className="inline-block w-3 h-3 rounded-sm"
            style={{ background: COLORS.slate, opacity: 0.4 }}
          />
          Planned
        </div>
        <div className="flex items-center gap-2 mb-1">
          <span
            className="inline-block w-3 h-3 rounded-sm"
            style={{ background: COLORS.accent, opacity: 0.3 }}
          />
          In current filter
        </div>
        <div className="text-muted text-[10px] mt-1.5 pt-1.5 border-t border-sand tabular-nums">
          {visitedIso3.length} visited · {plannedIso3.length} planned
        </div>
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
