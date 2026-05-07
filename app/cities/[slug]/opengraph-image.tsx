import { ImageResponse } from 'next/og';
import { fetchCityBySlug } from '@/lib/notion';

// Per-city OG card. Two-pane layout when a cover photo exists: city
// name + country on the left, full-bleed cover photo on the right. No
// cover → full-card text layout. 1200x630.
//
// Cover precedence: heroPhotoUrls[0] > personalPhoto. Wikimedia/Commons
// heroImage was dropped from the cover chain (May 2026 policy: own
// photos only). Cities with no curated picks and no personal photo
// render the text-only layout.

export const alt = 'A city in Mike Lee\'s travel atlas';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function CityOgImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const city = await fetchCityBySlug(slug);
  const name = city?.name ?? 'A city in the atlas';
  const country = city?.country ?? '';
  const status = city?.been ? 'Been' : city?.go ? 'Planned' : null;
  const coverUrl = city
    ? city.heroPhotoUrls?.[0] ?? city.personalPhoto ?? null
    : null;

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
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            width: coverUrl ? TEXT_PANE_WIDTH : 1200,
            height: '100%',
            padding: '64px 56px',
            background: '#fdfaf2',
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
            <span>📮 City</span>
            {status === 'Been' && <span style={{ color: '#2f6f73' }}>· Been here</span>}
            {status === 'Planned' && (
              <span style={{ color: '#6b7c8f' }}>· On the planning list</span>
            )}
          </div>

          <div
            style={{
              color: '#1c1b19',
              fontSize: name.length > 18 ? 88 : 112,
              fontWeight: 600,
              lineHeight: 1,
              letterSpacing: '-0.02em',
              marginBottom: 24,
              display: 'flex',
            }}
          >
            {name}
          </div>

          {country && (
            <div
              style={{
                color: '#6b7c8f',
                fontSize: 32,
                lineHeight: 1.3,
                display: 'flex',
              }}
            >
              {country}
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
