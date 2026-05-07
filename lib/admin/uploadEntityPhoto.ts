// === uploadEntityPhoto =====================================================
// Single source of truth for the "drop a photo onto a known entity"
// flow used by both EntityCoverPickerModal and HeroPicker. Wraps the
// existing signed-URL → Storage → DB write dance so the callers don't
// each reimplement EXIF parsing, HEIC conversion, hash computation,
// signed-URL fetch, and storage upload.
//
// For pins the helper also creates a personal_photos row so the new
// photo joins the per-entity editor's HeroPicker pool. For cities and
// countries there's no per-photo row — the URL itself is the artifact —
// so the helper just hands the public URL back to the caller and lets
// them decide what to do with hero_photo_urls.
//
// promoteToCover controls whether the helper writes hero_photo_urls
// itself (true → moves the new URL to position 0, preserving the rest
// of the array; the EntityCoverPickerModal uses this) or leaves the
// caller to commit hero_photo_urls in its own Save flow (false → the
// HeroPicker uses this so its onChange + parent Save are the only
// writer).

import { sha256OfFile } from '@/lib/photoHash';
import { convertHeicIfNeeded } from '@/lib/heicConvert';
import { extractExifMeta } from '@/lib/exifGps';
import { supabase } from '@/lib/supabase';

export type UploadEntityKind = 'pin' | 'city' | 'country';

export type UploadEntityPhotoResult = {
  /** Public URL of the uploaded image. */
  url: string;
  /** personal_photos row id, set only for pin uploads. */
  photoId?: string;
  /** Updated hero_photo_urls array, set only when promoteToCover=true
   *  AND the helper performed the write itself. Caller can use this to
   *  reflect the new ordering without an extra fetch. */
  heroPhotoUrls?: string[];
};

export type UploadEntityPhotoOptions = {
  kind: UploadEntityKind;
  /** uuid for pin, slug for city/country. */
  entityRef: string;
  file: File;
  /** Existing hero_photo_urls — required when promoteToCover=true so
   *  the helper can compute the merged array. Defaulted to [] when
   *  promoteToCover is false. */
  existingHeroPhotoUrls?: string[];
  promoteToCover?: boolean;
  /** Optional progress callback. Stage strings are stable enough to
   *  render directly in the UI. */
  onStage?: (stage: 'preparing' | 'signing' | 'uploading' | 'saving') => void;
};

async function imageDimensions(
  file: File,
): Promise<{ width: number; height: number } | null> {
  return new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const out = { width: img.naturalWidth, height: img.naturalHeight };
      URL.revokeObjectURL(url);
      resolve(out);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

/** Append a URL to the existing hero array, deduping and putting the new
 *  value first. Used by both promoteToCover paths. */
function unshiftHeroUrl(existing: string[], url: string): string[] {
  return [url, ...existing.filter(u => u && u !== url)];
}

export async function uploadEntityPhoto(
  opts: UploadEntityPhotoOptions,
): Promise<UploadEntityPhotoResult> {
  const { kind, entityRef, file, promoteToCover = false, onStage } = opts;
  const existingHeroPhotoUrls = opts.existingHeroPhotoUrls ?? [];

  onStage?.('preparing');
  const { file: working } = await convertHeicIfNeeded(file);
  const hash = await sha256OfFile(working);
  const meta = await extractExifMeta(working);
  const dims = await imageDimensions(working);

  onStage?.('signing');
  const tokenRes = await fetch('/api/admin/upload-photo', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ hash, contentType: working.type }),
  });
  const tokenData = await tokenRes.json().catch(() => ({}));
  if (!tokenRes.ok) {
    throw new Error(tokenData?.error ?? `signed-url failed (${tokenRes.status})`);
  }

  onStage?.('uploading');
  const { error: uploadErr } = await supabase.storage
    .from('personal-photos')
    .uploadToSignedUrl(tokenData.path, tokenData.token, working, {
      contentType: working.type || 'application/octet-stream',
      upsert: true,
    });
  if (uploadErr) throw new Error(uploadErr.message);

  const publicUrl = tokenData.publicUrl as string;

  onStage?.('saving');

  if (kind === 'pin') {
    const res = await fetch('/api/admin/personal-photos', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        pinId: entityRef,
        url: publicUrl,
        hash,
        takenAt: meta.takenAt ? meta.takenAt.toISOString() : null,
        exifLat: meta.lat ?? null,
        exifLng: meta.lng ?? null,
        width: dims?.width ?? null,
        height: dims?.height ?? null,
        bytes: working.size,
        promoteToCover,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error ?? `save failed (${res.status})`);
    return {
      url: publicUrl,
      photoId: typeof data?.id === 'string' ? data.id : undefined,
      heroPhotoUrls: Array.isArray(data?.heroPhotoUrls) ? data.heroPhotoUrls : undefined,
    };
  }

  // City / country: write hero_photo_urls only when explicitly promoting.
  if (promoteToCover) {
    const next = unshiftHeroUrl(existingHeroPhotoUrls, publicUrl);
    const endpoint =
      kind === 'city' ? '/api/admin/update-city' : '/api/admin/update-country';
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slug: entityRef, fields: { hero_photo_urls: next } }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error ?? `save failed (${res.status})`);
    return { url: publicUrl, heroPhotoUrls: next };
  }

  return { url: publicUrl };
}
