import { ImageResponse } from 'next/og';
import { fetchPinBySlug } from '@/lib/pins';

// Per-pin OG / Twitter card image. Renders pin name + place text + an
// "atlas pin" eyebrow. 1200x630 to match X / Slack / LinkedIn previews.
// Falls back to the sitewide app/opengraph-image.tsx if fetchPinBySlug
// returns null (deleted slug, etc.) — Next handles that automatically
// when this file throws.
//
// Tokens kept inline because Tailwind classes don't apply inside
// ImageResponse (it's an Edge SVG renderer). Hex values mirror
// tailwind.config.ts: paper, sand, ink-deep, ink, slate, teal, accent.

export const alt = 'A pin in Mike Lee\'s travel atlas';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function PinOgImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const pin = await fetchPinBySlug(slug);
  const name = pin?.name ?? 'A pin in the atlas';
  const placeText = pin
    ? [pin.cityNames[0], pin.statesNames[0]].filter(Boolean).join(', ')
    : '';
  const visited = !!pin?.visited;
  const isUnesco = pin?.unescoId != null;

  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: '#fdfaf2',
          padding: '72px 92px',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 24,
            border: '2px solid #eceae6',
            borderRadius: 8,
          }}
        />

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 18,
            color: '#7c7e7f',
            fontSize: 26,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            fontWeight: 500,
            marginBottom: 28,
          }}
        >
          <span>📍 Pin</span>
          {visited && (
            <span style={{ color: '#2f6f73' }}>· Visited</span>
          )}
          {isUnesco && (
            <span style={{ color: '#b8862e' }}>· UNESCO</span>
          )}
        </div>

        <div
          style={{
            color: '#1c1b19',
            fontSize: name.length > 36 ? 76 : 96,
            fontWeight: 600,
            lineHeight: 1.05,
            letterSpacing: '-0.02em',
            marginBottom: 28,
            display: 'flex',
            // Cap to two lines via overflow; longer names get truncated
            // by the renderer rather than overflowing the card.
            maxHeight: 220,
            overflow: 'hidden',
          }}
        >
          {name}
        </div>

        {placeText && (
          <div
            style={{
              color: '#6b7c8f',
              fontSize: 36,
              lineHeight: 1.3,
              maxWidth: 960,
              display: 'flex',
            }}
          >
            {placeText}
          </div>
        )}

        <div
          style={{
            marginTop: 'auto',
            display: 'flex',
            alignItems: 'baseline',
            gap: 14,
            color: '#2f6f73',
            fontSize: 26,
            fontWeight: 600,
          }}
        >
          <span>go.mike-lee.me</span>
          <span style={{ color: '#7c7e7f', fontSize: 22, fontWeight: 400 }}>
            · Mike Lee&apos;s travel atlas
          </span>
        </div>
      </div>
    ),
    { ...size },
  );
}
