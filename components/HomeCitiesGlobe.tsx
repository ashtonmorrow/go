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
// A second layer renders one larger amber marker per featured list
// "guide anchor", layered on top of the city dots. Multi-base lists
// (spa-day, bali) emit one marker per city; all click through to the
// same /lists/<slug>. A small toggle in the top-right lets a visitor
// hide the guide layer if they want the unfiltered pin distribution.
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

type GuideAnchor = {
  slug: string;
  title: string;
  description: string;
  cityName: string;
  lat: number;
  lng: number;
};

type Props = {
  cities: CityRow[];
  guides?: GuideAnchor[];
};

const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';

export default function HomeCitiesGlobe({ cities, guides = [] }: Props) {
  const router = useRouter();
  const [hoveredCitySlug, setHoveredCitySlug] = useState<string | null>(null);
  const [hoveredGuideSlug, setHoveredGuideSlug] = useState<string | null>(null);
  const [showGuides, setShowGuides] = useState(true);

  // City dots. Drop rows without coordinates — a Point geometry needs both axes.
  const cityGeojson = useMemo(() => {
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

  // Guide markers. Each anchor is one Point; multiple anchors for the
  // same guide slug emit multiple Points (one per city), all clicking
  // through to the same /lists/<slug>.
  const guideGeojson = useMemo(() => {
    const features = guides.map(g => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [g.lng, g.lat] as [number, number] },
      properties: {
        slug: g.slug,
        title: g.title,
        cityName: g.cityName,
      },
    }));
    return { type: 'FeatureCollection' as const, features };
  }, [guides]);

  // Click handler walks features in render order. Guide layer is on top
  // so a guide-pin click wins over a city-dot click at the same spot.
  const handleClick = useCallback(
    (e: MapMouseEvent) => {
      const feature = e.features?.[0];
      if (!feature) return;
      const props = feature.properties as { slug?: string } | undefined;
      const layer = feature.layer?.id;
      if (!props?.slug) return;
      if (layer === 'guide-markers') {
        router.push(`/lists/${props.slug}`);
      } else if (layer === 'city-dots') {
        router.push(`/cities/${props.slug}`);
      }
    },
    [router],
  );

  // Hover state for cursor and visual feedback. Track which layer the
  // hovered feature is on so we can highlight the right pin.
  const handleMouseMove = useCallback((e: MapMouseEvent) => {
    const feature = e.features?.[0];
    if (!feature) {
      setHoveredCitySlug(null);
      setHoveredGuideSlug(null);
      return;
    }
    const props = feature.properties as { slug?: string } | undefined;
    if (feature.layer?.id === 'guide-markers') {
      setHoveredGuideSlug(props?.slug ?? null);
      setHoveredCitySlug(null);
    } else {
      setHoveredCitySlug(props?.slug ?? null);
      setHoveredGuideSlug(null);
    }
  }, []);

  const handleMouseLeave = useCallback(() => {
    setHoveredCitySlug(null);
    setHoveredGuideSlug(null);
  }, []);

  const interactiveLayers = useMemo(
    () => (showGuides ? ['guide-markers', 'city-dots'] : ['city-dots']),
    [showGuides],
  );

  const hoveredGuide = useMemo(
    () => (hoveredGuideSlug ? guides.find(g => g.slug === hoveredGuideSlug) ?? null : null),
    [hoveredGuideSlug, guides],
  );

  const isPointer = hoveredCitySlug !== null || hoveredGuideSlug !== null;

  return (
    <div className="relative w-full h-full">
      <MapView
        mapStyle={STYLE_URL}
        initialViewState={{ longitude: 10, latitude: 30, zoom: 1.4 }}
        projection={{ type: 'globe' }}
        attributionControl={false}
        style={{ width: '100%', height: '100%', cursor: isPointer ? 'pointer' : 'grab' }}
        dragRotate
        touchPitch
        interactiveLayerIds={interactiveLayers}
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <Source id="cities" type="geojson" data={cityGeojson as never}>
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
                ['==', ['get', 'slug'], hoveredCitySlug ?? '__none__'],
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

        {showGuides && guides.length > 0 && (
          <Source id="guides" type="geojson" data={guideGeojson as never}>
            <Layer
              id="guide-markers"
              type="circle"
              paint={{
                // Warm amber so guides read as a distinct surface from
                // the cool teal/slate city dots. Larger radius + thicker
                // stroke says "this is a destination writeup, click in."
                'circle-color': '#C28432',
                'circle-radius': [
                  'case',
                  ['==', ['get', 'slug'], hoveredGuideSlug ?? '__none__'],
                  12,
                  9,
                ] as unknown as number,
                'circle-opacity': 0.95,
                'circle-stroke-color': '#ffffff',
                'circle-stroke-width': 2,
              }}
            />
          </Source>
        )}
      </MapView>

      {/* Guides toggle — top-right, above the stats strip. Pill style so
          it reads as a control rather than a chip. Hidden on map routes
          that don't have any guides yet. */}
      {guides.length > 0 && (
        <button
          type="button"
          onClick={() => setShowGuides(v => !v)}
          aria-pressed={showGuides}
          className={
            'absolute top-3 right-3 z-10 inline-flex items-center gap-2 ' +
            'rounded-full px-3 py-1.5 text-small font-medium shadow-md transition-colors ' +
            (showGuides
              ? 'bg-ink-deep text-cream-soft hover:bg-ink-deep/90'
              : 'bg-white text-ink-deep border border-sand hover:bg-cream-soft')
          }
        >
          <span
            className="inline-block w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: showGuides ? '#C28432' : '#9CA3AF' }}
            aria-hidden="true"
          />
          {showGuides ? 'Guides on' : 'Guides off'}
        </button>
      )}

      {/* Hover card for a guide marker. Floats above the map with the
          guide title, anchor city, and a hint that the click leads to
          the writeup. Positioned bottom-center so it doesn't collide
          with the stats strip on mobile. */}
      {hoveredGuide && (
        <div
          className="
            absolute left-1/2 -translate-x-1/2 top-3 z-10
            pointer-events-none
            max-w-md rounded-lg bg-white shadow-lg border border-sand
            px-4 py-2.5
            sm:left-auto sm:right-3 sm:translate-x-0
          "
        >
          <div className="text-small font-semibold text-ink-deep leading-snug">
            {hoveredGuide.title}
          </div>
          <div className="text-label text-muted mt-0.5">
            📮 {hoveredGuide.cityName} · click to read
          </div>
        </div>
      )}
    </div>
  );
}
