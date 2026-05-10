// === PinPhotoMasonry ========================================================
// Photo gallery used on city / country detail pages. Renders Mike's
// personal pin photos for the place as a CSS-columns masonry. Each card
// represents ONE pin — when a pin has multiple photos in the place's
// pool, the card shows the most-recent shot as the cover and a "+N"
// indicator; opening it walks through the whole group as a carousel.
// That replaces the older one-tile-per-photo behaviour, which let a
// single restaurant with five menu shots flood the grid.
//
// Why CSS columns over CSS grid: with mixed orientations, a true grid
// either crops to a fixed aspect (loses Mike's framing) or leaves
// awkward gaps where row heights don't match. CSS columns flow each
// item top-to-bottom in one column, then start the next; the visual
// is the Pinterest / Are.na pattern that fits varied aspects nicely.
// The trade-off: vertical reading order isn't strictly newest-first
// across the whole page, only per column. For a place's photo gallery
// (browsing, not chronological) that's fine.

import Link from 'next/link';
import { thumbUrl, isVideoUrl } from '@/lib/imageUrl';
import type { PinPhoto } from '@/lib/personalPhotos';
import Lightbox, { type LightboxPhoto } from './Lightbox';

/** Group photos by pinId, preserving the order in which photos arrived
 *  (the fetchers sort by taken_at desc, so the first photo per group
 *  is the most recent — the right cover for the masonry tile). Pins
 *  without a slug fall back to a synthetic key so they don't collide. */
function groupByPin(photos: PinPhoto[]): PinPhoto[][] {
  const order: string[] = [];
  const groups = new Map<string, PinPhoto[]>();
  for (const p of photos) {
    const key = p.pinId || `noid:${p.pinSlug ?? p.pinName}:${p.id}`;
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key)!.push(p);
  }
  return order.map(k => groups.get(k)!);
}

export default function PinPhotoMasonry({
  photos,
  emptyLabel,
}: {
  photos: PinPhoto[];
  /** Render-suppressing fallback label. If photos is empty AND no
   *  emptyLabel is provided, the section renders nothing. */
  emptyLabel?: string;
}) {
  if (photos.length === 0) {
    if (!emptyLabel) return null;
    return (
      <p className="text-small text-muted py-6 text-center">{emptyLabel}</p>
    );
  }

  const groups = groupByPin(photos);

  return (
    <div
      className="
        columns-2 sm:columns-3 lg:columns-4
        gap-3 sm:gap-4
        [column-fill:_balance]
      "
    >
      {groups.map(group => {
        const cover = group[0]!;
        const extra = group.length - 1;
        const aspect =
          cover.width && cover.height
            ? `${cover.width} / ${cover.height}`
            : '4 / 3';
        const isCoverVideo = isVideoUrl(cover.url);
        // Card width is 100% of its column. Picking 240px gives a sharp
        // 240-ish CSS px column on retina (close to what columns-4
        // produces at typical viewports). For videos, prefer the poster;
        // fall back to a hidden-controls <video preload="metadata">
        // tile when no poster exists.
        const thumbSrc =
          isCoverVideo && cover.posterUrl
            ? thumbUrl(cover.posterUrl, { size: 240 }) ?? cover.posterUrl
            : thumbUrl(cover.url, { size: 240 }) ?? cover.url;
        const altText = cover.caption ?? cover.pinName;
        const href = cover.pinSlug ? `/pins/${cover.pinSlug}` : null;
        // The Lightbox carousel walks every photo in this pin's group.
        const carousel: LightboxPhoto[] = group.map(p => ({
          url: p.url,
          alt: p.caption ?? p.pinName,
          width: p.width,
          height: p.height,
          caption: p.caption ?? `From ${p.pinName}`,
          posterUrl: p.posterUrl,
        }));
        // Two affordances per card without nesting <a> inside <button>:
        //   - The Lightbox covers the photo area as a single full-size
        //     button. Tap = open the carousel for this pin.
        //   - The bottom chip row sits absolutely on top of the image,
        //     pointer-events disabled by default so taps pass through
        //     to the lightbox; the pin-name pill re-enables pointer
        //     events so its own Link click navigates to the pin page.
        return (
          <div
            key={cover.pinId || cover.id}
            className="
              group relative mb-3 sm:mb-4 break-inside-avoid
              overflow-hidden rounded-lg
              border border-sand bg-cream-soft
              transition-shadow hover:shadow-paper
            "
            style={{ aspectRatio: aspect }}
          >
            <Lightbox
              photos={carousel}
              startIndex={0}
              alt={altText}
              className="block absolute inset-0 w-full h-full"
            >
              {isCoverVideo && !cover.posterUrl ? (
                // No poster on file; let the browser draw the first
                // frame from the video. preload="metadata" keeps the
                // bytes bounded.
                <video
                  src={cover.url}
                  muted
                  playsInline
                  preload="metadata"
                  className="
                    w-full h-full object-cover
                    transition-transform duration-500
                    group-hover:scale-[1.02]
                  "
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={thumbSrc}
                  alt={altText}
                  loading="lazy"
                  decoding="async"
                  className="
                    w-full h-full object-cover
                    transition-transform duration-500
                    group-hover:scale-[1.02]
                  "
                />
              )}
              {isCoverVideo && (
                <span
                  aria-hidden
                  className="absolute inset-0 flex items-center justify-center pointer-events-none"
                >
                  <span className="w-12 h-12 rounded-full bg-black/55 text-white flex items-center justify-center text-xl">
                    ▶
                  </span>
                </span>
              )}
            </Lightbox>
            {/* +N badge — only when this pin has more than one photo.
                Sits top-right so it does not collide with the bottom
                pin-name pill. pointer-events-none so taps fall through
                to the Lightbox button underneath. */}
            {extra > 0 && (
              <span
                aria-hidden
                className="
                  pointer-events-none
                  absolute top-2 right-2
                  pill bg-black/65 text-white border-white/10 backdrop-blur-sm
                  text-micro font-medium tabular-nums
                "
                title={`${group.length} photos`}
              >
                +{extra}
              </span>
            )}
            {/* Bottom gradient + chip row. The gradient gives the chips
                contrast against any image. pointer-events-none on the
                row so taps pass through to the lightbox; the inner Link
                re-enables them so navigation still works. */}
            <div
              aria-hidden
              className="
                pointer-events-none
                absolute inset-x-0 bottom-0 h-1/3
                bg-gradient-to-t from-black/60 via-black/20 to-transparent
              "
            />
            <div className="absolute bottom-2 left-2 right-2 flex flex-wrap items-end gap-1.5 pointer-events-none">
              {href ? (
                <Link
                  href={href}
                  className="
                    pointer-events-auto
                    pill bg-black/55 text-white border-white/10 backdrop-blur-sm
                    max-w-full truncate font-medium
                    hover:bg-black/75 transition-colors
                  "
                  title={`Open ${cover.pinName}`}
                >
                  {cover.pinName}
                </Link>
              ) : (
                <span
                  className="
                    pill bg-black/55 text-white border-white/10 backdrop-blur-sm
                    max-w-full truncate font-medium
                  "
                >
                  {cover.pinName}
                </span>
              )}
              {cover.pinTag && (
                <span
                  className="
                    pill bg-white/15 text-white border-white/20 backdrop-blur-sm
                    capitalize
                  "
                >
                  {cover.pinTag}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
