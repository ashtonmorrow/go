'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { thumbUrl } from '@/lib/imageUrl';

export type AdminCityRow = {
  slug: string;
  name: string;
  country: string | null;
  been: boolean;
  go: boolean;
  heroPhotoUrls: string[];
  coverUrl: string | null;
};

type Filter = 'all' | 'visited' | 'short-list' | 'researching' | 'curated' | 'uncurated';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'visited', label: 'Visited' },
  { id: 'short-list', label: 'Short list' },
  { id: 'researching', label: 'Researching' },
  { id: 'curated', label: 'Curated' },
  { id: 'uncurated', label: 'Auto-pick' },
];

export default function CitiesAdminClient({ rows }: { rows: AdminCityRow[] }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('visited');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      // Search match
      if (q) {
        const hay = `${r.name} ${r.country ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      // Status filter
      switch (filter) {
        case 'visited':
          if (!r.been) return false;
          break;
        case 'short-list':
          if (!r.go || r.been) return false;
          break;
        case 'researching':
          if (r.been || r.go) return false;
          break;
        case 'curated':
          if (r.heroPhotoUrls.length === 0) return false;
          break;
        case 'uncurated':
          if (r.heroPhotoUrls.length > 0) return false;
          break;
        case 'all':
          break;
      }
      return true;
    });
  }, [rows, search, filter]);

  const counts = useMemo(() => {
    const total = rows.length;
    const visited = rows.filter(r => r.been).length;
    const curated = rows.filter(r => r.heroPhotoUrls.length > 0).length;
    return { total, visited, curated };
  }, [rows]);

  return (
    <div className="space-y-4">
      {/* Search + counts */}
      <div className="flex items-center gap-3 flex-wrap">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search city or country…"
          className="flex-1 min-w-[240px] px-3 py-2 text-small border border-sand rounded bg-white focus:outline-none focus:border-teal"
        />
        <span className="text-small text-muted whitespace-nowrap">
          {counts.curated} / {counts.total} curated · {counts.visited} visited
        </span>
      </div>

      {/* Filter pills */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {FILTERS.map(f => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={
              'px-3 py-1 rounded-full text-small transition-colors ' +
              (filter === f.id
                ? 'bg-teal text-white'
                : 'bg-cream-soft text-ink hover:bg-sand')
            }
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Result count */}
      <div className="text-small text-muted">
        Showing {filtered.length} of {rows.length} cities
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <p className="text-small text-muted italic py-8 text-center">
          No cities match the current filter.
        </p>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {filtered.map(c => (
            <li key={c.slug}>
              <Link
                href={`/admin/cities/${c.slug}`}
                className="group block rounded-md border border-sand bg-white hover:border-teal hover:shadow-sm transition-all overflow-hidden"
              >
                <div className="relative aspect-[4/3] bg-cream-soft">
                  {c.coverUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={thumbUrl(c.coverUrl, { size: 320 }) ?? c.coverUrl}
                      alt={c.name}
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted text-label uppercase tracking-wider">
                      No cover
                    </div>
                  )}
                  {c.heroPhotoUrls.length > 0 && (
                    <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-teal/95 text-white text-[10px] font-medium">
                      {c.heroPhotoUrls.length} {c.heroPhotoUrls.length === 1 ? 'pick' : 'picks'}
                    </span>
                  )}
                  {c.been && (
                    <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded bg-ink-deep/85 text-white text-[10px] font-medium">
                      ✓ visited
                    </span>
                  )}
                  {!c.been && c.go && (
                    <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded bg-amber-500/90 text-white text-[10px] font-medium">
                      ⌛ short list
                    </span>
                  )}
                </div>
                <div className="p-2.5">
                  <div className="text-small font-medium text-ink-deep group-hover:text-teal truncate">
                    {c.name}
                  </div>
                  {c.country && (
                    <div className="text-label text-muted truncate">{c.country}</div>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
