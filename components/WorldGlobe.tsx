'use client';

import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
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
import { useCityFilters, type KoppenGroup } from './CityFiltersContext';
import { applyLayerVisibility, cityLayer, filterCities, layerCounts as countLayers, sortCities } from '@/lib/cityFilter';
import { COLORS } from '@/lib/colors';
import ActiveFilters from './ActiveFilters';
import KoppenIcon from './KoppenIcon';

/** Compact population formatter — "1.2M", "640K", "23K", "5,200" — sized to
 *  fit the narrow popup without overflowing. Uses Intl when available. */
function formatPopulation(n: number | null | undefined): string | null {
  if (n == null || !Number.isFinite(n) || n <= 0) return null;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1_000)}K`;
  return new Intl.NumberFormat('en-US').format(n);
}

/** Bucket a city's population into one of four size tiers and return the
 *  filter range that defines that tier. Used by the population chip in the
 *  hover popup so clicking "693K" snaps the cockpit's population filter to
 *  "Mid-size" cities (100K – 1M), revealing similar-sized peers on the map. */
type PopTier = {
  /** Stable id we use to detect "is this tier currently active?" */
  id: 'small' | 'mid' | 'large' | 'mega';
  label: string;
  min: number;
  max: number | null;
};
const POP_TIERS: PopTier[] = [
  { id: 'small', label: 'Small (<100K)',   min: 0,          max: 100_000 },
  { id: 'mid',   label: 'Mid (100K–1M)',   min: 100_000,    max: 1_000_000 },
  { id: 'large', label: 'Large (1M–10M)',  min: 1_000_000,  max: 10_000_000 },
  { id: 'mega',  label: 'Megacity (>10M)', min: 10_000_000, max: null },
];
function tierForPop(n: number): PopTier {
  for (const t of POP_TIERS) {
    if (n >= t.min && (t.max == null || n < t.max)) return t;
  }
  return POP_TIERS[POP_TIERS.length - 1];
}

// Pin shape consumed by the globe. Now carries the same practicality
// fields as the rest of the city pipeline so the cockpit can filter on
// them. lat/lng/sisterCities are the additions on top of the standard
// City shape — required for the map to render and draw connections.
type Pin = {
  id: string;
  name: string;
  slug: string;
  country: string;
  /** Country slug for routing to /countries/[slug] from the hover card. */
  countrySlug: string | null;
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

  // === Sticky-popup grace timer ============================================
  // Hover opens the popup. Moving the cursor off the pin schedules a close
  // 220ms later — long enough to slide the cursor onto the popup itself.
  // The popup's wrapper cancels the timer on mouseenter so it stays open
  // while the user reads the climate/population row or clicks a button.
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelClose = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);
  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimerRef.current = setTimeout(() => setHovered(null), 220);
  }, [cancelClose]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  const handleMouseMove = useCallback(
    (e: MapMouseEvent) => {
      const feat = e.features?.[0];
      if (feat && feat.layer.id === 'cities-layer') {
        const id = feat.properties?.id as string | undefined;
        if (id) {
          const p = byId.get(id);
          if (p && p.id !== hovered?.id) {
            cancelClose();
            setHovered(p);
          } else if (p) {
            // Re-entered the same pin — cancel any pending close.
            cancelClose();
          }
        }
      } else if (hovered) {
        // Cursor left all pins. Schedule a close, but let the popup cancel
        // it if the cursor moves into the popup body itself.
        scheduleClose();
      }
    },
    [byId, hovered, cancelClose, scheduleClose]
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

        {/* === Hover popup (interactive) =====================================
            Sticky: opens on pin hover, stays open while the cursor is in the
            popup body. Shows climate icon, population, an optional saved-
            places link (matching the gold-ring overlay), and a "Sister
            cities" button that takes over the highlight trigger from the
            legend. The whole popup is one mouse-region — onMouseEnter
            cancels the pending close, onMouseLeave starts a fresh timer. */}
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
            <div
              onMouseEnter={cancelClose}
              onMouseLeave={scheduleClose}
              className="min-w-[240px] max-w-[280px] p-3.5 text-small text-ink"
            >
              {/* Header — flag links to country detail, city name links to
                  city detail. The flag's wrapping anchor is sized to the flag
                  so it has a clear hit-target without expanding into the rest
                  of the row. Both names get hover-color affordance so it's
                  visible they're links. */}
              <div className="flex items-start gap-2">
                {hovered.countryFlag && (
                  hovered.countrySlug ? (
                    <Link
                      href={`/countries/${hovered.countrySlug}`}
                      className="flex-shrink-0 mt-0.5 group/flag"
                      title={`Open ${hovered.country}`}
                      aria-label={`Open ${hovered.country}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={hovered.countryFlag}
                        alt=""
                        className="w-5 h-auto rounded-sm border border-sand transition-all group-hover/flag:border-teal group-hover/flag:ring-2 group-hover/flag:ring-teal/20"
                      />
                    </Link>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={hovered.countryFlag}
                      alt=""
                      className="w-5 h-auto rounded-sm border border-sand mt-0.5 flex-shrink-0"
                    />
                  )
                )}
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/cities/${hovered.slug}`}
                    className="block text-ink-deep font-semibold leading-tight hover:text-teal transition-colors truncate"
                  >
                    {hovered.name}
                  </Link>
                  {hovered.countrySlug ? (
                    <Link
                      href={`/countries/${hovered.countrySlug}`}
                      className="block text-muted text-micro leading-tight truncate hover:text-ink-deep transition-colors"
                    >
                      {hovered.country}
                    </Link>
                  ) : (
                    <div className="text-muted text-micro leading-tight truncate">
                      {hovered.country}
                    </div>
                  )}
                </div>
              </div>

              {/* Facts strip — both climate and population are clickable
                  chips that toggle filters in the city filter cockpit so the
                  user can find peer cities. Climate filters by koppen group
                  (A Tropical / B Arid / C Temperate / D Continental / E Polar);
                  population snaps to the appropriate size tier (Small / Mid /
                  Large / Megacity). Climate is icon-only (matches the small-
                  chip pattern in the navigation cockpit); population shows the
                  formatted number since the number is the data the user
                  actually wants to see. */}
              {(hovered.koppen || hovered.population) && (
                <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
                  {hovered.koppen && (() => {
                    const firstChar = hovered.koppen[0]?.toUpperCase();
                    const isKoppenGroup = (c: string | undefined): c is KoppenGroup =>
                      c === 'A' || c === 'B' || c === 'C' || c === 'D' || c === 'E';
                    if (!isKoppenGroup(firstChar)) return null;
                    const groupCode: KoppenGroup = firstChar;
                    const isActive = !!ctx?.state.koppenGroups?.has(groupCode);
                    return (
                      <button
                        type="button"
                        onClick={() => {
                          if (!ctx) return;
                          ctx.setState((s) => {
                            const next = new Set(s.koppenGroups);
                            if (next.has(groupCode)) next.delete(groupCode);
                            else next.add(groupCode);
                            return { ...s, koppenGroups: next };
                          });
                        }}
                        className={
                          'inline-flex items-center justify-center w-6 h-6 rounded-full transition-colors border ' +
                          (isActive
                            ? 'bg-teal/10 text-ink-deep border-teal/40'
                            : 'bg-cream-soft text-slate border-sand hover:border-slate hover:text-ink-deep')
                        }
                        aria-label={
                          isActive
                            ? 'Clear climate filter'
                            : 'Show similar-climate cities'
                        }
                        title={
                          isActive
                            ? 'Click to clear climate filter'
                            : 'Show similar-climate cities'
                        }
                      >
                        <KoppenIcon code={hovered.koppen} size={13} />
                      </button>
                    );
                  })()}
                  {(() => {
                    const popLabel = formatPopulation(hovered.population);
                    if (!popLabel || hovered.population == null) return null;
                    const tier = tierForPop(hovered.population);
                    // "Active" when the cockpit's range matches this tier's
                    // bounds — lets the chip read pressed/unpressed correctly
                    // even when the user gets here via a different entry point.
                    const isActive =
                      ctx?.state.populationMin === tier.min &&
                      (ctx?.state.populationMax ?? null) === tier.max;
                    return (
                      <button
                        type="button"
                        onClick={() => {
                          if (!ctx) return;
                          ctx.setState((s) => {
                            // Toggle: clicking an already-active tier clears it.
                            if (isActive) {
                              return { ...s, populationMin: null, populationMax: null };
                            }
                            return {
                              ...s,
                              populationMin: tier.min,
                              populationMax: tier.max,
                            };
                          });
                        }}
                        className={
                          'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-label transition-colors border ' +
                          (isActive
                            ? 'bg-teal/10 text-ink-deep border-teal/40'
                            : 'bg-cream-soft text-slate border-sand hover:border-slate hover:text-ink-deep')
                        }
                        aria-label={
                          isActive
                            ? `Clear ${tier.label} filter`
                            : `Show ${tier.label} cities`
                        }
                        title={
                          isActive
                            ? `Click to clear ${tier.label} filter`
                            : `Show ${tier.label} cities`
                        }
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                          <circle cx="9" cy="7" r="4" />
                          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                        </svg>
                        <span className="tabular-nums">{popLabel}</span>
                      </button>
                    );
                  })()}
                </div>
              )}

              {/* Saved-places link — shown when this city has a Google saved-
                  places URL (the gold-ring overlay). External link, opens in
                  a new tab so the map state survives. */}
              {hovered.savedPlaces && (
                <a
                  href={hovered.savedPlaces}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1.5 text-label font-medium text-accent hover:text-accent/80 transition-colors"
                >
                  <span
                    aria-hidden
                    className="inline-block w-2.5 h-2.5 rounded-full bg-transparent flex-shrink-0"
                    style={{ border: `1.5px solid ${COLORS.accent}` }}
                  />
                  Saved places
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M7 17 17 7" />
                    <path d="M7 7h10v10" />
                  </svg>
                </a>
              )}

              {/* Action buttons — sister-cities trigger now lives here, not in
                  the legend. Clicking promotes the hovered city to selectedId,
                  which draws the dashed connection lines + golden sister rings.
                  Disabled when there are no sisters to highlight, so users get
                  feedback instead of a silent click. */}
              <div className="mt-3 flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    if (hovered.sisterCities.length === 0) return;
                    // Toggle: clicking on a highlighted city clears the
                    // dashed-line overlay; clicking on a different city
                    // switches to it.
                    setSelectedId(prev =>
                      prev === hovered.id ? null : hovered.id,
                    );
                  }}
                  disabled={hovered.sisterCities.length === 0}
                  className={
                    'flex-1 px-2.5 py-1.5 rounded-md text-label font-medium transition-colors ' +
                    (hovered.sisterCities.length === 0
                      ? 'bg-cream-soft text-muted cursor-not-allowed'
                      : selectedId === hovered.id
                        ? 'bg-accent/15 text-ink-deep border border-accent/40'
                        : 'bg-ink-deep text-cream-soft hover:bg-ink')
                  }
                  title={
                    hovered.sisterCities.length === 0
                      ? 'No sister cities recorded'
                      : selectedId === hovered.id
                        ? 'Click to clear highlight'
                        : 'Sister cities'
                  }
                >
                  Sister cities
                </button>
                <Link
                  href={`/cities/${hovered.slug}`}
                  className="px-2.5 py-1.5 rounded-md text-label font-medium text-ink-deep border border-sand hover:border-slate transition-colors"
                  title="Open postcard"
                >
                  Open →
                </Link>
              </div>
            </div>
          </Popup>
        )}

        <NavigationControl position="bottom-left" showCompass={projection === 'globe'} />
      </MapView>

      {/* === Selection clear pill === floats top-left when a sister-city
          highlight is active, so the user can dismiss the dashed-line overlay
          without having to find the originating pin again. The richer city
          info (name, climate, population, "Open postcard") moved into the
          hover popup itself, so this pill is intentionally minimal. */}
      {selected && (
        <div className="absolute top-3 left-3 z-10">
          <button
            type="button"
            onClick={() => setSelectedId(null)}
            className="bg-white/95 backdrop-blur border border-sand rounded-full shadow-sm pl-3 pr-2 py-1.5 text-label text-ink hover:border-slate transition-colors inline-flex items-center gap-2"
            aria-label={`Clear sister-city highlight on ${selected.name}`}
          >
            <span className="text-muted">Highlighting</span>
            <span className="font-medium text-ink-deep truncate max-w-[14ch]">
              {selected.name}
            </span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Legend — compact pin-color key. Mirrors the LAYERS in the sidebar
          cockpit so any on-map color maps back to its toggle. Layers hidden
          in the cockpit are dimmed here so the key still reads as complete
          but tells the truth about what's currently shown. The gold ring is
          a separate row for the orthogonal saved-places overlay, labelled
          "ring" so users read it as overlay rather than a status color. The
          old "Click a pin to see its sister cities" hint is gone — that
          trigger now lives as a button inside the pin's hover popup. */}
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
