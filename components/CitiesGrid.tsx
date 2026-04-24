'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { City } from '@/lib/notion';

type Props = {
  cities: Pick<City,
    'id' | 'name' | 'slug' | 'country' | 'been' | 'go' | 'heroImage' | 'personalPhoto' |
    'population' | 'elevation' | 'avgHigh' | 'avgLow' | 'rainfall' | 'koppen' | 'founded'
  >[];
};

type SortKey = 'name' | 'population' | 'elevation' | 'avgHigh' | 'avgLow' | 'rainfall' | 'founded';
type Filter = 'all' | 'been' | 'go';

export default function CitiesGrid({ cities }: Props) {
  const [sort, setSort] = useState<SortKey>('name');
  const [desc, setDesc] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    let list = cities;
    if (filter === 'been') list = list.filter(c => c.been);
    if (filter === 'go') list = list.filter(c => c.go);
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      list = list.filter(c =>
        c.name.toLowerCase().includes(needle) || (c.country || '').toLowerCase().includes(needle)
      );
    }
    // sort
    const get = (c: any): any => {
      if (sort === 'name') return c.name?.toLowerCase() ?? '';
      if (sort === 'founded') {
        const m = (c.founded || '').match(/\d+/);
        const n = m ? parseInt(m[0], 10) : null;
        return c.founded?.includes('BC') && n ? -n : n;
      }
      return c[sort];
    };
    const sorted = [...list].sort((a, b) => {
      const av = get(a), bv = get(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (av < bv) return desc ? 1 : -1;
      if (av > bv) return desc ? -1 : 1;
      return 0;
    });
    return sorted;
  }, [cities, sort, desc, filter, q]);

  const sortButtons: { k: SortKey; label: string }[] = [
    { k: 'name', label: 'A–Z' },
    { k: 'population', label: 'Population' },
    { k: 'avgHigh', label: 'Hottest' },
    { k: 'avgLow', label: 'Coldest' },
    { k: 'rainfall', label: 'Rainfall' },
    { k: 'elevation', label: 'Elevation' },
    { k: 'founded', label: 'Founded' },
  ];

  return (
    <section className="max-w-page mx-auto px-5 py-10">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-h1 text-ink-deep">Cities</h1>
          <p className="text-slate mt-1">{filtered.length} of {cities.length}</p>
        </div>
        <input
          type="text"
          placeholder="Search city or country"
          value={q}
          onChange={e => setQ(e.target.value)}
          className="px-3 py-2 rounded border border-sand bg-cream-soft text-ink text-sm focus:outline-none focus:border-teal w-64"
        />
      </div>

      <div className="mt-5 flex flex-wrap gap-2 text-small">
        {(['all','been','go'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={
              'px-3 py-1.5 rounded-full border transition-colors capitalize ' +
              (filter === f
                ? 'bg-teal text-white border-teal'
                : 'bg-cream-soft text-slate border-sand hover:border-slate')
            }
          >
            {f === 'all' ? 'All' : f === 'been' ? 'Been' : 'Go'}
          </button>
        ))}

        <span className="ml-2 text-muted self-center">Sort:</span>
        {sortButtons.map(s => (
          <button
            key={s.k}
            onClick={() => {
              if (sort === s.k) setDesc(d => !d);
              else { setSort(s.k); setDesc(false); }
            }}
            className={
              'px-3 py-1.5 rounded-full border transition-colors ' +
              (sort === s.k
                ? 'bg-ink-deep text-cream-soft border-ink-deep'
                : 'bg-cream-soft text-slate border-sand hover:border-slate')
            }
          >
            {s.label}{sort === s.k ? (desc ? ' ↓' : ' ↑') : ''}
          </button>
        ))}
      </div>

      <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {filtered.map(c => (
          <Link key={c.id} href={`/cities/${c.slug}`} className="card group">
            <div className="aspect-[4/3] bg-sand overflow-hidden">
              {(c.personalPhoto || c.heroImage) ? (
                <img
                  src={c.personalPhoto || c.heroImage!}
                  alt={c.name}
                  className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-500"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted text-small">
                  No image
                </div>
              )}
            </div>
            <div className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-ink-deep font-medium">{c.name}</h3>
                  <p className="text-small text-slate">{c.country}</p>
                </div>
                {c.been && <span className="pill bg-teal/10 text-teal">Been</span>}
                {!c.been && c.go && <span className="pill bg-sky/20 text-slate">Go</span>}
              </div>
              <div className="mt-3 text-small text-muted flex flex-wrap gap-x-3 gap-y-0.5">
                {c.population != null && <span>{Intl.NumberFormat('en').format(c.population)} pop</span>}
                {c.avgHigh != null && <span>{c.avgHigh.toFixed(0)}°/{c.avgLow?.toFixed(0) ?? '?'}°C</span>}
                {c.koppen && <span>{c.koppen}</span>}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
