'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

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

type Props = { pins: Pin[] };

// Web Mercator projection for a given zoom + viewport size.
// Returns x/y in pixels relative to the top-left of the world image.
function project(lat: number, lng: number, sizePx: number) {
  const x = ((lng + 180) / 360) * sizePx;
  const sinLat = Math.sin((lat * Math.PI) / 180);
  // Clamp to avoid Infinity at poles
  const clamped = Math.max(-0.9999, Math.min(0.9999, sinLat));
  const y = (0.5 - Math.log((1 + clamped) / (1 - clamped)) / (4 * Math.PI)) * sizePx;
  return { x, y };
}

// We render the world from OSM tiles at zoom 2 (4×4 grid of 256-px tiles =
// 1024 px square image). This is the smallest tile zoom that still shows
// recognisable continent shapes without too much distortion at the equator.
const ZOOM = 2;
const TILES_PER_SIDE = 1 << ZOOM; // 4
const TILE_SIZE = 256;
const WORLD_PX = TILES_PER_SIDE * TILE_SIZE; // 1024

export default function WorldMap({ pins }: Props) {
  const router = useRouter();
  const [hovered, setHovered] = useState<string | null>(null);
  const [filter, setFilter] = useState<'been' | 'go' | 'both'>('both');

  const visible = useMemo(() => {
    if (filter === 'been') return pins.filter(p => p.been);
    if (filter === 'go') return pins.filter(p => p.go && !p.been);
    return pins;
  }, [pins, filter]);

  const tiles = useMemo(() => {
    const out: { x: number; y: number; url: string }[] = [];
    for (let y = 0; y < TILES_PER_SIDE; y++) {
      for (let x = 0; x < TILES_PER_SIDE; x++) {
        out.push({ x, y, url: `https://tile.openstreetmap.org/${ZOOM}/${x}/${y}.png` });
      }
    }
    return out;
  }, []);

  const beenCount = pins.filter(p => p.been).length;
  const goCount = pins.filter(p => p.go && !p.been).length;

  return (
    <div className="mt-6">
      {/* Filter chips */}
      <div className="flex gap-2 mb-4 text-small">
        {[
          { k: 'both' as const, label: 'All', count: pins.length },
          { k: 'been' as const, label: 'Been', count: beenCount },
          { k: 'go' as const, label: 'Go', count: goCount },
        ].map(c => {
          const active = filter === c.k;
          return (
            <button
              key={c.k}
              onClick={() => setFilter(c.k)}
              className={
                'px-3 py-1.5 rounded-full border transition-colors ' +
                (active
                  ? 'bg-teal text-white border-teal'
                  : 'bg-white text-slate border-sand hover:border-slate')
              }
            >
              {c.label} <span className="opacity-70 ml-1">{c.count}</span>
            </button>
          );
        })}
      </div>

      {/* Map container — aspect-ratio matches world image (square Mercator).
          We use SVG so pins, tooltips, and hover are crisp at any size. */}
      <div
        className="relative w-full overflow-hidden rounded border border-sand bg-cream-soft"
        style={{ aspectRatio: '1 / 1', maxHeight: '80vh' }}
      >
        {/* Tile layer — absolute-positioned grid of OSM tiles */}
        <div className="absolute inset-0">
          {tiles.map(t => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={`${t.x}-${t.y}`}
              src={t.url}
              alt=""
              className="absolute"
              style={{
                left: `${(t.x / TILES_PER_SIDE) * 100}%`,
                top: `${(t.y / TILES_PER_SIDE) * 100}%`,
                width: `${100 / TILES_PER_SIDE}%`,
                height: `${100 / TILES_PER_SIDE}%`,
                imageRendering: 'auto',
                // Slight desaturation so pins pop. Real photographic OSM tiles
                // can be visually busy when crowded with pins.
                filter: 'saturate(0.55) brightness(1.04)',
              }}
              loading="lazy"
            />
          ))}
        </div>

        {/* Pin layer — SVG overlay, viewBox sized to the world image so we can
            project lat/lng to pixel coords directly. */}
        <svg
          className="absolute inset-0 w-full h-full"
          viewBox={`0 0 ${WORLD_PX} ${WORLD_PX}`}
          preserveAspectRatio="none"
        >
          {visible.map(p => {
            const { x, y } = project(p.lat, p.lng, WORLD_PX);
            const isBeen = p.been;
            const isHovered = hovered === p.id;
            // Pin radius in world-px. SVG scales it so 8 ≈ 8 / 1024 of width.
            const r = isHovered ? 9 : 6;
            return (
              <g
                key={p.id}
                onMouseEnter={() => setHovered(p.id)}
                onMouseLeave={() => setHovered(prev => (prev === p.id ? null : prev))}
                onClick={() => router.push(`/cities/${p.slug}`)}
                style={{ cursor: 'pointer' }}
              >
                {/* Halo */}
                <circle
                  cx={x}
                  cy={y}
                  r={r * 2.4}
                  fill={isBeen ? '#2f6f73' : '#6b7c8f'}
                  opacity={isHovered ? 0.28 : 0.18}
                />
                {/* Core */}
                <circle
                  cx={x}
                  cy={y}
                  r={r}
                  fill={isBeen ? '#2f6f73' : '#6b7c8f'}
                  stroke="#ffffff"
                  strokeWidth={2}
                />
              </g>
            );
          })}
        </svg>

        {/* Hover tooltip — HTML overlay so we get nice typography + a flag */}
        {hovered && (() => {
          const p = visible.find(v => v.id === hovered);
          if (!p) return null;
          const { x, y } = project(p.lat, p.lng, WORLD_PX);
          const xPct = (x / WORLD_PX) * 100;
          const yPct = (y / WORLD_PX) * 100;
          // Position above the pin; flip below if near the top edge.
          const above = yPct > 18;
          return (
            <div
              className="absolute pointer-events-none z-10"
              style={{
                left: `${xPct}%`,
                top: `${yPct}%`,
                transform: above
                  ? 'translate(-50%, calc(-100% - 14px))'
                  : 'translate(-50%, 14px)',
              }}
            >
              <div
                className="bg-white border border-sand rounded px-2.5 py-1.5 text-small whitespace-nowrap flex items-center gap-2"
                style={{
                  boxShadow:
                    '0 1px 2px rgba(15, 23, 42, 0.06), 0 4px 12px rgba(15, 23, 42, 0.08)',
                }}
              >
                {p.countryFlag && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.countryFlag}
                    alt=""
                    className="w-4 h-auto rounded-sm border border-sand"
                  />
                )}
                <div>
                  <div className="text-ink-deep font-medium leading-tight">{p.name}</div>
                  <div className="text-muted text-[10px] leading-tight">{p.country}</div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Attribution — required by OSM tile policy */}
        <div className="absolute bottom-1 right-1 text-[9px] bg-white/85 text-ink-deep/70 px-1 rounded leading-none py-0.5 pointer-events-none">
          © OpenStreetMap
        </div>
      </div>

      {/* Legend */}
      <div className="mt-3 flex gap-4 text-small text-slate">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full bg-teal" /> Visited
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full" style={{ background: '#6b7c8f' }} /> Planned
        </span>
      </div>
    </div>
  );
}
