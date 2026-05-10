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
//
// Video support: if the dropped File is video/* the helper skips HEIC
// convert + EXIF parse, captures a poster frame client-side via a
// hidden <video> + canvas, uploads both the video and the poster, and
// records media_type='video' on the personal_photos row. The poster
// URL is what tile renderers use for the still; click → lightbox plays
// the underlying video.

import { sha256OfFile } from '@/lib/photoHash';
import { convertHeicIfNeeded } from '@/lib/heicConvert';
import { extractExifMeta } from '@/lib/exifGps';
import { supabase } from '@/lib/supabase';
import { isVideoFile, videoPosterFromFile } from '@/lib/admin/videoPoster';

export type UploadEntityKind = 'pin' | 'city' | 'country';

export type UploadEntityPhotoResult = {
  /** Public URL of the uploaded image or video. */
  url: string;
  /** personal_photos row id, set only for pin uploads. */
  photoId?: string;
  /** Updated hero_photo_urls array, set only when promoteToCover=true
   *  AND the helper performed the write itself. Caller can use this to
   *  reflect the new ordering without an extra fetch. */
  heroPhotoUrls?: string[];
  /** 'image' or 'video' — useful for callers that want to update local
   *  candidate pools immediately without waiting on a refetch. */
  mediaType?: 'image' | 'video';
  /** For videos, the public URL of the captured poster JPG. */
  posterUrl?: string;
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

/** Fetch a signed upload token + path for a given hash and contentType.
 *  Wraps the /api/admin/upload-photo handler. */
async function getSignedUpload(
  hash: string,
  contentType: string,
): Promise<{ token: string; path: string; publicUrl: string }> {
  const res = await fetch('/api/admin/upload-photo', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ hash, contentType }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error ?? `signed-url failed (${res.status})`);
  }
  return data as { token: string; path: string; publicUrl: string };
}

export async function uploadEntityPhoto(
  opts: UploadEntityPhotoOptions,
): Promise<UploadEntityPhotoResult> {
  const { kind, entityRef, file, promoteToCover = false, onStage } = opts;
  const existingHeroPhotoUrls = opts.existingHeroPhotoUrls ?? [];
  const isVideo = isVideoFile(file);

  onStage?.('preparing');

  // Branch the prep step. Videos skip HEIC convert (no-op anyway) +
  // EXIF parse (mostly empty for the QuickTime/MP4 boxes we'd see),
  // and capture a poster frame in their place.
  let working: File = file;
  let exifTakenAt: Date | null = null;
  let exifLat: number | null = null;
  let exifLng: number | null = null;
  let width: number | null = null;
  let height: number | null = null;
  let durationSeconds: number | null = null;
  let posterBlob: Blob | null = null;

  if (isVideo) {
    const meta = await videoPosterFromFile(file);
    if (meta) {
      width = meta.width;
      height = meta.height;
      durationSeconds = meta.durationSeconds;
      posterBlob = meta.posterBlob;
    }
  } else {
    const converted = await convertHeicIfNeeded(file);
    working = converted.file;
    const exif = await extractExifMeta(working);
    exifTakenAt = exif.takenAt ?? null;
    exifLat = exif.lat ?? null;
    exifLng = exif.lng ?? null;
    const dims = await imageDimensions(working);
    width = dims?.width ?? null;
    height = dims?.height ?? null;
  }

  const hash = await sha256OfFile(working);

  onStage?.('signing');
  const tokenData = await getSignedUpload(hash, working.type || (isVideo ? 'video/mp4' : ''));

  onStage?.('uploading');
  const { error: uploadErr } = await supabase.storage
    .from('personal-photos')
    .uploadToSignedUrl(tokenData.path, tokenData.token, working, {
      contentType: working.type || 'application/octet-stream',
      upsert: true,
    });
  if (uploadErr) throw new Error(uploadErr.message);

  const publicUrl = tokenData.publicUrl;

  // Upload the poster as a sibling object. Hash the JPEG so the path
  // is content-addressed too — re-uploading the same video re-uses
  // the same poster file. The token endpoint already handles upsert.
  let posterUrl: string | null = null;
  if (posterBlob) {
    try {
      const posterFile = new File([posterBlob], `${hash}-poster.jpg`, {
        type: 'image/jpeg',
      });
      const posterHash = await sha256OfFile(posterFile);
      const posterToken = await getSignedUpload(posterHash, 'image/jpeg');
      const { error: posterErr } = await supabase.storage
        .from('personal-photos')
        .uploadToSignedUrl(posterToken.path, posterToken.token, posterFile, {
          contentType: 'image/jpeg',
          upsert: true,
        });
      if (!posterErr) {
        posterUrl = posterToken.publicUrl;
      }
    } catch (e) {
      console.warn('[uploadEntityPhoto] poster upload failed:', e);
    }
  }

  onStage?.('saving');

  if (kind === 'pin') {
    const res = await fetch('/api/admin/personal-photos', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        pinId: entityRef,
        url: publicUrl,
        mediaType: isVideo ? 'video' : 'image',
        posterUrl,
        durationSeconds,
        hash,
        takenAt: exifTakenAt ? exifTakenAt.toISOString() : null,
        exifLat,
        exifLng,
        width,
        height,
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
      mediaType: isVideo ? 'video' : 'image',
      posterUrl: posterUrl ?? undefined,
    };
  }

  // City / country: write hero_photo_urls only when explicitly promoting.
  // Videos can be promoted to a city/country hero too — the renderer
  // will detect by extension and play with controls.
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
    return {
      url: publicUrl,
      heroPhotoUrls: next,
      mediaType: isVideo ? 'video' : 'image',
      posterUrl: posterUrl ?? undefined,
    };
  }

  return {
    url: publicUrl,
    mediaType: isVideo ? 'video' : 'image',
    posterUrl: posterUrl ?? undefined,
  };
}
