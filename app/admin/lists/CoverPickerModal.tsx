'use client';

import { useEffect, useState } from 'react';
import { isCommonsUrl } from '@/components/CommonsAttributionBadge';

// === CoverPickerModal ======================================================
// Photo-level cover picker for /admin/lists/[slug] and the inline picker on
// /admin/lists. Three tabs:
//
//   1. "In this list"     → personal photos AND pin.images entries (codex
//                           art, Wikidata pictures) for every pin that's
//                           a member of the current list. Loaded eagerly.
//   2. "Related places"   → photos from pins in any city or country whose
//                           name word-matches the list name, plus the
//                           hero photos attached to those cities and
//                           countries themselves. Loaded lazily.
//   3. "All my photos"    → every personal photo on the site, paginated.
//                           Loaded lazily when the tab is first activated.
//
// The endpoint returns tiles tagged with a source discriminator
// ('personal' | 'pin-image' | 'city-hero' | 'country-hero'). Picking a
// 'personal' tile commits saved_lists.cover_photo_id (FK uuid). Picking
// any other tile commits saved_lists.cover_image_url (raw URL) — the
// /lists resolver prefers cover_image_url over cover_photo_id over
// cover_pin_id over the geo / pin-pile fallbacks.
//
// State is intentionally local — the parent passes the current cover URL
// for highlighting and receives the final committed cover via onCommit
// so it can update its own preview without a round-trip refetch.

export type PhotoSource = 'personal' | 'pin-image' | 'city-hero' | 'country-hero';

export type PhotoTile = {
  id: string;
  url: string;
  source: PhotoSource;
  /** For source=pin-image, the value of pin.images[i].source — typically
   *  'codex-generated', 'wikidata', or null. The picker shows a small
   *  badge for codex tiles so you can spot AI art at a glance. */
  imageSource?: string | null;
  pinId: string | null;
  pinName: string;
  pinSlug: string | null;
  takenAt: string | null;
  lat: number | null;
  lng: number | null;
};

type Props = {
  listName: string;
  /** Current cover URL — used for highlighting the active tile in the
   *  grid. Null when the list has no curated cover yet. */
  currentCoverUrl: string | null;
  /** Called after a successful save with the committed photo (or null
   *  for clear). Parent uses this to update its preview tile. */
  onCommit: (next: { coverPhotoId: string | null; coverUrl: string | null }) => void;
  onClose: () => void;
};

type Tab = 'in-list' | 'related' | 'all';

const PAGE = 200;

export default function CoverPickerModal({
  listName,
  currentCoverUrl,
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
  // Source-filter pills + per-tile delete state — same shape as
  // EntityCoverPickerModal so the cleanup workflow feels consistent
  // across pickers.
  type SourceFilter = 'all' | 'personal' | 'pin' | 'codex' | 'city' | 'country';
  const [filter, setFilter] = useState<SourceFilter>('all');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Drop a deleted tile from whichever tab's pool currently holds it.
  // Tabs can have overlapping members (a personal photo for a member
  // pin shows up in both in-list and related when the list-name word
  // also matches the city), so we filter all three pools by id rather
  // than tracking which tab owns it.
  function dropTileLocal(id: string) {
    setInList(prev => (prev ? prev.filter(t => t.id !== id) : prev));
    setRelated(prev => (prev ? prev.filter(t => t.id !== id) : prev));
    setAll(prev => prev.filter(t => t.id !== id));
  }

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
    setFilter('all');
    if (next === 'all' && all.length === 0) {
      void loadAll(true);
    }
    if (next === 'related' && related === null) {
      void loadRelated();
    }
  }

  /** Permanently delete a personal photo or pin.images entry. Same
   *  semantics as EntityCoverPickerModal — see that file's deleteTile
   *  comment for the dispatch matrix. */
  async function deleteTile(p: PhotoTile) {
    if (deletingId) return;
    if (p.source !== 'personal' && p.source !== 'pin-image') return;
    const label = p.source === 'personal' ? 'personal photo' : 'pin image';
    const ok = window.confirm(
      `Delete this ${label}?\n\n` +
        'This permanently removes it from the database and Storage. ' +
        'It cannot be undone.',
    );
    if (!ok) return;
    setDeletingId(p.id);
    setError(null);
    try {
      let res: Response;
      if (p.source === 'personal') {
        res = await fetch('/api/admin/personal-photos', {
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id: p.id }),
        });
      } else {
        if (!p.pinId) throw new Error('pin image is missing pinId');
        res = await fetch('/api/admin/pin-image', {
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ pinId: p.pinId, url: p.url }),
        });
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? `delete failed (${res.status})`);
      }
      dropTileLocal(p.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'delete failed');
    } finally {
      setDeletingId(null);
    }
  }

  async function pick(photo: PhotoTile) {
    setSaving(true);
    setError(null);
    try {
      // Personal photos commit via the FK column; everything else (pin
      // images, city/country heroes) commit via the raw URL column. We
      // null the slot we're not using so precedence is unambiguous on
      // the resolver side.
      const body =
        photo.source === 'personal'
          ? {
              action: 'setCover' as const,
              name: listName,
              cover_photo_id: photo.id,
              cover_image_url: null,
              cover_pin_id: null,
            }
          : {
              action: 'setCover' as const,
              name: listName,
              cover_photo_id: null,
              cover_image_url: photo.url,
              cover_pin_id: null,
            };
      const res = await fetch('/api/admin/saved-list', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'save failed');
      onCommit({
        coverPhotoId: photo.source === 'personal' ? photo.id : null,
        coverUrl: photo.url,
      });
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
          cover_image_url: null,
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
  // Counts come from the active tab's full pool (so they don't shift
  // with the pill toggle), filtering happens at render time.
  const tabCounts = {
    all: photos.length,
    personal: photos.filter(p => p.source === 'personal').length,
    pin: photos.filter(p => p.source === 'pin-image').length,
    codex: photos.filter(p => p.source === 'pin-image' && p.imageSource === 'codex-generated').length,
    city: photos.filter(p => p.source === 'city-hero').length,
    country: photos.filter(p => p.source === 'country-hero').length,
  };
  const filtered = photos.filter(p => {
    if (filter === 'all') return true;
    if (filter === 'personal') return p.source === 'personal';
    if (filter === 'pin') return p.source === 'pin-image';
    if (filter === 'codex') return p.source === 'pin-image' && p.imageSource === 'codex-generated';
    if (filter === 'city') return p.source === 'city-hero';
    if (filter === 'country') return p.source === 'country-hero';
    return true;
  });
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
                    ? 'Photos from pins, cities, and countries whose name word-matches this list'
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

        {/* Source filter pills — scope the active tab's grid by source.
            Reset to 'all' on every tab switch (see switchTab) so the
            user's mental model stays simple. Hidden when the active
            tab's pool is empty. */}
        {photos.length > 0 && (
          <div className="px-5 pt-2 pb-1 flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'all', label: 'All', count: tabCounts.all },
                { id: 'personal', label: 'Personal', count: tabCounts.personal },
                { id: 'pin', label: 'Pin', count: tabCounts.pin },
                { id: 'codex', label: 'Codex', count: tabCounts.codex },
                { id: 'city', label: 'City', count: tabCounts.city },
                { id: 'country', label: 'Country', count: tabCounts.country },
              ] as { id: SourceFilter; label: string; count: number }[]
            )
              .filter(p => p.count > 0 || p.id === 'all')
              .map(p => {
                const active = filter === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setFilter(p.id)}
                    aria-pressed={active}
                    className={
                      'pill text-micro ' +
                      (active
                        ? 'bg-ink-deep text-white border border-ink-deep'
                        : 'bg-cream-soft text-slate border border-sand hover:bg-sand/40')
                    }
                  >
                    {p.label}
                    <span className="ml-1 tabular-nums opacity-80">({p.count})</span>
                  </button>
                );
              })}
          </div>
        )}

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
                ? 'No photos found. Pins on this list have no personal photos and no pin.images entries (codex / Wikidata).'
                : tab === 'related'
                ? 'No related-place photos found. The list name needs to word-match a city or country (e.g. a list called "bangkok" surfaces Bangkok pins).'
                : 'No personal photos uploaded yet.'}
            </p>
          ) : filtered.length === 0 ? (
            <p className="text-center text-slate text-small py-12">
              Nothing matches that filter. Click <strong>All</strong> to widen.
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {filtered.map(p => {
                const isCurrent = !!currentCoverUrl && p.url === currentCoverUrl;
                const isCodex = p.imageSource === 'codex-generated';
                const isCommons = isCommonsUrl(p.url);
                const sourceBadge =
                  isCommons ? 'Commons'
                  : p.source === 'city-hero' ? 'City'
                  : p.source === 'country-hero' ? 'Country'
                  : isCodex ? 'Codex'
                  : p.source === 'pin-image' ? 'Pin'
                  : null;
                const canDelete = p.source === 'personal' || p.source === 'pin-image';
                const isDeleting = deletingId === p.id;
                return (
                  <div
                    key={p.id}
                    className={
                      'group relative aspect-square overflow-hidden rounded-md bg-cream-soft border-2 transition-all ' +
                      (isCurrent
                        ? 'border-teal ring-2 ring-teal/30'
                        : isCommons
                          ? 'border-amber-400 hover:border-amber-500 hover:shadow-paper'
                          : 'border-sand hover:border-slate hover:shadow-paper') +
                      (isDeleting ? ' opacity-60' : '')
                    }
                  >
                    <button
                      type="button"
                      onClick={() => pick(p)}
                      disabled={saving || savingClear || isDeleting}
                      className="absolute inset-0 cursor-pointer focus-visible:ring-2 focus-visible:ring-teal disabled:cursor-not-allowed"
                      title={`${p.pinName}${p.takenAt ? ' · ' + new Date(p.takenAt).toLocaleDateString() : ''}`}
                      aria-label={`Use ${p.pinName} as cover`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={p.url}
                        alt={p.pinName}
                        loading="lazy"
                        className="w-full h-full object-cover transition-transform group-hover:scale-105"
                      />
                    </button>
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink-deep/80 to-transparent p-2 text-white text-micro leading-tight">
                      <p className="truncate">{p.pinName}</p>
                    </div>
                    {sourceBadge && (
                      <div
                        className={
                          'pointer-events-none absolute top-1.5 right-1.5 pill text-micro shadow ' +
                          (isCommons
                            ? 'bg-amber-500 text-white'
                            : isCodex
                              ? 'bg-orange text-white'
                              : p.source === 'personal'
                                ? 'bg-teal text-white'
                                : 'bg-ink-deep/80 text-white')
                        }
                        title={
                          isCommons
                            ? 'Wikimedia Commons. Picking this promotes a CC BY-SA image — attribution will display under it on every public render.'
                            : undefined
                        }
                      >
                        {sourceBadge}
                      </div>
                    )}
                    {isCurrent && (
                      <div className="pointer-events-none absolute top-1.5 left-1.5 pill bg-teal text-white text-micro shadow">
                        Current
                      </div>
                    )}
                    {canDelete && (
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          void deleteTile(p);
                        }}
                        disabled={isDeleting || saving || savingClear}
                        className={
                          'absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide bg-red-600/90 text-white transition-opacity disabled:opacity-50 ' +
                          (isCurrent
                            ? 'opacity-100'
                            : 'opacity-0 group-hover:opacity-100 focus:opacity-100')
                        }
                        aria-label="Delete this photo"
                        title={
                          p.source === 'personal'
                            ? 'Delete this personal photo (removes from DB + Storage). Cannot be undone.'
                            : 'Delete this pin image entry (removes from this pin + Storage if no other pin uses it). Cannot be undone.'
                        }
                      >
                        {isDeleting ? '…' : 'delete'}
                      </button>
                    )}
                  </div>
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
