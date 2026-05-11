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

// === HomeCitiesGlobe ========================================================
// Full-bleed 3D globe for the home page, plotting every city in the
// atlas as a dot. Slim sibling of PinsMap: no filter cockpit, no popup
// chrome, no controls — just dots on a globe, click any dot to open the
// city detail page. Visited cities render teal and larger; not-yet
// cities render slate and small so the visited story reads at a glance.
//
// Pairs with the floating stats strip in app/page.tsx; that's the only
// page chrome over the map.

type CityRow = {
  name: string;
  slug: string;
  lat: number | null;
  lng: number | null;
  been: boolean;
};

type Props = { cities: CityRow[] };

const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';

export default function HomeCitiesGlobe({ cities }: Props) {
  const router = useRouter();
  const [hoveredSlug, setHoveredSlug] = useState<string | null>(null);

  // Drop rows without coordinates — a Point geometry needs both axes.
  // Build a GeoJSON FeatureCollection so MapLibre draws all dots in one
  // pass instead of one React marker per row.
  const geojson = useMemo(() => {
    const features = [] as Array<{
      type: 'Feature';
      geometry: { type: 'Point'; coordinates: [number, number] };
      properties: { slug: string; name: string; been: number };
    }>;
    for (const c of cities) {
      if (c.lat == null || c.lng == null) continue;
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [c.lng, c.lat] },
        properties: { slug: c.slug, name: c.name, been: c.been ? 1 : 0 },
      });
    }
    return { type: 'FeatureCollection' as const, features };
  }, [cities]);

  const handleClick = useCallback(
    (e: MapMouseEvent) => {
      const slug = (e.features?.[0]?.properties as { slug?: string } | undefined)?.slug;
      if (slug) router.push(`/cities/${slug}`);
    },
    [router],
  );

  const handleMouseMove = useCallback((e: MapMouseEvent) => {
    const slug = (e.features?.[0]?.properties as { slug?: string } | undefined)?.slug;
    setHoveredSlug(slug ?? null);
  }, []);

  const handleMouseLeave = useCallback(() => setHoveredSlug(null), []);

  return (
    <MapView
      mapStyle={STYLE_URL}
      initialViewState={{ longitude: 10, latitude: 30, zoom: 1.4 }}
      projection={{ type: 'globe' }}
      attributionControl={false}
      style={{ width: '100%', height: '100%', cursor: hoveredSlug ? 'pointer' : 'grab' }}
      dragRotate
      touchPitch
      interactiveLayerIds={['city-dots']}
      onClick={handleClick}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <Source id="cities" type="geojson" data={geojson as never}>
        <Layer
          id="city-dots"
          type="circle"
          paint={{
            // Teal for visited, slate for not-yet. Hovered dot grows so
            // the cursor change has a visual partner.
            'circle-color': [
              'case',
              ['==', ['get', 'been'], 1],
              COLORS.teal,
              COLORS.slate,
            ] as unknown as string,
            'circle-radius': [
              'case',
              ['==', ['get', 'slug'], hoveredSlug ?? '__none__'],
              7,
              ['==', ['get', 'been'], 1],
              4.5,
              2.5,
            ] as unknown as number,
            'circle-opacity': [
              'case',
              ['==', ['get', 'been'], 1],
              0.95,
              0.55,
            ] as unknown as number,
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 1,
          }}
        />
      </Source>
    </MapView>
  );
}
