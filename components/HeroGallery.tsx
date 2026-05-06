'use client';

import { useEffect, useState, useCallback } from 'react';
import { thumbUrl, heroUrl } from '@/lib/imageUrl';

// === HeroGallery ===========================================================
// Native-aspect, no-crop photo gallery used when an entity (pin / city /
// country) has a curated `hero_photo_urls` list. Replaces HeroCollage's
// uniform-tile mosaic, which cover-cropped portrait shots in half.
//
// Layout:
//   - First image renders as a full-width banner: object-contain on a
//     max-h-[70vh] canvas — portraits letterbox, landscapes fill, never
//     cropped.
//   - Remaining images render as a CSS column-count masonry beneath the
//     hero. Every image is `width: 100%; height: auto`, so each photo
//     occupies its native aspect ratio. No crop. No square forcing.
//   - Mobile: 2-column masonry. Desktop: 3-column.
//
// Click any image → opens the same fullscreen lightbox carousel as
// HeroCollage (Esc / arrows / swipe / thumbnail strip).
//
// Why not justified rows (Flickr-style)? They look great but require
// runtime container-width measurement; we want this to render correctly
// on the server with no layout shift. Masonry via CSS columns gets us
// "every photo at its native aspect" without JavaScript layout.

export type GalleryImage = {
  url: string;
  alt?: string;
  width?: number | null;
  height?: number | null;
  /** Used in lightbox caption when present. */
  caption?: string | null;
  /** Optional flag — surfaced in alt-text contexts but not visually
   *  required since the entire gallery is curated. */
  isPersonal?: boolean;
};

type Props = {
  images: GalleryImage[];
  /** Used as alt text fallback and aria-label for the gallery. */
  title: string;
  className?: string;
  /** Optional caption shown under the gallery. */
  caption?: string;
};

export default function HeroGallery({ images, title, className, caption }: Props) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const N = images.length;

  const close = useCallback(() => setOpenIdx(null), []);
  const next = useCallback(
    () => setOpenIdx(i => (i == null ? null : (i + 1) % N)),
    [N],
  );
  const prev = useCallback(
    () => setOpenIdx(i => (i == null ? null : (i - 1 + N) % N)),
    [N],
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

  const hero = images[0];
  const rest = images.slice(1);

  return (
    <figure className={className}>
      {/* Banner hero — native aspect, no crop. Portraits letterbox to
          70vh, landscapes fill the available width. */}
      <button
        type="button"
        onClick={() => setOpenIdx(0)}
        className="block w-full bg-cream-soft cursor-zoom-in overflow-hidden rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal"
        aria-label={`Open ${hero.alt ?? title} full size`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={heroUrl(hero.url, 1600, 88) ?? hero.url}
          alt={hero.alt ?? title}
          width={hero.width ?? 1600}
          height={hero.height ?? 1067}
          decoding="async"
          className="w-full max-h-[70vh] object-contain"
        />
      </button>

      {/* Masonry of remaining images — CSS columns keep each photo at
          its native aspect ratio (width:100%; height:auto). */}
      {rest.length > 0 && (
        <div
          className="mt-3 sm:mt-4 columns-2 md:columns-3 gap-2 sm:gap-3 [column-fill:_balance]"
          aria-label={`${title} gallery, ${rest.length} more image${rest.length === 1 ? '' : 's'}`}
        >
          {rest.map((img, i) => {
            const idx = i + 1; // index into the full images[] array for the lightbox
            return (
              <button
                key={img.url + idx}
                type="button"
                onClick={() => setOpenIdx(idx)}
                className="relative block w-full mb-2 sm:mb-3 break-inside-avoid bg-cream-soft cursor-zoom-in overflow-hidden rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal"
                aria-label={`Open ${img.alt ?? title} image ${idx + 1}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={thumbUrl(img.url, { size: 800, quality: 85 }) ?? img.url}
                  alt={img.alt ?? title}
                  width={img.width ?? undefined}
                  height={img.height ?? undefined}
                  loading="lazy"
                  decoding="async"
                  className="w-full h-auto block"
                />
              </button>
            );
          })}
        </div>
      )}

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
          {N > 1 && (
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
          <figure
            onClick={e => e.stopPropagation()}
            className="flex flex-col items-center max-w-full max-h-full gap-3"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={images[openIdx].url}
              alt={images[openIdx].alt ?? title}
              width={images[openIdx].width ?? undefined}
              height={images[openIdx].height ?? undefined}
              className="max-w-full max-h-[calc(100vh-9rem)] object-contain rounded"
            />
            <figcaption className="text-white/80 text-small text-center max-w-prose">
              {images[openIdx].caption ?? images[openIdx].alt ?? title}
              <span className="ml-2 text-white/60">
                {openIdx + 1} / {N}
              </span>
            </figcaption>
          </figure>
        </div>
      )}
    </figure>
  );
}
