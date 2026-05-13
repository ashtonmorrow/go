'use client';

// === Flag ===================================================================
// Render a city or country flag with an automatic fallback chain when the
// primary URL fails to load. The chain:
//
//   1. cityFlag (curated or Wikidata-resolved city flag)
//   2. countryFlag (the country's flag — used both as the "no city flag"
//      default and as the runtime fallback when cityFlag returns a 404)
//   3. hide entirely (no broken-image icon)
//
// Why a dedicated component:
//   - The naive `<img src={cityFlag || countryFlag}>` pattern only handles
//     the case where cityFlag is null. It does NOT handle a cityFlag URL
//     that's set but 404s (the double-encoded Wikimedia URLs the May 2026
//     audit surfaced, stale signed S3 URLs, etc).
//   - onError fires once the browser fails to load the image, which lets
//     us swap to the country flag without a server round-trip.

import { useState } from 'react';
import { thumbUrl } from '@/lib/imageUrl';

type Props = {
  cityFlag: string | null | undefined;
  countryFlag: string | null | undefined;
  alt?: string;
  /** Pixel size of the rendered img element. Pipes through thumbUrl so
   *  Wikimedia source isn't fetched at full resolution. */
  size?: number;
  className?: string;
  width?: number;
  height?: number;
  /** Wrapper style override (e.g. for the postcard stamp face). */
  style?: React.CSSProperties;
};

export default function Flag({
  cityFlag,
  countryFlag,
  alt = '',
  size = 80,
  className,
  width,
  height,
  style,
}: Props) {
  // Tier marker: 0 = trying cityFlag, 1 = trying countryFlag, 2 = both
  // failed, render nothing. The hook re-renders on each escalation.
  const initialTier = cityFlag ? 0 : countryFlag ? 1 : 2;
  const [tier, setTier] = useState<0 | 1 | 2>(initialTier);

  const src = tier === 0 ? cityFlag : tier === 1 ? countryFlag : null;
  if (!src) {
    // Nothing to render. Page CSS handles the empty slot.
    return null;
  }

  const optimized = thumbUrl(src, { size }) ?? src;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={optimized}
      alt={alt}
      className={className}
      width={width}
      height={height}
      style={style}
      loading="lazy"
      decoding="async"
      onError={() => {
        // Escalate one tier on failure. If the city flag broke, try the
        // country flag. If both broke, set tier=2 so the next render
        // returns null and the slot stays empty (no broken-image icon).
        if (tier === 0 && countryFlag) setTier(1);
        else setTier(2);
      }}
    />
  );
}
