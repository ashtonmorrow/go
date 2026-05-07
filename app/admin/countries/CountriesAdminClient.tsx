'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { thumbUrl } from '@/lib/imageUrl';
import EntityCoverPickerModal from '@/components/admin/EntityCoverPickerModal';

export type AdminCountryRow = {
  slug: string;
  name: string;
  flag: string | null;
  beenCount: number;
  goCount: number;
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

export default function CountriesAdminClient({ rows: initialRows }: { rows: AdminCountryRow[] }) {
  const [rows, setRows] = useState(initialRows);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('visited');
  const [coverPickerFor, setCoverPickerFor] = useState<string | null>(null);

  function applyCoverCommit(
    slug: string,
    next: { coverUrl: string | null; heroPhotoUrls: string[] },
  ) {
    setRows(prev =>
      prev.map(r =>
        r.slug === slug
          ? { ...r, coverUrl: next.coverUrl ?? r.coverUrl, heroPhotoUrls: next.heroPhotoUrls }
          : r,
      ),
    );
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      if (q) {
        if (!r.name.toLowerCase().includes(q)) return false;
      }
      switch (filter) {
        case 'visited':
          if (r.beenCount === 0) return false;
          break;
        case 'short-list':
          if (r.beenCount > 0 || r.goCount === 0) return false;
          break;
        case 'researching':
          if (r.beenCount > 0 || r.goCount > 0) return false;
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
    const visited = rows.filter(r => r.beenCount > 0).length;
    const curated = rows.filter(r => r.heroPhotoUrls.length > 0).length;
    return { total, visited, curated };
  }, [rows]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search country…"
          className="flex-1 min-w-[240px] px-3 py-2 text-small border border-sand rounded bg-white focus:outline-none focus:border-teal"
        />
        <span className="text-small text-muted whitespace-nowrap">
          {counts.curated} / {counts.total} curated · {counts.visited} visited
        </span>
      </div>

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

      <div className="text-small text-muted">
        Showing {filtered.length} of {rows.length} countries
      </div>

      {filtered.length === 0 ? (
        <p className="text-small text-muted italic py-8 text-center">
          No countries match the current filter.
        </p>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {filtered.map(c => (
            <li
              key={c.slug}
              className="group rounded-md border border-sand bg-white hover:border-teal hover:shadow-sm transition-all overflow-hidden"
            >
              <button
                type="button"
                onClick={() => setCoverPickerFor(c.slug)}
                className="relative aspect-[4/3] w-full bg-cream-soft block"
                title="Change cover"
                aria-label={`Change cover for ${c.name}`}
              >
                {c.coverUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={thumbUrl(c.coverUrl, { size: 320 }) ?? c.coverUrl}
                    alt={c.name}
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                ) : c.flag ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={c.flag}
                    alt={c.name}
                    loading="lazy"
                    className="w-full h-full object-contain p-4 bg-cream"
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
                {c.beenCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded bg-ink-deep/85 text-white text-[10px] font-medium">
                    ✓ {c.beenCount}
                  </span>
                )}
                {c.beenCount === 0 && c.goCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded bg-amber-500/90 text-white text-[10px] font-medium">
                    ⌛ {c.goCount}
                  </span>
                )}
                <span className="absolute inset-x-0 bottom-0 px-2 py-1 text-[10px] uppercase tracking-wider text-white bg-ink-deep/0 group-hover:bg-ink-deep/55 transition-colors text-center">
                  Change cover
                </span>
              </button>
              <Link
                href={`/admin/countries/${c.slug}`}
                className="block p-2.5 flex items-center gap-2"
                title="Open per-country editor"
              >
                {c.flag && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={c.flag}
                    alt=""
                    className="w-5 h-auto rounded border border-sand flex-shrink-0"
                  />
                )}
                <div className="text-small font-medium text-ink-deep group-hover:text-teal truncate">
                  {c.name}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {coverPickerFor && (() => {
        const target = rows.find(r => r.slug === coverPickerFor);
        if (!target) return null;
        return (
          <EntityCoverPickerModal
            kind="country"
            entityRef={target.slug}
            entityName={target.name}
            currentCoverUrl={target.coverUrl}
            existingHeroPhotoUrls={target.heroPhotoUrls}
            onCommit={next => applyCoverCommit(target.slug, next)}
            onClose={() => setCoverPickerFor(null)}
          />
        );
      })()}
    </div>
  );
}
