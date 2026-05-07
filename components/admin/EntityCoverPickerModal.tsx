'use client';

import { useEffect, useRef, useState } from 'react';
import { uploadEntityPhoto } from '@/lib/admin/uploadEntityPhoto';

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
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {photos.map(p => {
                const isCurrent = !!currentCoverUrl && p.url === currentCoverUrl;
                const isCodex = p.imageSource === 'codex-generated';
                const sourceBadge =
                  p.source === 'city-hero' ? 'City'
                  : p.source === 'country-hero' ? 'Country'
                  : isCodex ? 'Codex'
                  : p.source === 'pin-image' ? 'Pin'
                  : null;
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
                    title={p.pinName}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.url}
                      alt={p.pinName}
                      loading="lazy"
                      className="w-full h-full object-cover transition-transform group-hover:scale-105"
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink-deep/80 to-transparent p-2 text-white text-micro leading-tight">
                      <p className="truncate">{p.pinName}</p>
                    </div>
                    {sourceBadge && (
                      <div
                        className={
                          'absolute top-1.5 right-1.5 pill text-micro shadow ' +
                          (isCodex
                            ? 'bg-orange text-white'
                            : p.source === 'personal'
                              ? 'bg-teal text-white'
                              : 'bg-ink-deep/80 text-white')
                        }
                      >
                        {sourceBadge}
                      </div>
                    )}
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
