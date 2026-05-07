'use client';

import { useEffect, useRef, useState } from 'react';
import { uploadEntityPhoto } from '@/lib/admin/uploadEntityPhoto';
import { isCommonsUrl } from '../CommonsAttributionBadge';

// === EntityCoverPickerModal ================================================
// Inline quick cover picker for /admin/pins, /admin/cities, /admin/countries.
// Pulls candidate photos via /api/admin/personal-photos with the matching
// scope, then writes the picked URL to the entity's hero_photo_urls column
// (via the existing update-pin / update-city / update-country endpoints).
//
// The first entry of hero_photo_urls is what every public detail page
// reads as the cover. Picking moves the chosen URL to position 0 and
// keeps the rest of the existing array behind it, so the picker doubles
// as a "set primary cover" affordance without throwing away the curated
// gallery the per-entity editor produced.
//
// State is local. The parent passes the current cover URL for highlight
// and gets onCommit() with the new URL so it can refresh the row's
// thumbnail without a page reload.

export type PhotoSource = 'personal' | 'pin-image' | 'city-hero' | 'country-hero';

export type PhotoTile = {
  id: string;
  url: string;
  source: PhotoSource;
  imageSource?: string | null;
  pinId: string | null;
  pinName: string;
  pinSlug: string | null;
  takenAt: string | null;
  lat: number | null;
  lng: number | null;
};

export type EntityKind = 'pin' | 'city' | 'country';

type Props = {
  kind: EntityKind;
  /** uuid for pin, slug for city/country. */
  entityRef: string;
  /** Display label in the modal header. */
  entityName: string;
  /** Current first hero URL — highlights matching tile, optional. */
  currentCoverUrl: string | null;
  /** Existing hero_photo_urls so we can preserve the rest of the array
   *  behind the new pick. */
  existingHeroPhotoUrls: string[];
  onCommit: (next: { coverUrl: string | null; heroPhotoUrls: string[] }) => void;
  onClose: () => void;
};

export default function EntityCoverPickerModal({
  kind,
  entityRef,
  entityName,
  currentCoverUrl,
  existingHeroPhotoUrls,
  onCommit,
  onClose,
}: Props) {
  const [photos, setPhotos] = useState<PhotoTile[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingClear, setSavingClear] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadStage, setUploadStage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Source-filter pill state. 'all' includes everything; the four
  // discriminator pills mirror the source field on each tile, plus a
  // 'codex' shortcut for the most common cleanup target (pin.images
  // entries with imageSource === 'codex-generated').
  type Filter = 'all' | 'personal' | 'pin' | 'codex' | 'city' | 'country';
  const [filter, setFilter] = useState<Filter>('all');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const param =
          kind === 'pin' ? `pinId=${encodeURIComponent(entityRef)}`
          : kind === 'city' ? `citySlug=${encodeURIComponent(entityRef)}`
          : `countrySlug=${encodeURIComponent(entityRef)}`;
        const res = await fetch(`/api/admin/personal-photos?${param}&limit=500`);
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error ?? 'load failed');
        if (!cancelled) setPhotos(data.photos as PhotoTile[]);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'load failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [kind, entityRef]);

  // Move picked URL to front; preserve the rest of the array minus dupes.
  function buildNewHeroOrder(pickedUrl: string): string[] {
    const rest = existingHeroPhotoUrls.filter(u => u && u !== pickedUrl);
    return [pickedUrl, ...rest];
  }

  async function pick(photo: PhotoTile) {
    setSaving(true);
    setError(null);
    const next = buildNewHeroOrder(photo.url);
    try {
      const ok = await writeHero(kind, entityRef, next);
      if (!ok.success) throw new Error(ok.error ?? 'save failed');
      onCommit({ coverUrl: photo.url, heroPhotoUrls: next });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'save failed');
    } finally {
      setSaving(false);
    }
  }

  /** Upload a single file → make it the cover. The shared helper handles
   *  EXIF / HEIC / hash / Storage upload / personal_photos insert; we
   *  just stage the UI and surface the merged hero_photo_urls back to
   *  the parent on success. */
  async function uploadAndUseAsCover(file: File) {
    setUploading(true);
    setError(null);
    try {
      const result = await uploadEntityPhoto({
        kind,
        entityRef,
        file,
        existingHeroPhotoUrls,
        promoteToCover: true,
        onStage: stage => setUploadStage(stage + '…'),
      });
      const nextHero =
        result.heroPhotoUrls ??
        [result.url, ...existingHeroPhotoUrls.filter(u => u && u !== result.url)];
      onCommit({ coverUrl: result.url, heroPhotoUrls: nextHero });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'upload failed');
    } finally {
      setUploading(false);
      setUploadStage(null);
    }
  }

  /** Permanently delete a tile from its source. Two paths matter for
   *  cleanup: personal photos (full row + Storage drop via DELETE
   *  /api/admin/personal-photos) and pin.images entries (array entry +
   *  Storage drop via DELETE /api/admin/pin-image). City and country
   *  hero entries aren't destructive of underlying photos — they're
   *  array memberships managed by the per-entity editor — so the picker
   *  doesn't expose delete on those tiles. */
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
      // Drop the tile from the modal's local pool so the grid reflects
      // the delete instantly. The parent's table thumbnail won't update
      // until the modal closes; that's fine since deletion doesn't
      // change the cover (cover URL is stored separately).
      setPhotos(prev => (prev ? prev.filter(t => t.id !== p.id) : prev));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'delete failed');
    } finally {
      setDeletingId(null);
    }
  }

  async function clear() {
    // Reverts to the auto-pick fallback by emptying hero_photo_urls
    // entirely. The per-entity editor can still re-curate later.
    setSavingClear(true);
    setError(null);
    try {
      const ok = await writeHero(kind, entityRef, []);
      if (!ok.success) throw new Error(ok.error ?? 'clear failed');
      onCommit({ coverUrl: null, heroPhotoUrls: [] });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'clear failed');
    } finally {
      setSavingClear(false);
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !saving && !savingClear) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving, savingClear]);

  // Pill counts + filtered list. Counts come from the full pool (so
  // they don't shift as the user toggles pills), filtering happens at
  // render time.
  const all = photos ?? [];
  const counts = {
    all: all.length,
    personal: all.filter(p => p.source === 'personal').length,
    pin: all.filter(p => p.source === 'pin-image').length,
    codex: all.filter(p => p.source === 'pin-image' && p.imageSource === 'codex-generated').length,
    city: all.filter(p => p.source === 'city-hero').length,
    country: all.filter(p => p.source === 'country-hero').length,
  };
  const filtered = all.filter(p => {
    if (filter === 'all') return true;
    if (filter === 'personal') return p.source === 'personal';
    if (filter === 'pin') return p.source === 'pin-image';
    if (filter === 'codex') return p.source === 'pin-image' && p.imageSource === 'codex-generated';
    if (filter === 'city') return p.source === 'city-hero';
    if (filter === 'country') return p.source === 'country-hero';
    return true;
  });

  return (
    <div
      className="fixed inset-0 z-50 bg-ink-deep/40 flex items-center justify-center p-4"
      onClick={() => !saving && !savingClear && onClose()}
    >
      <div
        className="bg-white rounded-lg shadow-paper max-w-5xl w-full max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-sand flex items-center gap-3 flex-wrap">
          <h2 className="text-h3 text-ink-deep">{entityName} cover</h2>
          <span className="text-small text-muted">
            Pick the primary cover. Remaining picks stay below it in the gallery.
          </span>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={saving || savingClear || uploading}
            className="ml-auto text-label px-3 py-1 rounded border border-sand text-ink-deep hover:bg-cream-soft disabled:opacity-50"
            title="Upload a new photo and use it as the cover"
          >
            {uploading ? `Uploading${uploadStage ? ' · ' + uploadStage : '…'}` : '+ Upload new'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.heic,.heif"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void uploadAndUseAsCover(f);
            }}
          />
          <button
            type="button"
            onClick={clear}
            disabled={saving || savingClear || uploading}
            className="text-label text-slate hover:text-orange disabled:opacity-50"
            title="Empty hero_photo_urls so the public page falls back to auto-pick"
          >
            {savingClear ? 'Clearing…' : 'Clear cover'}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={saving || savingClear || uploading}
            className="text-label text-slate hover:text-ink-deep disabled:opacity-50"
          >
            ✕
          </button>
        </div>

        {/* Source filter pills — sit above the grid so the user can scope
            to e.g. just codex art for cleanup or just personal photos
            for a polished cover. Hidden when the pool is empty. */}
        {photos && photos.length > 0 && (
          <div className="px-5 pt-3 pb-1 flex flex-wrap items-center gap-1.5 border-b border-sand/60">
            {(
              [
                { id: 'all', label: 'All', count: counts.all },
                { id: 'personal', label: 'Personal', count: counts.personal },
                { id: 'pin', label: 'Pin', count: counts.pin },
                { id: 'codex', label: 'Codex', count: counts.codex },
                { id: 'city', label: 'City', count: counts.city },
                { id: 'country', label: 'Country', count: counts.country },
              ] as { id: Filter; label: string; count: number }[]
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

        <div className="flex-1 overflow-y-auto p-5 bg-cream-soft/40">
          {error && (
            <div className="mb-4 px-3 py-2 rounded bg-orange/10 border border-orange/40 text-small text-orange">
              {error}
            </div>
          )}
          {loading ? (
            <p className="text-center text-slate text-small py-12">Loading photos…</p>
          ) : !photos || photos.length === 0 ? (
            <p className="text-center text-slate text-small py-12">
              No photos found. Add one via the per-{kind} editor or upload via /admin/upload.
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
                // Wikimedia Commons tiles get a yellow Commons warning
                // pill instead of the neutral source badge so picking
                // one is a deliberate choice — promoting a Commons URL
                // to hero_photo_urls means CC BY-SA attribution travels
                // with the image on every public render.
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
                      title={p.pinName}
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
        </div>

        {(saving || savingClear) && (
          <div className="px-5 py-3 border-t border-sand bg-cream-soft text-small text-muted">
            Saving…
          </div>
        )}
      </div>
    </div>
  );
}

/** Persist the new hero_photo_urls array via the matching update
 *  endpoint. Returns { success } so the caller doesn't have to
 *  duplicate error parsing. */
async function writeHero(
  kind: EntityKind,
  entityRef: string,
  next: string[],
): Promise<{ success: boolean; error?: string }> {
  if (kind === 'pin') {
    const res = await fetch('/api/admin/update-pin', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: entityRef, fields: { hero_photo_urls: next } }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { success: false, error: data?.error ?? `failed (${res.status})` };
    return { success: true };
  }
  if (kind === 'city') {
    const res = await fetch('/api/admin/update-city', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slug: entityRef, fields: { hero_photo_urls: next } }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { success: false, error: data?.error ?? `failed (${res.status})` };
    return { success: true };
  }
  // country
  const res = await fetch('/api/admin/update-country', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ slug: entityRef, fields: { hero_photo_urls: next } }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { success: false, error: data?.error ?? `failed (${res.status})` };
  return { success: true };
}
