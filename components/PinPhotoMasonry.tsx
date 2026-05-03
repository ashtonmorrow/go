// === PinPhotoMasonry ========================================================
// Photo gallery used on city / country detail pages. Renders Mike's
// personal pin photos for the place as a CSS-columns masonry — each card
// keeps the photo's native aspect ratio, so portraits stay narrow and
// landscapes spread wide. The whole card is the click target; pin name +
// kind chips overlay the bottom of the image so the visual reads first.
//
// Why CSS columns over CSS grid: with mixed orientations, a true grid
// either crops to a fixed aspect (loses Mike's framing) or leaves
// awkward gaps where row heights don't match. CSS columns flow each
// item top-to-bottom in one column, then start the next — the visual
// is the Pinterest / Are.na pattern that fits varied aspects nicely.
// The trade-off: vertical reading order isn't strictly newest-first
// across the whole page, only per column. For a place's photo gallery
// (browsing, not chronological) that's fine.

import Link from 'next/link';
import { thumbUrl } from '@/lib/imageUrl';
import type { PinPhoto } from '@/lib/personalPhotos';

export default function PinPhotoMasonry({
  photos,
  emptyLabel,
}: {
  photos: PinPhoto[];
  /** Render-suppressing fallback label. If photos is empty AND no
   *  emptyLabel is provided, the section renders nothing — the page
   *  pads up tighter when there's nothing to show. */
  emptyLabel?: string;
}) {
  if (photos.length === 0) {
    if (!emptyLabel) return null;
    return (
      <p className="text-small text-muted py-6 text-center">{emptyLabel}</p>
    );
  }

  return (
    <div
      className="
        columns-2 sm:columns-3 lg:columns-4
        gap-3 sm:gap-4
        [column-fill:_balance]
      "
    >
      {photos.map(photo => {
        const aspect =
          photo.width && photo.height
            ? `${photo.width} / ${photo.height}`
            : '4 / 3';
        // Card width is 100% of its column. Picking 480px as the
        // serving width gives a sharp 240-ish CSS px column on retina
        // (close to what columns-4 produces at typical viewports).
        const src = thumbUrl(photo.url, { size: 240 }) ?? photo.url;
        const href = photo.pinSlug ? `/pins/${photo.pinSlug}` : '#';
        return (
          <Link
            key={photo.id}
            href={href}
            className="
              group block mb-3 sm:mb-4 break-inside-avoid
              relative overflow-hidden rounded-lg
              border border-sand bg-cream-soft
              transition-shadow hover:shadow-paper
            "
            style={{ aspectRatio: aspect }}
            title={photo.caption ?? photo.pinName}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={photo.caption ?? photo.pinName}
              loading="lazy"
              decoding="async"
              className="
                absolute inset-0 w-full h-full object-cover
                transition-transform duration-500
                group-hover:scale-[1.02]
              "
            />
            {/* Bottom gradient + chip row. The gradient gives the chips
                contrast against any image. Chips: pin name (primary,
                white text on a translucent dark plate so it reads on
                bright photos) + the pin's kind/tag (smaller, white-
                outline). */}
            <div
              aria-hidden
              className="
                pointer-events-none
                absolute inset-x-0 bottom-0 h-1/3
                bg-gradient-to-t from-black/60 via-black/20 to-transparent
              "
            />
            <div className="absolute bottom-2 left-2 right-2 flex flex-wrap items-end gap-1.5">
              <span
                className="
                  pill bg-black/55 text-white border-white/10 backdrop-blur-sm
                  max-w-full truncate font-medium
                "
              >
                {photo.pinName}
              </span>
              {photo.pinTag && (
                <span
                  className="
                    pill bg-white/15 text-white border-white/20 backdrop-blur-sm
                    capitalize
                  "
                >
                  {photo.pinTag}
                </span>
              )}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
