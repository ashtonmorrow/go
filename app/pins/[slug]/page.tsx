// === /pins/[slug] ==========================================================
// Detail page for a single pin, modelled as a Wikipedia-style article:
//
//   ┌──────────────────────────────────────┬──────────────┐
//   │  Title                               │              │
//   │  Sub-line: city, country · since N   │  Infobox     │
//   │  Tag pills, list pills, badges       │  (facts,     │
//   │                                      │   links,     │
//   │  Hero image                          │   coords,    │
//   │                                      │   external)  │
//   │  Lead paragraph (Wikipedia summary)  │              │
//   │                                      │              │
//   │  About (UNESCO blurb / curator note) │              │
//   │  Hours · Cost                        │              │
//   │  Image gallery                       │              │
//   │  Tags                                │              │
//   └──────────────────────────────────────┴──────────────┘
//
// More-is-more: every fact we have is rendered. Empty bits are dropped
// silently. Wikipedia summary fetched at request time and cached 30 days.
//
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { fetchPinBySlug } from '@/lib/pins';
import { fetchAllCountries } from '@/lib/notion';
import { fetchWikipediaSummary, titleFromWikipediaUrl } from '@/lib/wikipedia';
import { flagCircle } from '@/lib/flags';
import JsonLd from '@/components/JsonLd';
import ViewSwitcher from '@/components/ViewSwitcher';
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

  // Run the slow-but-cheap lookups in parallel: country slug for the
  // breadcrumb / containedInPlace, Wikipedia summary for the lead paragraph.
  const country = pin.statesNames[0] ?? null;
  const [countries, wp] = await Promise.all([
    country ? fetchAllCountries() : Promise.resolve([]),
    fetchWikipediaSummary(titleFromWikipediaUrl(pin.wikipediaUrl)),
  ]);
  const countryRecord = country
    ? countries.find(c => c.name.toLowerCase() === country.toLowerCase()) ?? null
    : null;
  const countrySlug = countryRecord?.slug ?? null;
  const flagUrl = flagCircle(countryRecord?.iso2 ?? null);

  const placeText = [...pin.cityNames, ...pin.statesNames].filter(Boolean).join(', ');
  const breadcrumbs = [
    { name: 'Pins', item: `${SITE_URL}/pins` },
    ...(country && countrySlug
      ? [{ name: country, item: `${SITE_URL}/countries/${countrySlug}` }]
      : []),
    { name: pin.name },
  ];

  // TouristAttraction structured data.
  const isFree =
    pin.priceAmount === 0
      ? true
      : pin.priceAmount != null
      ? false
      : null;

  // Format inception year — negative is BCE.
  const formatYear = (y: number | null): string | null => {
    if (y == null) return null;
    if (y < 0) return `${-y} BCE`;
    return `${y}`;
  };

  // De-dupe images by URL just in case the rehost put the same one in twice.
  const galleryImages = pin.images.filter((img, i, arr) =>
    img.url && arr.findIndex(x => x.url === img.url) === i
  );

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

      {/* === Breadcrumbs + View switcher ==================================
          Switcher renders without a `current` so no pill is highlighted —
          we're on a detail page, not any of the four index views. */}
      <div className="mb-3 flex items-center justify-between gap-3 flex-wrap">
        <nav className="text-small text-muted" aria-label="Breadcrumb">
          <Link href="/pins" className="hover:text-teal">Pins</Link>
          {country && countrySlug && (
            <>
              <span className="mx-1.5" aria-hidden>›</span>
              <Link href={`/countries/${countrySlug}`} className="hover:text-teal">{country}</Link>
            </>
          )}
          <span className="mx-1.5" aria-hidden>›</span>
          <span className="text-ink-deep">{pin.name}</span>
        </nav>
        <ViewSwitcher object="pins" />
      </div>

      {/* === Title block ================================================== */}
      <header className="border-b border-sand pb-5">
        <h1 className="text-h1 text-ink-deep leading-tight">{pin.name}</h1>

        {/* Sub-line: place · since YYYY · type. Each is optional and the
            separators collapse cleanly. Wikipedia's own one-liner
            description wins when populated (more recognisable phrasing). */}
        <p className="mt-2 text-slate">
          <SubLine
            parts={[
              wp?.description ?? null,
              placeText || null,
              formatYear(pin.inceptionYear) ? `since ${formatYear(pin.inceptionYear)}` : null,
            ]}
          />
        </p>

        {/* Pills row: status, lists, category */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {pin.visited && (
            <span className="pill bg-teal/10 text-teal">Been</span>
          )}
          {pin.lists.map(l => (
            <span
              key={l}
              className="pill bg-accent/10 text-accent border border-accent/20"
              title={`Featured on ${l}`}
            >
              {l}
            </span>
          ))}
          {pin.category && pin.lists.length === 0 && (
            <span className="pill bg-cream-soft text-slate">{pin.category}</span>
          )}
        </div>
      </header>

      {/* === Hero image =================================================== */}
      {galleryImages[0] && (
        <figure className="mt-6 rounded overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={galleryImages[0].url}
            alt={pin.name}
            className="w-full max-h-[60vh] object-cover bg-cream-soft"
          />
        </figure>
      )}

      <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-10 mt-8">
        {/* === Main column =============================================== */}
        <div className="min-w-0">
          {/* Lead paragraph — Wikipedia summary if we have one. Falls back
              to the curator description otherwise. Clear "Read more on
              Wikipedia" link at the bottom for the full article. */}
          {wp?.extract && (
            <section>
              <p className="text-ink leading-relaxed text-[17px]">{wp.extract}</p>
              <a
                href={wp.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block text-small text-teal hover:underline"
              >
                Read more on Wikipedia →
              </a>
            </section>
          )}

          {/* Curator description — UNESCO inscription text or the original
              Airtable Description. Renders below the Wikipedia lead so it's
              clearly a second voice. */}
          {pin.description && (
            <section className={wp?.extract ? 'mt-8 pt-8 border-t border-sand' : ''}>
              {wp?.extract && (
                <h2 className="text-h3 text-ink-deep mb-3">From the source</h2>
              )}
              <p className="text-ink leading-relaxed whitespace-pre-line">{pin.description}</p>
            </section>
          )}

          {/* Visiting practicalities */}
          {(pin.hours || pin.priceText) && (
            <section className="mt-8 pt-8 border-t border-sand grid grid-cols-1 sm:grid-cols-2 gap-6">
              {pin.hours && (
                <div>
                  <h2 className="text-h3 text-ink-deep mb-2">Hours</h2>
                  <p className="text-ink leading-relaxed whitespace-pre-line">{pin.hours}</p>
                </div>
              )}
              {pin.priceText && (
                <div>
                  <h2 className="text-h3 text-ink-deep mb-2">Cost</h2>
                  <p className="text-ink leading-relaxed">{pin.priceText}</p>
                  {isFree === true && (
                    <p className="mt-1 text-small text-teal">Free entry.</p>
                  )}
                </div>
              )}
            </section>
          )}

          {/* Image gallery — drops the first image since it's the hero,
              renders the rest as a 3-up grid. Most pins only have one
              image so this section often doesn't appear. */}
          {galleryImages.length > 1 && (
            <section className="mt-8 pt-8 border-t border-sand">
              <h2 className="text-h3 text-ink-deep mb-3">Gallery</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {galleryImages.slice(1).map((img, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={img.url + i}
                    src={img.url}
                    alt={`${pin.name} — image ${i + 2}`}
                    className="w-full aspect-square object-cover rounded bg-cream-soft"
                  />
                ))}
              </div>
            </section>
          )}

          {/* Tags — Wikidata "instance of" labels. Useful for grokking
              what kind of place this actually is at a glance. */}
          {pin.tags.length > 0 && (
            <section className="mt-8 pt-8 border-t border-sand">
              <h2 className="text-h3 text-ink-deep mb-2">Type</h2>
              <div className="flex flex-wrap gap-1.5">
                {pin.tags.map(t => (
                  <span key={t} className="pill bg-cream-soft text-slate text-[11px]">
                    {t}
                  </span>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* === Infobox sidebar =========================================== */}
        <aside className="self-start md:sticky md:top-20 space-y-4">
          {/* Wikipedia thumbnail (only when distinct from hero — saves a
              redundant render when both are the same image). */}
          {wp?.thumbnailUrl && wp.thumbnailUrl !== galleryImages[0]?.url && (
            <figure className="card p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={wp.thumbnailUrl}
                alt=""
                aria-hidden
                className="w-full rounded bg-cream-soft"
              />
              <figcaption className="text-[10px] text-muted mt-1 px-1">
                Image via Wikipedia
              </figcaption>
            </figure>
          )}

          {/* Plan-a-visit action block */}
          <div className="card p-4 space-y-3 text-small">
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
          </div>

          {/* Facts table — Wikipedia infobox style. Every row is optional. */}
          <div className="card p-4 text-small">
            <h3 className="text-muted uppercase tracking-wider text-[11px] mb-3">Facts</h3>
            <dl className="space-y-2">
              {country && (
                <Fact label="Country">
                  <span className="inline-flex items-center gap-1.5">
                    {flagUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={flagUrl} alt="" className="w-4 h-4 rounded-full border border-sand" />
                    )}
                    {countrySlug ? (
                      <Link href={`/countries/${countrySlug}`} className="hover:text-teal">
                        {country}
                      </Link>
                    ) : (
                      country
                    )}
                  </span>
                </Fact>
              )}
              {pin.cityNames[0] && <Fact label="City">{pin.cityNames[0]}</Fact>}
              {pin.category && <Fact label="Category">{pin.category}</Fact>}
              {formatYear(pin.inceptionYear) && (
                <Fact label="Established">{formatYear(pin.inceptionYear)}</Fact>
              )}
              {pin.unescoId != null && (
                <Fact label="UNESCO #">
                  <a
                    href={pin.unescoUrl ?? '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-teal hover:underline tabular-nums"
                  >
                    {pin.unescoId}
                  </a>
                </Fact>
              )}
              {pin.lat != null && pin.lng != null && (
                <Fact label="Coords">
                  <span className="font-mono tabular-nums text-[12px]">
                    {pin.lat.toFixed(4)}, {pin.lng.toFixed(4)}
                  </span>
                </Fact>
              )}
            </dl>
          </div>

          {/* External references — every link out lives here so the body
              doesn't get cluttered with parenthetical "see also" lines. */}
          {(pin.unescoUrl || pin.wikipediaUrl || pin.wikidataUrl) && (
            <div className="card p-4 text-small">
              <h3 className="text-muted uppercase tracking-wider text-[11px] mb-3">References</h3>
              <ul className="space-y-1.5">
                {pin.unescoUrl && (
                  <li>
                    <a
                      href={pin.unescoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-teal hover:underline"
                    >
                      whc.unesco.org →
                    </a>
                  </li>
                )}
                {pin.wikipediaUrl && (
                  <li>
                    <a
                      href={pin.wikipediaUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-teal hover:underline"
                    >
                      Wikipedia →
                    </a>
                  </li>
                )}
                {pin.wikidataUrl && (
                  <li>
                    <a
                      href={pin.wikidataUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-teal hover:underline"
                    >
                      Wikidata ({pin.wikidataQid}) →
                    </a>
                  </li>
                )}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </article>
  );
}

// === Sub-line ===
// Joins non-empty parts with a center-dot separator. Pulls slightly
// nicer than just .filter().join() because we get to drop the leading
// separator if the first part is empty.
function SubLine({ parts }: { parts: (string | null)[] }) {
  const filled = parts.filter((p): p is string => !!p);
  if (filled.length === 0) return null;
  return (
    <>
      {filled.map((p, i) => (
        <span key={i}>
          {i > 0 && <span className="mx-1.5 text-muted" aria-hidden>·</span>}
          {p}
        </span>
      ))}
    </>
  );
}

// === Fact ===
// One row of the facts dl. Hidden if children is null/undefined so
// callers don't have to wrap each row in their own conditional.
function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  if (children == null || children === '') return null;
  return (
    <div className="flex justify-between items-start gap-3">
      <dt className="text-slate">{label}</dt>
      <dd className="text-ink-deep text-right">{children}</dd>
    </div>
  );
}
