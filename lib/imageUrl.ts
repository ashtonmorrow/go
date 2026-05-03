/**
 * Image URL helpers — turn raw remote URLs into resized variants served by
 * Vercel's image optimizer (the engine behind `next/image`).
 *
 * Why we route through `/_next/image` instead of Supabase's transformer
 * --------------------------------------------------------------------
 * Originally every thumbnail / hero hit Supabase's
 * /storage/v1/render/image/public/ endpoint with width/height query
 * params. That worked but Supabase counts each unique transformed URL
 * as one billable transformation and only includes 100/month on Pro —
 * /pins/cards alone fans out to 5,093 pin thumbs and burns through the
 * quota on a single bot crawl. Once over, it's $5 per 1,000 transforms.
 *
 * Vercel's image optimizer fixes this: it's a single proxy at
 * /_next/image?url=...&w=W&q=Q that fetches the source ONCE per unique
 * source URL, resizes to the requested width on the fly, and caches the
 * result at the edge for `images.minimumCacheTTL` seconds (we set it to
 * a year). Vercel Pro includes 5,000 source images/month and unlimited
 * resize variants — at our scale, effectively free.
 *
 * Net effect of this rewrite: zero Supabase image transformations.
 *
 * The widths used here (×2 for retina) all live in next.config.js
 * `images.imageSizes`. Asking for a width that's not in that set or
 * `deviceSizes` returns 400 from /_next/image, so any new size has to
 * be added to the config too.
 *
 * Pass-through for anything we shouldn't optimize (e.g. flag SVGs from
 * flagcdn — they're tiny and resizing them just wastes cycles).
 */

const SUPABASE_HOST = 'pdjrvlhepiwkshxerkpz.supabase.co';

/** Hostnames whose images we DO want to push through Next's optimizer.
 *  Everything else is returned unchanged. flagcdn / hatscripts SVGs
 *  are deliberately excluded — they're already small and Next can't
 *  rasterize SVG safely. */
const OPTIMIZABLE_HOSTS = [
  SUPABASE_HOST,
  'upload.wikimedia.org',
  'commons.wikimedia.org',
  'v5.airtableusercontent.com',
  's3.us-west-2.amazonaws.com',
  'prod-files-secure.s3.us-west-2.amazonaws.com',
];

export type ThumbOptions = {
  /** CSS pixel size of the rendered img element. We serve 2x for retina. */
  size: number;
  /** JPEG quality 1-100. Defaults to 80, which is a good visual-vs-bytes balance. */
  quality?: number;
  /** Resize strategy. Kept for source-API compatibility but the Next
   *  optimizer always preserves aspect ratio, so this is informational. */
  resize?: 'cover' | 'contain' | 'fill';
};

function isOptimizable(url: string): boolean {
  return OPTIMIZABLE_HOSTS.some(host => url.includes(host));
}

/** Build a /_next/image URL with the requested width + quality. The width
 *  has to match a value in next.config's images.imageSizes ∪ deviceSizes;
 *  callers should pick from the existing pool. */
function nextImageUrl(source: string, width: number, quality: number): string {
  const w = Math.max(1, Math.round(width));
  const q = Math.max(1, Math.min(100, Math.round(quality)));
  return `/_next/image?url=${encodeURIComponent(source)}&w=${w}&q=${q}`;
}

/**
 * Resize a remote image to `size * 2` pixels (retina). Pass-through for
 * URLs we can't or shouldn't optimize (flag CDNs, anything off the
 * allowlist, or empty input).
 */
export function thumbUrl(
  url: string | null | undefined,
  options: ThumbOptions,
): string | null {
  if (!url) return null;
  if (!isOptimizable(url)) return url;
  const { size, quality = 80 } = options;
  // 2x for retina, snapped to the widths declared in next.config.
  return nextImageUrl(url, size * 2, quality);
}

/**
 * Larger contexts (hero on the detail page) where we want a non-square
 * image: feed Next a width and let it preserve aspect ratio.
 */
export function heroUrl(
  url: string | null | undefined,
  width: number,
  quality = 82,
): string | null {
  if (!url) return null;
  if (!isOptimizable(url)) return url;
  return nextImageUrl(url, width * 2, quality);
}
