'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Map as MapView,
  Source,
  Layer,
  type MapMouseEvent,
} from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { COLORS } from '@/lib/colors';

// === HomeGlobe ==============================================================
// Full-bleed 3D globe for the home page. A stripped-down sibling of
// CountriesGlobe: no filter cockpit, no hover popup, no controls
// overlay — just the globe with visited countries shaded teal, click
// any country to open its detail page. The home is where the visual
// answer to "where has Mike been?" lives; CountriesGlobe at
// /countries/map is the version with the filter cockpit and the
// interactive tile.
//
// Country matching uses both ISO3166-1-Alpha-3 (the canonical field on
// the GeoJSON) and feature.name (a fallback for the handful of
// disputed features the Natural-Earth-derived dataset leaves as
// iso3='-99', most notably France, Norway, Kosovo). Same dual-lookup
// CountriesGlobe uses.

type CountryRow = {
  name: string;
  slug: string;
  iso3: string | null;
};

type Props = {
  /** Lowercased names of countries Mike has visited at least once.
   *  Computed server-side from pins where visited=true. */
  visitedCountryNames: Set<string>;
  /** Every country in the atlas. Used to build the ISO3-based fill
   *  expression and the click-to-navigate lookup. */
  countries: CountryRow[];
};

const COUNTRY_GEOJSON =
  'https://cdn.jsdelivr.net/gh/datasets/geo-countries@master/data/countries.geojson';

export default function HomeGlobe({ visitedCountryNames, countries }: Props) {
  const router = useRouter();
  const [hoveredIso3, setHoveredIso3] = useState<string | null>(null);

  // Build visited ISO3 + name arrays for the MapLibre fill expression.
  // ISO3 covers most countries; the name fallback catches France /
  // Norway / Kosovo (iso3='-99' in Natural Earth) the same way
  // CountriesGlobe does.
  const { visitedIso3, visitedNames, nameToSlug, iso3ToSlug, nameToIso3 } =
    useMemo(() => {
      const visitedIso3: string[] = [];
      const visitedNames: string[] = [];
      const nameToSlug: Record<string, string> = {};
      const iso3ToSlug: Record<string, string> = {};
      const nameToIso3: Record<string, string> = {};
      for (const c of countries) {
        if (c.iso3) iso3ToSlug[c.iso3] = c.slug;
        nameToSlug[c.name] = c.slug;
        if (c.iso3) nameToIso3[c.name] = c.iso3;
        if (visitedCountryNames.has(c.name.toLowerCase())) {
          if (c.iso3) visitedIso3.push(c.iso3);
          visitedNames.push(c.name);
        }
      }
      return { visitedIso3, visitedNames, nameToSlug, iso3ToSlug, nameToIso3 };
    }, [countries, visitedCountryNames]);

  // Resolve a GeoJSON feature to a real ISO3, falling through to a
  // name lookup when the source has iso3='-99'.
  const resolveIso3 = useCallback(
    (feat: { properties?: Record<string, unknown> | null } | undefined): string | null => {
      const raw = feat?.properties?.['ISO3166-1-Alpha-3'] as string | undefined;
      if (raw && raw !== '-99') return raw;
      const name = feat?.properties?.['name'] as string | undefined;
      if (name && nameToIso3[name]) return nameToIso3[name];
      return null;
    },
    [nameToIso3],
  );

  const handleClick = useCallback(
    (e: MapMouseEvent) => {
      const feat = e.features?.[0];
      const iso3 = resolveIso3(feat);
      if (!iso3) return;
      const slug = iso3ToSlug[iso3];
      if (slug) router.push(`/countries/${slug}`);
    },
    [resolveIso3, iso3ToSlug, router],
  );

  const handleMouseMove = useCallback(
    (e: MapMouseEvent) => {
      const feat = e.features?.[0];
      const iso3 = resolveIso3(feat);
      setHoveredIso3(iso3);
    },
    [resolveIso3],
  );

  const handleMouseLeave = useCallback(() => setHoveredIso3(null), []);

  const hoveredName = hoveredIso3
    ? countries.find(c => c.iso3 === hoveredIso3)?.name ?? '__none__'
    : '__none__';
  const hoveredIsoOrNone = hoveredIso3 ?? '__none__';

  return (
    <MapView
      mapStyle="https://tiles.openfreemap.org/styles/positron"
      initialViewState={{ longitude: 10, latitude: 30, zoom: 1.4 }}
      projection={{ type: 'globe' }}
      attributionControl={false}
      style={{ width: '100%', height: '100%', cursor: hoveredIso3 ? 'pointer' : 'grab' }}
      dragRotate
      touchPitch
      interactiveLayerIds={['countries-fill']}
      onClick={handleClick}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <Source id="countries" type="geojson" data={COUNTRY_GEOJSON}>
        <Layer
          id="countries-fill"
          type="fill"
          paint={{
            'fill-color': [
              'case',
              [
                'any',
                ['in', ['get', 'ISO3166-1-Alpha-3'], ['literal', visitedIso3]],
                ['in', ['get', 'name'], ['literal', visitedNames]],
              ],
              COLORS.teal,
              'transparent',
            ] as unknown as string,
            'fill-opacity': [
              'case',
              [
                'any',
                ['==', ['get', 'ISO3166-1-Alpha-3'], hoveredIsoOrNone],
                ['==', ['get', 'name'], hoveredName],
              ],
              0.85,
              [
                'any',
                ['in', ['get', 'ISO3166-1-Alpha-3'], ['literal', visitedIso3]],
                ['in', ['get', 'name'], ['literal', visitedNames]],
              ],
              0.6,
              0,
            ] as unknown as number,
          }}
        />
        <Layer
          id="countries-outline"
          type="line"
          paint={{
            'line-color': COLORS.inkDeep,
            'line-width': [
              'case',
              [
                'any',
                ['==', ['get', 'ISO3166-1-Alpha-3'], hoveredIsoOrNone],
                ['==', ['get', 'name'], hoveredName],
              ],
              1.4,
              0.4,
            ] as unknown as number,
            'line-opacity': [
              'case',
              [
                'any',
                ['==', ['get', 'ISO3166-1-Alpha-3'], hoveredIsoOrNone],
                ['==', ['get', 'name'], hoveredName],
              ],
              0.7,
              0.18,
            ] as unknown as number,
          }}
        />
      </Source>
    </MapView>
  );
}
