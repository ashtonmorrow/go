// === Country flag URL helpers ==============================================
// One place to resolve a flag image for any country, by ISO 3166-1 alpha-2.
// Two purpose-built sources, both open-source and free:
//
//   • flag-icons (lipis)        — rectangular SVGs, 4:3 aspect.
//                                  served via flagcdn.com.
//                                  https://github.com/lipis/flag-icons (MIT)
//                                  Used for: postcard stamps, country card
//                                  fronts, anywhere a rectangular flag fits.
//
//   • circle-flags (HatScripts) — flags purpose-designed as 1:1 CIRCLES.
//                                  National symbols are framed correctly
//                                  inside the circle (centred coats of arms,
//                                  proportional stripes), unlike a naive
//                                  cover-crop of a rectangular flag.
//                                  https://github.com/HatScripts/circle-flags (MIT)
//                                  Used for: dropdown indicators, map markers,
//                                  any 1:1 round badge.
//
// Both libraries are MIT-licensed and free for personal AND commercial use.
// National flag designs themselves are public-domain national symbols.

/**
 * Rectangular flag SVG (4:3 aspect). Crisp at any size.
 * Pass an ISO2 code; we lower-case it to match the canonical filename.
 * Returns null when no ISO2 is supplied, so callers can fall through to
 * a Notion-curated override or a sand placeholder.
 */
export function flagRect(iso2: string | null | undefined): string | null {
  if (!iso2) return null;
  return `https://flagcdn.com/${iso2.toLowerCase()}.svg`;
}

/**
 * Circular flag SVG (1:1). Designed to be displayed as a round badge —
 * national symbols sit inside the circle correctly. Use this anywhere
 * a flag appears as a small round indicator (e.g. dropdown rows, map
 * markers, hover dots). Crops naive cover-fits cause visual problems
 * with striped flags or off-centre coats of arms.
 */
export function flagCircle(iso2: string | null | undefined): string | null {
  if (!iso2) return null;
  return `https://hatscripts.github.io/circle-flags/flags/${iso2.toLowerCase()}.svg`;
}
