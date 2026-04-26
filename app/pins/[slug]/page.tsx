// === /pins/[slug] ==========================================================
// Detail page for a single pin. Hero (when an image exists) + name +
// description + practical block (location, hours, website, links out to
// Google Maps and UNESCO).
//
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { fetchPinBySlug } from '@/lib/pins';
import { fetchAllCountries } from '@/lib/notion';
import JsonLd from '@/components/JsonLd';
import { SITE_URL, clip, breadcrumbJsonLd, pinJsonLd } from '@/lib/seo';

export const revalidate = 3600;
export const dynamicParams = true;

export async function generateStaticParams() {
  // Lazy-render — first hit fills the cache, subsequent hits are instant.
  return [];
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const pin = await fetchPinBySlug(slug);
  if (!pin) return { title: 'Not found' };

  const description =
    clip(pin.description, 155) ??
    `${pin.name}${pin.cityNames[0] ? `, ${pin.cityNames[0]}` : ''}. Travel pin from a personal atlas.`;

  const url = `${SITE_URL}/pins/${pin.slug ?? pin.id}`;
  const image = pin.images[0]?.url ?? undefined;

  return {
    title: pin.name,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'article',
      url,
      title: `${pin.name} · Mike Lee`,
      description,
      ...(image ? { images: [{ url: image }] } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: `${pin.name} · Mike Lee`,
      description,
      ...(image ? { images: [image] } : {}),
    },
  };
}

export default async function PinPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const pin = await fetchPinBySlug(slug);
  if (!pin) notFound();

  // Resolve the country slug so the JSON-LD `containedInPlace` link points
  // back at this site's own country page rather than just naming a string.
  // Lookup is cheap thanks to the React.cache() wrapper around fetchAllCountries.
  const country = pin.statesNames[0] ?? null;
  const countries = country ? await fetchAllCountries() : [];
  const countrySlug =
    country
      ? countries.find(c => c.name.toLowerCase() === country.toLowerCase())?.slug ?? null
      : null;

  const placeText = [...pin.cityNames, ...pin.statesNames].filter(Boolean).join(', ');
  const breadcrumbs = [
    { name: 'Pins', item: `${SITE_URL}/pins` },
    ...(country && countrySlug
      ? [{ name: country, item: `${SITE_URL}/countries/${countrySlug}` }]
      : []),
    { name: pin.name },
  ];

  // TouristAttraction structured data — the canonical schema for a
  // place-of-interest detail page. Carries geo, address, sameAs links
  // (UNESCO + official site), isAccessibleForFree when known.
  const isFree =
    pin.priceAmount === 0
      ? true
      : pin.priceAmount != null
      ? false
      : null;

  return (
    <article className="max-w-page mx-auto px-5 py-8">
      <JsonLd
        data={pinJsonLd({
          slug: pin.slug ?? pin.id,
          name: pin.name,
          description: pin.description,
          image: pin.images[0]?.url ?? null,
          lat: pin.lat,
          lng: pin.lng,
          city: pin.cityNames[0] ?? null,
          country,
          countrySlug,
          category: pin.category,
          unescoId: pin.unescoId,
          unescoUrl: pin.unescoUrl,
          website: pin.website,
          isFree,
        })}
      />
      <JsonLd data={breadcrumbJsonLd(breadcrumbs)} />

      <div className="text-small text-muted mb-2">
        <Link href="/pins" className="hover:text-teal">Pins</Link>
      </div>

      <header className="flex items-end gap-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-h1 text-ink-deep leading-tight">{pin.name}</h1>
          {placeText && <p className="mt-2 text-slate">{placeText}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            {pin.visited && <span className="pill bg-teal/10 text-teal">Been</span>}
            {pin.category && <span className="pill bg-cream-soft text-slate">{pin.category}</span>}
            {pin.unescoId != null && (
              <span className="pill bg-accent/10 text-accent">UNESCO #{pin.unescoId}</span>
            )}
          </div>
        </div>
      </header>

      {pin.images[0] && (
        <figure className="mt-6 rounded overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={pin.images[0].url}
            alt={pin.name}
            className="w-full max-h-[60vh] object-cover bg-cream-soft"
          />
          {pin.images[0].filename && (
            <figcaption className="text-[11px] text-muted mt-1">{pin.images[0].filename}</figcaption>
          )}
        </figure>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-10 mt-8">
        {/* Main column — description */}
        <div className="md:col-span-2 min-w-0">
          {pin.description && (
            <section>
              {/* Description text from the Airtable source preserves HTML
                  entities (&lsquo;, &ndash;, etc.). React renders them
                  as-is, which is correct since they're escape sequences in
                  the original UNESCO copy. */}
              <p className="text-ink leading-relaxed whitespace-pre-line">{pin.description}</p>
            </section>
          )}

          {pin.hours && (
            <section className="mt-8">
              <h2 className="text-h3 text-ink-deep mb-2">Hours</h2>
              <p className="text-ink leading-relaxed whitespace-pre-line">{pin.hours}</p>
            </section>
          )}

          {pin.priceText && (
            <section className="mt-8">
              <h2 className="text-h3 text-ink-deep mb-2">Cost</h2>
              <p className="text-ink leading-relaxed">{pin.priceText}</p>
            </section>
          )}
        </div>

        {/* Sidebar — practical links + coords */}
        <aside className="card p-5 text-small self-start md:sticky md:top-20 space-y-4">
          <h3 className="text-muted uppercase tracking-wider text-[11px]">Plan a visit</h3>

          {pin.googleMapsUrl ? (
            <a
              href={pin.googleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block px-3 py-2 rounded bg-teal/10 text-teal hover:bg-teal/15 transition-colors text-center font-medium"
            >
              Open in Google Maps →
            </a>
          ) : (
            <p className="text-muted text-[11px]">No coordinates on file.</p>
          )}

          {pin.website && (
            <a
              href={pin.website}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-teal hover:underline truncate"
              title={pin.website}
            >
              {pin.website.replace(/^https?:\/\//, '').split('/')[0]} →
            </a>
          )}

          {pin.unescoUrl && (
            <a
              href={pin.unescoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-teal hover:underline"
            >
              UNESCO World Heritage page →
            </a>
          )}

          {(pin.lat != null && pin.lng != null) && (
            <dl className="pt-3 border-t border-sand text-[12px]">
              <div className="flex justify-between gap-3">
                <dt className="text-slate">Coords</dt>
                <dd className="text-ink-deep font-mono tabular-nums">
                  {pin.lat.toFixed(4)}, {pin.lng.toFixed(4)}
                </dd>
              </div>
            </dl>
          )}
        </aside>
      </div>
    </article>
  );
}
