'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useMemo, useState } from 'react';
import { thumbUrl } from '@/lib/imageUrl';

// === ListsBrowser ===========================================================
// Searchable browser for /lists. One unified grid of all lists (no
// guides-vs-saved-lists section split). The input at the top filters by
// list name and by anchor place (the city or country a list pivots to),
// so "barcelona", "spain", "food" all narrow the grid. Polished guides
// carry a small "Guide" chip so a stranger can see at a glance which
// lists have a writeup behind them, without burying the rest of the
// pile.

export type ListEntry = {
  name: string;
  slug: string;
  count: number;
  visitedCount: number;
  cover: string | null;
  anchor: { kind: 'city' | 'country'; name: string; slug: string } | null;
  isGuide: boolean;
  guideTitle: string | null;
  guideDescription: string | null;
  /** ISO date used for "recent first" ordering when no search query is
   *  active. Guides: their content's updated/published date. Non-guides:
   *  the saved_lists meta-row's updated_at. Null = sinks to the back. */
  updatedAt: string | null;
};

export default function ListsBrowser({ lists }: { lists: ListEntry[] }) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return lists;
    return lists.filter(l => {
      if (l.name.toLowerCase().includes(q)) return true;
      if (l.guideTitle?.toLowerCase().includes(q)) return true;
      if (l.guideDescription?.toLowerCase().includes(q)) return true;
      if (l.anchor?.name.toLowerCase().includes(q)) return true;
      return false;
    });
  }, [lists, query]);

  return (
    <>
      <div className="mb-6">
        <label className="block">
          <span className="sr-only">Search lists</span>
          <div className="relative">
            <span
              aria-hidden
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" />
              </svg>
            </span>
            <input
              type="search"
              inputMode="search"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Try 'Bangkok', 'spain', or 'coffee'"
              className="
                w-full pl-9 pr-3 py-2.5
                rounded-md border border-sand bg-white
                text-ink-deep placeholder:text-muted
                focus:outline-none focus:border-ink-deep transition-colors
              "
            />
          </div>
        </label>
        <p className="mt-2 text-label text-muted tabular-nums">
          {filtered.length === lists.length
            ? `${lists.length} lists`
            : `${filtered.length} of ${lists.length} lists`}
        </p>
      </div>

      {filtered.length === 0 ? (
        <div className="card p-8 text-center text-slate">
          No lists match &ldquo;{query}&rdquo;. Try a city, country, or theme.
        </div>
      ) : (
        <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {filtered.map(l => (
            <li key={l.slug}>
              <Link
                href={`/lists/${l.slug}`}
                className="group block card overflow-hidden hover:shadow-paper transition-shadow h-full"
              >
                {l.cover ? (
                  <div className="relative aspect-[4/3] bg-cream-soft overflow-hidden">
                    <Image
                      src={thumbUrl(l.cover, { size: 480 }) ?? l.cover}
                      alt=""
                      fill
                      sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, 25vw"
                      className="object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                    />
                    {l.anchor && (
                      <span className="absolute bottom-1.5 left-1.5 inline-flex items-center gap-1 pill bg-black/55 text-white text-micro backdrop-blur-sm">
                        <span aria-hidden>
                          {l.anchor.kind === 'city' ? '📮' : '🌍'}
                        </span>
                        {l.anchor.name}
                      </span>
                    )}
                    {l.isGuide && (
                      <span
                        className="absolute top-1.5 left-1.5 pill bg-teal text-white text-micro font-medium uppercase tracking-wider"
                        title="A polished destination guide with a writeup"
                      >
                        Guide
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="relative aspect-[4/3] bg-cream-soft border-b border-sand flex items-center justify-center text-muted text-micro uppercase tracking-wider">
                    No photo yet
                    {l.isGuide && (
                      <span className="absolute top-1.5 left-1.5 pill bg-teal text-white text-micro font-medium uppercase tracking-wider">
                        Guide
                      </span>
                    )}
                  </div>
                )}
                <div className="p-3">
                  <h2 className="text-ink-deep font-semibold leading-tight group-hover:text-teal transition-colors capitalize truncate">
                    {l.guideTitle ?? l.name}
                  </h2>
                  {l.guideDescription ? (
                    <p className="mt-1.5 text-label text-slate leading-snug line-clamp-2">
                      {l.guideDescription}
                    </p>
                  ) : (
                    <p className="mt-0.5 text-label text-muted tabular-nums">
                      {l.count} {l.count === 1 ? 'pin' : 'pins'}
                      {l.visitedCount > 0 && (
                        <> · {l.visitedCount} visited</>
                      )}
                    </p>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
