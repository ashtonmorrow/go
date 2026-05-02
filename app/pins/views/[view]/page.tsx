// === /pins/views/[view] ====================================================
// Curated landing pages over the pin set. Each registered view gets its own
// SEO surface (title, description, OG, Article JSON-LD) plus a short
// editorial intro that runs above the existing pin map / cards / table.
// The view's filter patch primes PinFiltersContext so the cockpit lands
// pre-filtered without losing the user's search input.
//
// Add a view: drop an entry into PIN_VIEWS in lib/pinViews.ts. This route
// auto-discovers the slug, generates static params, and builds metadata.
//
// Why no /pins/[slug] collision: detail pages are served by app/pins/[slug]/
// which catches /pins/<anything>. Sub-namespacing under /pins/views/ keeps
// the detail catch-all clean.

import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { fetchAllPins } from '@/lib/pins';
import { fetchPersonalCovers } from '@/lib/personalPhotos';
import { fetchAllCountries } from '@/lib/notion';
import { getPinView, PIN_VIEW_SLUGS } from '@/lib/pinViews';
import PinViewPrimer from '@/components/PinViewPrimer';
import PinsMap from '@/components/PinsMapLoader';
import PinsGrid from '@/components/PinsGrid';
import PinsTable from '@/components/PinsTable';
import JsonLd from '@/components/JsonLd';
import { SITE_URL, AUTHOR_ID, WEBSITE_ID, breadcrumbJsonLd } from '@/lib/seo';

type Props = { params: Promise<{ view: string }> };

export const revalidate = 604800;
export const dynamicParams = false; // Only known views render; everything else 404s.

export async function generateStaticParams() {
  return PIN_VIEW_SLUGS.map(view => ({ view }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { view: slug } = await params;
  const view = getPinView(slug);
  if (!view) return { title: 'Not found' };

  const url = `${SITE_URL}/pins/views/${view.slug}`;
  return {
    title: view.label,
    description: view.description,
    alternates: { canonical: url },
    openGraph: {
      type: 'article',
      url,
      title: `${view.label} · Mike Lee`,
      description: view.description,
      ...(view.heroImage ? { images: [{ url: `${SITE_URL}${view.heroImage}` }] } : {}),
    },
    twitter: {
      card: view.heroImage ? 'summary_large_image' : 'summary',
      title: `${view.label} · Mike Lee`,
      description: view.description,
      ...(view.heroImage ? { images: [`${SITE_URL}${view.heroImage}`] } : {}),
    },
  };
}

export default async function PinView({ params }: Props) {
  const { view: slug } = await params;
  const view = getPinView(slug);
  if (!view) notFound();

  const surface = view.surface ?? 'map';
  const url = `${SITE_URL}/pins/views/${view.slug}`;

  // Pull the same data the underlying view would on its own. fetchAllPins
  // is unstable_cache'd so this doesn't add a network round-trip beyond
  // what /pins/map or /pins/cards already pay for. Cards needs the
  // personal-cover lookup; map doesn't. Both cards and table want the
  // ISO2 lookup for flag rendering.
  const wantsCovers = surface === 'cards';
  const wantsCountries = surface === 'cards' || surface === 'table';
  const [pinsRaw, countries, personalCovers] = await Promise.all([
    fetchAllPins(),
    wantsCountries ? fetchAllCountries() : Promise.resolve([]),
    wantsCovers ? fetchPersonalCovers() : Promise.resolve(new Map<string, string>()),
  ]);

  const pins = wantsCovers
    ? pinsRaw.map(p => ({ ...p, personalCoverUrl: personalCovers.get(p.id) ?? null }))
    : pinsRaw;

  const countryNameToIso2: Record<string, string> = {};
  if (wantsCountries) {
    for (const c of countries) {
      if (c.iso2) countryNameToIso2[c.name.toLowerCase()] = c.iso2;
    }
  }

  // Schema.org Article so each curated view becomes a first-class entity
  // (rather than a generic WebPage). Each view is editorial — short prose
  // with opinionated framing — which matches Article semantics better.
  const articleData = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    '@id': url,
    url,
    headline: view.label,
    description: view.description,
    author: { '@id': AUTHOR_ID },
    publisher: { '@id': AUTHOR_ID },
    isPartOf: { '@id': WEBSITE_ID },
    inLanguage: 'en-US',
    ...(view.heroImage ? { image: `${SITE_URL}${view.heroImage}` } : {}),
  };

  const breadcrumb = breadcrumbJsonLd([
    { name: 'Home', item: SITE_URL },
    { name: 'Pins', item: `${SITE_URL}/pins/cards` },
    { name: 'Views', item: `${SITE_URL}/pins/views` },
    { name: view.label },
  ]);

  return (
    <>
      <JsonLd data={articleData} />
      <JsonLd data={breadcrumb} />

      {/* Filter primer — runs once on mount, applies the view's patch
          to the global PinFiltersContext so the cockpit + view land
          pre-filtered. Renders nothing visible. */}
      <PinViewPrimer view={view} />

      {/* Editorial intro. The map / cards / table view sits below. */}
      <article className="max-w-page mx-auto px-5 pt-8 pb-4">
        <nav className="text-small text-muted mb-3" aria-label="Breadcrumb">
          <Link href="/pins/cards" className="hover:text-teal">Pins</Link>
          <span className="mx-1.5" aria-hidden>›</span>
          <Link href="/pins/views" className="hover:text-teal">Views</Link>
          <span className="mx-1.5" aria-hidden>›</span>
          <span className="text-ink-deep">{view.label}</span>
        </nav>

        <header className="mb-5">
          <h1 className="text-h1 text-ink-deep leading-tight">{view.label}</h1>
        </header>

        {/* Editorial body only renders when a view actually carries prose
            (file-based content takes priority later). The default
            curated-view treatment is title + map; copy that explains the
            obvious got cut. */}
        {view.body.length > 0 && (
          <div className="post-prose max-w-prose">
            {view.body.map((para, i) => <p key={i}>{para}</p>)}
          </div>
        )}
      </article>

      {/* The actual filtered surface. Reuses the existing component (and
          its filter cockpit), so the user can refine further from the
          curated start state. */}
      {surface === 'map' && <PinsMap pins={pins} />}
      {surface === 'cards' && (
        <div className="max-w-page mx-auto px-5 py-6">
          <PinsGrid pins={pins} countryNameToIso2={countryNameToIso2} />
        </div>
      )}
      {surface === 'table' && (
        <div className="max-w-page mx-auto px-5 py-6">
          <PinsTable pins={pins} countryNameToIso2={countryNameToIso2} />
        </div>
      )}
    </>
  );
}
