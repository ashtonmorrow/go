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

// World rendered from OSM tiles at zoom 2 (4×4 grid of 256-px tiles =
// 1024-px square source). preserveAspectRatio="none" on the SVG and
// percentage tile layout mean the map stretches to whatever viewport size
// we give it — so the same component scales cleanly across mobile through
// 4K without per-device fiddling.
const ZOOM = 2;
const TILES_PER_SIDE = 1 << ZOOM; // 4
const WORLD_PX = TILES_PER_SIDE * 256; // 1024

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

  // Full-bleed map: spans the full viewport width and fills the area below
  // the sticky nav (~64px). Filter chips float as a small overlay so they
  // don't claim chrome real estate the way a separate header would. Pins
  // are clickable; click navigates to the city's detail page.
  return (
    <div
      className="relative w-screen overflow-hidden bg-cream-soft"
      style={{
        // 64px tracks the sticky nav height (py-3 + pill content). Matches
        // edge-to-edge intent without hiding the nav.
        height: 'calc(100svh - 64px)',
        // Pull the wrapper out of any parent padding so it truly bleeds to
        // the viewport edges on all devices.
        marginLeft: 'calc(50% - 50vw)',
        marginRight: 'calc(50% - 50vw)',
      }}
    >
      {/* Tile layer — absolute-positioned 4×4 grid of OSM tiles */}
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
              // Slight desaturation so pins pop. OSM tiles can be busy.
              filter: 'saturate(0.55) brightness(1.04)',
            }}
            loading="lazy"
          />
        ))}
      </div>

      {/* Pin layer — SVG overlay sized to the source world image so we can
          project lat/lng to pixel coords once and let SVG scaling handle
          resizing. preserveAspectRatio="none" lets the SVG stretch to match
          the (non-square) viewport; pins co-stretch with the tiles. */}
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox={`0 0 ${WORLD_PX} ${WORLD_PX}`}
        preserveAspectRatio="none"
      >
        {visible.map(p => {
          const { x, y } = project(p.lat, p.lng, WORLD_PX);
          const isBeen = p.been;
          const isHovered = hovered === p.id;
          const r = isHovered ? 9 : 6;
          return (
            <g
              key={p.id}
              onMouseEnter={() => setHovered(p.id)}
              onMouseLeave={() => setHovered(prev => (prev === p.id ? null : prev))}
              onClick={() => router.push(`/cities/${p.slug}`)}
              style={{ cursor: 'pointer' }}
            >
              <circle
                cx={x}
                cy={y}
                r={r * 2.4}
                fill={isBeen ? '#2f6f73' : '#6b7c8f'}
                opacity={isHovered ? 0.28 : 0.18}
              />
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

      {/* Hover tooltip — HTML overlay positioned by the pin's % within the
          source viewBox (matches the SVG stretch). */}
      {hovered && (() => {
        const p = visible.find(v => v.id === hovered);
        if (!p) return null;
        const { x, y } = project(p.lat, p.lng, WORLD_PX);
        const xPct = (x / WORLD_PX) * 100;
        const yPct = (y / WORLD_PX) * 100;
        const above = yPct > 18;
        return (
          <div
            className="absolute pointer-events-none z-20"
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

      {/* Filter chips — floating overlay top-left so the map stays full bleed
          but Been/Go filtering remains one tap away. */}
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

      {/* OSM attribution — required by their tile policy */}
      <div className="absolute bottom-1 right-1 text-[9px] bg-white/85 text-ink-deep/70 px-1 rounded leading-none py-0.5 pointer-events-none">
        © OpenStreetMap
      </div>
    </div>
  );
}
