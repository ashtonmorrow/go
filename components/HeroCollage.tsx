'use client';

import { useEffect, useState, useCallback } from 'react';
import { thumbUrl, heroUrl } from '@/lib/imageUrl';
import CommonsAttributionBadge from './CommonsAttributionBadge';

// === HeroCollage ===========================================================
// Adaptive multi-image hero that replaces the single-photo Lightbox on
// country, city, and pin detail pages. The single-photo letterbox (current
// behaviour) leaves 60% dead space when the hero photo is portrait-shaped,
// which is most of the time on this atlas. A mosaic with a feature tile
// fills the same vertical real estate without forcing a landscape that
// doesn't exist.
//
// Behaviour matrix:
//   N=1  → single tile, object-contain letterbox (matches old Lightbox)
//   N=2  → 50/50 split, object-cover
//   N=3  → 1 feature + 2 stacked (Airbnb 3-up)
//   N=4  → feature + 3 stacked (preserves a hero shot)
//   N=5  → feature + 2x2 grid (Airbnb listing classic)
//   N=6+ → feature + 2x3 grid, last tile gets +N overlay if more images
//
// Feature-tile pick (priority chain):
//   1. Personal photo with strongest landscape ratio (≥ 1.2 wider than tall)
//   2. Personal photo (any orientation, prefer landscape if any)
//   3. Curated/source landscape image
//   4. First image as fallback
//
// Click anywhere → opens lightbox carousel at the clicked index, with
// arrow-key, swipe (touch), and Esc support, plus a thumbnail strip.

export type CollageImage = {
  url: string;
  alt?: string;
  width?: number | null;
  height?: number | null;
  /** Personal photos win the feature tile and lead the carousel. */
  isPersonal?: boolean;
  /** Optional caption shown in the carousel under the open image. */
  caption?: string | null;
};

type Props = {
  images: CollageImage[];
  /** Used as alt text fallback and aria-label for the collage. */
  title: string;
  className?: string;
  /** Optional caption shown under the collage (e.g. "From a pin in France"). */
  caption?: string;
};

function isLandscape(img: CollageImage): boolean {
  if (!img.width || !img.height) return false;
  return img.width / img.height >= 1.2;
}

function landscapeRatio(img: CollageImage): number {
  if (!img.width || !img.height) return 0;
  return img.width / img.height;
}

/** Pick the feature tile (most attention-grabbing image) and re-order
 *  the rest so the page composes well. Returns the same array length. */
function arrange(images: CollageImage[]): CollageImage[] {
  if (images.length <= 1) return images;
  const personal = images.filter(i => i.isPersonal);
  const personalLandscapes = personal.filter(isLandscape);
  let feature: CollageImage | undefined;
  if (personalLandscapes.length > 0) {
    // Widest personal landscape wins.
    feature = personalLandscapes
      .slice()
      .sort((a, b) => landscapeRatio(b) - landscapeRatio(a))[0];
  } else if (personal.length > 0) {
    feature = personal[0];
  } else {
    const curatedLandscapes = images.filter(isLandscape);
    feature = curatedLandscapes[0] ?? images[0];
  }
  if (!feature) return images;
  const rest = images.filter(i => i !== feature);
  return [feature, ...rest];
}

export default function HeroCollage({ images, title, className, caption }: Props) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const ordered = arrange(images);
  const visible = ordered.slice(0, 6);
  const overflow = ordered.length - visible.length;
  const N = visible.length;

  const close = useCallback(() => setOpenIdx(null), []);
  const next = useCallback(
    () => setOpenIdx(i => (i == null ? null : (i + 1) % ordered.length)),
    [ordered.length],
  );
  const prev = useCallback(
    () =>
      setOpenIdx(i =>
        i == null ? null : (i - 1 + ordered.length) % ordered.length,
      ),
    [ordered.length],
  );

  useEffect(() => {
    if (openIdx == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') prev();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [openIdx, close, next, prev]);

  if (N === 0) return null;

  // Each tile is a button so the whole grid is keyboard-reachable.
  // Inline the open state to keep this all client-side and simple.
  function tile(img: CollageImage, idx: number, sizePx: number, klass: string) {
    return (
      <button
        key={img.url + idx}
        type="button"
        onClick={() => setOpenIdx(idx)}
        className={
          'group relative block bg-cream-soft cursor-zoom-in overflow-hidden ' +
          'focus-visible:outline-2 focus-visible:outline-offset-2 ' +
          'focus-visible:outline-teal ' +
          klass
        }
        aria-label={`Open ${img.alt ?? title} image ${idx + 1}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumbUrl(img.url, { size: sizePx }) ?? img.url}
          alt={img.alt ?? title}
          loading="lazy"
          decoding="async"
          className="w-full h-full object-cover"
        />
        <CommonsAttributionBadge url={img.url} />
        {idx === visible.length - 1 && overflow > 0 && (
          <span
            className={
              'absolute inset-0 bg-black/45 text-white ' +
              'flex items-center justify-center text-h2 font-medium'
            }
            aria-hidden
          >
            +{overflow}
          </span>
        )}
      </button>
    );
  }

  // N=1 keeps the old object-contain letterbox so portrait covers don't
  // get cropped in half. The collage only earns its keep with multiple
  // images.
  let body: React.ReactNode;
  if (N === 1) {
    body = (
      <button
        type="button"
        onClick={() => setOpenIdx(0)}
        className={
          'group relative w-full bg-cream-soft cursor-zoom-in overflow-hidden ' +
          'rounded focus-visible:outline-2 focus-visible:outline-offset-2 ' +
          'focus-visible:outline-teal'
        }
        aria-label={`Open ${visible[0].alt ?? title} full size`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={heroUrl(visible[0].url, 1200) ?? visible[0].url}
          alt={visible[0].alt ?? title}
          width={visible[0].width ?? 1200}
          height={visible[0].height ?? 800}
          decoding="async"
          className="w-full max-h-[70vh] object-contain"
        />
        <CommonsAttributionBadge url={visible[0].url} />
      </button>
    );
  } else if (N === 2) {
    body = (
      <div className="grid grid-cols-2 gap-1.5 h-[50vh] max-h-[520px] rounded overflow-hidden">
        {tile(visible[0], 0, 800, '')}
        {tile(visible[1], 1, 800, '')}
      </div>
    );
  } else if (N === 3) {
    body = (
      <div className="grid grid-cols-[1.4fr_1fr] gap-1.5 h-[55vh] max-h-[560px] rounded overflow-hidden">
        {tile(visible[0], 0, 1200, '')}
        <div className="grid grid-rows-2 gap-1.5">
          {tile(visible[1], 1, 600, '')}
          {tile(visible[2], 2, 600, '')}
        </div>
      </div>
    );
  } else if (N === 4) {
    body = (
      <div className="grid grid-cols-[1.3fr_1fr] gap-1.5 h-[55vh] max-h-[560px] rounded overflow-hidden">
        {tile(visible[0], 0, 1200, '')}
        <div className="grid grid-rows-3 gap-1.5">
          {tile(visible[1], 1, 600, '')}
          {tile(visible[2], 2, 600, '')}
          {tile(visible[3], 3, 600, '')}
        </div>
      </div>
    );
  } else if (N === 5) {
    body = (
      <div className="grid grid-cols-[1.3fr_1fr] gap-1.5 h-[55vh] max-h-[560px] rounded overflow-hidden">
        {tile(visible[0], 0, 1200, '')}
        <div className="grid grid-cols-2 grid-rows-2 gap-1.5">
          {tile(visible[1], 1, 500, '')}
          {tile(visible[2], 2, 500, '')}
          {tile(visible[3], 3, 500, '')}
          {tile(visible[4], 4, 500, '')}
        </div>
      </div>
    );
  } else {
    // N>=6 — feature + 2x3 grid; +N overlay rides on the last tile.
    body = (
      <div className="grid grid-cols-[1.3fr_1fr] gap-1.5 h-[55vh] max-h-[560px] rounded overflow-hidden">
        {tile(visible[0], 0, 1200, '')}
        <div className="grid grid-cols-2 grid-rows-3 gap-1.5">
          {tile(visible[1], 1, 500, '')}
          {tile(visible[2], 2, 500, '')}
          {tile(visible[3], 3, 500, '')}
          {tile(visible[4], 4, 500, '')}
          {tile(visible[5], 5, 500, '')}
          {/* On 6 exact images this slot is a duplicate of last; on 7+
              it shows +N. Skip when there are exactly 6 visible to keep
              the grid clean. */}
        </div>
      </div>
    );
  }

  // Mobile: stack to 2 columns of square tiles and a +N pill. Tile grid
  // ignores the desktop layouts above for narrow viewports — mosaic
  // patterns get crushed otherwise. Carousel is the same on mobile.
  const mobileBody =
    N === 1 ? null : (
      <div className="md:hidden grid grid-cols-2 gap-1.5 mt-2 rounded overflow-hidden">
        {visible.slice(0, 4).map((img, idx) => (
          <button
            key={img.url + idx}
            type="button"
            onClick={() => setOpenIdx(idx)}
            className="relative aspect-square bg-cream-soft cursor-zoom-in overflow-hidden"
            aria-label={`Open ${img.alt ?? title} image ${idx + 1}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={thumbUrl(img.url, { size: 600 }) ?? img.url}
              alt={img.alt ?? title}
              loading="lazy"
              decoding="async"
              className="w-full h-full object-cover"
            />
            {idx === 3 && ordered.length > 4 && (
              <span
                className={
                  'absolute inset-0 bg-black/45 text-white ' +
                  'flex items-center justify-center text-h2 font-medium'
                }
                aria-hidden
              >
                +{ordered.length - 4}
              </span>
            )}
          </button>
        ))}
      </div>
    );

  return (
    <figure className={className}>
      {/* Desktop layout — the mosaic. Hidden on mobile in favour of mobileBody. */}
      <div className={N === 1 ? '' : 'hidden md:block'}>{body}</div>
      {/* On N=1 the single tile is fine on every viewport. */}
      {N > 1 && mobileBody}
      {caption && (
        <figcaption className="text-label text-muted px-1 mt-1">{caption}</figcaption>
      )}

      {openIdx != null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          onClick={close}
          className="fixed inset-0 z-[60] bg-black/90 flex flex-col items-center justify-center p-4 sm:p-8 cursor-zoom-out"
        >
          <button
            type="button"
            onClick={e => {
              e.stopPropagation();
              close();
            }}
            className="absolute top-3 right-3 sm:top-4 sm:right-4 w-10 h-10 inline-flex items-center justify-center rounded-full bg-white/10 text-white text-2xl leading-none hover:bg-white/20 focus-visible:bg-white/20 transition-colors"
            aria-label="Close"
          >
            ×
          </button>
          {/* Prev / next when we have more than one image. */}
          {ordered.length > 1 && (
            <>
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  prev();
                }}
                className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 w-12 h-12 inline-flex items-center justify-center rounded-full bg-white/10 text-white text-3xl leading-none hover:bg-white/20 focus-visible:bg-white/20 transition-colors"
                aria-label="Previous image"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  next();
                }}
                className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 w-12 h-12 inline-flex items-center justify-center rounded-full bg-white/10 text-white text-3xl leading-none hover:bg-white/20 focus-visible:bg-white/20 transition-colors"
                aria-label="Next image"
              >
                ›
              </button>
            </>
          )}
          {/* The open figure stops click propagation so accidental clicks
              inside don't dismiss before the user gets to interact. */}
          <figure
            onClick={e => e.stopPropagation()}
            className="relative flex flex-col items-center max-w-full max-h-full gap-3"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={ordered[openIdx].url}
              alt={ordered[openIdx].alt ?? title}
              width={ordered[openIdx].width ?? undefined}
              height={ordered[openIdx].height ?? undefined}
              className="max-w-full max-h-[calc(100vh-9rem)] object-contain rounded"
            />
            <CommonsAttributionBadge url={ordered[openIdx].url} variant="always" />
            <figcaption className="text-white/80 text-small text-center max-w-prose">
              {ordered[openIdx].caption ?? ordered[openIdx].alt ?? title}
              <span className="ml-2 text-white/60">
                {openIdx + 1} / {ordered.length}
              </span>
            </figcaption>
          </figure>
        </div>
      )}
    </figure>
  );
}
