// lib/inlinePinPhotos.ts
//
// Pure helpers for injecting personal pin photos into a list-body markdown.
// Lives outside lib/content.ts so it can be exercised from /scripts (which
// runs under tsx, not Next, and so cannot import the `server-only` marker
// that content.ts uses).
//
// The rule the injector implements:
//   - For every `[Name](/pins/<slug>)` link in the body, if the linked pin
//     has personal photos available, splice a <figure> block in after the
//     paragraph of first mention.
//   - One figure per pin per guide (later mentions don't repeat the image).
//   - Skip blocks that are headings, tables, lists, blockquotes, or HTML
//     comments — only insert into ordinary paragraphs.
//
// marked passes raw HTML through unchanged, so the figure markup makes it to
// the rendered page intact and picks up the `.post-prose figure` styling.
//
// Image bytes: we route the Supabase source through `/_next/image?url=...` so
// the Vercel optimizer downsizes the originals (often 3-6 MB phone photos)
// to ~1080px and serves WebP. Bare Supabase URLs would otherwise blow up
// page weight on a Cairo guide with six figures.

// Widths the next.config.js image optimizer accepts. Keep in sync with the
// list in lib/imageUrl.ts; we want a width close to the prose column
// (~720px) at 2x for retina, snapped to a valid value. 1080 is the closest
// match >= 1440 isn't allowed, 1200 is the next step up.
const FIGURE_WIDTH = 1080;
const FIGURE_QUALITY = 82;
const OPTIMIZABLE_HOSTS = [
  'pdjrvlhepiwkshxerkpz.supabase.co',
  // matches both the bare Supabase Storage host and any CDN alias if we
  // add one later; broaden as needed.
];

function isOptimizable(url: string): boolean {
  return OPTIMIZABLE_HOSTS.some((h) => url.includes(h));
}

function optimizedSrc(url: string): string {
  if (!isOptimizable(url)) return url;
  return `/_next/image?url=${encodeURIComponent(url)}&w=${FIGURE_WIDTH}&q=${FIGURE_QUALITY}`;
}

/** Match `](/pins/<slug>)` even when a query/hash follows the slug. */
const PIN_LINK_RE = /\]\(\/pins\/([a-z0-9-]+)(?:[?#][^)]*)?\)/g;

/**
 * Extract every unique `/pins/<slug>` reference from a list body markdown.
 * Returns slugs in first-appearance order so callers can resolve photos
 * deterministically and so the eventual figure ordering matches the prose.
 */
export function extractPinSlugsFromBody(body: string): string[] {
  if (!body) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  PIN_LINK_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PIN_LINK_RE.exec(body))) {
    const slug = m[1];
    if (!seen.has(slug)) {
      seen.add(slug);
      out.push(slug);
    }
  }
  return out;
}

/** Minimal photo shape needed for rendering the figure. */
export type InlinePinPhoto = {
  url: string;
  caption: string | null;
  width: number | null;
  height: number | null;
};

export type InlinePinPhotoEntry = {
  pinName: string;
  photos: InlinePinPhoto[];
};

/**
 * Rewrite a list body markdown so the first paragraph that mentions each
 * photo-having pin is followed by a <figure> block (linked back to the pin
 * detail page).
 */
export function enhanceBodyWithPinPhotos(
  body: string,
  inlineSlugPhotos: Map<string, InlinePinPhotoEntry>,
): string {
  if (!body) return body;
  // Skip the walk if no slug in the map actually has photos.
  let anyPhotos = false;
  for (const v of inlineSlugPhotos.values()) {
    if (v.photos.length > 0) {
      anyPhotos = true;
      break;
    }
  }
  if (!anyPhotos) return body;

  const blocks = body.split(/\n\n+/);
  const usedSlugs = new Set<string>();
  const out: string[] = [];

  for (const rawBlock of blocks) {
    out.push(rawBlock);

    const trimmed = rawBlock.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('#')) continue; // headings
    if (trimmed.startsWith('|')) continue; // tables
    if (trimmed.startsWith('>')) continue; // blockquotes
    if (trimmed.startsWith('<!--')) continue; // HTML comments
    if (/^[*\-+] /.test(trimmed) || /^\d+\. /.test(trimmed)) continue; // lists

    PIN_LINK_RE.lastIndex = 0;
    const slugsHere: string[] = [];
    const seen = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = PIN_LINK_RE.exec(rawBlock))) {
      const slug = m[1];
      if (seen.has(slug)) continue;
      seen.add(slug);
      if (usedSlugs.has(slug)) continue;
      const entry = inlineSlugPhotos.get(slug);
      if (!entry || entry.photos.length === 0) continue;
      slugsHere.push(slug);
    }
    if (slugsHere.length === 0) continue;

    for (const slug of slugsHere) {
      const entry = inlineSlugPhotos.get(slug)!;
      const photo = entry.photos[0]!;
      usedSlugs.add(slug);
      out.push(renderFigure(slug, entry.pinName, photo));
    }
  }

  return out.join('\n\n');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderFigure(slug: string, pinName: string, photo: InlinePinPhoto): string {
  const src = optimizedSrc(photo.url);
  const alt = photo.caption?.trim() || pinName;
  const captionText = photo.caption?.trim() || pinName;
  const href = `/pins/${slug}`;
  // The intrinsic aspect-ratio attributes prevent layout shift while the
  // image is loading. We use the source dimensions even though the served
  // bytes are downscaled by the optimizer — the rendered aspect ratio is
  // unchanged.
  const dims =
    photo.width && photo.height ? ` width="${photo.width}" height="${photo.height}"` : '';
  return [
    `<figure class="post-prose-figure">`,
    `  <a href="${href}">`,
    `    <img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}"${dims} loading="lazy" decoding="async">`,
    `  </a>`,
    `  <figcaption><a href="${href}">${escapeHtml(captionText)}</a></figcaption>`,
    `</figure>`,
  ].join('\n');
}
