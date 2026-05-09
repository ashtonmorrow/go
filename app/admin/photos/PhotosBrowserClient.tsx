'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { thumbUrl } from '@/lib/imageUrl';

/** Run async work over an array with a bounded concurrency so we don't
 *  fire e.g. 60 parallel deletes against Supabase / Storage. Returns
 *  results in input order. Failures aren't thrown — they're surfaced
 *  via the worker's own Result-type return so the caller can react
 *  per-item. */
async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function pull(): Promise<void> {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await worker(items[i], i);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => pull()),
  );
  return results;
}

type Source = 'personal' | 'codex' | 'hidden';

type Tile = {
  id: string;
  source: 'personal' | 'codex';
  url: string;
  pinId: string;
  pinName: string;
  pinSlug: string | null;
  city: string | null;
  country: string | null;
  takenAt: string | null;
  hidden: boolean;
};

const PAGE_SIZE = 60;

export default function PhotosBrowserClient() {
  const [source, setSource] = useState<Source>('personal');
  const [q, setQ] = useState('');
  const [offset, setOffset] = useState(0);
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  // Load whenever source / q / offset changes. Debounce search input
  // so each keystroke doesn't fire a request.
  useEffect(() => {
    let cancelled = false;
    const handle = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          source,
          offset: String(offset),
          limit: String(PAGE_SIZE),
        });
        if (q.trim()) params.set('q', q.trim());
        const res = await fetch(`/api/admin/photos?${params}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error ?? `failed (${res.status})`);
        if (!cancelled) {
          setTiles((data.photos as Tile[]) ?? []);
          setTotal((data.total as number) ?? 0);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'load failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [source, q, offset]);

  function switchSource(next: Source) {
    setSource(next);
    setOffset(0);
    setSelected(new Set());
    setFlash(null);
  }

  function toggleSelected(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected(prev => {
      if (prev.size === tiles.length) return new Set();
      return new Set(tiles.map(t => t.id));
    });
  }

  async function bulkDelete() {
    const ids = [...selected];
    if (!ids.length) return;
    const ok = window.confirm(
      `Permanently delete ${ids.length} ${
        ids.length === 1 ? 'photo' : 'photos'
      }?\n\nThis removes them from the database and Storage. Cannot be undone.`,
    );
    if (!ok) return;
    setBulkDeleting(true);
    setFlash(null);
    setError(null);
    try {
      // Snapshot tiles + ids so concurrent UI updates don't shift the
      // map underneath the delete loop.
      const tileById = new Map(tiles.map(t => [t.id, t]));
      const targetIds = [...ids];
      // Concurrency-limited so 60 selected photos don't fire 60
      // parallel HTTP requests + Storage deletes + last_photo_at
      // trigger fires. 5 in flight is plenty fast and well behaved.
      const results = await runWithConcurrency(targetIds, 5, async id => {
        const t = tileById.get(id);
        if (!t) return { id, ok: false as const, error: 'tile not found in current page' };
        try {
          if (t.source === 'personal') {
            const res = await fetch('/api/admin/personal-photos', {
              method: 'DELETE',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ id: t.id }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data?.error ?? `failed (${res.status})`);
          } else {
            const res = await fetch('/api/admin/pin-image', {
              method: 'DELETE',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ pinId: t.pinId, url: t.url }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data?.error ?? `failed (${res.status})`);
          }
          return { id, ok: true as const };
        } catch (e) {
          return {
            id,
            ok: false as const,
            error: e instanceof Error ? e.message : 'delete failed',
          };
        }
      });
      const succeeded = results.filter(r => r.ok).length;
      const failed = results.length - succeeded;
      // Drop succeeded ids from the local list so the UI reflects
      // immediately. Keep failed ids selected so retry is possible.
      const failedIds = new Set(results.filter(r => !r.ok).map(r => r.id));
      setTiles(prev => prev.filter(t => failedIds.has(t.id) || !ids.includes(t.id)));
      setTotal(prev => Math.max(0, prev - succeeded));
      setSelected(failedIds);
      setFlash(
        failed > 0
          ? `Deleted ${succeeded}, ${failed} failed. Selected rows remain.`
          : `Deleted ${succeeded} photo${succeeded === 1 ? '' : 's'}.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'bulk delete failed');
    } finally {
      setBulkDeleting(false);
    }
  }

  const allSelected = tiles.length > 0 && selected.size === tiles.length;
  const someSelected = selected.size > 0 && !allSelected;

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-1 text-small border-b border-sand">
        {(
          [
            { id: 'personal', label: 'Personal' },
            { id: 'codex', label: 'Codex' },
            { id: 'hidden', label: 'Hidden' },
          ] as { id: Source; label: string }[]
        ).map(t => {
          const active = source === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => switchSource(t.id)}
              className={
                'px-3 py-1.5 -mb-px border-b-2 transition-colors ' +
                (active
                  ? 'border-teal text-ink-deep font-medium'
                  : 'border-transparent text-slate hover:text-ink-deep')
              }
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Toolbar: search + selection + bulk delete */}
      <div className="flex items-center gap-3 flex-wrap">
        <input
          type="search"
          value={q}
          onChange={e => {
            setQ(e.target.value);
            setOffset(0);
          }}
          placeholder="Search by pin name…"
          className="flex-1 min-w-[240px] max-w-md text-small border border-sand rounded px-3 py-2 bg-white focus:outline-none focus:border-ink-deep"
        />
        <span className="text-label text-muted tabular-nums">
          {loading ? 'Loading…' : `${total.toLocaleString()} ${total === 1 ? 'photo' : 'photos'}`}
        </span>
        {tiles.length > 0 && (
          <label className="inline-flex items-center gap-1.5 text-small cursor-pointer">
            <input
              type="checkbox"
              checked={allSelected}
              ref={el => {
                if (el) el.indeterminate = someSelected;
              }}
              onChange={toggleSelectAll}
            />
            <span className="text-ink">Select all on page</span>
          </label>
        )}
        {selected.size > 0 && (
          <>
            <span className="text-label text-muted tabular-nums">
              {selected.size} selected
            </span>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="text-label text-muted hover:text-ink"
            >
              clear
            </button>
            <button
              type="button"
              onClick={bulkDelete}
              disabled={bulkDeleting}
              className={
                'ml-auto text-small px-3 py-1.5 rounded font-medium ' +
                (bulkDeleting
                  ? 'bg-cream-soft text-muted cursor-not-allowed'
                  : 'bg-orange text-white hover:bg-orange/90')
              }
            >
              {bulkDeleting ? 'Deleting…' : `Delete ${selected.size}`}
            </button>
          </>
        )}
      </div>

      {flash && (
        <div className="px-3 py-2 rounded bg-cream-soft border border-sand text-small text-ink">
          {flash}
        </div>
      )}
      {error && (
        <div className="px-3 py-2 rounded bg-orange/10 border border-orange/40 text-small text-orange">
          {error}
        </div>
      )}

      {/* Grid */}
      {tiles.length === 0 && !loading ? (
        <p className="text-center text-slate text-small py-12">
          {q
            ? 'No photos match this search.'
            : source === 'codex'
              ? 'No codex pin images.'
              : source === 'hidden'
                ? 'No hidden personal photos.'
                : 'No personal photos.'}
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {tiles.map(t => {
            const isSelected = selected.has(t.id);
            return (
              <div
                key={t.id}
                className={
                  'group relative aspect-square overflow-hidden rounded-md bg-cream-soft border-2 transition-all ' +
                  (isSelected
                    ? 'border-teal ring-2 ring-teal/30'
                    : 'border-sand hover:border-slate')
                }
              >
                <button
                  type="button"
                  onClick={() => toggleSelected(t.id)}
                  className="absolute inset-0 cursor-pointer focus-visible:ring-2 focus-visible:ring-teal"
                  aria-label={`Select ${t.pinName}`}
                  title={`${t.pinName}${t.takenAt ? ' · ' + new Date(t.takenAt).toLocaleDateString() : ''}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={thumbUrl(t.url, { size: 192 }) ?? t.url}
                    alt={t.pinName}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover"
                  />
                </button>
                <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink-deep/80 to-transparent p-2 text-white text-micro leading-tight">
                  <p className="truncate">{t.pinName}</p>
                  {(t.city || t.country) && (
                    <p className="truncate opacity-70">
                      {[t.city, t.country].filter(Boolean).join(', ')}
                    </p>
                  )}
                </div>
                {/* Source badge */}
                <div
                  className={
                    'pointer-events-none absolute top-1.5 right-1.5 pill text-micro shadow ' +
                    (t.source === 'codex'
                      ? 'bg-orange text-white'
                      : t.hidden
                        ? 'bg-amber-600 text-white'
                        : 'bg-teal text-white')
                  }
                >
                  {t.source === 'codex' ? 'Codex' : t.hidden ? 'Hidden' : 'Personal'}
                </div>
                {/* Selection indicator (top-left) */}
                <div
                  className={
                    'absolute top-1.5 left-1.5 w-5 h-5 rounded border-2 transition-colors flex items-center justify-center ' +
                    (isSelected
                      ? 'bg-teal border-teal text-white'
                      : 'bg-white/90 border-sand opacity-0 group-hover:opacity-100')
                  }
                  aria-hidden
                >
                  {isSelected && (
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  )}
                </div>
                {/* Pin link */}
                <Link
                  href={`/admin/pins/${t.pinId}`}
                  onClick={e => e.stopPropagation()}
                  className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-white/80 hover:bg-white text-[10px] text-ink-deep opacity-0 group-hover:opacity-100 transition-opacity"
                  title={`Edit ${t.pinName}`}
                >
                  edit pin →
                </Link>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-center gap-3 pt-4 border-t border-sand">
          <button
            type="button"
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            disabled={offset === 0 || loading}
            className="text-small px-3 py-1.5 rounded border border-sand text-ink-deep hover:bg-cream-soft disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ← Prev
          </button>
          <span className="text-label text-muted tabular-nums">
            {offset + 1}–{Math.min(offset + tiles.length, total)} of{' '}
            {total.toLocaleString()}
          </span>
          <button
            type="button"
            onClick={() => setOffset(offset + PAGE_SIZE)}
            disabled={offset + tiles.length >= total || loading}
            className="text-small px-3 py-1.5 rounded border border-sand text-ink-deep hover:bg-cream-soft disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
