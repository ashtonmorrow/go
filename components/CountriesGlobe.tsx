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

type Props = {
  // Set of ISO 3166-1 alpha-3 codes for countries with at least one Been city.
  visitedIso3: string[];
  // Set of ISO3s for countries with Go cities but no Been (i.e. only planned).
  plannedIso3: string[];
  // Map ISO3 → { name, slug } so click → navigate to /countries/<slug>.
  iso3Map: Record<string, { name: string; slug: string; beenCount: number; cityCount: number }>;
};

type Projection = 'globe' | 'mercator';

// Public-domain Natural-Earth-derived country boundaries hosted by datasets/
// geo-countries on GitHub, served through jsDelivr. Single ~250 KB file,
// covers every UN country with ISO_A3 properties — small enough to ship as
// a runtime fetch instead of bundling. License: PDDL 1.0.
const COUNTRY_GEOJSON = 'https://cdn.jsdelivr.net/gh/datasets/geo-countries@master/data/countries.geojson';

export default function CountriesGlobe({ visitedIso3, plannedIso3, iso3Map }: Props) {
  const router = useRouter();
  const mapRef = useRef<MapRef | null>(null);

  const [projection, setProjection] = useState<Projection>('globe');
  const [hovered, setHovered] = useState<{
    iso3: string;
    lng: number;
    lat: number;
  } | null>(null);

  // Pre-build the paint expressions for the country fill / outline layers.
  // MapLibre's expression types are union-of-tuples and don't infer cleanly
  // from `useMemo` builders, so the result is cast through `any` at the
  // callsite. The actual structure is straightforward: case → in →
  // literal-array of ISO3 strings.
  const hoveredIso = hovered?.iso3 ?? '__none__';
  const visitedSet = useMemo(() => visitedIso3, [visitedIso3]);
  const plannedSet = useMemo(() => plannedIso3, [plannedIso3]);

  // === Click + hover ===
  // queryRenderedFeatures hits the country fill layer; navigate on click,
  // track ISO3 + cursor lat/lng on hover for the popup.
  const handleClick = useCallback(
    (e: MapMouseEvent) => {
      const feat = e.features?.[0];
      if (!feat) return;
      const iso3 = feat.properties?.ISO_A3 as string | undefined;
      if (!iso3) return;
      const entry = iso3Map[iso3];
      if (entry) router.push(`/countries/${entry.slug}`);
    },
    [iso3Map, router]
  );

  const handleMouseMove = useCallback((e: MapMouseEvent) => {
    const feat = e.features?.[0];
    if (feat) {
      const iso3 = feat.properties?.ISO_A3 as string | undefined;
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
          {/* Fill — visited gets teal at moderate opacity, planned gets
              slate, everything else is transparent so the basemap shows.
              MapLibre expression types don't infer cleanly through React's
              JSX prop checking, hence the `as any` casts. */}
          <Layer
            id="countries-fill"
            type="fill"
            paint={{
              'fill-color': [
                'case',
                ['in', ['get', 'ISO_A3'], ['literal', visitedSet]],
                COLORS.teal,
                ['in', ['get', 'ISO_A3'], ['literal', plannedSet]],
                COLORS.slate,
                'rgba(0,0,0,0)',
              ] as unknown as string,
              'fill-opacity': [
                'case',
                ['==', ['get', 'ISO_A3'], hoveredIso],
                0.65,
                ['in', ['get', 'ISO_A3'], ['literal', visitedSet]],
                0.45,
                ['in', ['get', 'ISO_A3'], ['literal', plannedSet]],
                0.22,
                0,
              ] as unknown as number,
            }}
          />
          {/* Subtle outline on every country so unvisited ones still read as
              shapes against the basemap; thicker outline on the hovered one. */}
          <Layer
            id="countries-outline"
            type="line"
            paint={{
              'line-color': COLORS.inkDeep,
              'line-width': [
                'case',
                ['==', ['get', 'ISO_A3'], hoveredIso],
                1.4,
                0.4,
              ] as unknown as number,
              'line-opacity': [
                'case',
                ['==', ['get', 'ISO_A3'], hoveredIso],
                0.7,
                0.25,
              ] as unknown as number,
            }}
          />
        </Source>

        {/* Hover popup — name + visited/total cities */}
        {hovered && iso3Map[hovered.iso3] && (
          <Popup
            longitude={hovered.lng}
            latitude={hovered.lat}
            closeButton={false}
            closeOnClick={false}
            anchor="top"
            offset={12}
            className="!p-0"
          >
            <div className="px-2.5 py-1.5">
              <div className="text-ink-deep font-medium leading-tight text-small">
                {iso3Map[hovered.iso3].name}
              </div>
              <div className="text-muted text-[10px] leading-tight tabular-nums">
                {iso3Map[hovered.iso3].beenCount > 0
                  ? `${iso3Map[hovered.iso3].beenCount} of ${iso3Map[hovered.iso3].cityCount} cities visited`
                  : iso3Map[hovered.iso3].cityCount > 0
                    ? `${iso3Map[hovered.iso3].cityCount} cities · planning`
                    : 'Not visited'}
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
            style={{ background: COLORS.teal, opacity: 0.5 }}
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
        <div className="text-muted text-[10px] mt-1.5 pt-1.5 border-t border-sand">
          Click any country to open its page
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
