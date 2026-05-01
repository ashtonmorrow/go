import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { fetchPinBySlug, type Pin, type PinOpeningHours, type PinHoursDetails } from '@/lib/pins';
import { fetchPhotosForPin } from '@/lib/personalPhotos';
import { fetchCountryByName } from '@/lib/notion';
import { fetchWikipediaSummary, titleFromWikipediaUrl } from '@/lib/wikipedia';
import { flagCircle } from '@/lib/flags';
import { getListUrl, LIST_ICONS, type CanonicalList } from '@/lib/pinLists';
import { parseHours, DAY_LABELS, type DayKey } from '@/lib/parseHours';
import { admissionView, admissionShortLabel } from '@/lib/admission';
import {
  STATUS_FACET, BOOKING_FACET, CROWD_FACET, FOOD_FACET, RESTROOMS_FACET,
  SHADE_FACET, INDOOR_FACET, WHEELCHAIR_FACET, PHOTOGRAPHY_FACET,
  DIFFICULTY_FACET, PARKING_FACET, REQUIRES_GUIDE_FACET, TIME_OF_DAY_FACET,
  bringFacet, monthRange,
} from '@/lib/pinFacets';
import JsonLd from '@/components/JsonLd';
import { SITE_URL, clip, breadcrumbJsonLd, pinJsonLd } from '@/lib/seo';
import { withUtm } from '@/lib/utm';
import { thumbUrl, heroUrl } from '@/lib/imageUrl';
import { readPlaceContent, paragraphs } from '@/lib/content';

export const revalidate = 604800;
export const dynamicParams = true;

export async function generateStaticParams() {
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

  // Indexability: a content file can opt the page in via `indexable: true`
  // in its frontmatter. Either source flips noindex off — once you've
  // dropped a /content/pins/<slug>.md with the flag set, the page becomes
  // crawlable without touching the DB.
  const fileContent = await readPlaceContent('pins', pin.slug ?? '');
  const indexable = fileContent?.indexable === true || pin.indexable;

  return {
    title: pin.name,
    description,
    alternates: { canonical: url },
    robots: indexable ? undefined : { index: false, follow: true },
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

  const country = pin.statesNames[0] ?? null;
  // Surgical country lookup by name — used to load all 226 countries here
  // and .find() through them. The case-insensitive name match is handled
  // server-side via ilike now.
  const [countryRecord, wp, personalPhotos, content] = await Promise.all([
    country ? fetchCountryByName(country) : Promise.resolve(null),
    fetchWikipediaSummary(titleFromWikipediaUrl(pin.wikipediaUrl)),
    fetchPhotosForPin(pin.id),
    readPlaceContent('pins', pin.slug ?? ''),
  ]);
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

  const admission = admissionView(pin);
  const isFree = pin.freeToVisit ?? pin.free ?? (
    pin.priceAmount === 0 ? true :
    pin.priceAmount != null && pin.priceAmount > 0 ? false : null
  );

  const formatYear = (y: number | null): string | null => {
    if (y == null) return null;
    if (y < 0) return `${-y} BCE`;
    return `${y}`;
  };

  const galleryImages = pin.images.filter((img, i, arr) =>
    img.url && arr.findIndex(x => x.url === img.url) === i
  );

  const hoursDetailsHasData =
    pin.hoursDetails && (
      !!pin.hoursDetails.weekly ||
      !!pin.hoursDetails.ramadan ||
      !!pin.hoursDetails.parent_site ||
      !!pin.hoursDetails.type ||
      (Array.isArray(pin.hoursDetails.notes) && pin.hoursDetails.notes.length > 0)
    );
  const isHotel = pin.kind === 'hotel';
  const isRestaurant = pin.kind === 'restaurant';
  const isHotelOrRestaurant = isHotel || isRestaurant;
  const hasPlanInfo = Boolean(
    (!isHotel && (hoursDetailsHasData || pin.openingHours || pin.hours)) ||
    (!isHotelOrRestaurant && admission.kind !== 'unknown') ||
    pin.booking || pin.bookingUrl || pin.officialTicketUrl ||
    pin.bookingRequired != null ||
    pin.status || pin.closureReason || pin.closureDays.length ||
    (!isHotel && (pin.bestMonths.length || pin.worstMonths.length || pin.bestTimeOfDay.length || pin.crowdLevel)) ||
    (!isHotel && pin.durationMinutes != null),
  );

  // Amenity grid is irrelevant for hotels (of course they have wifi/restrooms;
  // the qualitative wifi_quality/breakfast_quality fields cover what matters).
  const amenityFacets = isHotel ? [] : [
    pin.foodOnSite ? FOOD_FACET[pin.foodOnSite] : null,
    pin.restrooms ? RESTROOMS_FACET[pin.restrooms] : null,
    pin.waterRefill ? { label: 'Water refill available', icon: 'droplet' } : null,
    pin.wifi ? { label: 'Wi-Fi available', icon: 'wifi' } : null,
    pin.lockers ? { label: 'Lockers available', icon: 'package' } : null,
    pin.shade ? SHADE_FACET[pin.shade] : null,
    pin.indoorOutdoor ? INDOOR_FACET[pin.indoorOutdoor] : null,
  ].filter((f): f is { label: string; icon: string } => Boolean(f));

  const hasGettingThere = Boolean(pin.address || pin.nearestTransit || pin.parking || pin.accessNotes);

  // Good-to-know is mostly irrelevant for hotels too; wheelchair_accessible
  // matters but otherwise the personal review carries it.
  const goodToKnowFacets = isHotel ? [] : [
    pin.wheelchairAccessible ? WHEELCHAIR_FACET[pin.wheelchairAccessible] : null,
    pin.photography ? PHOTOGRAPHY_FACET[pin.photography] : null,
    pin.requiresGuide ? REQUIRES_GUIDE_FACET[pin.requiresGuide] : null,
    pin.requiresPermit ? { label: 'Permit required', icon: 'receipt' } : null,
    pin.kidFriendly === true ? { label: 'Kid-friendly', icon: 'baby' } : null,
    pin.kidFriendly === false ? { label: 'Not for young kids', icon: 'circle-x' } : null,
    pin.strollerFriendly === true ? { label: 'Stroller-friendly', icon: 'baby' } : null,
    pin.petFriendly === true ? { label: 'Pet-friendly', icon: 'paw-print' } : null,
    pin.difficulty ? DIFFICULTY_FACET[pin.difficulty] : null,
  ].filter((f): f is { label: string; icon: string } => Boolean(f));

  const hasGoodToKnow = !isHotel && Boolean(
    goodToKnowFacets.length || pin.dressCode || pin.safetyNotes || pin.scamWarning ||
    pin.languagesOffered.length || pin.minAgeRecommended != null,
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
          address: pin.address,
          openingHours: pin.openingHours,
          admission: pin.admission,
          wheelchairAccessible: pin.wheelchairAccessible,
          kidFriendly: pin.kidFriendly,
          durationMinutes: pin.durationMinutes,
        })}
      />
      <JsonLd data={breadcrumbJsonLd(breadcrumbs)} />

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
      </div>

      <header className="border-b border-sand pb-5 flex gap-4 items-start">
        {galleryImages[0] && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbUrl(galleryImages[0].url, { size: 96 }) ?? galleryImages[0].url}
            alt=""
            aria-hidden
            width={96}
            height={96}
            className="w-20 h-20 sm:w-24 sm:h-24 rounded object-cover bg-cream-soft border border-sand flex-shrink-0"
          />
        )}
        <div className="flex-1 min-w-0">
          {pin.lat != null && pin.lng != null && (
            <p className="text-label uppercase tracking-[0.18em] font-mono text-muted mb-1">
              {pin.lat.toFixed(4)}, {pin.lng.toFixed(4)}
            </p>
          )}
          <h1 className="text-h1 text-ink-deep leading-tight">{pin.name}</h1>
          <p className="mt-2 text-slate">
            <SubLine
              parts={[
                wp?.description ?? null,
                placeText || null,
                formatYear(pin.inceptionYear) ? `since ${formatYear(pin.inceptionYear)}` : null,
              ]}
            />
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            {pin.visited && (
              <span className="text-teal text-label uppercase tracking-[0.14em] font-medium inline-flex items-center gap-1.5">
                <span aria-hidden>✅</span>
                <span>Visited</span>
              </span>
            )}
            {pin.status && pin.status !== 'active' && (
              <span className="pill bg-orange/10 text-orange">{STATUS_FACET[pin.status].label}</span>
            )}
            {pin.lists.map(l => {
            const canonical = l as CanonicalList;
            const icon = LIST_ICONS[canonical];
            const url = icon
              ? getListUrl(canonical, {
                  unescoId: pin.unescoId,
                  atlasObscuraSlug: null,
                  wikidataQid: pin.wikidataQid,
                })
              : null;
            const className =
              'pill bg-accent/10 text-accent border border-accent/20 ' +
              'inline-flex items-center gap-1.5 hover:bg-accent/15 transition-colors';
            const inner = (
              <>
                {icon && <span aria-hidden>{icon}</span>}
                <span>{l}</span>
                {url && <span aria-hidden className="text-accent/60 text-micro">↗</span>}
              </>
            );
            return url ? (
              <a
                key={l}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className={className}
                title={`Featured on ${l} — open source`}
              >
                {inner}
              </a>
            ) : (
              <span key={l} className={className} title={`Featured on ${l}`}>
                {inner}
              </span>
            );
          })}
          {pin.category && pin.lists.length === 0 && (
            <span className="pill bg-cream-soft text-slate">{pin.category}</span>
          )}
          </div>
        </div>
      </header>

      {personalPhotos[0] && (
        <figure className="mt-6 rounded overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={heroUrl(personalPhotos[0].url, 1200) ?? personalPhotos[0].url}
            alt={pin.name}
            // The hero is the LCP element on this route; tell the browser
            // not to defer it. Without this, image lazy-load heuristics +
            // network throttling could push LCP past 30s on slow connections.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            {...({ fetchpriority: 'high' } as any)}
            decoding="async"
            // Width/height from EXIF (when available) prevents the CLS shift
            // we were seeing when the hero arrived after FCP. Falls back to
            // a 3:2 placeholder so the layout still reserves space.
            width={personalPhotos[0].width ?? 1200}
            height={personalPhotos[0].height ?? 800}
            className="w-full max-h-[60vh] object-cover bg-cream-soft"
          />
        </figure>
      )}

      <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-10 mt-8">
        <div className="min-w-0">
          {/* Personal-voice notes from /content/pins/<slug>.md, if present.
              Sits at the top because it's the part of the page someone came
              for — Wikipedia's extract reads like an encyclopedia, this
              reads like a postcard. */}
          {content && (
            <section className="mb-8 pb-8 border-b border-sand">
              {paragraphs(content.body).map((p, i) => (
                <p key={i} className={'text-ink leading-relaxed text-prose' + (i > 0 ? ' mt-4' : '')}>
                  {p}
                </p>
              ))}
            </section>
          )}

          {wp?.extract && (
            <section>
              <p className="text-ink leading-relaxed text-prose">{wp.extract}</p>
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

          {pin.description && (
            <section className={wp?.extract ? 'mt-8 pt-8 border-t border-sand' : ''}>
              {wp?.extract && <h2 className="text-h3 text-ink-deep mb-3">From the source</h2>}
              <p className="text-ink leading-relaxed whitespace-pre-line">{pin.description}</p>
            </section>
          )}

          {hasPlanInfo && <PlanSection pin={pin} admissionLabel={admissionShortLabel(admission)} />}

          {amenityFacets.length > 0 && (
            <section className="mt-8 pt-8 border-t border-sand">
              <h2 className="text-h3 text-ink-deep mb-3">What to expect</h2>
              <FacetGrid items={amenityFacets} />
            </section>
          )}

          {hasGettingThere && <GettingThereSection pin={pin} />}

          {pin.bring.length > 0 && (
            <section className="mt-8 pt-8 border-t border-sand">
              <h2 className="text-h3 text-ink-deep mb-3">What to bring</h2>
              <div className="flex flex-wrap gap-1.5">
                {pin.bring.map(b => (
                  <span key={b} className="pill bg-cream-soft text-ink-deep">
                    {bringFacet(b).label}
                  </span>
                ))}
              </div>
            </section>
          )}

          {hasGoodToKnow && <GoodToKnowSection pin={pin} facets={goodToKnowFacets} />}

          <PersonalSection pin={pin} />

          {personalPhotos.length > 1 && (
            <section className="mt-8 pt-8 border-t border-sand">
              <h2 className="text-h3 text-ink-deep mb-3">Your photos</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {personalPhotos.slice(1).map(p => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={p.id}
                    src={thumbUrl(p.url, { size: 240 }) ?? p.url}
                    alt={p.caption ?? `${pin.name} — personal photo`}
                    loading="lazy"
                    decoding="async"
                    width={240}
                    height={240}
                    className="w-full aspect-square object-cover rounded bg-cream-soft"
                  />
                ))}
              </div>
            </section>
          )}

          {galleryImages.length > 1 && (
            <section className="mt-8 pt-8 border-t border-sand">
              <h2 className="text-h3 text-ink-deep mb-3">Gallery</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {galleryImages.slice(1).map((img, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={img.url + i}
                    src={thumbUrl(img.url, { size: 240 }) ?? img.url}
                    alt={`${pin.name} — image ${i + 2}`}
                    loading="lazy"
                    decoding="async"
                    width={240}
                    height={240}
                    className="w-full aspect-square object-cover rounded bg-cream-soft"
                  />
                ))}
              </div>
            </section>
          )}

          {pin.tags.length > 0 && (
            <section className="mt-8 pt-8 border-t border-sand">
              <h2 className="text-h3 text-ink-deep mb-2">Type</h2>
              <div className="flex flex-wrap gap-1.5">
                {pin.tags.map(t => (
                  <span key={t} className="pill bg-cream-soft text-slate text-label">{t}</span>
                ))}
              </div>
            </section>
          )}
        </div>

        <aside className="self-start md:sticky md:top-20 space-y-4">
          {wp?.thumbnailUrl && wp.thumbnailUrl !== galleryImages[0]?.url && personalPhotos.length === 0 && (
            <figure className="card p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={wp.thumbnailUrl} alt="" aria-hidden className="w-full rounded bg-cream-soft" />
              {/* Attribution: per Wikimedia Commons + Wikipedia REST policy,
                  link to the source article so the upstream author + license
                  credits travel with the image. The full credit story lives
                  on /credits. */}
              <figcaption className="text-micro text-muted mt-1 px-1">
                Lead image from{' '}
                {wp.url ? (
                  <a
                    href={wp.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-ink-deep underline-offset-2 hover:underline"
                  >
                    the Wikipedia article
                  </a>
                ) : (
                  'the Wikipedia article'
                )}
                .{' '}
                <Link href="/credits" className="hover:text-ink-deep underline-offset-2 hover:underline">
                  Credits
                </Link>
              </figcaption>
            </figure>
          )}

          <div className="card p-4 space-y-3 text-small">
            <h3 className="text-muted uppercase tracking-wider text-label">Plan a visit</h3>

            {pin.googleMapsUrl ? (
              <a
                href={withUtm(pin.googleMapsUrl, { medium: 'pin-detail', campaign: 'google-maps' })}
                target="_blank"
                rel="noopener noreferrer"
                className="block px-3 py-2 rounded bg-teal/10 text-teal hover:bg-teal/15 transition-colors text-center font-medium"
              >
                Open in Google Maps →
              </a>
            ) : (
              <p className="text-muted text-label">No coordinates on file.</p>
            )}

            {pin.bookingUrl && (
              <a
                href={withUtm(pin.bookingUrl, { medium: 'pin-detail-cta', campaign: 'booking' })}
                target="_blank"
                rel="noopener noreferrer"
                className="block px-3 py-2 rounded bg-accent/10 text-accent hover:bg-accent/15 transition-colors text-center font-medium"
              >
                Book tickets →
              </a>
            )}

            {!pin.bookingUrl && pin.officialTicketUrl && (
              <a
                href={withUtm(pin.officialTicketUrl, { medium: 'pin-detail-cta', campaign: 'official-tickets' })}
                target="_blank"
                rel="noopener noreferrer"
                className="block px-3 py-2 rounded bg-accent/10 text-accent hover:bg-accent/15 transition-colors text-center font-medium"
              >
                Buy tickets →
              </a>
            )}

            {pin.website && (
              <a
                href={withUtm(pin.website, { medium: 'pin-detail', campaign: 'official-website' })}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-teal hover:underline truncate"
                title={pin.website}
              >
                {pin.website.replace(/^https?:\/\//, '').split('/')[0]} →
              </a>
            )}
          </div>

          <div className="card p-4 text-small">
            <h3 className="text-muted uppercase tracking-wider text-label mb-3">Facts</h3>
            <dl className="space-y-2">
              {country && (
                <Fact label="Country">
                  <span className="inline-flex items-center gap-1.5">
                    {flagUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={flagUrl} alt="" className="w-4 h-4 rounded-full border border-sand" />
                    )}
                    {countrySlug ? (
                      <Link href={`/countries/${countrySlug}`} className="hover:text-teal">{country}</Link>
                    ) : (
                      country
                    )}
                  </span>
                </Fact>
              )}
              {pin.cityNames[0] && <Fact label="City">{pin.cityNames[0]}</Fact>}
              {pin.address && <Fact label="Address"><span className="text-right">{pin.address}</span></Fact>}
              {pin.category && <Fact label="Category">{pin.category}</Fact>}
              {pin.durationMinutes != null && (
                <Fact label="Visit time">{fmtDuration(pin.durationMinutes)}</Fact>
              )}
              {formatYear(pin.inceptionYear) && (
                <Fact label="Established">{formatYear(pin.inceptionYear)}</Fact>
              )}
              {pin.unescoId != null && (
                <Fact label="UNESCO #">
                  <a
                    href={pin.unescoUrl ? withUtm(pin.unescoUrl, { medium: 'pin-detail', campaign: 'unesco' }) : '#'}
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
                  <span className="font-mono tabular-nums text-small">
                    {pin.lat.toFixed(4)}, {pin.lng.toFixed(4)}
                  </span>
                </Fact>
              )}
            </dl>
          </div>

          {(pin.unescoUrl || pin.wikipediaUrl || pin.wikidataUrl) && (
            <div className="card p-4 text-small">
              <h3 className="text-muted uppercase tracking-wider text-label mb-3">References</h3>
              <ul className="space-y-1.5">
                {pin.unescoUrl && (
                  <li><a href={withUtm(pin.unescoUrl, { medium: 'pin-detail', campaign: 'unesco' })} target="_blank" rel="noopener noreferrer" className="text-teal hover:underline">whc.unesco.org →</a></li>
                )}
                {pin.wikipediaUrl && (
                  <li><a href={withUtm(pin.wikipediaUrl, { medium: 'pin-detail', campaign: 'wikipedia' })} target="_blank" rel="noopener noreferrer" className="text-teal hover:underline">Wikipedia →</a></li>
                )}
                {pin.wikidataUrl && (
                  <li><a href={withUtm(pin.wikidataUrl, { medium: 'pin-detail', campaign: 'wikidata' })} target="_blank" rel="noopener noreferrer" className="text-teal hover:underline">Wikidata ({pin.wikidataQid}) →</a></li>
                )}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </article>
  );
}

function PlanSection({ pin, admissionLabel }: { pin: Pin; admissionLabel: string | null }) {
  // Hotels and restaurants get their own pricing in the kind-specific section
  // (room_price_per_night, etc.), so admission/cost is suppressed here.
  const isHotel = pin.kind === 'hotel';
  const isRestaurant = pin.kind === 'restaurant';
  const heading =
    isHotel ? 'Plan your stay' :
    isRestaurant ? 'Plan your meal' :
    'Plan your visit';

  // Hours: skip empty {} hours_details placeholder.
  const hoursDetailsHasData =
    pin.hoursDetails && (
      !!pin.hoursDetails.weekly ||
      !!pin.hoursDetails.ramadan ||
      !!pin.hoursDetails.parent_site ||
      !!pin.hoursDetails.type ||
      (Array.isArray(pin.hoursDetails.notes) && pin.hoursDetails.notes.length > 0)
    );
  const showHours = !isHotel && (hoursDetailsHasData || pin.openingHours || pin.hours);

  const showCost =
    !isHotel && !isRestaurant && (
      admissionLabel != null ||
      pin.freeToVisit != null ||
      pin.free === true ||
      pin.admission ||
      pin.priceText ||
      pin.priceAmount != null
    );
  const showTiming = !isHotel && (pin.bestMonths.length || pin.worstMonths.length || pin.bestTimeOfDay.length || pin.crowdLevel);
  const showBooking = pin.booking || pin.bookingRequired != null || pin.bookingUrl || pin.officialTicketUrl;
  const showStatus = pin.status && pin.status !== 'active';

  return (
    <section className="mt-8 pt-8 border-t border-sand">
      <h2 className="text-h3 text-ink-deep mb-4">{heading}</h2>

      {showStatus && pin.status && (
        <div className="mb-4 px-3 py-2 rounded bg-orange/10 text-orange text-small">
          <strong>{STATUS_FACET[pin.status].label}.</strong>
          {pin.closureReason && <span className="ml-1">{pin.closureReason}</span>}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {showHours && (
          <div>
            <h3 className="text-small text-muted uppercase tracking-wider text-label mb-2">Hours</h3>
            <HoursBlock hoursDetails={pin.hoursDetails} openingHours={pin.openingHours} raw={pin.hours} />
            {pin.closureDays.length > 0 && (
              <p className="mt-2 text-label text-muted">
                Also closed: {pin.closureDays.join(', ')}
              </p>
            )}
          </div>
        )}

        {showCost && (
          <div>
            <h3 className="text-small text-muted uppercase tracking-wider text-label mb-2">Admission</h3>
            <AdmissionBlock pin={pin} fallback={admissionLabel} />
          </div>
        )}

        {showBooking && (
          <div>
            <h3 className="text-small text-muted uppercase tracking-wider text-label mb-2">Booking</h3>
            {pin.booking && <p className="text-ink">{BOOKING_FACET[pin.booking].label}</p>}
            {!pin.booking && pin.bookingRequired === true && (
              <p className="text-ink">Booking required</p>
            )}
            {!pin.booking && pin.bookingRequired === false && (
              <p className="text-ink">No booking needed</p>
            )}
            {pin.bookingUrl && (
              <a href={pin.bookingUrl} target="_blank" rel="noopener noreferrer" className="text-teal hover:underline text-small block mt-1">
                Reserve →
              </a>
            )}
            {!pin.bookingUrl && pin.officialTicketUrl && (
              <a href={pin.officialTicketUrl} target="_blank" rel="noopener noreferrer" className="text-teal hover:underline text-small block mt-1">
                Official tickets →
              </a>
            )}
          </div>
        )}

        {(pin.hoursSourceUrl || pin.priceSourceUrl) && (
          <div className="sm:col-span-2 text-label text-muted">
            Sources:{' '}
            {pin.hoursSourceUrl && (
              <a href={pin.hoursSourceUrl} target="_blank" rel="noopener noreferrer" className="hover:text-teal underline">
                hours
              </a>
            )}
            {pin.hoursSourceUrl && pin.priceSourceUrl && ' · '}
            {pin.priceSourceUrl && (
              <a href={pin.priceSourceUrl} target="_blank" rel="noopener noreferrer" className="hover:text-teal underline">
                pricing
              </a>
            )}
          </div>
        )}

        {showTiming && (
          <div>
            <h3 className="text-small text-muted uppercase tracking-wider text-label mb-2">When to go</h3>
            <ul className="text-small text-ink space-y-1">
              {pin.bestMonths.length > 0 && (
                <li><span className="text-muted">Best:</span> {monthRange(pin.bestMonths)}</li>
              )}
              {pin.worstMonths.length > 0 && (
                <li><span className="text-muted">Avoid:</span> {monthRange(pin.worstMonths)}</li>
              )}
              {pin.bestTimeOfDay.length > 0 && (
                <li>
                  <span className="text-muted">Time of day:</span>{' '}
                  {pin.bestTimeOfDay.map(t => TIME_OF_DAY_FACET[t].label).join(', ')}
                </li>
              )}
              {pin.crowdLevel && (
                <li><span className="text-muted">Crowds:</span> {CROWD_FACET[pin.crowdLevel].label}</li>
              )}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

function AdmissionBlock({ pin, fallback }: { pin: Pin; fallback: string | null }) {
  const view = admissionView(pin);
  if (view.kind === 'free') {
    return (
      <>
        <p className="text-teal font-medium">Free</p>
        {view.note && <p className="mt-1 text-small text-ink leading-relaxed">{view.note}</p>}
      </>
    );
  }
  if (view.kind === 'paid' && view.tiers.length) {
    return (
      <>
        <dl className="text-small">
          {view.tiers.map((t, i) => (
            <div key={`${t.label}-${i}`} className="flex justify-between gap-3 py-0.5">
              <dt className="text-slate">{t.label}</dt>
              <dd className="text-ink-deep tabular-nums font-mono">{t.formatted}</dd>
            </div>
          ))}
        </dl>
        {view.notes.length > 0 && (
          <ul className="mt-2 text-label text-muted leading-relaxed space-y-0.5">
            {view.notes.map((n, i) => (
              <li key={i}>· {n}</li>
            ))}
          </ul>
        )}
      </>
    );
  }
  if (view.kind === 'paid' && view.note) {
    return <p className="text-ink leading-relaxed text-small">{view.note}</p>;
  }
  return fallback ? <p className="text-ink text-small">{fallback}</p> : <p className="text-muted text-small">Pricing unknown</p>;
}

function GettingThereSection({ pin }: { pin: Pin }) {
  return (
    <section className="mt-8 pt-8 border-t border-sand">
      <h2 className="text-h3 text-ink-deep mb-3">Getting there</h2>
      <dl className="text-small space-y-2">
        {pin.address && (
          <div className="flex flex-col sm:flex-row sm:gap-3">
            <dt className="text-slate sm:w-32 flex-shrink-0">Address</dt>
            <dd className="text-ink-deep">{pin.address}</dd>
          </div>
        )}
        {pin.nearestTransit && (pin.nearestTransit.station || pin.nearestTransit.line) && (
          <div className="flex flex-col sm:flex-row sm:gap-3">
            <dt className="text-slate sm:w-32 flex-shrink-0">Transit</dt>
            <dd className="text-ink-deep">
              {pin.nearestTransit.station}
              {pin.nearestTransit.line && <span className="text-muted"> · {pin.nearestTransit.line}</span>}
              {typeof pin.nearestTransit.walking_minutes === 'number' && (
                <span className="text-muted"> · {pin.nearestTransit.walking_minutes} min walk</span>
              )}
            </dd>
          </div>
        )}
        {pin.parking && (
          <div className="flex flex-col sm:flex-row sm:gap-3">
            <dt className="text-slate sm:w-32 flex-shrink-0">Parking</dt>
            <dd className="text-ink-deep">{PARKING_FACET[pin.parking].label}</dd>
          </div>
        )}
        {pin.accessNotes && (
          <div className="flex flex-col sm:flex-row sm:gap-3">
            <dt className="text-slate sm:w-32 flex-shrink-0">Notes</dt>
            <dd className="text-ink-deep leading-relaxed">{pin.accessNotes}</dd>
          </div>
        )}
      </dl>
    </section>
  );
}

function PersonalSection({ pin }: { pin: Pin }) {
  const universal =
    pin.personalRating != null ||
    pin.personalReview ||
    pin.visitYear != null ||
    pin.companions.length > 0;

  const hasHotel =
    pin.kind === 'hotel' &&
    (pin.nightsStayed != null ||
      pin.roomType ||
      pin.roomPricePerNight != null ||
      pin.wouldStayAgain != null ||
      pin.hotelVibe.length ||
      pin.breakfastQuality ||
      pin.wifiQuality ||
      pin.noiseLevel ||
      pin.locationPitch);

  const hasMeal =
    pin.kind === 'restaurant' &&
    (pin.cuisine.length ||
      pin.mealTypes.length ||
      pin.dishesTried.length ||
      pin.dietaryOptions.length ||
      pin.reservationRecommended != null ||
      pin.priceTier != null ||
      pin.pricePerPersonUsd != null);

  if (!universal && !hasHotel && !hasMeal) return null;

  const heading =
    pin.kind === 'hotel' ? 'Your stay' :
    pin.kind === 'restaurant' ? 'Your meal' :
    'Your visit';

  return (
    <section className="mt-8 pt-8 border-t border-sand">
      <h2 className="text-h3 text-ink-deep mb-3">{heading}</h2>

      {universal && (
        <div className="mb-4 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-small">
          {pin.personalRating != null && (
            <span aria-label={`${pin.personalRating} out of 5 stars`} className="text-ink-deep">
              {'★'.repeat(pin.personalRating)}
              <span className="text-sand">{'★'.repeat(5 - pin.personalRating)}</span>
            </span>
          )}
          {pin.visitYear != null && (
            <span className="text-slate">{pin.visitYear}</span>
          )}
          {pin.bestFor.length > 0 && (
            <span className="text-muted text-small">
              best for {pin.bestFor.join(', ')}
            </span>
          )}
          {pin.companions.length > 0 && (
            <span className="text-muted text-small">
              with {pin.companions.join(', ')}
            </span>
          )}
        </div>
      )}

      {hasHotel && (
        <>
          {pin.hotelVibe.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {pin.hotelVibe.map(v => (
                <span key={v} className="pill bg-cream-soft text-ink-deep capitalize">{v}</span>
              ))}
            </div>
          )}
          <dl className="text-small space-y-1.5 mb-4">
            {pin.nightsStayed != null && (
              <FactRow label="Nights">
                {pin.nightsStayed} {pin.nightsStayed === 1 ? 'night' : 'nights'}
              </FactRow>
            )}
            {pin.roomType && <FactRow label="Room">{pin.roomType}</FactRow>}
            {pin.roomPricePerNight != null && (
              <FactRow label="Per night">
                <span className="font-mono tabular-nums">
                  {pin.roomPriceCurrency ? `${pin.roomPriceCurrency} ` : ''}
                  {pin.roomPricePerNight}
                </span>
              </FactRow>
            )}
            {pin.locationPitch && <FactRow label="Location">{pin.locationPitch}</FactRow>}
            {pin.breakfastQuality && <FactRow label="Breakfast">{pin.breakfastQuality}</FactRow>}
            {pin.wifiQuality && <FactRow label="Wifi">{pin.wifiQuality}</FactRow>}
            {pin.noiseLevel && <FactRow label="Noise">{pin.noiseLevel}</FactRow>}
            {pin.wouldStayAgain === true && (
              <FactRow label="Verdict"><span className="text-teal">Would stay again</span></FactRow>
            )}
            {pin.wouldStayAgain === false && (
              <FactRow label="Verdict"><span className="text-orange">Wouldn&rsquo;t stay again</span></FactRow>
            )}
          </dl>
        </>
      )}

      {hasMeal && (
        <dl className="text-small space-y-1.5 mb-4">
          {(pin.priceTier || pin.pricePerPersonUsd != null) && (
            <FactRow label="Price">
              <span className="inline-flex items-baseline gap-2">
                {pin.priceTier && (
                  <span className="font-mono text-ink-deep tabular-nums">{pin.priceTier}</span>
                )}
                {pin.pricePerPersonUsd != null && (
                  <span className="text-muted text-small">
                    ~${pin.pricePerPersonUsd.toLocaleString()}/person
                  </span>
                )}
              </span>
            </FactRow>
          )}
          {pin.cuisine.length > 0 && (
            <FactRow label="Cuisine">
              <span className="flex flex-wrap gap-1">
                {pin.cuisine.map(c => (
                  <span key={c} className="pill bg-cream-soft text-ink-deep capitalize">{c}</span>
                ))}
              </span>
            </FactRow>
          )}
          {pin.mealTypes.length > 0 && (
            <FactRow label="Best for">{pin.mealTypes.join(', ')}</FactRow>
          )}
          {pin.dishesTried.length > 0 && (
            <FactRow label="Tried">{pin.dishesTried.join(' · ')}</FactRow>
          )}
          {pin.dietaryOptions.length > 0 && (
            <FactRow label="Dietary">{pin.dietaryOptions.join(', ')}</FactRow>
          )}
          {pin.reservationRecommended === true && (
            <FactRow label="Reservation">Recommended</FactRow>
          )}
          {pin.reservationRecommended === false && (
            <FactRow label="Reservation">Walk-ins welcome</FactRow>
          )}
        </dl>
      )}

      {pin.personalReview && (
        <p className="text-ink leading-relaxed whitespace-pre-line">{pin.personalReview}</p>
      )}
    </section>
  );
}

function GoodToKnowSection({
  pin,
  facets,
}: {
  pin: Pin;
  facets: { label: string; icon: string }[];
}) {
  return (
    <section className="mt-8 pt-8 border-t border-sand">
      <h2 className="text-h3 text-ink-deep mb-3">Good to know</h2>

      {facets.length > 0 && <FacetGrid items={facets} className="mb-4" />}

      <dl className="text-small space-y-2">
        {pin.dressCode && (
          <FactRow label="Dress code">{pin.dressCode}</FactRow>
        )}
        {pin.minAgeRecommended != null && (
          <FactRow label="Recommended age">{pin.minAgeRecommended}+</FactRow>
        )}
        {pin.languagesOffered.length > 0 && (
          <FactRow label="Languages">{pin.languagesOffered.join(', ')}</FactRow>
        )}
        {pin.safetyNotes && (
          <FactRow label="Safety">{pin.safetyNotes}</FactRow>
        )}
        {pin.scamWarning && (
          <FactRow label="Watch out for">
            <span className="text-orange">{pin.scamWarning}</span>
          </FactRow>
        )}
      </dl>
    </section>
  );
}

function FacetGrid({ items, className }: { items: { label: string; icon: string }[]; className?: string }) {
  return (
    <ul className={'grid grid-cols-1 sm:grid-cols-2 gap-2 ' + (className ?? '')}>
      {items.map((it, i) => (
        <li key={i} className="flex items-start gap-2 text-small text-ink">
          <span aria-hidden className="text-teal mt-0.5">●</span>
          <span>{it.label}</span>
        </li>
      ))}
    </ul>
  );
}

function fmtDuration(mins: number): string {
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  if (rem === 0) return `${hours} hr`;
  return `${hours} hr ${rem} min`;
}

const HOURS_DAY_ORDER: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function HoursBlock({
  hoursDetails,
  openingHours,
  raw,
}: {
  hoursDetails: PinHoursDetails | null;
  openingHours: PinOpeningHours | null;
  raw: string | null;
}) {
  const todayIdx = new Date().getDay();
  const todayKey: DayKey = (['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as DayKey[])[todayIdx];

  const hasHoursDetailsData =
    hoursDetails && (
      !!hoursDetails.weekly ||
      !!hoursDetails.ramadan ||
      !!hoursDetails.parent_site ||
      !!hoursDetails.type ||
      (Array.isArray(hoursDetails.notes) && hoursDetails.notes.length > 0)
    );
  if (hasHoursDetailsData && hoursDetails) {
    const w = hoursDetails.weekly ?? null;
    const dailyText = w?.daily;
    // If `weekly` exists but every per-day field is missing, treat the whole
    // schedule as "not yet annotated" rather than rendering seven rows that
    // each say Closed. Otherwise render the table and use "—" for missing
    // days so they're visually distinct from explicit "Closed" entries.
    const populatedDays = w
      ? HOURS_DAY_ORDER.filter(d => {
          const t = (w as Record<string, string | undefined>)[d];
          return typeof t === 'string' && t.trim().length > 0;
        })
      : [];
    const allDaysEmpty = w && !dailyText && populatedDays.length === 0;
    return (
      <div className="text-small">
        {dailyText ? (
          <p className="text-ink font-mono">Daily {dailyText}</p>
        ) : allDaysEmpty ? (
          <NoHoursPlaceholder />
        ) : w ? (
          <dl className="font-mono">
            {HOURS_DAY_ORDER.map(d => {
              const text = (w as Record<string, string | undefined>)[d];
              const hasText = typeof text === 'string' && text.trim().length > 0;
              const isToday = d === todayKey;
              return (
                <div
                  key={d}
                  className={'flex items-baseline justify-between gap-3 py-0.5 ' + (isToday ? 'text-teal font-semibold' : 'text-ink')}
                >
                  <dt className="w-12 text-micro uppercase tracking-[0.14em] flex-shrink-0">
                    {DAY_LABELS[d]}
                    {isToday && <span aria-hidden className="ml-1 text-micro">●</span>}
                  </dt>
                  <dd className={'tabular-nums ' + (hasText ? '' : 'text-muted/70')}>
                    {hasText ? text : '—'}
                  </dd>
                </div>
              );
            })}
          </dl>
        ) : null}
        {hoursDetails.ramadan?.daily && (
          <p className="mt-2 text-label text-muted">
            Ramadan: {hoursDetails.ramadan.daily}
          </p>
        )}
        {hoursDetails.parent_site && (
          <p className="mt-1 text-label text-muted">
            Hours follow {hoursDetails.parent_site}.
          </p>
        )}
        {Array.isArray(hoursDetails.notes) && hoursDetails.notes.length > 0 && (
          <ul className="mt-2 text-label text-muted leading-relaxed space-y-0.5">
            {hoursDetails.notes.map((n, i) => (
              <li key={i}>· {n}</li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  if (openingHours) {
    // Same convention as hours_details.weekly: an entirely-empty schedule
    // (every day missing or empty array) means we haven't annotated this
    // pin yet, not that it's closed every day. Render the placeholder
    // instead of seven rows of "Closed". Per-day, missing intervals show
    // as "—" so the user can see which days still need annotation.
    const allDaysEmpty = HOURS_DAY_ORDER.every(d => {
      const intervals = (openingHours as Record<string, string[] | undefined>)[d];
      return !intervals || intervals.length === 0;
    });
    if (allDaysEmpty && !openingHours.notes) {
      return <NoHoursPlaceholder />;
    }
    return (
      <dl className="text-small font-mono">
        {HOURS_DAY_ORDER.map(d => {
          const intervals = (openingHours as Record<string, string[] | undefined>)[d];
          const isToday = d === todayKey;
          const hasIntervals = !!intervals && intervals.length > 0;
          return (
            <div
              key={d}
              className={'flex items-baseline justify-between gap-3 py-0.5 ' + (isToday ? 'text-teal font-semibold' : 'text-ink')}
            >
              <dt className="w-12 text-micro uppercase tracking-[0.14em] flex-shrink-0">
                {DAY_LABELS[d]}
                {isToday && <span aria-hidden className="ml-1 text-micro">●</span>}
              </dt>
              <dd className={'tabular-nums ' + (hasIntervals ? '' : 'text-muted/70')}>
                {hasIntervals ? intervals.join(', ') : '—'}
              </dd>
            </div>
          );
        })}
        {openingHours.notes && (
          <p className="mt-2 text-label text-muted font-sans leading-relaxed">{openingHours.notes}</p>
        )}
      </dl>
    );
  }

  if (!raw) return null;

  const parsed = parseHours(raw);
  if (!parsed?.structured) {
    return <p className="text-ink leading-relaxed whitespace-pre-line text-small">{raw}</p>;
  }

  return (
    <dl className="text-small font-mono">
      {parsed.structured.map(d => {
        const isToday = d.day === todayKey;
        return (
          <div
            key={d.day}
            className={'flex items-baseline justify-between gap-3 py-0.5 ' + (isToday ? 'text-teal font-semibold' : 'text-ink')}
          >
            <dt className="w-12 text-micro uppercase tracking-[0.14em] flex-shrink-0">
              {DAY_LABELS[d.day]}
              {isToday && <span aria-hidden className="ml-1 text-micro">●</span>}
            </dt>
            <dd className="tabular-nums">{d.closed ? 'Closed' : `${d.open}–${d.close}`}</dd>
          </div>
        );
      })}
    </dl>
  );
}

/**
 * Placeholder shown when a pin has hours_details / opening_hours / hours
 * fields, but every per-day cell is empty. Distinguishes "we haven't
 * annotated this yet" from "this place is closed every day", which is what
 * the old "Closed" rendering implied. Same pin without any hours field at
 * all just doesn't render this section — null parent.
 */
function NoHoursPlaceholder() {
  return (
    <div className="flex items-start gap-2 px-3 py-2 rounded-md bg-cream-soft border border-sand text-small text-muted">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="mt-0.5 flex-shrink-0">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
      <span>Hours haven&rsquo;t been added yet.</span>
    </div>
  );
}

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

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  if (children == null || children === '') return null;
  return (
    <div className="flex justify-between items-start gap-3">
      <dt className="text-slate">{label}</dt>
      <dd className="text-ink-deep text-right">{children}</dd>
    </div>
  );
}

function FactRow({ label, children }: { label: string; children: React.ReactNode }) {
  if (children == null || children === '') return null;
  return (
    <div className="flex flex-col sm:flex-row sm:gap-3">
      <dt className="text-slate sm:w-32 flex-shrink-0">{label}</dt>
      <dd className="text-ink-deep leading-relaxed">{children}</dd>
    </div>
  );
}
