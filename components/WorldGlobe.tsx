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

type Pin = {
  id: string;
  name: string;
  slug: string;
  country: string;
  countryFlag: string | null;
  been: boolean;
  go: boolean;
  lat: number;
  lng: number;
  sisterCities: string[];
};

type Projection = 'globe' | 'mercator';

// Pin status drives both the colour and the size of the dot. Encoded as a
// numeric category so MapLibre's circle-color expression can do a simple
// match on the property.
const STATUS_BEEN = 0;
const STATUS_GO = 1;
const STATUS_OTHER = 2;

export default function WorldGlobe({ pins }: { pins: Pin[] }) {
  const router = useRouter();
  const mapRef = useRef<MapRef | null>(null);

  const [projection, setProjection] = useState<Projection>('globe');
  const [hovered, setHovered] = useState<Pin | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Index for O(1) sister-city lookup by id.
  const byId = useMemo(() => {
    const m = new Map<string, Pin>();
    for (const p of pins) m.set(p.id, p);
    return m;
  }, [pins]);

  const selected = selectedId ? byId.get(selectedId) ?? null : null;
  const sisterIds = useMemo(
    () => new Set(selected?.sisterCities ?? []),
    [selected]
  );

  // === GeoJSON sources ===
  // 1) All cities as points; one paint expression styles all of them based
  //    on `status` (Been / Go / Other) and `selected`/`sister` flags.
  const citiesGeoJSON = useMemo(() => {
    return {
      type: 'FeatureCollection' as const,
      features: pins.map(p => {
        const status = p.been ? STATUS_BEEN : p.go ? STATUS_GO : STATUS_OTHER;
        return {
          type: 'Feature' as const,
          id: p.id,
          properties: {
            id: p.id,
            name: p.name,
            slug: p.slug,
            country: p.country,
            status,
            selected: p.id === selectedId,
            sister: sisterIds.has(p.id),
          },
          geometry: {
            type: 'Point' as const,
            coordinates: [p.lng, p.lat],
          },
        };
      }),
    };
  }, [pins, selectedId, sisterIds]);

  // 2) Sister-city connections drawn as great-circle-ish line strings from
  //    the selected city to each sister. We just use straight lat/lng line
  //    segments — MapLibre's globe projection auto-curves them across the
  //    sphere, and on Mercator they read as expected for short hops.
  const linesGeoJSON = useMemo(() => {
    if (!selected) return { type: 'FeatureCollection' as const, features: [] };
    const features = selected.sisterCities
      .map((id: string) => byId.get(id))
      .filter((s): s is Pin => Boolean(s))
      .map((s: Pin) => ({
        type: 'Feature' as const,
        properties: {},
        geometry: {
          type: 'LineString' as const,
          coordinates: [
            [selected.lng, selected.lat],
            [s.lng, s.lat],
          ],
        },
      }));
    return { type: 'FeatureCollection' as const, features };
  }, [selected, byId]);

  // === Click + hover handling ===
  // We listen at the map level, then check what feature was hit. interactiveLayerIds
  // narrows hits to our city circles so empty-map clicks deselect.
  const handleClick = useCallback(
    (e: MapMouseEvent) => {
      const feat = e.features?.[0];
      if (!feat || feat.layer.id !== 'cities-layer') {
        setSelectedId(null);
        return;
      }
      const id = feat.properties?.id as string | undefined;
      if (!id) return;
      // Single click selects (and reveals sisters); double-click navigates.
      setSelectedId(prev => (prev === id ? null : id));
    },
    []
  );

  const handleDoubleClick = useCallback(
    (e: MapMouseEvent) => {
      const feat = e.features?.[0];
      if (!feat || feat.layer.id !== 'cities-layer') return;
      const slug = feat.properties?.slug as string | undefined;
      if (slug) router.push(`/cities/${slug}`);
    },
    [router]
  );

  const handleMouseMove = useCallback(
    (e: MapMouseEvent) => {
      const feat = e.features?.[0];
      if (feat && feat.layer.id === 'cities-layer') {
        const id = feat.properties?.id as string | undefined;
        if (id) {
          const p = byId.get(id);
          if (p && p.id !== hovered?.id) setHovered(p);
        }
      } else if (hovered) {
        setHovered(null);
      }
    },
    [byId, hovered]
  );

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
        interactiveLayerIds={['cities-layer']}
        onClick={handleClick}
        onDblClick={handleDoubleClick}
        onMouseMove={handleMouseMove}
      >
        {/* Sister-city connection lines — rendered first so pins sit above */}
        <Source id="connections" type="geojson" data={linesGeoJSON}>
          <Layer
            id="connections-layer"
            type="line"
            paint={{
              'line-color': COLORS.accent,
              'line-width': 1.5,
              'line-opacity': 0.55,
              'line-dasharray': [2, 2],
            }}
          />
        </Source>

        {/* All cities — single layer, expression-driven styling */}
        <Source id="cities" type="geojson" data={citiesGeoJSON}>
          <Layer
            id="cities-layer"
            type="circle"
            paint={{
              // Outer halo via stroke
              'circle-radius': [
                'case',
                ['boolean', ['get', 'selected'], false],
                9,
                ['boolean', ['get', 'sister'], false],
                7,
                ['match', ['get', 'status'], STATUS_BEEN, 5, STATUS_GO, 5, 3],
              ],
              'circle-color': [
                'case',
                ['boolean', ['get', 'selected'], false],
                COLORS.inkDeep,
                ['boolean', ['get', 'sister'], false],
                COLORS.accent,
                [
                  'match',
                  ['get', 'status'],
                  STATUS_BEEN,
                  COLORS.teal,
                  STATUS_GO,
                  COLORS.slate,
                  COLORS.pinIdle,
                ],
              ],
              'circle-stroke-color': COLORS.white,
              'circle-stroke-width': [
                'case',
                ['boolean', ['get', 'selected'], false],
                2.5,
                ['boolean', ['get', 'sister'], false],
                2,
                1,
              ],
              'circle-opacity': [
                'case',
                ['boolean', ['get', 'selected'], false],
                1,
                ['boolean', ['get', 'sister'], false],
                1,
                [
                  'match',
                  ['get', 'status'],
                  STATUS_BEEN,
                  1,
                  STATUS_GO,
                  1,
                  // Other cities are de-emphasised so Been/Go visually pop;
                  // they still show on the globe as tiny dots.
                  0.55,
                ],
              ],
            }}
          />
        </Source>

        {/* Hover popup */}
        {hovered && (
          <Popup
            longitude={hovered.lng}
            latitude={hovered.lat}
            closeButton={false}
            closeOnClick={false}
            anchor="bottom"
            offset={14}
            className="!p-0"
          >
            <div className="flex items-center gap-2 px-2.5 py-1.5">
              {hovered.countryFlag && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={hovered.countryFlag}
                  alt=""
                  className="w-4 h-auto rounded-sm border border-sand"
                />
              )}
              <div>
                <div className="text-ink-deep font-medium leading-tight text-small">
                  {hovered.name}
                </div>
                <div className="text-muted text-[10px] leading-tight">{hovered.country}</div>
              </div>
            </div>
          </Popup>
        )}

        <NavigationControl position="bottom-left" showCompass={projection === 'globe'} />
      </MapView>

      {/* === Selected-city info card === floating top-left when a pin is
          selected. Shows where you've drilled to + sister count + a CTA to
          open the postcard detail. Replaces the old All/Been/Go filter chips
          since with all cities visible the chips were less essential. */}
      {selected && (
        <div className="absolute top-3 left-3 z-10 max-w-xs">
          <div className="bg-white border border-sand rounded-lg shadow-lg p-3">
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className="text-ink-deep font-semibold leading-tight truncate">
                  {selected.name}
                </div>
                <div className="text-muted text-small leading-tight truncate">
                  {selected.country}
                </div>
                <div className="text-[11px] text-slate mt-1">
                  {selected.sisterCities.length === 0
                    ? 'No sister cities recorded'
                    : `${selected.sisterCities.length} sister cit${selected.sisterCities.length === 1 ? 'y' : 'ies'} highlighted`}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                aria-label="Clear selection"
                className="text-muted hover:text-ink-deep -mr-1 -mt-1 p-1"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <button
              type="button"
              onClick={() => router.push(`/cities/${selected.slug}`)}
              className="mt-2 w-full px-3 py-1.5 rounded-md bg-ink-deep text-cream-soft text-small font-medium hover:bg-ink transition-colors"
            >
              Open postcard →
            </button>
          </div>
        </div>
      )}

      {/* Legend — compact pin-color key, only shown when nothing is selected */}
      {!selected && (
        <div className="absolute top-3 left-3 z-10 bg-white/90 backdrop-blur border border-sand rounded-lg shadow-sm p-2.5 text-[11px] text-slate">
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-teal" />
            Been
          </div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-slate" />
            Want to go
          </div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: COLORS.pinIdle }} />
            Sister-city network
          </div>
          <div className="text-muted text-[10px] mt-1.5 pt-1.5 border-t border-sand">
            Click a pin to see its sister cities
          </div>
        </div>
      )}

      {/* Projection toggle — top-right */}
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
