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
//   - We track the set of URLs that have failed in a Set in state, and
//     pick the first non-failed URL from the [cityFlag, countryFlag]
//     priority order on each render. This handles the case where the
//     parent re-renders with a different `cityFlag` prop: the new URL
//     isn't in the failed Set, so we try it. (An earlier draft used a
//     "tier" index in state, which got stuck pointing at countryFlag
//     when the parent passed a fresh cityFlag — the bug we explicitly
//     don't want to recreate.)

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
  const [failedUrls, setFailedUrls] = useState<Set<string>>(() => new Set());
  // Pick the first non-failed URL from the priority order. Each render
  // re-evaluates from scratch, so prop changes naturally surface.
  const candidates = [cityFlag, countryFlag].filter(
    (u): u is string => !!u && !failedUrls.has(u),
  );
  const src = candidates[0] ?? null;
  if (!src) return null;

  const optimized = thumbUrl(src, { size }) ?? src;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      // The key forces React to drop and rebuild the <img> element when
      // the candidate URL changes (city flag fails → switch to country).
      // Without it, the browser may treat the swap as a src update on
      // the same element and replay the error event from a stale state.
      key={src}
      src={optimized}
      alt={alt}
      className={className}
      width={width}
      height={height}
      style={style}
      loading="lazy"
      decoding="async"
      onError={() => {
        setFailedUrls(prev => {
          if (prev.has(src)) return prev;
          const next = new Set(prev);
          next.add(src);
          return next;
        });
      }}
    />
  );
}
