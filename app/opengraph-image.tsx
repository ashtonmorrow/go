import { ImageResponse } from 'next/og';

// Sitewide default OG / Twitter card image. Any route that doesn't ship
// its own opengraph-image.tsx falls back to this. Replaces the favicon
// that was being served as the OG image on cockpit indexes — that
// looked broken in social link previews. 1200x630 is the
// twitter:summary_large_image / og:image convention; both Slack and X
// crop to this aspect.
//
// Tokens kept inline (Tailwind classes don't apply inside ImageResponse —
// it runs in an edge-runtime SVG renderer). Hex values mirror the design
// tokens in tailwind.config.ts: paper, sand, ink-deep, teal.

export const runtime = 'edge';
export const alt = "Mike Lee's travel atlas — cities, countries, saved places, photos";
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: '#fdfaf2', // paper
          padding: '80px 100px',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          position: 'relative',
        }}
      >
        {/* Subtle frame mimicking the postcard inset border */}
        <div
          style={{
            position: 'absolute',
            inset: 24,
            border: '2px solid #eceae6', // sand
            borderRadius: 8,
          }}
        />

        {/* Eyebrow */}
        <div
          style={{
            color: '#7c7e7f', // muted
            fontSize: 28,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            fontWeight: 500,
            marginBottom: 32,
          }}
        >
          go.mike-lee.me
        </div>

        {/* Headline */}
        <div
          style={{
            color: '#1c1b19', // ink-deep
            fontSize: 96,
            fontWeight: 600,
            lineHeight: 1.05,
            letterSpacing: '-0.02em',
            marginBottom: 32,
            display: 'flex',
          }}
        >
          A personal travel atlas
        </div>

        {/* Subhead */}
        <div
          style={{
            color: '#2e2e2e', // ink
            fontSize: 36,
            lineHeight: 1.4,
            maxWidth: 880,
            display: 'flex',
          }}
        >
          Cities, countries, saved places, maps, photos, and notes from more than a decade of planning and travel.
        </div>

        {/* Footer */}
        <div
          style={{
            marginTop: 'auto',
            display: 'flex',
            alignItems: 'baseline',
            gap: 16,
            color: '#2f6f73', // teal
            fontSize: 28,
            fontWeight: 600,
          }}
        >
          <span>Mike Lee</span>
          <span style={{ color: '#7c7e7f', fontSize: 24, fontWeight: 400 }}>
            · travel · cartography · open data
          </span>
        </div>
      </div>
    ),
    { ...size },
  );
}
