'use client';

import { useMemo, useState } from 'react';
import { thumbUrl } from '@/lib/imageUrl';

// === HeroPicker ============================================================
// Reusable curation widget for picking the hero photos that drive
// <HeroGallery> on a pin / city / country detail page. Stores an
// ordered array of URLs.
//
// Used by:
//   - app/admin/pins/[id]/PinEditorClient.tsx       (recommended max 6)
//   - app/admin/cities/[slug]/CityHeroEditor.tsx    (recommended max 12)
//   - app/admin/countries/[slug]/CountryHeroEditor (recommended max 16)
//
// Behaviour:
//   - Top counter shows "Picked X / recommended N" + Reset button.
//   - Picked rail: drag the tile by its body to reorder; click × to
//     remove. Hard cap is `maxAbsolute` (default 20).
//   - Available rail: click a tile to append. Personal photos surface
//     a small hide / unhide toggle that calls `onToggleHidden(id,
//     hidden)` so ugly auto-picks can be suppressed without leaving
//     the picker. Toggling a hidden photo flips it back instantly via
//     local state.

export type HeroCandidate = {
  url: string;
  /** Tooltip / aria-label fallback. */
  alt?: string;
  width?: number | null;
  height?: number | null;
  /** Short tag shown on the tile (e.g. "personal", "Wikidata"). */
  label?: string;
  /** True when `personal_photos.hidden = true` (suppressed from the
   *  auto-pick HeroCollage). */
  hidden?: boolean;
  /** Personal-photo row id. Required to flip `hidden` via
   *  `onToggleHidden`. Wikidata candidates leave this undefined. */
  id?: string;
};

type Props = {
  /** Currently picked URLs in display order. */
  value: string[];
  /** Full pool of photos that could be picked. */
  candidates: HeroCandidate[];
  onChange: (next: string[]) => void;
  /** Called when the user clicks the hide / unhide toggle on a personal
   *  candidate. The picker is responsible for the API call; the parent
   *  is responsible for refreshing the candidate list afterwards (or
   *  letting the picker keep its optimistic state in sync). */
  onToggleHidden?: (id: string, nextHidden: boolean) => Promise<void> | void;
  /** Called when the user clicks the delete button on a candidate. The
   *  parent decides what API to hit based on the candidate shape (`id`
   *  set → personal photo; otherwise → pin.images entry) and is
   *  expected to refresh the page or candidate list on success. The
   *  picker confirms with the user before invoking. */
  onDelete?: (c: HeroCandidate) => Promise<void> | void;
  maxRecommended?: number;
  maxAbsolute?: number;
  title?: string;
  hint?: string;
};

export default function HeroPicker({
  value,
  candidates,
  onChange,
  onToggleHidden,
  onDelete,
  maxRecommended = 8,
  maxAbsolute = 20,
  title = 'Hero photos',
  hint = 'Pick photos that should appear in the hero gallery, in the order you want them. Leave empty to use auto-pick.',
}: Props) {
  // Drag-rank state — index of the picked tile being dragged + current
  // drop target. Mirrors the AdminListEditor pattern (native HTML5 DnD,
  // no library).
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  // Optimistic hidden state so toggles feel instant. Keyed by personal
  // photo id; falsy = follow the candidate prop.
  const [hiddenOverrides, setHiddenOverrides] = useState<Record<string, boolean>>({});
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingUrl, setDeletingUrl] = useState<string | null>(null);
  // URLs the user has just deleted in this session — keep them out of
  // the available rail optimistically, even before the parent refreshes
  // its candidate list.
  const [deletedUrls, setDeletedUrls] = useState<Set<string>>(new Set());

  const byUrl = useMemo(() => {
    const m = new Map<string, HeroCandidate>();
    for (const c of candidates) m.set(c.url, c);
    return m;
  }, [candidates]);

  const pickedSet = useMemo(() => new Set(value), [value]);
  const available = useMemo(
    () => candidates.filter(c => !pickedSet.has(c.url) && !deletedUrls.has(c.url)),
    [candidates, pickedSet, deletedUrls],
  );

  const counterClass =
    value.length > maxRecommended
      ? 'text-amber-700'
      : value.length > 0
      ? 'text-teal'
      : 'text-muted';

  function isHidden(c: HeroCandidate): boolean {
    if (c.id && c.id in hiddenOverrides) return hiddenOverrides[c.id]!;
    return !!c.hidden;
  }

  function moveTo(fromIdx: number, toIdx: number) {
    if (fromIdx === toIdx) return;
    const next = value.slice();
    const [moved] = next.splice(fromIdx, 1);
    if (!moved) return;
    next.splice(toIdx, 0, moved);
    onChange(next);
  }

  function remove(idx: number) {
    onChange(value.filter((_, i) => i !== idx));
  }

  function add(url: string) {
    if (value.includes(url)) return;
    if (value.length >= maxAbsolute) return;
    onChange([...value, url]);
  }

  function reset() {
    if (value.length === 0) return;
    if (!confirm('Clear all hero picks and fall back to auto-pick?')) return;
    onChange([]);
  }

  async function toggleHidden(id: string, currentHidden: boolean) {
    if (!onToggleHidden) return;
    if (togglingId) return;
    const nextHidden = !currentHidden;
    setHiddenOverrides(o => ({ ...o, [id]: nextHidden }));
    setTogglingId(id);
    try {
      await onToggleHidden(id, nextHidden);
    } catch {
      // Roll back on failure.
      setHiddenOverrides(o => {
        const { [id]: _drop, ...rest } = o;
        return rest;
      });
    } finally {
      setTogglingId(null);
    }
  }

  async function deleteCandidate(c: HeroCandidate) {
    if (!onDelete) return;
    if (deletingUrl) return;
    const kindLabel = c.id ? 'personal photo' : 'image';
    const ok = confirm(
      `Delete this ${kindLabel}?\n\n` +
        'This permanently removes it from the database and from Storage. ' +
        'It cannot be undone.',
    );
    if (!ok) return;
    setDeletingUrl(c.url);
    try {
      await onDelete(c);
      // Drop the picked entry too — if we just nuked an image that was
      // also in the hero picks, the picker shouldn't keep referencing it.
      onChange(value.filter(u => u !== c.url));
      setDeletedUrls(prev => {
        const next = new Set(prev);
        next.add(c.url);
        return next;
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'delete failed';
      alert(`Could not delete: ${msg}`);
    } finally {
      setDeletingUrl(null);
    }
  }

  return (
    <section className="border border-sand rounded-md bg-white">
      <header className="px-4 py-3 border-b border-sand flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-h4 text-ink-deep">{title}</h3>
          {hint && <p className="text-small text-muted mt-0.5">{hint}</p>}
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-small font-medium ${counterClass}`}>
            Picked {value.length} / {maxRecommended} recommended
            {value.length > maxRecommended && ` (+${value.length - maxRecommended})`}
          </span>
          <button
            type="button"
            onClick={reset}
            disabled={value.length === 0}
            className="text-small text-muted hover:text-teal disabled:opacity-40 disabled:cursor-not-allowed underline-offset-2 hover:underline"
          >
            Reset to auto-pick
          </button>
        </div>
      </header>

      <div className="p-4 space-y-5">
        <div>
          <h4 className="text-label uppercase tracking-wide text-muted mb-2">
            Picked ({value.length})
            {value.length > 1 && (
              <span className="ml-2 normal-case font-normal text-muted/80">
                · drag to reorder
              </span>
            )}
          </h4>
          {value.length === 0 ? (
            <p className="text-small text-muted italic">
              No picks yet. The public page will use the auto-pick collage.
            </p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
              {value.map((url, idx) => {
                const cand = byUrl.get(url);
                const isDragging = draggingIdx === idx;
                const isDropTarget = hoverIdx === idx && draggingIdx !== idx;
                return (
                  <figure
                    key={url}
                    draggable
                    onDragStart={e => {
                      e.dataTransfer.effectAllowed = 'move';
                      // Required by Firefox to actually start the drag.
                      e.dataTransfer.setData('text/plain', String(idx));
                      setDraggingIdx(idx);
                    }}
                    onDragOver={e => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      if (draggingIdx != null && draggingIdx !== idx) {
                        setHoverIdx(idx);
                      }
                    }}
                    onDragLeave={() => {
                      if (hoverIdx === idx) setHoverIdx(null);
                    }}
                    onDrop={e => {
                      e.preventDefault();
                      if (draggingIdx != null && draggingIdx !== idx) {
                        moveTo(draggingIdx, idx);
                      }
                      setDraggingIdx(null);
                      setHoverIdx(null);
                    }}
                    onDragEnd={() => {
                      setDraggingIdx(null);
                      setHoverIdx(null);
                    }}
                    className={
                      'relative aspect-square rounded overflow-hidden border bg-cream-soft group cursor-grab active:cursor-grabbing transition-all ' +
                      (isDragging
                        ? 'opacity-40 border-teal'
                        : isDropTarget
                        ? 'border-teal ring-2 ring-teal'
                        : 'border-sand')
                    }
                    aria-label={`Hero photo ${idx + 1} of ${value.length}. Drag to reorder.`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={thumbUrl(url, { size: 192 }) ?? url}
                      alt={cand?.alt ?? `Hero photo ${idx + 1}`}
                      loading="lazy"
                      draggable={false}
                      className="w-full h-full object-cover pointer-events-none"
                    />
                    <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-ink-deep/80 text-white text-[10px] font-medium tabular-nums pointer-events-none">
                      {idx + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => remove(idx)}
                      className="absolute top-1 right-1 w-5 h-5 inline-flex items-center justify-center rounded-full bg-black/60 text-white text-xs leading-none opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity hover:bg-orange/80"
                      aria-label="Remove from picks"
                      title="Remove"
                    >
                      ×
                    </button>
                  </figure>
                );
              })}
            </div>
          )}
        </div>

        <div>
          <h4 className="text-label uppercase tracking-wide text-muted mb-2">
            Available ({available.length})
          </h4>
          {available.length === 0 ? (
            <p className="text-small text-muted italic">
              All candidates are picked. Upload more photos via{' '}
              <a href="/admin/upload" className="text-teal hover:underline">
                /admin/upload
              </a>
              .
            </p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
              {available.map(c => {
                const hidden = isHidden(c);
                return (
                  <div
                    key={c.url}
                    className={
                      'relative aspect-square rounded overflow-hidden border bg-cream-soft group ' +
                      (hidden ? 'border-amber-500/60 opacity-70' : 'border-sand')
                    }
                  >
                    <button
                      type="button"
                      onClick={() => add(c.url)}
                      disabled={value.length >= maxAbsolute}
                      className="absolute inset-0 cursor-pointer hover:ring-2 hover:ring-teal focus-visible:ring-2 focus-visible:ring-teal disabled:cursor-not-allowed"
                      aria-label={`Add ${c.alt ?? 'image'} to hero picks`}
                      title={c.label ? `${c.label}\n\nClick to add` : 'Click to add'}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={thumbUrl(c.url, { size: 192 }) ?? c.url}
                        alt={c.alt ?? ''}
                        loading="lazy"
                        className="w-full h-full object-cover"
                      />
                    </button>
                    {/* Hide toggle — only available for personal photos
                        (the only candidates with a row id we can flip in
                        the DB). Sits above the click target. */}
                    {c.id && onToggleHidden && (
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          toggleHidden(c.id!, hidden);
                        }}
                        disabled={togglingId === c.id}
                        className={
                          'absolute top-1 right-1 px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide transition-opacity ' +
                          (hidden
                            ? 'bg-amber-600/95 text-white opacity-100 hover:bg-amber-700'
                            : 'bg-ink-deep/85 text-white opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-ink-deep')
                        }
                        aria-label={hidden ? 'Unhide from auto-pick' : 'Hide from auto-pick'}
                        title={
                          hidden
                            ? 'Currently hidden from auto-pick. Click to unhide.'
                            : 'Hide from auto-pick (still pickable here).'
                        }
                      >
                        {togglingId === c.id ? '…' : hidden ? 'hidden' : 'hide'}
                      </button>
                    )}
                    {/* Delete — irreversible. Distinct red treatment + top-
                        left so it never sits next to the hide toggle. Only
                        renders when the parent supplies an onDelete handler. */}
                    {onDelete && (
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          deleteCandidate(c);
                        }}
                        disabled={deletingUrl === c.url}
                        className="absolute top-1 left-1 px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide bg-red-600/90 text-white opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-red-700 transition-opacity disabled:opacity-50"
                        aria-label="Delete this image"
                        title={
                          c.id
                            ? 'Delete this personal photo (removes from DB + Storage).'
                            : 'Delete this image entry (removes from this pin + Storage if no other pin uses it).'
                        }
                      >
                        {deletingUrl === c.url ? '…' : 'delete'}
                      </button>
                    )}
                    {c.label && (
                      <span className="absolute bottom-0 left-0 right-0 px-1 py-0.5 bg-black/60 text-white text-[10px] truncate pointer-events-none">
                        {c.label}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
