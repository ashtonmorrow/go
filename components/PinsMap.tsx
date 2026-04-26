'use client';

import { useMemo, useState, useCallback } from 'react';
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
import { COLORS } from '@/lib/colors';

// === PinsMap ===============================================================
// Simplified globe view for /pins/map. Renders each pin as a small circle
// (teal if visited, slate otherwise). Hover reveals a popup with name +
// thumbnail; click navigates to the detail page.
//
// Intentionally narrower than WorldGlobe: no sister-city graph, no
// projection toggle. The pin set is curated, the visualisation is the
// dot field — adding more chrome would clutter it.

type Marker = {
  id: string;
  name: string;
  slug: string;
  lat: number;
  lng: number;
  visited: boolean;
  category: string | null;
  country: string | null;
  thumb: string | null;
};

const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';

export default function PinsMap({ markers }: { markers: Marker[] }) {
  const router = useRouter();
  const [hovered, setHovered] = useState<Marker | null>(null);

  // GeoJSON source from the markers — MapLibre renders ~1,300 dots in one
  // draw call instead of 1,300 React markers.
  const geojson = useMemo(() => ({
    type: 'FeatureCollection' as const,
    features: markers.map(m => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [m.lng, m.lat] },
      properties: {
        id: m.id,
        name: m.name,
        slug: m.slug,
        visited: m.visited ? 1 : 0,
      },
    })),
  }), [markers]);

  const byId = useMemo(() => {
    const m = new Map<string, Marker>();
    for (const x of markers) m.set(x.id, x);
    return m;
  }, [markers]);

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

        {hovered && (
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
                {hovered.thumb && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={hovered.thumb}
                    alt=""
                    className="w-10 h-10 rounded object-cover bg-cream-soft border border-sand"
                  />
                )}
                <div className="min-w-0">
                  <div className="text-ink-deep font-medium text-small truncate">
                    {hovered.name}
                  </div>
                  <div className="text-muted text-[11px] truncate">
                    {[hovered.category, hovered.country].filter(Boolean).join(' · ')}
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
