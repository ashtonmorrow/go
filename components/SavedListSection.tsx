'use client';

import Link from 'next/link';
import { useState } from 'react';
import { thumbUrl } from '@/lib/imageUrl';

// === SavedListSection ======================================================
// Cards-on-a-list block that renders at the bottom of city, country, and
// list-detail pages. Paginates via "Load more" so a 184-pin Barcelona list
// doesn't push 184 images into the initial paint.
//
// Server pages should pass a pre-filtered slice of pins (already matched
// against the list name); this component just handles the paged render +
// link-to-list footer. That keeps detail pages free to compose multiple
// lists if a city has, say, both "madrid" and "madrid food" lists.

export type SavedListPin = {
  id: string;
  slug: string | null;
  name: string;
  visited: boolean;
  cover: string | null;
  city: string | null;
  country: string | null;
  rating: number | null;
};

type Props = {
  /** Display title — usually the list name in title case, or "Saved on my <city> list". */
  title: string;
  /** Slug for the /lists/[slug] link if the user wants the full list. */
  listSlug: string | null;
  /** Optional Google Maps share URL — opens the live list in a new tab. */
  googleShareUrl: string | null;
  /** Pins to render. Caller does the saved_lists matching server-side. */
  pins: SavedListPin[];
  /** Initial page size — defaults to 24 so the section doesn't dominate the page. */
  pageSize?: number;
};

export default function SavedListSection({
  title,
  listSlug,
  googleShareUrl,
  pins,
  pageSize = 24,
}: Props) {
  const [shown, setShown] = useState(pageSize);
  if (pins.length === 0) return null;
  const visible = pins.slice(0, shown);
  const remaining = pins.length - shown;

  return (
    <section className="mt-10 pt-8 border-t border-sand">
      <header className="flex items-baseline justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h2 className="text-h3 text-ink-deep leading-tight">{title}</h2>
          <p className="mt-0.5 text-label text-muted tabular-nums">
            {pins.length} {pins.length === 1 ? 'pin' : 'pins'}
            {pins.filter(p => p.visited).length > 0 && (
              <> · {pins.filter(p => p.visited).length} visited</>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3 text-label">
          {googleShareUrl && (
            <a
              href={googleShareUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-accent hover:underline"
            >
              View live on Google Maps
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M7 17 17 7" />
                <path d="M7 7h10v10" />
              </svg>
            </a>
          )}
          {listSlug && (
            <Link href={`/lists/${listSlug}`} className="text-teal hover:underline">
              Open list →
            </Link>
          )}
        </div>
      </header>

      <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {visible.map(p => (
          <li key={p.id}>
            <Link
              href={p.slug ? `/pins/${p.slug}` : `/pins/${p.id}`}
              className="block card overflow-hidden hover:shadow-paper transition-shadow"
            >
              {p.cover ? (
                <div className="relative aspect-[4/3] bg-cream-soft overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={thumbUrl(p.cover, { size: 320 }) ?? p.cover}
                    alt=""
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                  {p.visited && (
                    <span className="absolute top-1.5 right-1.5 pill bg-teal text-white text-micro">
                      ✓
                    </span>
                  )}
                </div>
              ) : (
                <div className="aspect-[4/3] bg-cream-soft border-b border-sand flex items-center justify-center text-muted text-micro uppercase tracking-[0.14em]">
                  No photo
                </div>
              )}
              <div className="p-2.5">
                <h3 className="text-ink-deep font-medium leading-tight truncate text-small">
                  {p.name}
                </h3>
                {(p.city || p.country) && (
                  <p className="mt-0.5 text-label text-muted truncate">
                    {[p.city, p.country].filter(Boolean).join(' · ')}
                  </p>
                )}
                {p.rating != null && p.rating > 0 && (
                  <p className="mt-0.5 text-label" aria-label={`${p.rating} stars`}>
                    {'⭐'.repeat(p.rating)}
                  </p>
                )}
              </div>
            </Link>
          </li>
        ))}
      </ul>

      {remaining > 0 && (
        <div className="mt-5 text-center">
          <button
            type="button"
            onClick={() => setShown(s => s + pageSize)}
            className="px-4 py-2 rounded-md border border-sand text-small text-ink-deep hover:border-slate hover:bg-cream-soft transition-colors"
          >
            Load {Math.min(pageSize, remaining)} more
            <span className="text-muted ml-2 tabular-nums">({remaining} left)</span>
          </button>
        </div>
      )}
    </section>
  );
}
