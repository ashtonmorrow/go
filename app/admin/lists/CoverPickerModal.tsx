'use client';

import { useEffect, useState } from 'react';

// === CoverPickerModal ======================================================
// Photo-level cover picker for /admin/lists/[slug] and the inline picker on
// /admin/lists. Three tabs:
//
//   1. "In this list"     → photos attached to pins that are members of the
//                           current list. Loaded eagerly on mount.
//   2. "Related places"   → photos from pins in any city or country whose
//                           name word-matches the list name (so a list
//                           called "bangkok" surfaces every Bangkok pin
//                           photo even if those pins aren't members yet).
//                           Loaded lazily.
//   3. "All my photos"    → every personal photo on the site, paginated.
//                           Loaded lazily when the tab is first activated.
//
// Selection sets `saved_lists.cover_photo_id` via the existing
// /api/admin/saved-list { action: 'setCover' } endpoint. The modal also
// offers a Clear button that nulls both cover_photo_id and cover_pin_id
// so the cover reverts to the geo / pin-pile fallback chain on /lists.
//
// State is intentionally local — the parent page passes initial values and
// receives the final committed cover via onCommit so it can update its own
// preview without a round-trip refetch.

export type PhotoTile = {
  id: string;
  url: string;
  pinId: string;
  pinName: string;
  pinSlug: string | null;
  takenAt: string | null;
  lat: number | null;
  lng: number | null;
};

type Props = {
  listName: string;
  /** Initial cover photo URL to highlight in the grid (if any). Comes
   *  from saved_lists.cover_photo_id resolution on the server. */
  currentCoverPhotoId: string | null;
  /** Called after a successful save with the committed photo (or null
   *  for clear). Parent uses this to update its preview tile. */
  onCommit: (next: { coverPhotoId: string | null; coverUrl: string | null }) => void;
  onClose: () => void;
};

type Tab = 'in-list' | 'related' | 'all';

const PAGE = 200;

export default function CoverPickerModal({
  listName,
  currentCoverPhotoId,
  onCommit,
  onClose,
}: Props) {
  const [tab, setTab] = useState<Tab>('in-list');
  const [inList, setInList] = useState<PhotoTile[] | null>(null);
  const [related, setRelated] = useState<PhotoTile[] | null>(null);
  const [all, setAll] = useState<PhotoTile[]>([]);
  const [allOffset, setAllOffset] = useState(0);
  const [allHasMore, setAllHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingClear, setSavingClear] = useState(false);

  // Load "in this list" once on mount — the user almost always picks from
  // this scope, so it's worth the eager load.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/admin/personal-photos?listName=${encodeURIComponent(listName)}&limit=${PAGE}`,
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error ?? 'load failed');
        if (!cancelled) setInList(data.photos as PhotoTile[]);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'load failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [listName]);

  // Lazy-load the "all" tab the first time it's opened, then paginate on
  // demand via the "Load more" button at the bottom of the grid.
  async function loadAll(reset = false) {
    setLoading(true);
    setError(null);
    try {
      const offset = reset ? 0 : allOffset;
      const res = await fetch(
        `/api/admin/personal-photos?offset=${offset}&limit=${PAGE}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'load failed');
      const next = data.photos as PhotoTile[];
      setAll(prev => (reset ? next : [...prev, ...next]));
      setAllOffset(offset + next.length);
      setAllHasMore(Boolean(data.hasMore));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'load failed');
    } finally {
      setLoading(false);
    }
  }

  // Lazy-load the "related places" tab — photos from pins in cities or
  // countries whose name word-matches the list name. The API does the
  // heavy lifting; we just kick the request and stash the result.
  async function loadRelated() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/personal-photos?relatedToList=${encodeURIComponent(listName)}&limit=${PAGE}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'load failed');
      setRelated(data.photos as PhotoTile[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'load failed');
    } finally {
      setLoading(false);
    }
  }

  function switchTab(next: Tab) {
    setTab(next);
    setError(null);
    if (next === 'all' && all.length === 0) {
      void loadAll(true);
    }
    if (next === 'related' && related === null) {
      void loadRelated();
    }
  }

  async function pick(photo: PhotoTile) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/saved-list', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'setCover',
          name: listName,
          // Setting a curated photo wins over cover_pin_id; null the pin
          // override so the precedence is unambiguous.
          cover_photo_id: photo.id,
          cover_pin_id: null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'save failed');
      onCommit({ coverPhotoId: photo.id, coverUrl: photo.url });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'save failed');
    } finally {
      setSaving(false);
    }
  }

  async function clear() {
    setSavingClear(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/saved-list', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'setCover',
          name: listName,
          cover_photo_id: null,
          cover_pin_id: null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'clear failed');
      onCommit({ coverPhotoId: null, coverUrl: null });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'clear failed');
    } finally {
      setSavingClear(false);
    }
  }

  // Esc to close — small QoL.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !saving && !savingClear) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving, savingClear]);

  const photos =
    tab === 'in-list' ? inList ?? [] :
    tab === 'related' ? related ?? [] :
    all;
  const showLoadMore = tab === 'all' && allHasMore && !loading;

  return (
    <div
      className="fixed inset-0 z-50 bg-ink-deep/40 flex items-center justify-center p-4"
      onClick={() => !saving && !savingClear && onClose()}
    >
      <div
        className="bg-white rounded-lg shadow-paper max-w-5xl w-full max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-sand flex items-center gap-3 flex-wrap">
          <h2 className="text-h3 text-ink-deep capitalize">{listName} cover</h2>
          <span className="text-small text-muted">
            Pick a photo to use as the cover on /lists.
          </span>
          <button
            type="button"
            onClick={clear}
            disabled={saving || savingClear}
            className="ml-auto text-label text-slate hover:text-orange disabled:opacity-50"
            title="Revert to the city / pin-pile fallback chain"
          >
            {savingClear ? 'Clearing…' : 'Clear cover'}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={saving || savingClear}
            className="text-label text-slate hover:text-ink-deep disabled:opacity-50"
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="px-5 pt-3 flex gap-1 text-small">
          {(['in-list', 'related', 'all'] as const).map(t => {
            const active = tab === t;
            const label =
              t === 'in-list' ? 'In this list' :
              t === 'related' ? 'Related places' :
              'All my photos';
            const count =
              t === 'in-list' ? inList?.length ?? null :
              t === 'related' ? related?.length ?? null :
              null;
            return (
              <button
                key={t}
                type="button"
                onClick={() => switchTab(t)}
                disabled={saving || savingClear}
                className={
                  'px-3 py-1.5 rounded-t border-b-2 transition-colors ' +
                  (active
                    ? 'border-teal text-ink-deep font-medium'
                    : 'border-transparent text-slate hover:text-ink-deep')
                }
                title={
                  t === 'related'
                    ? 'Photos from pins in any city or country whose name word-matches this list'
                    : undefined
                }
              >
                {label}
                {count != null && (
                  <span className="ml-1.5 text-micro text-muted tabular-nums">
                    ({count})
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 bg-cream-soft/40">
          {error && (
            <div className="mb-4 px-3 py-2 rounded bg-orange/10 border border-orange/40 text-small text-orange">
              {error}
            </div>
          )}
          {loading && photos.length === 0 ? (
            <p className="text-center text-slate text-small py-12">Loading photos…</p>
          ) : photos.length === 0 ? (
            <p className="text-center text-slate text-small py-12">
              {tab === 'in-list'
                ? 'No personal photos attached to pins on this list yet.'
                : tab === 'related'
                ? 'No related-place photos found. The list name needs to word-match a city or country (e.g. a list called "bangkok" surfaces Bangkok pins).'
                : 'No personal photos uploaded yet.'}
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {photos.map(p => {
                const isCurrent = p.id === currentCoverPhotoId;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => pick(p)}
                    disabled={saving || savingClear}
                    className={
                      'group relative aspect-square overflow-hidden rounded-md bg-cream-soft border-2 transition-all ' +
                      (isCurrent
                        ? 'border-teal ring-2 ring-teal/30'
                        : 'border-sand hover:border-slate hover:shadow-paper')
                    }
                    title={`${p.pinName}${p.takenAt ? ' · ' + new Date(p.takenAt).toLocaleDateString() : ''}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.url}
                      alt={p.pinName}
                      loading="lazy"
                      className="w-full h-full object-cover transition-transform group-hover:scale-105"
                    />
                    {/* Pin name overlay */}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink-deep/80 to-transparent p-2 text-white text-micro leading-tight">
                      <p className="truncate">{p.pinName}</p>
                    </div>
                    {isCurrent && (
                      <div className="absolute top-1.5 left-1.5 pill bg-teal text-white text-micro shadow">
                        Current
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {showLoadMore && (
            <div className="mt-5 text-center">
              <button
                type="button"
                onClick={() => loadAll(false)}
                disabled={loading}
                className="px-4 py-2 rounded-md border border-sand text-small text-ink-deep hover:border-slate hover:bg-white transition-colors"
              >
                {loading ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </div>

        {/* Footer status */}
        {(saving || savingClear) && (
          <div className="px-5 py-3 border-t border-sand bg-cream-soft text-small text-muted">
            Saving…
          </div>
        )}
      </div>
    </div>
  );
}
