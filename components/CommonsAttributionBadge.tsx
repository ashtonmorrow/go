// === CommonsAttributionBadge ===============================================
// Small hover-revealed overlay that surfaces "via Wikimedia Commons" with a
// link to the canonical file page whenever a rendered <img> happens to point
// at commons.wikimedia.org or upload.wikimedia.org. The file page itself
// lists author + license, which satisfies CC BY-SA 4.0's URI/hyperlink
// attribution requirement: a reader who wants the credit is one click away.
//
// Forward-looking insurance. Today the public render paths don't surface
// Commons URLs (the city `hero_image` column was retired from the cover
// chain; pin.images and curated `hero_photo_urls` arrays are clean). But
// nothing prevents a future enrichment script — or a manual paste —
// from putting a Commons URL back into one of those fields. Drop this
// badge alongside any cover/hero <img> and the credit follows the image
// automatically the moment the URL changes.
//
// Renders nothing for non-Commons URLs, so dropping it into a render
// path is free unless and until a Commons URL appears.

const COMMONS_HOSTS = new Set(['commons.wikimedia.org', 'upload.wikimedia.org']);

/** Detect whether a URL points at Wikimedia Commons (or its CDN). */
function isCommonsUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    return COMMONS_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** Convert any Commons URL (CDN or wiki page) to the canonical
 *  https://commons.wikimedia.org/wiki/File:<filename> URL. The file page
 *  shows author, license, and license URL, which is what a reader needs
 *  to verify attribution. Returns the input unchanged when we can't
 *  parse a filename. */
function commonsFilePageUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname === 'commons.wikimedia.org') return url;
    // upload.wikimedia.org URL shapes:
    //   /wikipedia/commons/a/ab/Foo.jpg
    //   /wikipedia/commons/thumb/a/ab/Foo.jpg/640px-Foo.jpg
    const parts = u.pathname.split('/').filter(Boolean);
    const i = parts.indexOf('commons');
    if (i < 0) return url;
    const rest = parts.slice(i + 1);
    const tail = rest[0] === 'thumb' ? rest.slice(1) : rest;
    // [hash1, hash2, filename, (size-prefix-filename)?]
    if (tail.length < 3) return url;
    const filename = tail[2];
    return `https://commons.wikimedia.org/wiki/File:${filename}`;
  } catch {
    return url;
  }
}

type Position = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';

const POSITION_CLS: Record<Position, string> = {
  'bottom-right': 'bottom-1.5 right-1.5',
  'bottom-left': 'bottom-1.5 left-1.5',
  'top-right': 'top-1.5 right-1.5',
  'top-left': 'top-1.5 left-1.5',
};

export default function CommonsAttributionBadge({
  url,
  position = 'bottom-right',
  /** Render style. 'subtle' shows the badge only on hover/focus of the
   *  parent (.group). 'always' keeps it visible at all times. Use
   *  'always' for thumbnail contexts where there's no hover. */
  variant = 'subtle',
}: {
  url: string | null | undefined;
  position?: Position;
  variant?: 'subtle' | 'always';
}) {
  if (!isCommonsUrl(url)) return null;
  const href = commonsFilePageUrl(url!);
  const visibility =
    variant === 'always'
      ? 'opacity-100'
      : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100';
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer license"
      onClick={e => e.stopPropagation()}
      className={
        'absolute z-10 px-1.5 py-0.5 rounded-sm text-[10px] leading-tight font-medium ' +
        'bg-ink-deep/80 text-white shadow-sm hover:bg-ink-deep ' +
        'transition-opacity ' +
        POSITION_CLS[position] +
        ' ' +
        visibility
      }
      title="Source and license on Wikimedia Commons"
      aria-label="Photo source on Wikimedia Commons"
    >
      📷 Wikimedia Commons ↗
    </a>
  );
}

export { isCommonsUrl, commonsFilePageUrl };
