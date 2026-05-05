'use client';

// === ListMapAndCards =======================================================
// Client wrapper used on /lists/[slug]. Renders a globe-style MapLibre
// map of the list's pins above the SavedListSection card grid, and
// coordinates a "selected pin" filter between them. Click a dot on the
// map → only that pin's card stays visible. Click the same dot again
// (or the "Show all" pill) → cards reset to the full list.
//
// Why client: SavedListSection is already a client component (sort
// dropdown, pagination), and the map needs MapLibre + click handlers.
// Splitting state across server/client would require URL-state
// shenanigans for what's a transient UI selection. One client wrapper
// over both is simpler.
//
// What it doesn't do (intentionally): permanent filters, multi-select,
// drawn-region queries. The selection is one pin or none.

import { useMemo, useState, useCallback, useEffect } from 'react';
import {
  Map as MapView,
  Source,
  Layer,
  Popup,
  NavigationControl,
  type MapMouseEvent,
} from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import SavedListSection, { type SavedListPin } from './SavedListSection';

const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';

type Props = {
  /** Title forwarded to SavedListSection. */
  title: string;
  /** Slug forwarded to SavedListSection (controls the "Open list" footer link). */
  listSlug: string | null;
  /** Google Maps share URL forwarded to SavedListSection. */
  googleShareUrl: string | null;
  /** Pins on the list. Pins without lat/lng don't appear on the map but
   *  do appear in the card grid — keeping them in the corpus avoids
   *  silent data loss for Google Takeout pins that arrive without coords. */
  pins: SavedListPin[];
  pageSize?: number;
  showSort?: boolean;
  initialSort?: 'rated' | 'recent' | 'rating' | 'visited' | 'alpha' | 'city';
  /** Curated pin ordering forwarded to SavedListSection. Pinned pins
   *  render first regardless of the sort dropdown; unpinned tail falls
   *  through to the user's selection. */
  pinOrder?: string[];
};

export default function ListMapAndCards({
  title,
  listSlug,
  googleShareUrl,
  pins,
  pageSize,
  showSort,
  initialSort,
  pinOrder,
}: Props) {
  // Pins that can actually appear on the map. Sort + render order in the
  // grid is unaffected by this filter; we only use it for the GeoJSON.
  const mappable = useMemo(
    () => pins.filter(p => p.lat != null && p.lng != null),
    [pins],
  );

  // Centre the camera on the median lat/lng of the pin set so the list's
  // pins are roughly framed on first paint. Median over mean to absorb
  // outliers (one pin in Patagonia shouldn't yank the centre to the
  // South Atlantic). Falls back to a Mercator-friendly default when the
  // list has no mappable pins.
  const initialView = useMemo(() => {
    if (mappable.length === 0) return { latitude: 20, longitude: 0, zoom: 1 };
    const lats = mappable.map(p => p.lat as number).sort((a, b) => a - b);
    const lngs = mappable.map(p => p.lng as number).sort((a, b) => a - b);
    const mid = (xs: number[]) => xs[Math.floor(xs.length / 2)]!;
    // Span informs zoom — tight clusters zoom in, scattered lists zoom out.
    const latSpan = lats[lats.length - 1]! - lats[0]!;
    const lngSpan = lngs[lngs.length - 1]! - lngs[0]!;
    const span = Math.max(latSpan, lngSpan);
    let zoom = 2;
    if (span < 0.5) zoom = 11;
    else if (span < 2) zoom = 8;
    else if (span < 8) zoom = 5;
    else if (span < 30) zoom = 3;
    return { latitude: mid(lats), longitude: mid(lngs), zoom };
  }, [mappable]);

  // The selection state. null = "show all"; an id = "show that one only".
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Hover state drives the popup. Distinct from selected so hovering one
  // pin while another is selected doesn't blow away the filter.
  const [hovered, setHovered] = useState<SavedListPin | null>(null);

  const byId = useMemo(() => {
    const m = new Map<string, SavedListPin>();
    for (const p of mappable) m.set(p.id, p);
    return m;
  }, [mappable]);

  const geojson = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features: mappable.map(p => ({
        type: 'Feature' as const,
        geometry: {
          type: 'Point' as const,
          coordinates: [p.lng as number, p.lat as number],
        },
        properties: {
          id: p.id,
          name: p.name,
          // Selected dot rendered differently — encoded as a number for
          // the MapLibre paint-property match expression.
          isSelected: selectedId === p.id ? 1 : 0,
          isVisited: p.visited ? 1 : 0,
        },
      })),
    }),
    [mappable, selectedId],
  );

  const onMove = useCallback(
    (e: MapMouseEvent) => {
      const f = e.features?.[0];
      if (!f) {
        setHovered(null);
        return;
      }
      const id = (f.properties as { id?: string })?.id;
      if (!id) return;
      const pin = byId.get(id);
      if (pin) setHovered(pin);
    },
    [byId],
  );

  const onLeave = useCallback(() => setHovered(null), []);

  const onClick = useCallback(
    (e: MapMouseEvent) => {
      const f = e.features?.[0];
      const id = (f?.properties as { id?: string })?.id;
      if (!id) return;
      // Toggle: clicking the same selected pin clears the filter.
      setSelectedId(prev => (prev === id ? null : id));
    },
    [],
  );

  // Sync the cursor with the markers — pointer over a dot, default
  // elsewhere. Without this MapLibre defaults to grab/grabbing, which
  // makes the dots feel un-interactive.
  const [hoveringMarker, setHoveringMarker] = useState(false);
  useEffect(() => {
    document.body.style.cursor = hoveringMarker ? 'pointer' : '';
    return () => {
      document.body.style.cursor = '';
    };
  }, [hoveringMarker]);

  const filteredPins = useMemo(() => {
    if (!selectedId) return pins;
    return pins.filter(p => p.id === selectedId);
  }, [pins, selectedId]);

  const selectedPin = selectedId ? pins.find(p => p.id === selectedId) ?? null : null;

  // Skip the whole map block when no pins on the list have coordinates.
  // Some lists (themed collections like "Want to go") may end up
  // entirely coordinate-less; rendering an empty globe would just look
  // broken.
  if (mappable.length === 0) {
    return (
      <SavedListSection
        title={title}
        listSlug={listSlug}
        googleShareUrl={googleShareUrl}
        pins={pins}
        pageSize={pageSize}
        showSort={showSort}
        initialSort={initialSort}
        pinOrder={pinOrder}
      />
    );
  }

  return (
    <>
      <section
        className="
          relative mb-6 overflow-hidden rounded-lg border border-sand
          bg-cream-soft
        "
        aria-label="Map of pins on this list"
      >
        <div className="aspect-[16/9] sm:aspect-[2/1]">
          <MapView
            initialViewState={initialView}
            mapStyle={STYLE_URL}
            interactiveLayerIds={['list-pins']}
            onMouseMove={onMove}
            onMouseLeave={onLeave}
            onClick={onClick}
            onMouseEnter={() => setHoveringMarker(true)}
            cursor="default"
            // Prevent the wheel from hijacking the page scroll. Users can
            // pan/zoom with drag + double-click; ctrl+wheel still zooms
            // (MapLibre defaults). Better than a constantly-grabbing scroll.
            scrollZoom={false}
          >
            <NavigationControl position="top-right" showCompass={false} />
            <Source id="list-pins-src" type="geojson" data={geojson}>
              <Layer
                id="list-pins"
                type="circle"
                paint={{
                  'circle-radius': [
                    'case',
                    ['==', ['get', 'isSelected'], 1], 9,
                    6,
                  ],
                  'circle-color': [
                    'case',
                    ['==', ['get', 'isSelected'], 1], '#1c1b19',
                    ['==', ['get', 'isVisited'], 1], '#0d8c8c',
                    '#7c8da3',
                  ],
                  'circle-stroke-width': 2,
                  'circle-stroke-color': '#fbfaf6',
                }}
              />
            </Source>
            {hovered && hovered.lat != null && hovered.lng != null && (
              <Popup
                longitude={hovered.lng}
                latitude={hovered.lat}
                offset={12}
                closeButton={false}
                closeOnClick={false}
                anchor="bottom"
                className="font-sans"
              >
                <div className="text-small text-ink-deep font-medium leading-snug">
                  {hovered.name}
                </div>
                {hovered.city && (
                  <div className="text-micro text-muted">
                    {hovered.city}
                    {hovered.country ? ` · ${hovered.country}` : ''}
                  </div>
                )}
              </Popup>
            )}
          </MapView>
        </div>
        {/* Active-filter chip. Sits on the map so the user can clear the
            selection without scrolling back up if they've already dropped
            into the cards below. */}
        {selectedPin && (
          <button
            type="button"
            onClick={() => setSelectedId(null)}
            className="
              absolute top-3 left-3 inline-flex items-center gap-1.5
              px-3 py-1.5 rounded-full bg-ink-deep text-cream-soft
              text-small font-medium shadow-paper
              hover:bg-ink transition-colors
            "
            aria-label="Show all pins on the list"
          >
            <span>Showing: {selectedPin.name}</span>
            <span aria-hidden className="text-cream-soft/70">×</span>
          </button>
        )}
      </section>

      <SavedListSection
        title={selectedPin ? `Selected pin` : title}
        listSlug={listSlug}
        googleShareUrl={googleShareUrl}
        pins={filteredPins}
        pageSize={pageSize}
        showSort={showSort}
        initialSort={initialSort}
        pinOrder={pinOrder}
      />
    </>
  );
}
