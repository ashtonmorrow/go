'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

type City = {
  id: string;
  name: string;
  slug: string;
  country: string | null;
  been: boolean;
  go: boolean;
  cityFlag: string | null;
  countryFlag: string | null;
  personalPhoto: string | null;
  lat: number | null;
  lng: number | null;
  population: number | null;
  elevation: number | null;
  avgHigh: number | null;
  avgLow: number | null;
  rainfall: number | null;
  koppen: string | null;
  founded: string | null;
  savedPlaces: string | null;
  currency: string | null;
  language: string | null;
  driveSide: 'L' | 'R' | null;
};

type Props = { cities: City[] };

type SortKey = 'name' | 'population' | 'elevation' | 'avgHigh' | 'founded';

const PAGE_SIZE = 36;

export default function CitiesGrid({ cities }: Props) {
  const router = useRouter();
  const [sort, setSort] = useState<SortKey>('name');
  const [desc, setDesc] = useState(false);
  // Independent Been / Go toggles (replacing single 4-value filter).
  // Both off = show all. Either on = show union of selected.
  // Default matches the previous "Been" filter so /cities loads on the same set.
  const [showBeen, setShowBeen] = useState(true);
  const [showGo, setShowGo] = useState(false);
  const [q, setQ] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const filtered = useMemo(() => {
    let list = cities;
    // Apply personal-status toggles. If both off, no status filter.
    if (showBeen || showGo) {
      list = list.filter(c => (showBeen && c.been) || (showGo && c.go));
    }
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      list = list.filter(
        c => c.name.toLowerCase().includes(needle) || (c.country || '').toLowerCase().includes(needle)
      );
    }
    const get = (c: City): any => {
      if (sort === 'name') return c.name?.toLowerCase() ?? '';
      if (sort === 'founded') {
        const m = (c.founded || '').match(/\d+/);
        const n = m ? parseInt(m[0], 10) : null;
        return c.founded?.includes('BC') && n ? -n : n;
      }
      return (c as any)[sort];
    };
    return [...list].sort((a, b) => {
      const av = get(a),
        bv = get(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (av < bv) return desc ? 1 : -1;
      if (av > bv) return desc ? -1 : 1;
      return 0;
    });
  }, [cities, sort, desc, showBeen, showGo, q]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [showBeen, showGo, sort, desc, q]);

  const sentinel = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      entries => {
        for (const e of entries) {
          if (e.isIntersecting) setVisibleCount(v => Math.min(v + PAGE_SIZE, filtered.length));
        }
      },
      { rootMargin: '600px 0px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [filtered.length]);

  const visible = filtered.slice(0, visibleCount);
  const remaining = filtered.length - visibleCount;

  // Sort field buttons (left column under the prose). The wireframe shows 4
  // pills next to the Map toggle. Name is the implicit default (controlled by
  // A–Z / Z–A on the right) so it isn't a button here.
  const sortButtons: { k: SortKey; label: string }[] = [
    { k: 'founded', label: 'Founded' },
    { k: 'population', label: 'Population' },
    { k: 'elevation', label: 'Elevation' },
    { k: 'avgHigh', label: 'Temp' },
  ];

  return (
    <section className="max-w-page mx-auto px-5 py-10">
      {/* Header — two columns. Left is editorial (title, prose). Right is
          everything personal-to-me: search, my Been/Go status, sort direction. */}
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div className="max-w-prose">
          <h1 className="text-h1 text-ink-deep">Cities</h1>
          <p className="text-slate mt-3 leading-relaxed">
            I am currently using Notion to keep my travel notes organized. Originally
            everything was hand curated. Today much of it is scraped from open source
            sites across the web. I&apos;m often asked to share observations or notes
            about a specific destination, so this page seemed like a good compromise.
            Currently the cities postcards directly query my Notion via the API so
            be patient with the load time!
          </p>
          <p className="text-muted mt-3 text-small italic">
            PS, this page is like everything else, just for fun and a work in progress.
          </p>
        </div>

        {/* Right column: search + my filters + sort direction.
            Stacked top-to-bottom; right-aligned to match the wireframe. */}
        <div className="flex flex-col items-start gap-3 self-start">
          <input
            type="text"
            placeholder="Search city or country"
            value={q}
            onChange={e => setQ(e.target.value)}
            className="px-3 py-2 rounded border border-sand bg-white text-ink text-sm focus:outline-none focus:border-teal w-64"
          />
          <div className="flex items-center gap-5">
            <Toggle on={showBeen} onChange={setShowBeen} label="Been?" />
            <Toggle on={showGo} onChange={setShowGo} label="Go?" />
          </div>
          <Segmented
            value={desc ? 'desc' : 'asc'}
            options={[
              { value: 'asc', label: 'A-Z' },
              { value: 'desc', label: 'Z-A' },
            ]}
            onChange={v => setDesc(v === 'desc')}
          />
        </div>
      </div>

      {/* Below the header: Map toggle on the far left, then sort-field pills.
          The Map toggle navigates to /map (where, on that page, the toggle
          would appear "on" — current page is /cities so it's off here). */}
      <div className="mt-6 flex flex-wrap items-center gap-3 text-small">
        <Toggle on={false} onChange={() => router.push('/map')} label="Map" />
        <div className="flex flex-wrap gap-2 ml-2">
          {sortButtons.map(s => (
            <button
              key={s.k}
              onClick={() => setSort(s.k)}
              className={
                'px-4 py-2 rounded-md transition-colors font-medium ' +
                (sort === s.k
                  ? 'bg-ink-deep text-cream-soft'
                  : 'bg-ink-deep/95 text-cream-soft hover:bg-ink-deep')
              }
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Postcard grid: landscape cards. 4 at xl, 3 at lg, 2 at md, 1 at base */}
      <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {visible.map(c => (
          <CityCard key={c.id} city={c} onClick={() => router.push(`/cities/${c.slug}`)} />
        ))}
      </div>

      {remaining > 0 && (
        <div ref={sentinel} className="mt-8 text-center text-small text-muted py-8">
          Loading more… ({remaining} left)
        </div>
      )}

      {filtered.length === 0 && (
        <div className="text-center py-20 text-muted">
          <p>No cities match.</p>
        </div>
      )}
    </section>
  );
}

// === Toggle ===
// iOS-style switch with a label to the right. `on` is controlled. The whole
// row is one button so the label is also a click target. We intentionally use
// dark "ink-deep" for the on state to match the wireframe's solid black pill,
// not the brand teal — keeps the chrome visually quiet.
function Toggle({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className="inline-flex items-center gap-2 group"
    >
      <span
        className={
          'relative inline-block w-11 h-6 rounded-full transition-colors ' +
          (on ? 'bg-ink-deep' : 'bg-sand')
        }
      >
        <span
          className={
            'absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ' +
            (on ? 'left-[22px]' : 'left-0.5')
          }
        />
      </span>
      <span className="text-ink text-small font-medium">{label}</span>
    </button>
  );
}

// === Segmented control ===
// Two-option pill segment, used for A–Z / Z–A sort direction in the header.
// Generic on the value type so the same component can host other binary
// segment controls later (e.g. C / F unit toggle).
function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (next: T) => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-sand bg-white p-0.5">
      {options.map(o => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={
              'px-3 py-1 rounded text-small font-medium transition-colors ' +
              (active ? 'bg-cream-soft text-ink-deep' : 'text-slate hover:text-ink-deep')
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Postmark({ label, subtitle, color }: { label: string; subtitle: string; color: string }) {
  // Hand-stamped postal cancellation mark, semi-transparent, slightly rotated,
  // overlapping the postage stamp the way real postmarks do.
  // Shape: outer ring + inner ring, horizontal cancellation bar through middle,
  // top arc text with the label and bottom arc with the subtitle.
  const id = `pm-${Math.random().toString(36).slice(2, 7)}`;
  return (
    <div
      className="absolute z-20 pointer-events-none"
      style={{
        // Positioned to overlap the upper-left corner of the postage stamp,
        // simulating a real postal cancellation hitting the stamp. The stamp
        // now sits at top-1, so the postmark drops a hair to land more
        // squarely on the stamp face rather than running off the top.
        top: 2,
        right: 38,
        width: 60,
        height: 60,
        transform: 'rotate(-14deg)',
        opacity: 0.78,
      }}
      aria-hidden
    >
      <svg viewBox="0 0 64 64" width="60" height="60">
        <defs>
          <path id={`${id}-top`} d="M 8 32 a 24 24 0 0 1 48 0" fill="none" />
          <path id={`${id}-bot`} d="M 8 32 a 24 24 0 0 0 48 0" fill="none" />
        </defs>
        {/* Outer & inner concentric rings */}
        <circle cx="32" cy="32" r="29" fill="none" stroke={color} strokeWidth="1.5" />
        <circle cx="32" cy="32" r="22" fill="none" stroke={color} strokeWidth="0.8" />
        {/* Cancellation bar */}
        <line x1="2" y1="32" x2="62" y2="32" stroke={color} strokeWidth="2" />
        {/* Top arc text — the main label */}
        <text fontSize="6.5" fontWeight="700" fill={color} letterSpacing="1.2">
          <textPath href={`#${id}-top`} startOffset="50%" textAnchor="middle">
            {label}
          </textPath>
        </text>
        {/* Bottom arc text — country/subtitle */}
        <text fontSize="4" fontWeight="500" fill={color} letterSpacing="0.4">
          <textPath href={`#${id}-bot`} startOffset="50%" textAnchor="middle">
            {(subtitle || '').slice(0, 18).toUpperCase()}
          </textPath>
        </text>
      </svg>
    </div>
  );
}

function fmtCoord(value: number | null, axis: 'lat' | 'lng'): string {
  if (value == null) return '—';
  const dir = axis === 'lat' ? (value >= 0 ? 'N' : 'S') : value >= 0 ? 'E' : 'W';
  return `${Math.abs(value).toFixed(2)}°${dir}`;
}

function fmtPopulation(n: number | null): string | null {
  if (n == null) return null;
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(0) + 'K';
  return Intl.NumberFormat('en').format(n);
}

function CityCard({ city, onClick }: { city: City; onClick: () => void }) {
  const flagSrc = city.cityFlag || city.countryFlag;
  // Postcard flips on hover IF we have coordinates (so we can render a map back).
  const hasLocation = city.lat != null && city.lng != null;
  const dotX = city.lng != null ? ((city.lng + 180) / 360) * 100 : null;
  const dotY = city.lat != null ? ((90 - city.lat) / 180) * 60 : null;

  // Tiny deterministic rotation per card so the grid feels like a wall of
  // hand-placed postcards, not a uniform layout. Hash the id to a stable
  // angle in roughly [-1.2°, +1.2°].
  const seed = (city.id || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const tilt = ((seed % 25) - 12) / 10; // -1.2..1.2 deg

  // === Back-of-postcard map ===
  // Earlier this used a single OSM tile + background-position to "pan" to the
  // city. That math is wrong with `background-size: cover` on a non-square
  // card: cover scales the tile to fill the card and on the wider axis there's
  // no slack to pan, so the city ends up offset from where the pin is drawn
  // (50%/50%). Fix: render a 3x3 grid of tiles centred on the city's tile,
  // then translate that grid so the city's exact pixel sits dead-centre under
  // the pin. With 9 tiles around the city we always have enough map to fill
  // the card no matter where the city falls within its tile.
  const ZOOM = 4;
  const TILE_SIZE = 256;
  type Tile = { dx: number; dy: number; url: string | null };
  let tiles: Tile[] = [];
  let cityPxX = 0;
  let cityPxY = 0;
  if (hasLocation) {
    const n = Math.pow(2, ZOOM);
    const xf = ((city.lng! + 180) / 360) * n;
    const yf = ((1 - Math.asinh(Math.tan((city.lat! * Math.PI) / 180)) / Math.PI) / 2) * n;
    const cityTileX = Math.floor(xf);
    const cityTileY = Math.floor(yf);
    cityPxX = (xf - cityTileX) * TILE_SIZE; // 0..256, city's x within centre tile
    cityPxY = (yf - cityTileY) * TILE_SIZE;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const tx = cityTileX + dx;
        const ty = cityTileY + dy;
        // Wrap longitude (the world is a cylinder); clamp out-of-range Y near the poles
        const wx = ((tx % n) + n) % n;
        const url = ty < 0 || ty >= n ? null : `https://tile.openstreetmap.org/${ZOOM}/${wx}/${ty}.png`;
        tiles.push({ dx, dy, url });
      }
    }
  }
  // City's pixel within the 3x3 grid (768x768): centre tile starts at (TILE_SIZE, TILE_SIZE).
  const gridCityX = TILE_SIZE + cityPxX; // ∈ [256, 512]
  const gridCityY = TILE_SIZE + cityPxY;

  // Outer wrapper: provides perspective + size + click handler
  return (
    <div
      onClick={onClick}
      className={'flip-perspective cursor-pointer group ' + (hasLocation ? '' : 'no-flip')}
      style={{ aspectRatio: '5 / 3', transform: `rotate(${tilt}deg)` }}
    >
      <div className={'flip-card ' + (hasLocation ? '' : '!transform-none')}>
        {/* === BACK FACE === a country/region map with the city marked === */}
        {hasLocation && tiles.length > 0 && (
          <div
            className="flip-face flip-face-back overflow-hidden bg-cream-soft"
            style={{
              border: '1px solid hsl(35 22% 82%)',
              borderRadius: 4,
              boxShadow:
                '0 1px 2px rgba(15, 23, 42, 0.05), 0 4px 8px rgba(15, 23, 42, 0.05), 0 12px 18px -6px rgba(15, 23, 42, 0.06)',
            }}
          >
            {/* 3x3 tile grid, anchored so the city's exact pixel sits at
                card centre (50% / 50%). The translate negates gridCity to
                shift the grid up-and-left, then `left:50%;top:50%` puts that
                negated point at the card centre — net effect: gridCity is at
                card centre. The pin is drawn at card centre below. */}
            <div
              className="absolute"
              style={{
                left: '50%',
                top: '50%',
                width: TILE_SIZE * 3,
                height: TILE_SIZE * 3,
                transform: `translate(${-gridCityX}px, ${-gridCityY}px)`,
                pointerEvents: 'none',
              }}
            >
              {tiles.map(t =>
                t.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={`${t.dx}_${t.dy}`}
                    src={t.url}
                    alt=""
                    style={{
                      position: 'absolute',
                      left: (t.dx + 1) * TILE_SIZE,
                      top: (t.dy + 1) * TILE_SIZE,
                      width: TILE_SIZE,
                      height: TILE_SIZE,
                      display: 'block',
                    }}
                    loading="lazy"
                    draggable={false}
                  />
                ) : null
              )}
            </div>

            {/* City pin always at container centre (since the tile grid is
                anchored so the city's pixel lands here). */}
            <div
              className="absolute"
              style={{
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
                pointerEvents: 'none',
              }}
            >
              <div
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  background: '#2f6f73',
                  border: '2px solid white',
                  boxShadow: '0 0 0 6px rgba(47, 111, 115, 0.22)',
                }}
              />
            </div>

            {/* OSM attribution (required by their tile policy) */}
            <div
              className="absolute top-1 right-1 text-[8px] bg-white/85 text-ink-deep/70 px-1 rounded leading-none py-0.5"
              style={{ pointerEvents: 'none' }}
            >
              © OpenStreetMap
            </div>

            {/* Bottom strip: city name + "View my Pins" button (if savedPlaces) */}
            <div
              className="absolute bottom-0 inset-x-0 px-3 py-2 z-10 flex items-center justify-between gap-3"
              style={{
                background: 'linear-gradient(transparent, rgba(15, 23, 42, 0.7))',
              }}
            >
              <div className="text-white text-[11px] uppercase tracking-[0.18em] font-medium truncate">
                {city.name}
              </div>
              {city.savedPlaces && (
                <a
                  href={city.savedPlaces}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  className="inline-flex items-center gap-1.5 px-3 py-1 bg-white text-ink-deep text-[11px] font-medium hover:bg-cream-soft transition-colors flex-shrink-0"
                  style={{
                    borderBottom: '1px solid #0f172a',
                    borderRadius: 0,
                    boxShadow:
                      '0 0.6px 0.6px -1.25px rgba(0,0,0,0.18), 0 2.29px 2.29px -2.5px rgba(0,0,0,0.16), 0 10px 10px -3.75px rgba(0,0,0,0.06)',
                  }}
                >
                  View my Pins <span aria-hidden>📍</span>
                </a>
              )}
            </div>
          </div>
        )}

        {/* === FRONT FACE (the postcard back side — address+stamp) === */}
        <div
      className="flip-face postcard relative transition-shadow"
      style={{
        // Warm-cream postcard with solid border + warm drop shadow + inset border ring
        background: '#fdfaf2', // slightly aged cream paper
        border: '1px solid hsl(35 25% 78%)',
        borderRadius: 4,
        boxShadow:
          // Warm drop shadow (paper resting on a desk, not blue-gray)
          '0 1px 2px rgba(80, 56, 28, 0.06), 0 4px 8px rgba(80, 56, 28, 0.07), 0 12px 18px -6px rgba(80, 56, 28, 0.08),' +
          // Inset border line (printed frame inside the card edge)
          ' inset 0 0 0 1px rgba(255, 255, 255, 0.5), inset 0 0 0 4px transparent, inset 0 0 0 5px hsl(35 25% 86%)',
      }}
    >
      {/* === STAMP — top-right ===
          Tucked closer to the top edge of the card so the cancellation
          mark sits visibly on top of it (postmark below). White inner
          background + cream perforations for clearly visible scalloped
          edges against the warm card paper. */}
      <div
        className="stamp-perforated absolute top-1 right-2 z-10 w-[68px] h-[84px] bg-white p-2 flex items-center justify-center"
        style={{
          transform: 'rotate(2deg)',
          boxShadow: '0 1px 1px rgba(80, 56, 28, 0.08)',
        }}
        title={city.cityFlag ? `${city.name} flag` : city.country ? `${city.country} flag` : ''}
      >
        {flagSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={flagSrc} alt="" className="w-full h-full object-contain" loading="lazy" />
        ) : (
          <div className="w-full h-full bg-sand" />
        )}
      </div>

      {/* === POSTMARK CANCELLATION STAMP ===
          Round inked stamp overlapping the postage stamp (like a real cancellation).
          "VISITED" for Been, "PLANNING" for Go-only. Pulled up to follow
          the stamp's new top-1 position. */}
      {(city.been || city.go) && (
        <Postmark
          label={city.been ? 'VISITED' : 'PLANNING'}
          subtitle={city.country || ''}
          color={city.been ? '#2f6f73' : '#6b7c8f'}
        />
      )}

      {/* === HEADER — top-left: city + country === */}
      <div className="px-3.5 pt-3" style={{ paddingRight: 88 }}>
        <div className="flex items-center gap-1.5">
          <h3 className="text-ink-deep font-bold text-[15px] uppercase tracking-wide leading-tight truncate">
            {city.name}
          </h3>
          {city.savedPlaces && (
            <a
              href={city.savedPlaces}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              aria-label={`Open ${city.name} in Google Maps`}
              title="Open my saved places in Google Maps"
              className="text-[14px] leading-none flex-shrink-0 hover:scale-110 transition-transform"
            >
              <span aria-hidden>📍</span>
            </a>
          )}
        </div>
        <p className="text-[10px] text-slate uppercase tracking-[0.12em] mt-0.5 truncate">
          {city.country}
        </p>
      </div>

      {/* === POSTCARD MIDDLE LINE — vertical divider === */}
      <div className="absolute left-[42%] top-[58%] bottom-3 w-px border-l border-dashed border-sand" />

      {/* === BODY — postmark on left, address-style data on right === */}
      <div className="absolute inset-x-3.5 top-[58%] bottom-2 flex gap-3">
        {/* LEFT — postmark with location dot */}
        <div className="w-[38%] flex flex-col">
          <svg viewBox="0 0 100 60" className="w-full" preserveAspectRatio="none" style={{ height: 32 }}>
            <line x1="0" y1="30" x2="100" y2="30" stroke="hsl(35 22% 84%)" strokeWidth="0.5" />
            <line x1="50" y1="0" x2="50" y2="60" stroke="hsl(35 22% 84%)" strokeWidth="0.5" />
            <line x1="0" y1="22" x2="100" y2="22" stroke="hsl(35 22% 90%)" strokeWidth="0.3" strokeDasharray="1 2" />
            <line x1="0" y1="38" x2="100" y2="38" stroke="hsl(35 22% 90%)" strokeWidth="0.3" strokeDasharray="1 2" />
            {dotX != null && dotY != null && (
              <>
                <circle cx={dotX} cy={dotY} r="2.5" fill="#2f6f73" />
                <circle cx={dotX} cy={dotY} r="5" fill="#2f6f73" opacity="0.18" />
              </>
            )}
          </svg>
          <div className="mt-0.5 text-[9px] font-mono text-muted leading-tight">
            <div>{fmtCoord(city.lat, 'lat')}</div>
            <div>{fmtCoord(city.lng, 'lng')}</div>
          </div>
        </div>

        {/* RIGHT — address-style stat list. Compact 6-row layout fits inside
            the bottom 42% of the card without forcing scrolling on smaller
            tiles. Currency / language / drive-side come from the linked
            Country page; if absent, the row is omitted. */}
        <div className="flex-1 min-w-0">
          <dl className="text-[10px] leading-[1.35] tabular-nums">
            {fmtPopulation(city.population) && (
              <div className="flex justify-between gap-2">
                <dt className="text-muted">pop</dt>
                <dd className="text-ink truncate">{fmtPopulation(city.population)}</dd>
              </div>
            )}
            {(city.avgHigh != null || city.avgLow != null) && (
              <div className="flex justify-between gap-2">
                <dt className="text-muted">avg</dt>
                <dd className="text-ink">
                  {city.avgLow != null ? city.avgLow.toFixed(0) : '?'}–
                  {city.avgHigh != null ? city.avgHigh.toFixed(0) : '?'}°C
                </dd>
              </div>
            )}
            {city.currency && (
              <div className="flex justify-between gap-2">
                <dt className="text-muted">cur</dt>
                <dd className="text-ink truncate" title={city.currency}>{city.currency}</dd>
              </div>
            )}
            {city.language && (
              <div className="flex justify-between gap-2">
                <dt className="text-muted">lang</dt>
                <dd className="text-ink truncate" title={city.language}>{city.language}</dd>
              </div>
            )}
            {city.driveSide && (
              <div className="flex justify-between gap-2">
                <dt className="text-muted">drive</dt>
                <dd className="text-ink">{city.driveSide === 'L' ? 'left' : 'right'}</dd>
              </div>
            )}
            {city.koppen && (
              <div className="flex justify-between gap-2">
                <dt className="text-muted">cli</dt>
                <dd className="text-ink">{city.koppen}</dd>
              </div>
            )}
          </dl>
        </div>
      </div>

      {/* Saved-places link is now in the header next to the city name as a
          red 📍 emoji, so this corner is intentionally empty. */}
        </div>
      </div>
    </div>
  );
}
