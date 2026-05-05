'use client';

import { useEffect, useState, type ReactNode } from 'react';

// === Lightbox ==============================================================
// Click-to-zoom wrapper for any image surface. Render whatever thumbnail
// the page wants as `children`, pass the full-resolution `src` separately,
// and clicking the wrapper opens a fixed overlay showing the full image.
//
// Behaviour:
//   - Esc or backdrop click closes the modal
//   - Body scroll is locked while open
//   - object-contain on the modal image so portraits show fully
//   - Width/height props let the browser reserve aspect-correct space
//     (no layout flash as the high-res image loads)
//
// The wrapper is a <button> for keyboard reachability. It carries no
// background of its own — the children control all the visual presentation.

type Props = {
  /** Full-resolution image URL shown when the modal is open. The thumbnail
   *  rendering is up to `children`; this src is what the lightbox
   *  presents at full size. */
  src: string;
  alt: string;
  /** Native pixel dimensions (when known). Used to size the modal image
   *  so the browser reserves layout space and centres correctly for both
   *  portrait and landscape. */
  width?: number | null;
  height?: number | null;
  /** The thumbnail / hero rendering. Anything — img, figure, div with a
   *  background. The wrapper just adds the click-to-open behaviour. */
  children: ReactNode;
  /** Forwarded to the wrapping button. Use to size the click target
   *  (e.g. `block w-full`) or override default cursor. */
  className?: string;
  /** Optional caption rendered under the image in the open state.
   *  Falls back to `alt` when not provided. */
  caption?: string;
};

export default function Lightbox({
  src,
  alt,
  width,
  height,
  children,
  className,
  caption,
}: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    // Lock body scroll while the modal is up so the page underneath
    // doesn't drift on touch.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

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
        aria-label={`Open ${alt} full size`}
      >
        {children}
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={alt}
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
          {/* Stop click propagation on the image so accidental clicks
              don't dismiss before the user gets to drag/zoom on touch. */}
          <figure
            onClick={e => e.stopPropagation()}
            className="flex flex-col items-center max-w-full max-h-full gap-3"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={alt}
              width={width ?? undefined}
              height={height ?? undefined}
              className="max-w-full max-h-[calc(100vh-6rem)] object-contain rounded"
            />
            {(caption || alt) && (
              <figcaption className="text-white/80 text-small text-center max-w-prose">
                {caption ?? alt}
              </figcaption>
            )}
          </figure>
        </div>
      )}
    </>
  );
}
