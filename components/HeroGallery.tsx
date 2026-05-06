'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from 'react';
import { thumbUrl, heroUrl } from '@/lib/imageUrl';

// === HeroGallery ===========================================================
// Bounded "justified rows" hero — Flickr / Google Photos pattern. Total
// height stays inside a typical hero envelope (~50vh desktop, ~40vh
// mobile); photos pack into 1-3 rows that fill the container width
// exactly, each row at equal height, photos within a row scaled by
// their native aspect ratio. No cropping anywhere — every image is
// rendered at its true aspect.
//
// Why not CSS column masonry: photos at native aspect grow as tall as
// they want, blowing past a typical hero size. Justified rows lets us
// preserve aspect AND cap the total hero height in one move.
//
// Layout pass:
//   1. Pick a target row height: (maxHeight / preferredRowCount). The
//      preferred row count scales with photo count (1 photo → banner;
//      2-3 → 1 row; 4-8 → 2 rows; 9+ → 3 rows + overflow tile).
//   2. Walk photos accumulating aspect ratio. When the row's natural
//      width (sum_of_aspects × target_row_height + gaps) ≥ container
//      width, close the row and rescale each photo to actual_height =
//      (container_width − gaps) / sum_of_aspects.
//   3. The trailing row (if any) renders at the unscaled target height
//      so it doesn't stretch awkwardly to fill the full container.
//
// Container width is measured client-side via ResizeObserver. Server
// render uses a sensible default (1080px) so the SSR layout is in the
// right ballpark; the client recalculates on hydrate. There's a brief
// pre-hydrate moment where rows might over-/under-shoot — for a hero
// that's fine.
//
// Click any photo → fullscreen lightbox carousel (Esc / arrows close
// nav, body scroll locked while open).

export type GalleryImage = {
  url: string;
  alt?: string;
  width?: number | null;
  height?: number | null;
  caption?: string | null;
  isPersonal?: boolean;
};

type Props = {
  images: GalleryImage[];
  /** Used as alt text fallback and aria-label for the gallery. */
  title: string;
  className?: string;
  /** Optional caption shown under the gallery. */
  caption?: string;
  /** Override the default total hero max-height. CSS units; defaults to '55vh'. */
  maxHeight?: string;
};

/** Default container width assumed on the server before hydration. The
 *  client recalculates based on the actual mounted container — this
 *  value just needs to keep SSR layout sane. 1080px = mid-desktop. */
const SSR_CONTAINER_WIDTH = 1080;

/** Photos with no width/height fall back to a sensible aspect ratio so
 *  they pack into rows alongside known-aspect peers. 4:3 is a coin-flip
 *  guess that matches most camera + screenshot output. */
const FALLBACK_ASPECT = 4 / 3;

/** Pick a preferred row count for `n` images so the hero feels right
 *  at typical photo counts. Mike picks 1-20 hero photos:
 *    - 1     → banner
 *    - 2-3   → 1 row
 *    - 4-8   → 2 rows
 *    - 9+    → 3 rows + overflow tile to lightbox
 *  Returning the count caps the visible-photo budget; the remainder
 *  becomes a "+N" tile in the last row. */
function preferredRowCount(n: number): number {
  if (n <= 1) return 1;
  if (n <= 3) return 1;
  if (n <= 8) return 2;
  return 3;
}

type RowSlot = { idx: number; aspect: number };

type Row = {
  slots: RowSlot[];
  /** Pixel height each photo in this row should render at. */
  height: number;
};

function packRows(
  images: GalleryImage[],
  containerWidth: number,
  maxHeightPx: number,
  gap: number,
): { rows: Row[]; visibleCount: number } {
  if (images.length === 0) return { rows: [], visibleCount: 0 };

  const rowCount = preferredRowCount(images.length);
  // Target row height = (max_height − inter-row gaps) / rows. If we end
  // up with one row, fill the full envelope.
  const targetRowHeight = Math.max(
    140,
    Math.floor((maxHeightPx - gap * (rowCount - 1)) / rowCount),
  );

  const aspects = images.map(img => {
    const w = img.width ?? null;
    const h = img.height ?? null;
    if (w && h && h > 0) return w / h;
    return FALLBACK_ASPECT;
  });

  const rows: Row[] = [];
  let cursor = 0;
  while (cursor < images.length && rows.length < rowCount) {
    const slots: RowSlot[] = [];
    let aspectSum = 0;
    while (cursor < images.length) {
      slots.push({ idx: cursor, aspect: aspects[cursor]! });
      aspectSum += aspects[cursor]!;
      cursor++;
      // Closing the row: scaled width fits the container.
      const naturalWidth = aspectSum * targetRowHeight + (slots.length - 1) * gap;
      if (naturalWidth >= containerWidth) break;
    }
    // Compute actual row height so the row exactly fits container width.
    const innerWidth = containerWidth - (slots.length - 1) * gap;
    const cappedHeight = Math.min(
      targetRowHeight,
      innerWidth / aspectSum,
    );
    rows.push({ slots, height: Math.max(120, cappedHeight) });
  }

  // Visible-photo budget = the photos we packed into rows.
  let visibleCount = 0;
  for (const r of rows) visibleCount += r.slots.length;

  return { rows, visibleCount };
}

export default function HeroGallery({
  images,
  title,
  className,
  caption,
  maxHeight = '55vh',
}: Props) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(SSR_CONTAINER_WIDTH);
  const [maxHeightPx, setMaxHeightPx] = useState<number>(560);
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  const N = images.length;

  // Measure container width + max-height in pixels on mount and resize.
  // useLayoutEffect on the client so the first paint after hydration
  // already has the right rows; falls back to useEffect during SSR (no
  // window). Both branches run only on the client.
  const useIso = typeof window !== 'undefined' ? useLayoutEffect : useEffect;
  useIso(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0) setContainerWidth(rect.width);
      // Resolve maxHeight CSS value to px via a temp element on the
      // wrapper so vh / rem / px all work the same way.
      const probe = document.createElement('div');
      probe.style.position = 'absolute';
      probe.style.visibility = 'hidden';
      probe.style.height = maxHeight;
      el.appendChild(probe);
      const px = probe.getBoundingClientRect().height;
      el.removeChild(probe);
      if (px > 0) setMaxHeightPx(px);
    };
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [maxHeight]);

  const GAP = 8; // px

  const { rows, visibleCount } = useMemo(
    () => packRows(images, containerWidth, maxHeightPx, GAP),
    [images, containerWidth, maxHeightPx],
  );
  const overflow = N - visibleCount;

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

  // N=1: bounded banner. object-contain so portraits letterbox to the
  // hero envelope instead of cropping.
  if (N === 1) {
    const hero = images[0]!;
    return (
      <figure className={className} ref={wrapperRef}>
        <button
          type="button"
          onClick={() => setOpenIdx(0)}
          className="block w-full bg-cream-soft cursor-zoom-in overflow-hidden rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal"
          aria-label={`Open ${hero.alt ?? title} full size`}
          style={{ maxHeight }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={heroUrl(hero.url, 1600, 88) ?? hero.url}
            alt={hero.alt ?? title}
            width={hero.width ?? 1600}
            height={hero.height ?? 1067}
            decoding="async"
            className="w-full h-full object-contain"
            style={{ maxHeight }}
          />
        </button>
        {caption && (
          <figcaption className="text-label text-muted px-1 mt-1">{caption}</figcaption>
        )}
        {renderLightbox(images, openIdx, close, next, prev, title, N)}
      </figure>
    );
  }

  return (
    <figure className={className}>
      <div
        ref={wrapperRef}
        className="w-full bg-cream-soft rounded overflow-hidden"
        style={{ maxHeight }}
      >
        {rows.map((row, ri) => {
          const isLastRow = ri === rows.length - 1;
          return (
            <div
              key={ri}
              className="flex w-full"
              style={{
                gap: `${GAP}px`,
                marginTop: ri === 0 ? 0 : GAP,
                height: `${row.height}px`,
              }}
            >
              {row.slots.map((slot, si) => {
                const img = images[slot.idx]!;
                const showOverflow =
                  isLastRow && si === row.slots.length - 1 && overflow > 0;
                return (
                  <button
                    key={img.url + slot.idx}
                    type="button"
                    onClick={() => setOpenIdx(slot.idx)}
                    className="relative block bg-cream cursor-zoom-in overflow-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal"
                    style={{
                      flexGrow: slot.aspect,
                      flexBasis: 0,
                      minWidth: 0,
                    }}
                    aria-label={`Open ${img.alt ?? title} image ${slot.idx + 1}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={
                        thumbUrl(img.url, {
                          // Width estimate for the optimizer: aspect *
                          // row height (rounded up so the ×2 retina lands
                          // on a configured width).
                          size: Math.max(240, Math.ceil(slot.aspect * row.height)),
                          quality: 85,
                        }) ?? img.url
                      }
                      alt={img.alt ?? title}
                      loading={ri === 0 ? 'eager' : 'lazy'}
                      decoding="async"
                      className="w-full h-full object-cover"
                    />
                    {showOverflow && (
                      <span
                        className="absolute inset-0 bg-black/55 text-white flex items-center justify-center text-h2 font-medium"
                        aria-hidden
                      >
                        +{overflow}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
      {caption && (
        <figcaption className="text-label text-muted px-1 mt-1">{caption}</figcaption>
      )}
      {renderLightbox(images, openIdx, close, next, prev, title, N)}
    </figure>
  );
}

// Note on object-cover in the multi-row path:
// The container fits the photo's native aspect *exactly* (height =
// row.height, width = aspect × row.height ≈ flex-basis result), so
// object-cover and object-contain produce the same pixels — no actual
// crop occurs. We use object-cover only because if a 1px rounding error
// snuck in, contain would letterbox while cover hides it.

function renderLightbox(
  images: GalleryImage[],
  openIdx: number | null,
  close: () => void,
  next: () => void,
  prev: () => void,
  title: string,
  N: number,
) {
  if (openIdx == null) return null;
  const img = images[openIdx]!;
  return (
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
          src={img.url}
          alt={img.alt ?? title}
          width={img.width ?? undefined}
          height={img.height ?? undefined}
          className="max-w-full max-h-[calc(100vh-9rem)] object-contain rounded"
        />
        <figcaption className="text-white/80 text-small text-center max-w-prose">
          {img.caption ?? img.alt ?? title}
          <span className="ml-2 text-white/60">
            {openIdx + 1} / {N}
          </span>
        </figcaption>
      </figure>
    </div>
  );
}
