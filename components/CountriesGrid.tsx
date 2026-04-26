'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

// Minimal country shape the grid needs. Mirrors the "minimal" pattern used
// by CitiesGrid — keeps server payload small and the client component
// loosely coupled to the Notion schema.
type Country = {
  id: string;
  name: string;
  slug: string;
  flag: string | null;
  iso2: string | null;
  capital: string | null;
  language: string | null;
  currency: string | null;
  callingCode: string | null;
  schengen: boolean;
  voltage: string | null;
  plugTypes: string[];
  emergencyNumber: string | null;
  cityCount: number;
  beenCount: number;
  visa: string | null;
  tapWater: string | null;
};

type Props = { countries: Country[] };

type Sort = 'name' | 'visited' | 'cities' | 'continent';

export default function CountriesGrid({ countries }: Props) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('name');
  const [filter, setFilter] = useState<'all' | 'visited' | 'planned'>('all');

  const filtered = useMemo(() => {
    let list = countries;

    if (filter === 'visited') list = list.filter(c => c.beenCount > 0);
    if (filter === 'planned') list = list.filter(c => c.cityCount > 0 && c.beenCount === 0);

    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      list = list.filter(
        c => c.name.toLowerCase().includes(needle) || (c.iso2 || '').toLowerCase().includes(needle)
      );
    }

    return [...list].sort((a, b) => {
      if (sort === 'visited') return b.beenCount - a.beenCount || a.name.localeCompare(b.name);
      if (sort === 'cities') return b.cityCount - a.cityCount || a.name.localeCompare(b.name);
      return a.name.localeCompare(b.name);
    });
  }, [countries, q, sort, filter]);

  const visitedCount = countries.filter(c => c.beenCount > 0).length;

  return (
    <section className="max-w-page mx-auto px-5 py-10">
      <div className="max-w-prose">
        <h1 className="text-h1 text-ink-deep">Countries</h1>
        <p className="text-slate mt-3 leading-relaxed">
          {countries.length} countries in the atlas, {visitedCount} of them visited so far.
          Hover any flag for the practicalities — capital, language, currency, plug types.
        </p>
      </div>

      {/* Compact controls bar — search left, filter chips + sort right. */}
      <div className="mt-6 flex flex-wrap items-center gap-3 text-small">
        <input
          type="search"
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search country or ISO"
          className="px-3 py-2 rounded-md border border-sand bg-white text-ink focus:outline-none focus:border-ink-deep focus:ring-2 focus:ring-ink-deep/10 w-56"
        />

        <div className="flex flex-wrap gap-1">
          {[
            { k: 'all' as const, label: 'All', count: countries.length },
            { k: 'visited' as const, label: 'Visited', count: visitedCount },
            { k: 'planned' as const, label: 'Planned only', count: countries.filter(c => c.cityCount > 0 && c.beenCount === 0).length },
          ].map(c => {
            const active = filter === c.k;
            return (
              <button
                key={c.k}
                onClick={() => setFilter(c.k)}
                className={
                  'px-3 py-1.5 rounded-full border transition-colors ' +
                  (active
                    ? 'bg-ink-deep text-cream-soft border-ink-deep'
                    : 'bg-white text-slate border-sand hover:border-slate')
                }
              >
                {c.label} <span className="opacity-70 ml-1 tabular-nums">{c.count}</span>
              </button>
            );
          })}
        </div>

        <div className="ml-auto flex items-center gap-2 text-muted">
          <span>Sort:</span>
          {[
            { k: 'name' as const, label: 'A–Z' },
            { k: 'visited' as const, label: 'Most visited' },
            { k: 'cities' as const, label: 'Most cities' },
          ].map(s => (
            <button
              key={s.k}
              onClick={() => setSort(s.k)}
              className={
                'px-3 py-1 rounded-md transition-colors text-small font-medium ' +
                (sort === s.k ? 'bg-ink-deep text-cream-soft' : 'text-slate hover:text-ink-deep')
              }
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <p className="mt-3 text-small text-muted">
        {filtered.length} of {countries.length}
      </p>

      {/* Flag tile grid — 2 / 3 / 4 / 5 columns at increasing widths. Each
          card uses the shared flip-perspective CSS so the back of the card
          shows facts; identical mechanic to the cities postcards. */}
      <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {filtered.map(c => (
          <FlagCard key={c.id} country={c} onClick={() => router.push(`/countries/${c.slug}`)} />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-20 text-muted">
          <p>No countries match.</p>
        </div>
      )}
    </section>
  );
}

// === FlagCard ===
// Two-faced tile: front is the flag image with country name + ISO badge
// overlaid; back is a list of practicalities. Hover flips on Y-axis, click
// navigates to the country detail page.
function FlagCard({ country, onClick }: { country: Country; onClick: () => void }) {
  // Tiny deterministic tilt per card so the grid feels hand-placed (same
  // trick as CityCard).
  const seed = (country.id || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const tilt = ((seed % 21) - 10) / 12; // -0.83..0.83 deg

  const beenBadge = country.beenCount > 0;

  return (
    <div
      onClick={onClick}
      className="flip-perspective cursor-pointer group"
      style={{ aspectRatio: '3 / 2', transform: `rotate(${tilt}deg)` }}
    >
      <div className="flip-card">
        {/* === BACK FACE — facts === */}
        <div
          className="flip-face flip-face-back overflow-hidden bg-white border border-sand rounded-md shadow-card"
        >
          <div className="h-full p-3 flex flex-col">
            <div className="flex items-baseline justify-between gap-2 mb-1.5">
              <h3 className="text-ink-deep font-semibold text-small leading-tight truncate">
                {country.name}
              </h3>
              {country.iso2 && (
                <span className="text-[9px] font-mono text-muted tracking-[0.1em]">{country.iso2}</span>
              )}
            </div>
            <dl className="text-[10px] leading-tight space-y-0.5 flex-1 min-h-0 overflow-hidden">
              {country.capital && <Fact label="Capital" value={country.capital} />}
              {country.language && <Fact label="Lang" value={country.language} />}
              {country.currency && <Fact label="Currency" value={country.currency} />}
              {country.callingCode && <Fact label="Tel" value={country.callingCode} />}
              {country.voltage && <Fact label="Volt" value={country.voltage} />}
              {country.plugTypes.length > 0 && (
                <Fact label="Plugs" value={country.plugTypes.join(', ')} />
              )}
              {country.visa && <Fact label="Visa" value={country.visa} />}
              {country.tapWater && <Fact label="Water" value={country.tapWater} />}
              {country.emergencyNumber && <Fact label="999" value={country.emergencyNumber} />}
            </dl>
            {country.cityCount > 0 && (
              <div className="mt-1.5 pt-1.5 border-t border-sand text-[10px] text-slate flex justify-between tabular-nums">
                <span>{country.cityCount} cities</span>
                {country.beenCount > 0 && (
                  <span className="text-teal font-medium">{country.beenCount} visited</span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* === FRONT FACE — flag photo === */}
        <div
          className="flip-face overflow-hidden bg-cream-soft border border-sand rounded-md shadow-card relative"
        >
          {country.flag ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={country.flag}
              alt={`${country.name} flag`}
              className="w-full h-full object-cover"
              loading="lazy"
              draggable={false}
            />
          ) : (
            <div className="w-full h-full bg-sand flex items-center justify-center text-muted text-small">
              {country.iso2 || '—'}
            </div>
          )}

          {/* Bottom strip: country name (always readable, even on flag) */}
          <div
            className="absolute bottom-0 inset-x-0 px-3 py-2 z-10 flex items-baseline justify-between gap-2"
            style={{ background: 'linear-gradient(transparent, rgba(15, 23, 42, 0.7))' }}
          >
            <span className="text-white text-small font-medium uppercase tracking-[0.08em] truncate">
              {country.name}
            </span>
            {beenBadge && (
              <span className="text-[9px] uppercase tracking-[0.14em] text-teal bg-white/95 rounded-full px-1.5 py-0.5 flex-shrink-0">
                Been
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 items-baseline">
      <dt className="text-[9px] uppercase tracking-[0.12em] text-muted flex-shrink-0">{label}</dt>
      <dd className="text-ink-deep font-mono truncate text-right text-[10px]" title={value}>
        {value}
      </dd>
    </div>
  );
}
