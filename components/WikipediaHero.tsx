'use client';

// === WikipediaHero ==========================================================
// Last-resort hero image for cities (and any other surface that needs to
// fall back to a Commons image when no personal photos exist). Renders a
// figure with CC BY-SA attribution baked in. If the Commons URL fails to
// load (some hero_image rows still have stale or malformed URLs), the
// component hides itself rather than leaving a broken-image icon.
//
// CC BY-SA 4.0 compliance: the badge in the bottom-right corner links to
// the Commons file page, which displays the author + license. That's the
// "URI/hyperlink" attribution mode the license explicitly allows.

import { useState } from 'react';
import { thumbUrl } from '@/lib/imageUrl';
import CommonsAttributionBadge, { type CommonsAttributionMeta } from './CommonsAttributionBadge';

type Props = {
  /** Commons URL (Special:FilePath/... or upload.wikimedia.org/...). */
  src: string;
  /** Pre-fetched attribution metadata. Optional — when omitted the badge
   *  falls back to a bare "via Wikimedia Commons" link. */
  attribution?: CommonsAttributionMeta | null;
  /** Alt text for screen readers. Typically the place name. */
  alt: string;
  /** Pixel width to request from the image optimizer. The hero column on
   *  city detail pages is at most ~1100px wide, so 1200 covers retina at
   *  reasonable column widths. */
  width?: number;
  className?: string;
};

export default function WikipediaHero({
  src,
  attribution,
  alt,
  width = 1200,
  className,
}: Props) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  // size in thumbUrl is treated as CSS pixels then 2x'd, so passing 600
  // gives a 1200px served image. Keep this aligned with the column width.
  const optimized = thumbUrl(src, { size: width / 2 }) ?? src;
  return (
    <figure
      className={
        'relative overflow-hidden rounded-lg border border-sand bg-white/40 group ' +
        (className ?? '')
      }
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={optimized}
        alt={alt}
        className="w-full h-auto block"
        loading="eager"
        decoding="async"
        onError={() => setFailed(true)}
      />
      <CommonsAttributionBadge
        url={src}
        attribution={attribution ?? null}
        position="bottom-right"
        variant="subtle"
      />
    </figure>
  );
}
