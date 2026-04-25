'use client';

import { useMemo, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Map, Marker, Popup, NavigationControl } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import ViewSwitcher from './ViewSwitcher';

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
};

type Projection = 'globe' | 'mercator';

export default function WorldGlobe({ pins }: { pins: Pin[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<'both' | 'been' | 'go'>('both');
  const [projection, setProjection] = useState<Projection>('globe');
  const [hovered, setHovered] = useState<Pin | null>(null);

  const visible = useMemo(() => {
    if (filter === 'been') return pins.filter(p => p.been);
    if (filter === 'go') return pins.filter(p => p.go && !p.been);
    return pins;
  }, [pins, filter]);

  const handlePinClick = useCallback(
    (slug: string) => {
      router.push(`/cities/${slug}`);
    },
    [router]
  );

  return (
    <div className="relative w-full h-[calc(100svh-56px)] md:h-screen bg-cream-soft">
      <Map
        // Vector tiles from OpenFreeMap (free, no API key, OSM-derived).
        // The "positron" style is the cleanest light/cream look — works
        // beautifully with our pin overlay since the basemap stays quiet.
        mapStyle="https://tiles.openfreemap.org/styles/positron"
        initialViewState={{
          longitude: 10,
          latitude: 30,
          zoom: 1.4,
          // Slight tilt makes the globe feel more sculptural at default zoom
          pitch: 0,
          bearing: 0,
        }}
        // MapLibre v5 supports a true 3D globe projection (orthographic-ish)
        // and Web Mercator. Switching animates between the two.
        projection={{ type: projection }}
        // Hide MapLibre's own attribution control — OpenFreeMap's style
        // already renders attribution baked into the canvas. (We could
        // re-enable AttributionControl if we wanted the floating block.)
        attributionControl={false}
        style={{ width: '100%', height: '100%' }}
        // Enable smooth scroll-wheel zoom + double-click zoom + drag-rotate
        // (rotate is especially nice on the globe).
        dragRotate
        touchPitch
      >
        {/* Pins */}
        {visible.map(p => {
          const isBeen = p.been;
          return (
            <Marker
              key={p.id}
              longitude={p.lng}
              latitude={p.lat}
              anchor="center"
              onClick={e => {
                // The Marker click bubbles to the Map; we want the route
                // change to fire and the map drag handler to ignore it.
                e.originalEvent.stopPropagation();
                handlePinClick(p.slug);
              }}
            >
              <div
                onMouseEnter={() => setHovered(p)}
                onMouseLeave={() =>
                  setHovered(prev => (prev?.id === p.id ? null : prev))
                }
                style={{ cursor: 'pointer' }}
                aria-label={`${p.name}, ${p.country}`}
              >
                {/* Outer halo */}
                <div
                  style={{
                    position: 'absolute',
                    inset: -8,
                    borderRadius: '50%',
                    background: isBeen ? 'rgba(47, 111, 115, 0.18)' : 'rgba(107, 124, 143, 0.18)',
                    pointerEvents: 'none',
                  }}
                />
                {/* Core dot */}
                <div
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    background: isBeen ? '#2f6f73' : '#6b7c8f',
                    border: '2px solid white',
                    boxShadow: '0 1px 3px rgba(15, 23, 42, 0.25)',
                  }}
                />
              </div>
            </Marker>
          );
        })}

        {/* Hover popup — small card with flag + city + country */}
        {hovered && (
          <Popup
            longitude={hovered.lng}
            latitude={hovered.lat}
            closeButton={false}
            closeOnClick={false}
            anchor="bottom"
            offset={16}
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

        {/* Zoom + compass controls — bottom left so they don't fight the
            ViewSwitcher in the bottom-right or the filter chips top-left. */}
        <NavigationControl position="bottom-left" showCompass={projection === 'globe'} />
      </Map>

      {/* === Filter chips === floating top-left */}
      <div className="absolute top-3 left-3 z-10 flex gap-2 text-small">
        {[
          { k: 'both' as const, label: 'All' },
          { k: 'been' as const, label: 'Been' },
          { k: 'go' as const, label: 'Go' },
        ].map(c => {
          const active = filter === c.k;
          return (
            <button
              key={c.k}
              onClick={() => setFilter(c.k)}
              className={
                'px-3 py-1.5 rounded-full border transition-colors backdrop-blur ' +
                (active
                  ? 'bg-teal text-white border-teal'
                  : 'bg-white/85 text-slate border-sand hover:border-slate')
              }
            >
              {c.label}
            </button>
          );
        })}
      </div>

      {/* === Projection toggle === floating top-right.
          Globe is the default — Mercator is available for users who want
          the familiar flat view (better for Tokyo-LA distance reading). */}
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

      {/* Floating Postcard ↔ Map view switcher, bottom-right. */}
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
