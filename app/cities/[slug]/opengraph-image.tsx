import { ImageResponse } from 'next/og';
import { fetchCityBySlug } from '@/lib/notion';

// Per-city OG card. Renders the city name + country + a Been / Go badge
// when one applies. 1200x630, paper / sand / ink-deep / teal palette
// inline so it matches the rest of the site without depending on
// Tailwind (ImageResponse runs an Edge SVG renderer).

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
          <span>📮 City</span>
          {status === 'Been' && (
            <span style={{ color: '#2f6f73' }}>· Been here</span>
          )}
          {status === 'Planned' && (
            <span style={{ color: '#6b7c8f' }}>· On the planning list</span>
          )}
        </div>

        <div
          style={{
            color: '#1c1b19',
            fontSize: name.length > 18 ? 110 : 140,
            fontWeight: 600,
            lineHeight: 1,
            letterSpacing: '-0.02em',
            marginBottom: 28,
            display: 'flex',
          }}
        >
          {name}
        </div>

        {country && (
          <div
            style={{
              color: '#6b7c8f',
              fontSize: 40,
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
