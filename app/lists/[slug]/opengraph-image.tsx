import { ImageResponse } from 'next/og';
import { fetchAllSavedListsMeta } from '@/lib/savedLists';
import { readListContent } from '@/lib/content';

// Per-list OG card. Reads the list's frontmatter title (when there's a
// /content/lists/<slug>.md) plus the curated description, otherwise
// falls back to the title-cased saved-list name. 1200x630.

export const alt = 'A curated travel list in Mike Lee\'s atlas';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function ListOgImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [content, listsMeta] = await Promise.all([
    readListContent(slug),
    fetchAllSavedListsMeta(),
  ]);

  // Resolve the list name the same way the page does: prefer
  // frontmatter title, otherwise the saved-list metadata name (title
  // cased), otherwise the slug as a last resort.
  const fallbackName = (() => {
    for (const name of listsMeta.keys()) {
      if (name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') === slug) {
        return name.replace(/\b\w/g, c => c.toUpperCase());
      }
    }
    return slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  })();
  const title = content?.title ?? fallbackName;
  const description = content?.description ?? null;

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
          🗂️ Curated list
        </div>

        <div
          style={{
            color: '#1c1b19',
            fontSize: title.length > 32 ? 76 : 96,
            fontWeight: 600,
            lineHeight: 1.05,
            letterSpacing: '-0.02em',
            marginBottom: 28,
            display: 'flex',
            maxHeight: 230,
            overflow: 'hidden',
          }}
        >
          {title}
        </div>

        {description && (
          <div
            style={{
              color: '#6b7c8f',
              fontSize: 32,
              lineHeight: 1.35,
              maxWidth: 960,
              display: 'flex',
              maxHeight: 130,
              overflow: 'hidden',
            }}
          >
            {description}
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
