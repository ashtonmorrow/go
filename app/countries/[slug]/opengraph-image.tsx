import { ImageResponse } from 'next/og';
import { fetchCountryBySlug } from '@/lib/notion';

// Per-country OG card. Country name dominates; capital + continent
// sits as supporting text. 1200x630.

export const alt = 'A country in Mike Lee\'s travel atlas';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function CountryOgImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const country = await fetchCountryBySlug(slug);
  const name = country?.name ?? 'A country in the atlas';
  const sub = country
    ? [country.continent, country.capital ? `Capital: ${country.capital}` : null]
        .filter(Boolean)
        .join(' · ')
    : '';

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
            color: '#7c7e7f',
            fontSize: 26,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            fontWeight: 500,
            marginBottom: 28,
          }}
        >
          🌍 Country
        </div>

        <div
          style={{
            color: '#1c1b19',
            fontSize: name.length > 14 ? 110 : 140,
            fontWeight: 600,
            lineHeight: 1,
            letterSpacing: '-0.02em',
            marginBottom: 28,
            display: 'flex',
          }}
        >
          {name}
        </div>

        {sub && (
          <div
            style={{
              color: '#6b7c8f',
              fontSize: 36,
              lineHeight: 1.3,
              maxWidth: 960,
              display: 'flex',
            }}
          >
            {sub}
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
