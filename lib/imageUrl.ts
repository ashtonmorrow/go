/**
 * Image URL helpers — turn raw Supabase Storage URLs into resized thumbnails
 * served by Supabase's image transformation endpoint.
 *
 * Why this exists
 * ---------------
 * Cards on /pins/cards display 56x56 px thumbnails but were rendering full-
 * resolution photos (often 4-8 MB each, 4000x3000). With 1300+ pins on the
 * page, the network payload was ~118 MB. Switching the URL to the
 * /render/image/public/ endpoint with width/height query params makes
 * Supabase return a properly sized JPEG/WebP (~10-20 KB each).
 *
 * Anything that's not a Supabase Storage object URL (Airtable legacy,
 * Wikimedia, flagcdn, etc.) passes through unchanged. The transform is
 * idempotent — if we somehow pass an already-transformed URL through it,
 * the existing query params survive.
 *
 * Reference: https://supabase.com/docs/guides/storage/serving/image-transformations
 */

const STORAGE_OBJECT_SEGMENT = '/storage/v1/object/public/';
const STORAGE_RENDER_SEGMENT = '/storage/v1/render/image/public/';
const SUPABASE_HOST = 'pdjrvlhepiwkshxerkpz.supabase.co';

export type ThumbOptions = {
  /** CSS pixel size of the rendered img element. We serve 2x for retina. */
  size: number;
  /** JPEG quality 1-100. Defaults to 80, which is a good visual-vs-bytes balance. */
  quality?: number;
  /** Resize strategy — Supabase supports 'cover' (default), 'contain', 'fill'. */
  resize?: 'cover' | 'contain' | 'fill';
};

/**
 * Rewrite a Supabase Storage URL to its image-transform equivalent at
 * `size * 2` pixels (retina). Pass-through for non-Supabase URLs and any
 * input that doesn't look like a public Storage object.
 */
export function thumbUrl(
  url: string | null | undefined,
  options: ThumbOptions,
): string | null {
  if (!url) return null;
  if (!url.includes(SUPABASE_HOST) || !url.includes(STORAGE_OBJECT_SEGMENT)) {
    return url;
  }
  const { size, quality = 80, resize = 'cover' } = options;
  const transformed = url.replace(STORAGE_OBJECT_SEGMENT, STORAGE_RENDER_SEGMENT);
  const sep = transformed.includes('?') ? '&' : '?';
  // Multiply by 2 so 56px CSS thumbs still look crisp on retina displays.
  const px = Math.max(1, Math.round(size * 2));
  return `${transformed}${sep}width=${px}&height=${px}&resize=${resize}&quality=${quality}`;
}

/**
 * For larger contexts (hero on the detail page) where we want a non-square
 * image: keep the same width/quality but let the height match the source's
 * aspect ratio.
 */
export function heroUrl(
  url: string | null | undefined,
  width: number,
  quality = 82,
): string | null {
  if (!url) return null;
  if (!url.includes(SUPABASE_HOST) || !url.includes(STORAGE_OBJECT_SEGMENT)) {
    return url;
  }
  const transformed = url.replace(STORAGE_OBJECT_SEGMENT, STORAGE_RENDER_SEGMENT);
  const sep = transformed.includes('?') ? '&' : '?';
  const px = Math.max(1, Math.round(width * 2));
  return `${transformed}${sep}width=${px}&quality=${quality}`;
}
