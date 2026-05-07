import { ImageResponse } from 'next/og';
import { fetchPinBySlug } from '@/lib/pins';

// Per-pin OG / Twitter card image. Two-pane layout: pin cover photo
// fills the right half (full-bleed), text card sits on the left with
// the same paper / sand / ink-deep palette as the rest of the site.
// 1200x630 to match X / Slack / LinkedIn previews. ImageResponse
// fetches the cover URL on render and the result is cached at the
// edge, so the per-request cost is paid once per cache window.
//
// Cover precedence: curated heroPhotoUrls[0] > images[0].url. When
// neither exists, the layout falls through to a text-only card with
// the paper background covering the full canvas.

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

  // Cover precedence — curated picks lead, then the first image entry,
  // then null. Codex generated images are fine to use here; the OG
  // card is supposed to feel like the public hero, and the public hero
  // already falls back to codex art under the same precedence rule.
  const coverUrl = pin
    ? pin.heroPhotoUrls?.[0] ?? pin.images[0]?.url ?? null
    : null;

  // Two-pane layout when there's a cover; full-card text layout
  // otherwise. The text pane width is 600px (half of 1200) so the cover
  // fills the other half cleanly.
  const TEXT_PANE_WIDTH = 600;

  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          background: '#fdfaf2',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          position: 'relative',
        }}
      >
        {/* Text pane */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            width: coverUrl ? TEXT_PANE_WIDTH : 1200,
            height: '100%',
            padding: '64px 56px',
            background: '#fdfaf2',
            position: 'relative',
            // Subtle inset frame, matches the postcard treatment used
            // sitewide.
            border: '2px solid #eceae6',
            borderRadius: coverUrl ? '8px 0 0 8px' : 8,
            margin: coverUrl ? '24px 0 24px 24px' : 24,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              color: '#7c7e7f',
              fontSize: 22,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              fontWeight: 500,
              marginBottom: 24,
            }}
          >
            <span>📍 Pin</span>
            {visited && <span style={{ color: '#2f6f73' }}>· Visited</span>}
            {isUnesco && <span style={{ color: '#b8862e' }}>· UNESCO</span>}
          </div>

          <div
            style={{
              color: '#1c1b19',
              fontSize: name.length > 32 ? 60 : name.length > 22 ? 72 : 88,
              fontWeight: 600,
              lineHeight: 1.05,
              letterSpacing: '-0.02em',
              marginBottom: 24,
              display: 'flex',
              maxHeight: 320,
              overflow: 'hidden',
            }}
          >
            {name}
          </div>

          {placeText && (
            <div
              style={{
                color: '#6b7c8f',
                fontSize: 28,
                lineHeight: 1.35,
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
              gap: 12,
              color: '#2f6f73',
              fontSize: 22,
              fontWeight: 600,
            }}
          >
            <span>go.mike-lee.me</span>
            <span style={{ color: '#7c7e7f', fontSize: 18, fontWeight: 400 }}>
              · Mike Lee&apos;s travel atlas
            </span>
          </div>
        </div>

        {/* Cover pane — full-bleed photo on the right, only when we
            have one. Padded slightly inside the canvas border so the
            image reads as inset rather than running off the edge. */}
        {coverUrl && (
          <div
            style={{
              flex: 1,
              display: 'flex',
              margin: '24px 24px 24px 0',
              borderRadius: '0 8px 8px 0',
              overflow: 'hidden',
              border: '2px solid #eceae6',
              borderLeft: 'none',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={coverUrl}
              alt=""
              width={576}
              height={582}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
              }}
            />
          </div>
        )}
      </div>
    ),
    { ...size },
  );
}
