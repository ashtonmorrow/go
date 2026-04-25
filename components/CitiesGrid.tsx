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
};

type Props = { cities: City[] };

type SortKey = 'name' | 'population' | 'elevation' | 'avgHigh' | 'avgLow' | 'rainfall' | 'founded';
type Filter = 'all' | 'been' | 'go' | 'saved';

const PAGE_SIZE = 36;

export default function CitiesGrid({ cities }: Props) {
  const router = useRouter();
  const [sort, setSort] = useState<SortKey>('name');
  const [desc, setDesc] = useState(false);
  const [filter, setFilter] = useState<Filter>('been');
  const [q, setQ] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const filtered = useMemo(() => {
    let list = cities;
    if (filter === 'been') list = list.filter(c => c.been);
    else if (filter === 'go') list = list.filter(c => c.go);
    else if (filter === 'saved') list = list.filter(c => !!c.savedPlaces);
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
  }, [cities, sort, desc, filter, q]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [filter, sort, desc, q]);

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

  const filterChips: { k: Filter; label: string; count: number }[] = [
    { k: 'been', label: 'Been', count: cities.filter(c => c.been).length },
    { k: 'go', label: 'Go', count: cities.filter(c => c.go).length },
    { k: 'saved', label: 'Saved', count: cities.filter(c => !!c.savedPlaces).length },
    { k: 'all', label: 'All', count: cities.length },
  ];

  const sortButtons: { k: SortKey; label: string }[] = [
    { k: 'name', label: 'A–Z' },
    { k: 'population', label: 'Pop' },
    { k: 'avgHigh', label: 'Hot' },
    { k: 'avgLow', label: 'Cold' },
    { k: 'rainfall', label: 'Rain' },
    { k: 'elevation', label: 'Elev' },
    { k: 'founded', label: 'Founded' },
  ];

  return (
    <section className="max-w-page mx-auto px-5 py-10">
      <div className="flex items-end justify-between gap-4 flex-wrap">
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
          <p className="text-slate mt-4 text-small">
            {filtered.length} of {cities.length}
          </p>
        </div>
        <input
          type="text"
          placeholder="Search city or country"
          value={q}
          onChange={e => setQ(e.target.value)}
          className="px-3 py-2 rounded border border-sand bg-white text-ink text-sm focus:outline-none focus:border-teal w-64 self-start"
        />
      </div>

      <div className="mt-5 flex flex-wrap gap-2 text-small">
        {filterChips.map(c => {
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

        <span className="ml-2 text-muted self-center">Sort:</span>
        {sortButtons.map(s => (
          <button
            key={s.k}
            onClick={() => {
              if (sort === s.k) setDesc(d => !d);
              else {
                setSort(s.k);
                setDesc(false);
              }
            }}
            className={
              'px-3 py-1.5 rounded-full border transition-colors ' +
              (sort === s.k
                ? 'bg-ink-deep text-cream-soft border-ink-deep'
                : 'bg-white text-slate border-sand hover:border-slate')
            }
          >
            {s.label}
            {sort === s.k ? (desc ? ' ↓' : ' ↑') : ''}
          </button>
        ))}
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
        // simulating a real postal cancellation hitting the stamp.
        top: -4,
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

  // OSM tile coords for the back-of-postcard map.
  // Zoom 4 = ~2500km per tile (continental view). For most countries, the city
  // sits inside its tile with country context visible around it.
  const ZOOM = 4;
  let tileUrl: string | null = null;
  let subPctX = 50;
  let subPctY = 50;
  if (hasLocation) {
    const n = Math.pow(2, ZOOM);
    const xf = ((city.lng! + 180) / 360) * n;
    const yf = ((1 - Math.asinh(Math.tan((city.lat! * Math.PI) / 180)) / Math.PI) / 2) * n;
    const tileX = Math.floor(xf);
    const tileY = Math.floor(yf);
    tileUrl = `https://tile.openstreetmap.org/${ZOOM}/${tileX}/${tileY}.png`;
    subPctX = ((xf - tileX) * 100); // city's x within tile, as percent
    subPctY = ((yf - tileY) * 100);
  }

  // Outer wrapper: provides perspective + size + click handler
  return (
    <div
      onClick={onClick}
      className={'flip-perspective cursor-pointer group ' + (hasLocation ? '' : 'no-flip')}
      style={{ aspectRatio: '5 / 3', transform: `rotate(${tilt}deg)` }}
    >
      <div className={'flip-card ' + (hasLocation ? '' : '!transform-none')}>
        {/* === BACK FACE === a country/region map with the city marked === */}
        {hasLocation && tileUrl && (
          <div
            className="flip-face flip-face-back overflow-hidden bg-white"
            style={{
              border: '1px solid hsl(35 22% 82%)',
              borderRadius: 4,
              boxShadow:
                '0 1px 2px rgba(15, 23, 42, 0.05), 0 4px 8px rgba(15, 23, 42, 0.05), 0 12px 18px -6px rgba(15, 23, 42, 0.06)',
            }}
          >
            {/* Square OSM tile, scaled to height of postcard, centered horizontally */}
            <div
              className="absolute"
              style={{
                top: 0,
                bottom: 0,
                aspectRatio: '1 / 1',
                left: '50%',
                transform: 'translateX(-50%)',
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={tileUrl}
                alt={`Map of ${city.name} region`}
                className="w-full h-full object-cover"
                loading="lazy"
              />
              {/* City pin at the city's exact sub-tile position */}
              <div
                className="absolute"
                style={{
                  left: `${subPctX}%`,
                  top: `${subPctY}%`,
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
                    boxShadow: '0 0 0 5px rgba(47, 111, 115, 0.22)',
                  }}
                />
              </div>
            </div>

            {/* City name strip at bottom (like postcard caption) */}
            <div
              className="absolute bottom-0 inset-x-0 py-1.5 px-3 text-white text-[11px] uppercase tracking-[0.18em] font-medium z-10"
              style={{
                background: 'linear-gradient(transparent, rgba(15, 23, 42, 0.65))',
              }}
            >
              {city.name}
            </div>

            {/* OSM attribution (required by their tile policy) */}
            <div
              className="absolute top-1 right-1 text-[8px] bg-white/85 text-ink-deep/60 px-1 rounded leading-none py-0.5"
              style={{ pointerEvents: 'none' }}
            >
              © OpenStreetMap
            </div>
          </div>
        )}

        {/* === FRONT FACE (the postcard back side — address+stamp) === */}
        <div
      className="flip-face postcard relative bg-white transition-shadow"
      style={{
        // White postcard with solid border + soft drop shadow (like sitting on a desk)
        border: '1px solid hsl(35 22% 82%)',
        borderRadius: 4,
        boxShadow:
          '0 1px 2px rgba(15, 23, 42, 0.05), 0 4px 8px rgba(15, 23, 42, 0.05), 0 12px 18px -6px rgba(15, 23, 42, 0.06)',
      }}
    >
      {/* === STAMP — top-right ===
          Real-stamp look via stamp-perforated CSS class (scalloped edges via mask) */}
      <div
        className="stamp-perforated absolute top-2.5 right-2.5 z-10 w-[68px] h-[84px] bg-cream-soft p-2 flex items-center justify-center"
        style={{
          transform: 'rotate(2deg)',
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
          "VISITED" for Been, "PLANNING" for Go-only. */}
      {(city.been || city.go) && (
        <Postmark
          label={city.been ? 'VISITED' : 'PLANNING'}
          subtitle={city.country || ''}
          color={city.been ? '#2f6f73' : '#6b7c8f'}
        />
      )}

      {/* === HEADER — top-left: city + country === */}
      <div className="px-3.5 pt-3" style={{ paddingRight: 88 }}>
        <h3 className="text-ink-deep font-bold text-[15px] uppercase tracking-wide leading-tight truncate">
          {city.name}
        </h3>
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

        {/* RIGHT — address-style stat list */}
        <div className="flex-1 min-w-0">
          <dl className="text-[10px] leading-[1.4] tabular-nums">
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
            {city.koppen && (
              <div className="flex justify-between gap-2">
                <dt className="text-muted">cli</dt>
                <dd className="text-ink">{city.koppen}</dd>
              </div>
            )}
            {city.elevation != null && (
              <div className="flex justify-between gap-2">
                <dt className="text-muted">elev</dt>
                <dd className="text-ink">{Math.round(city.elevation)}m</dd>
              </div>
            )}
          </dl>
        </div>
      </div>

      {/* === SAVED-PLACES PIN — bottom-right === */}
      {city.savedPlaces && (
        <a
          href={city.savedPlaces}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          aria-label={`Open ${city.name} in Google Maps`}
          title="Open my saved places in Google Maps"
          className="absolute bottom-2 right-2 z-10 w-6 h-6 rounded-full bg-cream/95 backdrop-blur border border-sand text-teal grid place-items-center hover:bg-teal hover:text-white transition-colors"
        >
          <svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor" aria-hidden>
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z" />
          </svg>
        </a>
      )}
        </div>
      </div>
    </div>
  );
}
