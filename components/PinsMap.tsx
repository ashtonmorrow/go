'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Map as MapView,
  Source,
  Layer,
  Popup,
  NavigationControl,
  type MapMouseEvent,
} from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { usePinFilters } from './PinFiltersContext';
import { filterPins } from '@/lib/pinFilter';
import { COLORS } from '@/lib/colors';
import type { PinForCard } from '@/lib/pinsCardData';

// === PinsMap ===============================================================
// Simplified globe view for /pins/map. Renders each pin as a small circle
// (teal if visited, slate otherwise). Hover reveals a popup with name +
// thumbnail; click navigates to the detail page.
//
// Intentionally narrower than WorldGlobe: no sister-city graph, no
// projection toggle. The pin set is curated, the visualisation is the
// dot field — adding more chrome would clutter it.
//
// Filter cockpit wires through usePinFilters — same axes that drive the
// cards and table views drive the dot count here, so flipping between
// /pins/cards, /pins/map, /pins/table preserves the user's filter state.

const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';

export default function PinsMap({ pins }: { pins: PinForCard[] }) {
  const router = useRouter();
  const ctx = usePinFilters();

  // Filter via the shared cockpit, then drop pins without coordinates
  // (a marker layer needs every feature to have a Point geometry).
  const visible = useMemo(() => {
    const state = ctx?.state;
    const filtered = state ? filterPins(pins, state) : pins;
    return filtered.filter(p => p.lat != null && p.lng != null);
  }, [pins, ctx?.state]);

  // Push counts up to the cockpit (denominator is total *with coords*,
  // not total pins, so the badge math feels right on the map).
  useEffect(() => {
    const totalWithCoords = pins.filter(p => p.lat != null && p.lng != null).length;
    ctx?.setCounts(visible.length, totalWithCoords);
  }, [ctx, visible.length, pins]);

  const [hovered, setHovered] = useState<PinForCard | null>(null);

  // GeoJSON source from the visible pin set — MapLibre renders the dots
  // in one draw call instead of one React marker per row.
  const geojson = useMemo(() => ({
    type: 'FeatureCollection' as const,
    features: visible.map(p => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [p.lng as number, p.lat as number] },
      properties: {
        id: p.id,
        name: p.name,
        slug: p.slug ?? p.id,
        visited: p.visited ? 1 : 0,
      },
    })),
  }), [visible]);

  const byId = useMemo(() => {
    const m = new Map<string, PinForCard>();
    for (const x of visible) m.set(x.id, x);
    return m;
  }, [visible]);

  const onMove = useCallback((e: MapMouseEvent) => {
    const f = e.features?.[0];
    if (!f) { setHovered(null); return; }
    const id = (f.properties as any)?.id;
    setHovered(id ? byId.get(id) ?? null : null);
  }, [byId]);

  const onLeave = useCallback(() => setHovered(null), []);

  const onClick = useCallback((e: MapMouseEvent) => {
    const f = e.features?.[0];
    const slug = (f?.properties as any)?.slug;
    if (slug) router.push(`/pins/${slug}`);
  }, [router]);

  return (
    <div className="w-full h-[calc(100svh-56px)] md:h-screen relative">
      <MapView
        initialViewState={{ longitude: 0, latitude: 20, zoom: 1.5 }}
        mapStyle={STYLE_URL}
        projection={'globe' as unknown as 'mercator'}
        interactiveLayerIds={['pin-dots']}
        onMouseMove={onMove}
        onMouseLeave={onLeave}
        onClick={onClick}
        cursor={hovered ? 'pointer' : 'grab'}
      >
        <NavigationControl position="top-right" />
        <Source id="pins" type="geojson" data={geojson as never}>
          <Layer
            id="pin-dots"
            type="circle"
            paint={{
              // Visited = brand teal, not yet = slate.
              'circle-color': [
                'case',
                ['==', ['get', 'visited'], 1],
                COLORS.teal,
                COLORS.slate,
              ] as unknown as string,
              'circle-radius': 4,
              'circle-stroke-color': '#ffffff',
              'circle-stroke-width': 1,
              'circle-opacity': 0.85,
            }}
          />
        </Source>

        {hovered && hovered.lat != null && hovered.lng != null && (
          <Popup
            longitude={hovered.lng}
            latitude={hovered.lat}
            anchor="bottom"
            offset={8}
            closeButton={false}
            closeOnClick={false}
            className="pin-popup"
          >
            <div className="p-2 max-w-[220px]">
              <div className="flex items-center gap-2">
                {hovered.images[0]?.url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={hovered.images[0].url}
                    alt=""
                    className="w-10 h-10 rounded object-cover bg-cream-soft border border-sand"
                  />
                )}
                <div className="min-w-0">
                  <div className="text-ink-deep font-medium text-small truncate">
                    {hovered.name}
                  </div>
                  <div className="text-muted text-label truncate">
                    {[hovered.category, hovered.statesNames[0]].filter(Boolean).join(' · ')}
                  </div>
                </div>
              </div>
            </div>
          </Popup>
        )}
      </MapView>
    </div>
  );
}
