'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { isVideoUrl } from '@/lib/imageUrl';

// === Lightbox ==============================================================
// Click-to-zoom wrapper for any image surface. Render whatever thumbnail
// the page wants as `children`, pass the full-resolution `src` separately,
// and clicking the wrapper opens a fixed overlay showing the full image.
//
// Two modes:
//   - Single-photo (default): pass `src`, `alt`, `width`, `height`,
//     optionally `caption` and `posterUrl`. The modal shows that one
//     image (or video) at full size.
//   - Carousel: pass `photos` (an array). The modal opens at
//     `startIndex` (default 0), shows prev/next arrows, and reacts to
//     arrow keys. Useful when the click target represents a group of
//     photos for the same place. Use this from PinPhotoMasonry where
//     one card stands in for all the photos of a single pin.
//
// Behaviour:
//   - Esc or backdrop click closes the modal
//   - ←/→ navigate when `photos.length > 1`
//   - Body scroll is locked while open
//   - object-contain on the modal image so portraits show fully
//
// The wrapper is a <button> for keyboard reachability. It carries no
// background of its own; the children control the visual presentation.

export type LightboxPhoto = {
  url: string;
  alt?: string | null;
  width?: number | null;
  height?: number | null;
  caption?: string | null;
  posterUrl?: string | null;
};

type Props = {
  /** Full-resolution image URL shown when the modal is open. Required
   *  unless `photos` is provided. */
  src?: string;
  /** Alt for the single-photo mode. Required unless `photos` is set. */
  alt?: string;
  /** Native pixel dimensions (when known). Used to size the modal image
   *  so the browser reserves layout space and centres correctly. */
  width?: number | null;
  height?: number | null;
  /** The thumbnail / hero rendering. Anything; the wrapper just adds
   *  the click-to-open behaviour. */
  children: ReactNode;
  /** Forwarded to the wrapping button. Use to size the click target
   *  (e.g. `block w-full`) or override default cursor. */
  className?: string;
  /** Optional caption rendered under the image in the open state.
   *  Falls back to `alt` when not provided. */
  caption?: string;
  /** Optional poster JPG URL when `src` points at a video. */
  posterUrl?: string | null;
  /** Carousel mode: pass an array of photos. When set, src/alt/width/
   *  height/posterUrl on the single-photo path are ignored in the
   *  modal; it walks the array instead. */
  photos?: LightboxPhoto[];
  /** Where the carousel opens. Defaults to 0. Ignored unless `photos`
   *  is set. */
  startIndex?: number;
};

export default function Lightbox({
  src,
  alt,
  width,
  height,
  children,
  className,
  caption,
  posterUrl,
  photos,
  startIndex = 0,
}: Props) {
  const [open, setOpen] = useState(false);
  // In carousel mode, track which photo is on screen. When the modal
  // closes we leave the index where it was; opening it again starts
  // back at startIndex via a separate effect below.
  const [index, setIndex] = useState(startIndex);
  const isCarousel = !!(photos && photos.length > 0);
  const N = isCarousel ? photos!.length : 1;

  // Active photo for the modal. In carousel mode it comes from
  // `photos[index]`; in single-photo mode we synthesize one from the
  // legacy props so the render path below has a single shape to read.
  const active: LightboxPhoto = isCarousel
    ? photos![Math.max(0, Math.min(index, photos!.length - 1))]!
    : {
        url: src ?? '',
        alt: alt ?? '',
        width: width ?? null,
        height: height ?? null,
        caption: caption ?? null,
        posterUrl: posterUrl ?? null,
      };
  const activeIsVideo = isVideoUrl(active.url);

  // Reset to startIndex whenever the modal opens. Without this, opening
  // the same group a second time would resume where the user last left
  // off, which is rarely what the click on the tile means.
  useEffect(() => {
    if (open) setIndex(startIndex);
  }, [open, startIndex]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
      else if (isCarousel && N > 1 && e.key === 'ArrowRight') {
        setIndex(i => (i + 1) % N);
      } else if (isCarousel && N > 1 && e.key === 'ArrowLeft') {
        setIndex(i => (i - 1 + N) % N);
      }
    };
    document.addEventListener('keydown', onKey);
    // Lock body scroll while the modal is up.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, isCarousel, N]);

  const ariaLabel = active.alt ?? alt ?? '';

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          'group relative cursor-zoom-in focus-visible:outline-2 ' +
          'focus-visible:outline-offset-2 focus-visible:outline-teal ' +
          (className ?? 'block w-full')
        }
        aria-label={`Open ${ariaLabel} full size`}
      >
        {children}
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabel}
          onClick={() => setOpen(false)}
          className={
            'fixed inset-0 z-[60] bg-black/90 ' +
            'flex items-center justify-center p-4 sm:p-8 ' +
            'cursor-zoom-out'
          }
        >
          <button
            type="button"
            onClick={e => {
              e.stopPropagation();
              setOpen(false);
            }}
            className={
              'absolute top-3 right-3 sm:top-4 sm:right-4 ' +
              'w-10 h-10 inline-flex items-center justify-center ' +
              'rounded-full bg-white/10 text-white text-2xl leading-none ' +
              'hover:bg-white/20 focus-visible:bg-white/20 ' +
              'transition-colors'
            }
            aria-label="Close"
          >
            ×
          </button>

          {isCarousel && N > 1 && (
            <>
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  setIndex(i => (i - 1 + N) % N);
                }}
                className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 w-12 h-12 inline-flex items-center justify-center rounded-full bg-white/10 text-white text-3xl leading-none hover:bg-white/20 focus-visible:bg-white/20 transition-colors"
                aria-label="Previous photo"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  setIndex(i => (i + 1) % N);
                }}
                className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 w-12 h-12 inline-flex items-center justify-center rounded-full bg-white/10 text-white text-3xl leading-none hover:bg-white/20 focus-visible:bg-white/20 transition-colors"
                aria-label="Next photo"
              >
                ›
              </button>
            </>
          )}

          {/* Stop click propagation on the image so accidental clicks
              don't dismiss before the user gets to drag/zoom on touch. */}
          <figure
            onClick={e => e.stopPropagation()}
            className="flex flex-col items-center max-w-full max-h-full gap-3"
          >
            {activeIsVideo ? (
              <video
                key={active.url}
                src={active.url}
                poster={active.posterUrl ?? undefined}
                controls
                autoPlay
                playsInline
                preload="metadata"
                className="max-w-full max-h-[calc(100vh-6rem)] rounded"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={active.url}
                alt={active.alt ?? ''}
                width={active.width ?? undefined}
                height={active.height ?? undefined}
                className="max-w-full max-h-[calc(100vh-6rem)] object-contain rounded"
              />
            )}
            {(active.caption || active.alt) && (
              <figcaption className="text-white/80 text-small text-center max-w-prose">
                {active.caption ?? active.alt}
                {isCarousel && N > 1 && (
                  <span className="ml-2 text-white/60">
                    {index + 1} / {N}
                  </span>
                )}
              </figcaption>
            )}
          </figure>
        </div>
      )}
    </>
  );
}
