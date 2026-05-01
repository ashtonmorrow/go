'use client';

import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
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
import { useCityFilters } from './CityFiltersContext';
import { applyLayerVisibility, cityLayer, filterCities, layerCounts as countLayers, sortCities } from '@/lib/cityFilter';
import { COLORS } from '@/lib/colors';
import ActiveFilters from './ActiveFilters';

// Pin shape consumed by the globe. Now carries the same practicality
// fields as the rest of the city pipeline so the cockpit can filter on
// them. lat/lng/sisterCities are the additions on top of the standard
// City shape — required for the map to render and draw connections.
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

  // Filter axes — all optional, all matched by lib/cityFilter.ts
  continent?: string | null;
  koppen?: string | null;
  currency?: string | null;
  language?: string | null;
  founded?: string | null;
  visa?: string | null;
  tapWater?: string | null;
  driveSide?: 'L' | 'R' | null;
  savedPlaces?: string | null;
  population?: number | null;
  elevation?: number | null;
  avgHigh?: number | null;
  avgLow?: number | null;
  rainfall?: number | null;
};

type Projection = 'globe' | 'mercator';

// Pin layer drives both the colour and the size of the dot. Encoded as
// a numeric category so MapLibre's circle-color expression can do a
// simple match on the property. Layer keys mirror lib/cityFilter's
// CityLayer union: been > go > other (3 mutually-exclusive statuses).
// Saved-places is rendered as a separate gold-ring OVERLAY on top of
// the layer color, since it's an orthogonal signal — a Been city can
// also have saved places.
// Numeric encoding of CityLayer for MapLibre's match expressions.
const LAYER_VISITED     = 0;
const LAYER_PLANNING    = 1;
const LAYER_RESEARCHING = 2;

export default function WorldGlobe({ pins }: { pins: Pin[] }) {
  const router = useRouter();
  const mapRef = useRef<MapRef | null>(null);
  const ctx = useCityFilters();

  const [projection, setProjection] = useState<Projection>('globe');
  const [hovered, setHovered] = useState<Pin | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Pipeline: facets → layer visibility → sort. The byId index below
  // still includes every pin (so sister-graph lookups work even when a
  // sister is currently hidden — its line draws to the sister's coords
  // regardless). narrowed is the post-facet, pre-visibility set, used to
  // feed layer counts back to the sidebar.
  const narrowed = useMemo(() => {
    const state = ctx?.state;
    return state ? filterCities(pins, state) : pins;
  }, [pins, ctx?.state]);

  const visible = useMemo(() => {
    const state = ctx?.state;
    if (!state) return narrowed;
    return sortCities(applyLayerVisibility(narrowed, state), state);
  }, [narrowed, ctx?.state]);

  // Push counts + per-layer counts to the cockpit footer.
  useEffect(() => {
    ctx?.setCounts(visible.length, pins.length);
  }, [ctx, visible.length, pins.length]);

  useEffect(() => {
    ctx?.setLayerCounts(countLayers(narrowed));
  }, [ctx, narrowed]);

  // Index for O(1) sister-city lookup by id — over the full set so
  // selecting a visible city reveals lines to all its sisters, including
  // ones currently hidden by the filter.
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
  // 1) Visible cities as points (the filtered + layer-visible set) — one
  //    paint expression styles all of them based on `layer` (Been / Go /
  //    Other) and the `selected`/`sister` flags. `saved` is a boolean
  //    property used by a separate overlay layer that draws a gold ring
  //    around any saved-places city.
  const citiesGeoJSON = useMemo(() => {
    return {
      type: 'FeatureCollection' as const,
      features: visible.map(p => {
        const layer = cityLayer(p);
        const layerKey =
          layer === 'visited' ? LAYER_VISITED
            : layer === 'planning' ? LAYER_PLANNING
            : LAYER_RESEARCHING;
        return {
          type: 'Feature' as const,
          id: p.id,
          properties: {
            id: p.id,
            name: p.name,
            slug: p.slug,
            country: p.country,
            layer: layerKey,
            saved: !!p.savedPlaces,
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
  }, [visible, selectedId, sisterIds]);

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
              // Outer halo via stroke. Other is smaller than Been/Go so the
              // high-signal layers visually pop. Selected/sister overrides.
              'circle-radius': [
                'case',
                ['boolean', ['get', 'selected'], false],
                9,
                ['boolean', ['get', 'sister'], false],
                7,
                ['match', ['get', 'layer'], LAYER_VISITED, 5, LAYER_PLANNING, 5, 3],
              ],
              'circle-color': [
                'case',
                ['boolean', ['get', 'selected'], false],
                COLORS.inkDeep,
                ['boolean', ['get', 'sister'], false],
                COLORS.accent,
                [
                  'match',
                  ['get', 'layer'],
                  LAYER_VISITED,
                  COLORS.teal,
                  LAYER_PLANNING,
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
                  ['get', 'layer'],
                  LAYER_VISITED, 1,
                  LAYER_PLANNING,   1,
                  // Other cities are de-emphasised so Been/Go visually pop;
                  // they still show on the globe as small dots so the user
                  // sees the full atlas density.
                  0.55,
                ],
              ],
            }}
          />
          {/* Saved-places overlay — gold ring drawn around any city with
              saved annotations, regardless of its status layer. This is
              the orthogonal-overlay treatment: a Been city with saved
              places reads as "teal dot inside gold ring," carrying both
              signals at once. Filtered to only saved cities via the
              expression so it doesn't overdraw the rest. */}
          <Layer
            id="cities-saved-overlay"
            type="circle"
            filter={['boolean', ['get', 'saved'], false]}
            paint={{
              'circle-radius': [
                'case',
                ['boolean', ['get', 'selected'], false],
                12,
                ['boolean', ['get', 'sister'], false],
                10,
                ['match', ['get', 'layer'], LAYER_VISITED, 8, LAYER_PLANNING, 8, 6],
              ],
              'circle-color': 'transparent',
              'circle-stroke-color': COLORS.accent,
              'circle-stroke-width': 1.5,
              'circle-stroke-opacity': 0.85,
              // Always visible, but pull the opacity down on hidden-layer
              // dots so we don't see floating rings with no centre.
              'circle-opacity': 0,
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
                <div className="text-muted text-micro leading-tight">{hovered.country}</div>
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
                <div className="text-label text-slate mt-1">
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

      {/* Legend — compact pin-color key, only shown when nothing is selected.
          Mirrors the LAYERS in the sidebar cockpit so the user can map any
          on-map color back to its toggle. Layers the user has hidden are
          rendered greyed out in the legend so the key still reads as
          complete but tells the truth about what's currently shown. The
          gold ring is a separate row for the orthogonal saved-places
          overlay, not a status — explicitly labelled as "ring" so users
          read it as overlay rather than another color. */}
      {!selected && (
        <div className="absolute top-3 left-3 z-10 bg-white/90 backdrop-blur border border-sand rounded-lg shadow-sm p-2.5 text-label text-slate">
          <LegendRow
            on={ctx?.state.statusFocus == null || ctx.state.statusFocus === 'visited'}
            color={COLORS.teal}    label="Visited" />
          <LegendRow
            on={ctx?.state.statusFocus == null || ctx.state.statusFocus === 'planning'}
            color={COLORS.slate}   label="Planning" />
          <LegendRow
            on={ctx?.state.statusFocus == null || ctx.state.statusFocus === 'researching'}
            color={COLORS.pinIdle} label="Researching" small />
          <div className="flex items-center gap-2 mb-1 mt-1 pt-1.5 border-t border-sand">
            <span
              aria-hidden
              className="inline-block w-3 h-3 rounded-full bg-transparent"
              style={{ border: `1.5px solid ${COLORS.accent}` }}
            />
            <span>Saved places (ring)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-0.5" style={{ background: COLORS.accent, opacity: 0.5 }} />
            <span>Sister-city link</span>
          </div>
          <div className="text-muted text-micro mt-1.5">
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

      {/* Active-filter chip ribbon — floats top-center on the map. Hidden
          when no facets are active, so the map stays clean by default. */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 max-w-[60vw]">
        <div className="bg-white/90 backdrop-blur border border-sand rounded-md shadow-sm px-2 py-1 empty:hidden">
          <ActiveFilters />
        </div>
      </div>

      {/* View switcher lives at the page level (app/cities/map/page.tsx). */}
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

// One row of the floating legend — color swatch + label, dimmed when the
// corresponding layer is currently hidden in the sidebar cockpit.
function LegendRow({
  on,
  color,
  label,
  small = false,
}: {
  on: boolean;
  color: string;
  label: string;
  small?: boolean;
}) {
  const size = small ? 'w-1.5 h-1.5' : 'w-2.5 h-2.5';
  return (
    <div className={'flex items-center gap-2 mb-1 ' + (on ? '' : 'opacity-40 line-through')}>
      <span className={'inline-block rounded-full ' + size} style={{ background: color }} />
      <span>{label}</span>
    </div>
  );
}
