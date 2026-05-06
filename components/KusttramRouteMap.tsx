'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Layer,
  Map as MapView,
  Popup,
  Source,
  type MapMouseEvent,
  type MapRef,
} from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';

const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';

export type KusttramRoutePin = {
  id: string;
  slug: string | null;
  name: string;
  city: string | null;
  country: string | null;
  lat?: number | null;
  lng?: number | null;
};

type KusttramRouteMapProps = {
  pins: KusttramRoutePin[];
  label?: string;
  lineColor?: string;
  routeSegments?: readonly (readonly string[])[];
};

export default function KusttramRouteMap({
  pins,
  label = 'KT coastal tram',
  lineColor = '#0d8c8c',
  routeSegments,
}: KusttramRouteMapProps) {
  const router = useRouter();
  const mapRef = useRef<MapRef | null>(null);
  const [hovered, setHovered] = useState<KusttramRoutePin | null>(null);

  const routePins = useMemo(
    () => pins.filter(p => p.lat != null && p.lng != null),
    [pins],
  );

  const bounds = useMemo(() => {
    if (routePins.length === 0) return null;
    const lats = routePins.map(p => p.lat as number);
    const lngs = routePins.map(p => p.lng as number);
    return {
      minLat: Math.min(...lats),
      maxLat: Math.max(...lats),
      minLng: Math.min(...lngs),
      maxLng: Math.max(...lngs),
    };
  }, [routePins]);

  const initialView = useMemo(() => {
    if (!bounds) return { latitude: 51.21, longitude: 2.94, zoom: 8 };
    return {
      latitude: (bounds.minLat + bounds.maxLat) / 2,
      longitude: (bounds.minLng + bounds.maxLng) / 2,
      zoom: 8,
    };
  }, [bounds]);

  const fitRoute = useCallback(() => {
    if (!bounds || !mapRef.current) return;
    mapRef.current.fitBounds(
      [
        [bounds.minLng, bounds.minLat],
        [bounds.maxLng, bounds.maxLat],
      ],
      {
        padding: { top: 42, right: 34, bottom: 34, left: 34 },
        duration: 0,
      },
    );
  }, [bounds]);

  useEffect(() => {
    fitRoute();
  }, [fitRoute]);

  const byId = useMemo(() => {
    const map = new Map<string, KusttramRoutePin>();
    for (const pin of routePins) map.set(pin.id, pin);
    return map;
  }, [routePins]);

  const byRouteKey = useMemo(() => {
    const map = new Map<string, KusttramRoutePin>();
    for (const pin of routePins) {
      map.set(pin.id, pin);
      if (pin.slug) map.set(pin.slug, pin);
      map.set(pin.name.toLowerCase(), pin);
    }
    return map;
  }, [routePins]);

  const lineGeojson = useMemo(() => {
    const features =
      routeSegments && routeSegments.length > 0
        ? routeSegments
            .map((segment, segmentIndex) => {
              const coordinates = segment
                .map(key => byRouteKey.get(key) ?? byRouteKey.get(key.toLowerCase()))
                .filter((pin): pin is KusttramRoutePin => !!pin)
                .map(pin => [pin.lng as number, pin.lat as number]);

              if (coordinates.length < 2) return null;
              return {
                type: 'Feature' as const,
                geometry: {
                  type: 'LineString' as const,
                  coordinates,
                },
                properties: { segmentIndex },
              };
            })
            .filter((feature): feature is NonNullable<typeof feature> => feature !== null)
        : [
            {
              type: 'Feature' as const,
              geometry: {
                type: 'LineString' as const,
                coordinates: routePins.map(p => [p.lng as number, p.lat as number]),
              },
              properties: { segmentIndex: 0 },
            },
          ];

    return {
      type: 'FeatureCollection' as const,
      features,
    };
  }, [byRouteKey, routePins, routeSegments]);

  const terminalIds = useMemo(() => {
    const ids = new Set<string>();
    if (routeSegments && routeSegments.length > 0) {
      for (const segment of routeSegments) {
        const segmentPins = segment
          .map(key => byRouteKey.get(key) ?? byRouteKey.get(key.toLowerCase()))
          .filter((pin): pin is KusttramRoutePin => !!pin);
        const first = segmentPins[0];
        const last = segmentPins[segmentPins.length - 1];
        if (first) ids.add(first.id);
        if (last) ids.add(last.id);
      }
    } else {
      const first = routePins[0];
      const last = routePins[routePins.length - 1];
      if (first) ids.add(first.id);
      if (last) ids.add(last.id);
    }
    return ids;
  }, [byRouteKey, routePins, routeSegments]);

  const stopGeojson = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features: routePins.map(pin => ({
        type: 'Feature' as const,
        geometry: {
          type: 'Point' as const,
          coordinates: [pin.lng as number, pin.lat as number],
        },
        properties: {
          id: pin.id,
          name: pin.name,
          slug: pin.slug ?? pin.id,
          isTerminal: terminalIds.has(pin.id) ? 1 : 0,
        },
      })),
    }),
    [routePins, terminalIds],
  );

  const onMove = useCallback(
    (event: MapMouseEvent) => {
      const feature = event.features?.[0];
      const id = (feature?.properties as { id?: string } | undefined)?.id;
      setHovered(id ? byId.get(id) ?? null : null);
    },
    [byId],
  );

  const onLeave = useCallback(() => setHovered(null), []);

  const onClick = useCallback(
    (event: MapMouseEvent) => {
      const feature = event.features?.[0];
      const slug = (feature?.properties as { slug?: string } | undefined)?.slug;
      if (slug) router.push(`/pins/${slug}`);
    },
    [router],
  );

  if (routePins.length < 2 || lineGeojson.features.length === 0) return null;

  return (
    <div className="mt-5 overflow-hidden rounded-lg border border-sand bg-cream-soft">
      <div className="relative h-44 sm:h-52">
        <MapView
          ref={mapRef}
          initialViewState={initialView}
          mapStyle={STYLE_URL}
          interactiveLayerIds={['kusttram-stops']}
          onLoad={fitRoute}
          onMouseMove={onMove}
          onMouseLeave={onLeave}
          onClick={onClick}
          scrollZoom={false}
          dragRotate={false}
          touchZoomRotate={false}
          cursor={hovered ? 'pointer' : 'grab'}
        >
          <Source id="kusttram-line-source" type="geojson" data={lineGeojson}>
            <Layer
              id="kusttram-line-casing"
              type="line"
              paint={{
                'line-color': '#fbfaf6',
                'line-width': 7,
                'line-opacity': 0.95,
              }}
            />
            <Layer
              id="kusttram-line"
              type="line"
              paint={{
                'line-color': lineColor,
                'line-width': 3,
                'line-opacity': 0.95,
              }}
            />
          </Source>

          <Source id="kusttram-stops-source" type="geojson" data={stopGeojson}>
            <Layer
              id="kusttram-stops"
              type="circle"
              paint={{
                'circle-radius': [
                  'case',
                  ['==', ['get', 'isTerminal'], 1],
                  5,
                  3.25,
                ],
                'circle-color': [
                  'case',
                  ['==', ['get', 'isTerminal'], 1],
                  '#1c1b19',
                  lineColor,
                ],
                'circle-stroke-color': '#fbfaf6',
                'circle-stroke-width': 1.5,
              }}
            />
          </Source>

          {hovered && hovered.lat != null && hovered.lng != null && (
            <Popup
              longitude={hovered.lng}
              latitude={hovered.lat}
              anchor="bottom"
              offset={10}
              closeButton={false}
              closeOnClick={false}
              className="font-sans"
            >
              <div className="text-small font-medium leading-snug text-ink-deep">
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

        <div className="pointer-events-none absolute left-3 top-3 rounded-full border border-sand bg-white/95 px-3 py-1 text-label uppercase tracking-wider text-ink-deep shadow-sm">
          {label}
        </div>
      </div>
    </div>
  );
}
