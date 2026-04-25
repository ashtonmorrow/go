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
        <div>
          <h1 className="text-h1 text-ink-deep">Cities</h1>
          <p className="text-slate mt-1 text-small">
            {filtered.length} of {cities.length}
          </p>
        </div>
        <input
          type="text"
          placeholder="Search city or country"
          value={q}
          onChange={e => setQ(e.target.value)}
          className="px-3 py-2 rounded border border-sand bg-white text-ink text-sm focus:outline-none focus:border-teal w-64"
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
  const dotX = city.lng != null ? ((city.lng + 180) / 360) * 100 : null;
  const dotY = city.lat != null ? ((90 - city.lat) / 180) * 60 : null;

  return (
    <div
      onClick={onClick}
      className="postcard group cursor-pointer relative bg-cream-soft hover:bg-cream transition-colors"
      style={{
        // Postcard outer "perforation" — subtle dotted/dashed border
        border: '1px dashed hsl(35 18% 72%)',
        borderRadius: 6,
        boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04), 0 4px 8px rgba(15, 23, 42, 0.03)',
        aspectRatio: '5 / 3',
      }}
    >
      {/* === STAMP — top-right === */}
      <div
        className="absolute top-2 right-2 z-10 w-12 h-14 bg-cream-soft p-1 flex items-center justify-center"
        style={{
          // Mimic a stamp's perforated edge with a dashed border
          border: '1.5px dashed hsl(35 18% 70%)',
          transform: 'rotate(2deg)',
          boxShadow: '0 1px 2px rgba(15, 23, 42, 0.06)',
        }}
        title={city.cityFlag ? `${city.name} flag` : city.country ? `${city.country} flag` : ''}
      >
        {flagSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={flagSrc}
            alt=""
            className="w-full h-full object-contain"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full bg-sand rounded-sm" />
        )}
      </div>

      {/* === HEADER — top-left: city + country === */}
      <div className="px-3.5 pt-3 pr-16">
        <h3 className="text-ink-deep font-bold text-[15px] uppercase tracking-wide leading-tight truncate">
          {city.name}
        </h3>
        <p className="text-[10px] text-slate uppercase tracking-[0.12em] mt-0.5 truncate">
          {city.country}
          {city.been && <span className="ml-1 text-teal">· been</span>}
          {!city.been && city.go && <span className="ml-1 text-slate">· go</span>}
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
  );
}
