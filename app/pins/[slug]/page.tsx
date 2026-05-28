import Link from 'next/link';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { fetchPinBySlug, fetchPinsInBbox, type Pin } from '@/lib/pins';
import { fetchPhotosForPin } from '@/lib/personalPhotos';
import { fetchCountryByName, fetchCityByName } from '@/lib/places';
import { flagCircle } from '@/lib/flags';
import { admissionView, admissionShortLabel } from '@/lib/admission';
import {
  FOOD_FACET, RESTROOMS_FACET,
  SHADE_FACET, INDOOR_FACET, WHEELCHAIR_FACET, PHOTOGRAPHY_FACET,
  DIFFICULTY_FACET, PARKING_FACET, REQUIRES_GUIDE_FACET,
  bringFacet,
} from '@/lib/pinFacets';
import JsonLd from '@/components/JsonLd';
import { SITE_URL, clip, breadcrumbJsonLd, pinJsonLd, pinPageTitle } from '@/lib/seo';
import { withUtm } from '@/lib/utm';
import { thumbUrl } from '@/lib/imageUrl';
import Lightbox from '@/components/Lightbox';
import AdminEditLink from '@/components/AdminEditLink';
import PinActionBar from '@/components/PinActionBar';
// Detail-page helpers + sections, extracted out of this file (R3 plumbing).
import {
  isThinPin,
  computeRelatedPins,
  formatDistance,
  buildSourceLinks,
  enrichmentSourceLabel,
  formatSourceDate,
  fmtDuration,
  pinFaqJsonLd,
} from '@/lib/pinDetail';
import {
  PlanSection,
  HotelReviewSection,
  PersonalSection,
  GoodToKnowContent,
  FacetGrid,
  WikipediaSection,
  Fact,
  PinHero,
  PinHeaderChips,
} from '@/components/pin/PinDetailSections';

// 7-day ISR — bust via /api/revalidate when the underlying pin or its
// content file changes. The admin edit affordance has moved into a
// client-side <AdminEditLink>, so reading searchParams here is no
// longer necessary — the page can finally be statically cached.
export const revalidate = 604800;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  // generateMetadata runs BEFORE the route's error.tsx boundary mounts,
  // so any throw here surfaces as a Vercel 500 (the bare pages-router
  // _error fallback) and bypasses our App Router error UI. Wrap the
  // whole thing in a try/catch and degrade to a minimal title rather
  // than letting it kill the page render. The actual error gets logged
  // to Vercel runtime logs.
  try {
    const { slug } = await params;
    const pin = await fetchPinBySlug(slug);
    if (!pin) return { title: 'Not found' };

    // Meta description preference order:
    //   1. The first 155 chars of Mike's personal review when it exists —
    //      unique, voicey, and what a curious reader wants to see.
    //   2. The pin's curated `description`.
    //   3. A generic fallback so the meta tag never empties out.
    const description =
      clip(pin.personalReview, 155) ??
      clip(pin.description, 155) ??
      `${pin.name}${pin.cityNames[0] ? `, ${pin.cityNames[0]}` : ''}. Travel pin from a personal atlas.`;

    const url = `${SITE_URL}/pins/${pin.slug ?? pin.id}`;
    const image = pin.images[0]?.url ?? undefined;

    // Indexability: a content file can opt the page in via `indexable: true`
    // in its frontmatter. Either source flips noindex off — once you've
    // dropped a /content/pins/<slug>.md with the flag set, the page becomes
    // crawlable without touching the DB. The thinness gate is the *default*
    // — even with `indexable=false`, only thin pages get noindex now.
    //
    // Hotels are stricter. visited=true alone (set by parse-reservation
    // when a confirmation is imported) does not lift the gate; a hotel
    // page only gets indexed once the pin has a generated review on it.
    // The page itself still renders for anyone with the link, but search
    // engines stay out until there's real prose to read.
    // Pin indexability is now driven by the pin row itself (pin.indexable
    // flag + hotel-has-review rule + isThinPin heuristic for the rest).
    // The /content/pins/<slug>.md file source that used to override this
    // was deleted in the May 2026 plumbing pass (nothing was ever populated).
    const explicitIndexable = pin.indexable;
    let noindex: boolean;
    if (explicitIndexable) {
      noindex = false;
    } else if (pin.kind === 'hotel') {
      const hasReview = !!(pin.generatedReview && pin.generatedReview.trim());
      noindex = !hasReview;
    } else {
      noindex = isThinPin(pin, false);
    }

    // Long-tail-friendly title: "Pyramids of Egypt — review, hours, tickets".
    const richTitle = pinPageTitle(pin);

    return {
      title: richTitle,
      description,
      alternates: { canonical: url },
      robots: noindex ? { index: false, follow: true } : undefined,
      openGraph: {
        type: 'article',
        url,
        title: `${richTitle} · Mike Lee`,
        description,
        ...(image ? { images: [{ url: image }] } : {}),
      },
      twitter: {
        card: 'summary_large_image',
        title: `${richTitle} · Mike Lee`,
        description,
        ...(image ? { images: [image] } : {}),
      },
    };
  } catch (err) {
    console.error('[pins/[slug] generateMetadata] failed:', err);
    return { title: 'Pin', robots: { index: false, follow: true } };
  }
}

export default async function PinPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const pin = await fetchPinBySlug(slug);
  if (!pin) notFound();

  // states_names[0] is, in practice, always the country in our data — Google
  // Places admin areas land at country level for international pins. Variable
  // stays named `country` for clarity at call sites.
  const country = pin.statesNames[0] ?? null;
  const cityName = pin.cityNames[0] ?? null;
  // Bbox query is a single Supabase round-trip with a server-side filter
  // (~7km box at equator, haversine ranking has slack at corners).
  const BBOX_DELTA = 0.07;
  // Wikipedia is intentionally NOT in this Promise.all — it's a third-party
  // call that gates first byte if it stalls (3s timeout cap, but cold cache
  // is still slow). We render the lede + extract via <Suspense> below so the
  // rest of the page streams without it.
  const [countryRecord, cityRecord, personalPhotos, bboxCandidates] = await Promise.all([
    country ? fetchCountryByName(country) : Promise.resolve(null),
    cityName ? fetchCityByName(cityName) : Promise.resolve(null),
    fetchPhotosForPin(pin.id),
    pin.lat != null && pin.lng != null
      ? fetchPinsInBbox(
          pin.lat - BBOX_DELTA, pin.lat + BBOX_DELTA,
          pin.lng - BBOX_DELTA, pin.lng + BBOX_DELTA,
          pin.id,
        )
      : Promise.resolve([] as Pin[]),
  ]);
  const citySlug = cityRecord?.slug ?? null;

  // Rank the bbox candidates by haversine distance and take the 4 nearest
  // inside the 5km soft radius. Empty array → the block hides entirely.
  const relatedPins = computeRelatedPins(pin, bboxCandidates);

  // Sibling hotels for the in-cluster cross-link strip on hotel detail
  // pages. Filter the same bbox pool to kind=hotel, sort by personal
  // rating then visited, take up to 3. The strip also surfaces a link
  // to the city's hotel hub (/cities/<slug>/hotels) regardless of
  // whether siblings exist — that hub page is the cluster anchor.
  const siblingHotels: Pin[] =
    pin.kind === 'hotel'
      ? bboxCandidates
          .filter(p => p.kind === 'hotel' && p.id !== pin.id)
          .sort((a, b) => {
            if (a.visited !== b.visited) return a.visited ? -1 : 1;
            const ra = a.personalRating ?? 0;
            const rb = b.personalRating ?? 0;
            if (ra !== rb) return rb - ra;
            return a.name.localeCompare(b.name);
          })
          .slice(0, 3)
      : [];
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

  // Dedupe + prefer real photography. Codex AI-illustrated posters are
  // fine as fallback hero art when nothing else exists — Mike treats
  // them as proper covers, not just card thumbnails — but we don't want
  // them sitting next to a real photo in the gallery. So: if any
  // non-codex image exists, drop the codex ones; otherwise let the
  // codex art through as the hero.
  const dedupedImages = pin.images.filter(
    (img, i, arr) =>
      img.url && arr.findIndex(x => x.url === img.url) === i,
  );
  const realImages = dedupedImages.filter(img => img.source !== 'codex-generated');
  const galleryImages = realImages.length > 0 ? realImages : dedupedImages;

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
  const isPark = pin.kind === 'park';
  const isTransit = pin.kind === 'transit';
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
  // Transit stops mostly don't have food / wifi / lockers either, but a
  // platform CAN have restrooms or covered shelter, so keep that subset.
  const amenityFacets = isHotel
    ? []
    : isTransit
      ? [
          pin.restrooms ? RESTROOMS_FACET[pin.restrooms] : null,
          pin.shade ? SHADE_FACET[pin.shade] : null,
          pin.indoorOutdoor ? INDOOR_FACET[pin.indoorOutdoor] : null,
        ].filter((f): f is { label: string; icon: string } => Boolean(f))
      : [
          pin.foodOnSite ? FOOD_FACET[pin.foodOnSite] : null,
          pin.restrooms ? RESTROOMS_FACET[pin.restrooms] : null,
          pin.waterRefill ? { label: 'Water refill available', icon: 'droplet' } : null,
          pin.wifi ? { label: 'Wi-Fi available', icon: 'wifi' } : null,
          pin.lockers ? { label: 'Lockers available', icon: 'package' } : null,
          pin.shade ? SHADE_FACET[pin.shade] : null,
          pin.indoorOutdoor ? INDOOR_FACET[pin.indoorOutdoor] : null,
        ].filter((f): f is { label: string; icon: string } => Boolean(f));

  const hasGettingThere = Boolean(pin.address || pin.phone || pin.nearestTransit || pin.parking || pin.accessNotes);

  // Good-to-know is mostly irrelevant for hotels (the personal review
  // carries the relevant detail) and for transit (a tram stop doesn't
  // have a dress code or kid-friendly rating). For parks we keep the
  // full set because difficulty / pet-friendly / stroller / kid all
  // matter for "can I do this with my crew today" planning.
  const goodToKnowFacets = isHotel || isTransit
    ? []
    : [
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

  const hasGoodToKnow = !isHotel && !isTransit && Boolean(
    goodToKnowFacets.length || pin.dressCode || pin.safetyNotes || pin.scamWarning ||
    pin.languagesOffered.length || pin.minAgeRecommended != null,
  );

  const sourceLinks = buildSourceLinks(pin);
  const enrichmentSource = enrichmentSourceLabel(pin.enrichmentSourceType);
  const enrichmentChecked = formatSourceDate(pin.enrichmentCheckedAt);

  return (
    <article className="max-w-page mx-auto px-5 py-8">
      <JsonLd
        data={pinJsonLd({
          slug: pin.slug ?? pin.id,
          name: pin.name,
          kind: pin.kind,
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
          phone: pin.phone,
          cuisine: pin.cuisine,
          priceTier: pin.priceTier,
          priceLevel: pin.priceLevel,
          pricePerPersonUsd: pin.pricePerPersonUsd,
          roomPricePerNight: pin.roomPricePerNight,
          roomPriceCurrency: pin.roomPriceCurrency,
          googleRating: pin.googleRating,
          googleRatingCount: pin.googleRatingCount,
        })}
      />
      <JsonLd data={breadcrumbJsonLd(breadcrumbs)} />
      {(() => {
        const faq = pinFaqJsonLd(pin, `${SITE_URL}/pins/${pin.slug ?? pin.id}`);
        return faq ? <JsonLd data={faq} /> : null;
      })()}

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

      {/* No small header thumbnail — the HeroGallery / HeroCollage block
          below renders the same image at full size. The thumbnail used to
          double up on mobile and add no information. */}
      <header className="border-b border-sand pb-5 flex gap-4 items-start">
        <div className="flex-1 min-w-0">
          {pin.lat != null && pin.lng != null && (
            <p className="text-label uppercase tracking-[0.18em] font-mono text-muted mb-1">
              {pin.lat.toFixed(4)}, {pin.lng.toFixed(4)}
            </p>
          )}
          <h1 className="text-h1 text-ink-deep leading-tight">{pin.name}</h1>
          {/* Lede: location only. The Wikipedia short description used to
              also land here, but it loaded on the critical path and
              flickered into the SubLine on cold renders. The richer
              context lives in the streamed "From Wikipedia" section
              below. */}
          {placeText && (
            <p className="mt-2 text-prose text-slate leading-snug">{placeText}</p>
          )}
          <PinHeaderChips pin={pin} />
        </div>
      </header>

      {/* Hero collage — combines personal photos + curated gallery
          images. Falls through to HeroGallery when the pin has curated
          heroPhotoUrls picks, otherwise HeroCollage auto-arranges the
          dedup'd personal+gallery pool. Returns null when no images
          exist. See components/pin/PinDetailSections.tsx → PinHero. */}
      <PinHero pin={pin} personalPhotos={personalPhotos} galleryImages={galleryImages} />

      {/* Admin-only inline edit link, opt in via ?admin=1 so the URL
          stays bookmarkable without surfacing the link to drive-by
          visitors. Rendered client-side so the page itself stays
          ISR-friendly. The /admin/* path is still gated by basic auth. */}
      <AdminEditLink href={`/admin/pins/${pin.id}`} />

      {/* Primary CTAs — Directions, Book/Reserve/Tickets, Website, Call.
          Industry pattern (Google Maps, Apple Maps, Airbnb, Atlas Obscura
          all surface this row near the top of the place card). Replaces
          the right-rail "Plan a visit" card so the rail can carry pure
          reference data without competing for visual weight. Buttons
          render in priority order; the first available action is the
          teal primary, the rest are outline secondaries. */}
      <PinActionBar
        candidates={[
          { href: pin.googleMapsUrl, label: 'Directions', variant: 'directions', campaign: 'google-maps' },
          // Pick whichever booking-class CTA exists in kind-priority order
          // so we don't render two competing tickets buttons.
          pin.bookingUrl
            ? {
                href: pin.bookingUrl,
                label:
                  isHotel
                    ? 'Book a room'
                    : isRestaurant
                    ? 'Reserve a table'
                    : isPark
                    ? 'Buy entry'
                    : isTransit
                    ? 'Buy tickets'
                    : 'Book tickets',
                variant: 'book',
                campaign: 'booking',
              }
            : pin.officialTicketUrl
            ? { href: pin.officialTicketUrl, label: 'Buy tickets', variant: 'tickets', campaign: 'official-tickets' }
            : { href: null, label: '', variant: 'tickets', campaign: 'noop' },
          { href: pin.website, label: 'Website', variant: 'website', campaign: 'official-website' },
          { href: pin.phone, label: 'Call', variant: 'phone', campaign: 'phone' },
        ]}
      />

      <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-10 mt-8">
        <div className="min-w-0">
          {/* Personal review leads — sits first in the main column so Mike's
              voice is the first thing readers see, right under the Visited
              mark + hero. Source-of-truth content (Wikipedia extract, source
              description, hand-written notes from /content/pins/<slug>.md)
              all land below it. Getting There moved out of the main column
              entirely into a card in the right rail. */}
          {pin.kind === 'hotel' && pin.generatedReview ? (
            <HotelReviewSection pin={pin} />
          ) : (
            <PersonalSection pin={pin} />
          )}


          <Suspense fallback={null}>
            <WikipediaSection wikipediaUrl={pin.wikipediaUrl} />
          </Suspense>

          {pin.description && (
            // Collapsed by default since this is the upstream description
            // (Google / Wikidata / curated source) and is often long,
            // technical, or repeats what's already in Mike's review +
            // the Wikipedia extract above. Click to expand.
            <details className="mt-8 pt-8 border-t border-sand group">
              <summary className="cursor-pointer list-none flex items-center justify-between gap-3">
                <h2 className="text-h2 text-ink-deep">From the source</h2>
                <span
                  aria-hidden
                  className="text-muted text-small inline-flex items-center gap-1 group-open:rotate-180 transition-transform"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14">
                    <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                  </svg>
                </span>
              </summary>
              <p className="mt-4 text-ink leading-relaxed text-prose whitespace-pre-line">
                {pin.description}
              </p>
            </details>
          )}

          {hasPlanInfo && <PlanSection pin={pin} admissionLabel={admissionShortLabel(admission)} />}

          {/* Features &amp; amenities — consolidated section that
              replaced three parallel ones (What to expect / What to
              bring / Good to know). Each grouping renders only when it
              has content; the section as a whole hides when none of
              the three has anything to show. */}
          {(amenityFacets.length > 0 || pin.bring.length > 0 || hasGoodToKnow) && (
            <section className="mt-8 pt-8 border-t border-sand">
              <h2 className="text-h2 text-ink-deep mb-4">Features &amp; amenities</h2>
              <div className="space-y-6">
                {amenityFacets.length > 0 && (
                  <div>
                    <h3 className="text-small text-muted uppercase tracking-wider text-label mb-2">
                      What to expect
                    </h3>
                    <FacetGrid items={amenityFacets} />
                  </div>
                )}
                {pin.bring.length > 0 && (
                  <div>
                    <h3 className="text-small text-muted uppercase tracking-wider text-label mb-2">
                      What to bring
                    </h3>
                    <FacetGrid items={pin.bring.map(b => bringFacet(b))} />
                  </div>
                )}
                {hasGoodToKnow && (
                  <div>
                    <h3 className="text-small text-muted uppercase tracking-wider text-label mb-2">
                      Good to know
                    </h3>
                    <GoodToKnowContent pin={pin} facets={goodToKnowFacets} />
                  </div>
                )}
              </div>
            </section>
          )}

          {/* More photos — combined section that used to be two parallel
              ones ("Your photos" / "Gallery"). Personal photos lead under
              a sub-heading; sourced gallery images follow under their own
              sub-heading. The hero already pulled the first of each, so
              both grids start from slice(1). */}
          {(personalPhotos.length > 1 || galleryImages.length > 1) && (
            <section className="mt-8 pt-8 border-t border-sand">
              <h2 className="text-h2 text-ink-deep mb-4">More photos</h2>
              <div className="space-y-6">
                {personalPhotos.length > 1 && (
                  <div>
                    <h3 className="text-small text-muted uppercase tracking-wider text-label mb-2">
                      Personal
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {personalPhotos.slice(1).map(p => {
                        const altText = p.caption ?? `${pin.name} — personal photo`;
                        return (
                          <Lightbox
                            key={p.id}
                            src={p.url}
                            alt={altText}
                            width={p.width}
                            height={p.height}
                            className="block w-full aspect-square overflow-hidden rounded bg-cream-soft"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={thumbUrl(p.url, { size: 240 }) ?? p.url}
                              alt={altText}
                              loading="lazy"
                              decoding="async"
                              width={240}
                              height={240}
                              className="w-full h-full object-cover"
                            />
                          </Lightbox>
                        );
                      })}
                    </div>
                  </div>
                )}
                {galleryImages.length > 1 && (
                  <div>
                    <h3 className="text-small text-muted uppercase tracking-wider text-label mb-2">
                      From sources
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {galleryImages.slice(1).map((img, i) => {
                        const altText = `${pin.name} — image ${i + 2}`;
                        return (
                          <Lightbox
                            key={img.url + i}
                            src={img.url}
                            alt={altText}
                            width={img.width}
                            height={img.height}
                            className="block w-full aspect-square overflow-hidden rounded bg-cream-soft"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={thumbUrl(img.url, { size: 240 }) ?? img.url}
                              alt={altText}
                              loading="lazy"
                              decoding="async"
                              width={240}
                              height={240}
                              className="w-full h-full object-cover"
                            />
                          </Lightbox>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {pin.tags.length > 0 && (
            <section className="mt-8 pt-8 border-t border-sand">
              <h2 className="text-h2 text-ink-deep mb-4">Tags</h2>
              <div className="flex flex-wrap gap-1.5">
                {pin.tags.map(t => (
                  <span key={t} className="pill bg-cream-soft text-slate">{t}</span>
                ))}
              </div>
            </section>
          )}
        </div>

        <aside className="self-start md:sticky md:top-20 space-y-4">
          {/* The "Plan a visit / stay / meal" CTA card used to live here
              with Google-Maps + booking + website buttons. Those moved
              into PinActionBar near the top of the page (May 2026) so
              the rail now carries reference data exclusively. The same
              destinations are still present, just not duplicated. */}

          <div className="card p-5 text-small">
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
              {pin.cityNames[0] && (
                <Fact label="City">
                  {citySlug ? (
                    <Link href={`/cities/${citySlug}`} className="hover:text-teal">{pin.cityNames[0]}</Link>
                  ) : (
                    pin.cityNames[0]
                  )}
                </Fact>
              )}
              {/* Address is in the Getting There card below — not duplicated here. */}
              {pin.category && <Fact label="Category">{pin.category}</Fact>}
              {/* Price level — Google's 0–4 scale. Rendered in the Facts
                  card on every kind so the signal isn't trapped inside
                  the kind-specific "Mike's meal" section (which only
                  fires for restaurants). For restaurants without a
                  curated priceTier this surfaces alongside the meal
                  section's identical chip; redundant but consistent. */}
              {pin.priceLevel != null && pin.priceLevel > 0 && !pin.priceTier && (
                <Fact label="Price level">
                  <span
                    className="font-mono text-ink-deep tabular-nums"
                    title="Approximate price level from Google"
                  >
                    {'$'.repeat(Math.min(4, pin.priceLevel))}
                  </span>
                </Fact>
              )}
              {/* Google's user rating. Free signal in the Place Details
                  call we already pay for, distinct from Mike's curated
                  personalRating which leads the meal/stay/review
                  section. The "(N)" count gives 4.5 (8) vs 4.5 (8,431)
                  the calibration they need. Hidden when there are
                  fewer than 5 ratings — the average is too noisy to
                  show below that. */}
              {pin.googleRating != null &&
                pin.googleRatingCount != null &&
                pin.googleRatingCount >= 5 && (
                <Fact label="Google rating">
                  <span className="inline-flex items-baseline gap-1.5 tabular-nums">
                    <span className="text-ink-deep font-medium">
                      {pin.googleRating.toFixed(1)}
                    </span>
                    <span aria-hidden className="text-amber-500">★</span>
                    <span className="text-muted text-label">
                      ({Intl.NumberFormat('en').format(pin.googleRatingCount)})
                    </span>
                  </span>
                </Fact>
              )}
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

          {/* Getting there — moved out of the main column entirely. Address +
              transit + parking + access notes are reference data, not narrative,
              so they belong here in the rail with the other facts cards. The
              copy on the left is now free for the personal review and the
              kind-specific Plan / What to expect / Good to know sections. */}
          {hasGettingThere && (
            <div className="card p-5 text-small">
              <h3 className="text-muted uppercase tracking-wider text-label mb-3">Getting there</h3>
              <dl className="space-y-2.5">
                {pin.address && (
                  <div>
                    <dt className="text-muted text-label mb-0.5">Address</dt>
                    <dd className="text-ink-deep leading-snug">{pin.address}</dd>
                  </div>
                )}
                {pin.phone && (
                  <div>
                    <dt className="text-muted text-label mb-0.5">Phone</dt>
                    <dd className="text-ink-deep leading-snug">
                      {/* tel: link uses E.164 (no spaces / parens) so the
                          handset dialler picks it up cleanly on iOS / Android.
                          Display text keeps the human formatting Google
                          returned for readability. */}
                      <a
                        href={`tel:${pin.phone.replace(/[^+0-9]/g, '')}`}
                        className="text-teal hover:underline tabular-nums"
                      >
                        {pin.phone}
                      </a>
                    </dd>
                  </div>
                )}
                {pin.nearestTransit && (pin.nearestTransit.station || pin.nearestTransit.line) && (
                  <div>
                    <dt className="text-muted text-label mb-0.5">Nearest transit</dt>
                    <dd className="text-ink-deep leading-snug">
                      {pin.nearestTransit.station}
                      {pin.nearestTransit.line && (
                        <span className="text-muted"> · {pin.nearestTransit.line}</span>
                      )}
                      {typeof pin.nearestTransit.walking_minutes === 'number' && (
                        <span className="text-muted"> · {pin.nearestTransit.walking_minutes} min walk</span>
                      )}
                    </dd>
                  </div>
                )}
                {pin.parking && (
                  <div>
                    <dt className="text-muted text-label mb-0.5">Parking</dt>
                    <dd className="text-ink-deep leading-snug">{PARKING_FACET[pin.parking].label}</dd>
                  </div>
                )}
                {pin.accessNotes && (
                  <div>
                    <dt className="text-muted text-label mb-0.5">Notes</dt>
                    <dd className="text-ink leading-relaxed">{pin.accessNotes}</dd>
                  </div>
                )}
              </dl>
            </div>
          )}

          {sourceLinks.length > 0 && (
            <div className="card p-5 text-small">
              <h3 className="text-muted uppercase tracking-wider text-label mb-3">Sources</h3>
              <ul className="space-y-1.5">
                {sourceLinks.map(link => (
                  <li key={`${link.label}-${link.href}`}>
                    <a
                      href={withUtm(link.href, { medium: 'pin-detail-source', campaign: link.campaign })}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-teal hover:underline"
                    >
                      {link.label} →
                    </a>
                  </li>
                ))}
              </ul>
              {enrichmentSource && enrichmentChecked && (
                <p className="mt-3 text-label text-muted leading-relaxed">
                  {enrichmentSource} checked {enrichmentChecked}.
                </p>
              )}
              {pin.enrichmentConfidence && (
                <p className="mt-1 text-label text-muted leading-relaxed">
                  Confidence: {pin.enrichmentConfidence}.
                </p>
              )}
            </div>
          )}
        </aside>
      </div>

      {/* "More near here" — up to four nearest pins inside a 5 km radius.
          Renders only when this pin has coords AND there's at least one
          neighbour to surface. Improves crawl depth (Google has another
          path to follow) and gives travelers an obvious "what else is on
          this block?" affordance. */}
      {relatedPins.length > 0 && (
        <section className="mt-12 pt-8 border-t border-sand">
          <h2 className="text-h2 text-ink-deep mb-1">More near here</h2>
          <p className="text-prose text-muted mb-4">
            Other pins within walking distance of {pin.name}.
          </p>
          <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {relatedPins.map(r => (
              <li key={r.pin.id}>
                <Link
                  href={`/pins/${r.pin.slug ?? r.pin.id}`}
                  className="block card overflow-hidden hover:shadow-paper transition-shadow"
                >
                  {r.pin.images?.[0]?.url ? (
                    <div className="relative aspect-[4/3] bg-cream-soft overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={thumbUrl(r.pin.images[0].url, { size: 320 }) ?? r.pin.images[0].url}
                        alt=""
                        loading="lazy"
                        className="w-full h-full object-cover"
                      />
                      {r.pin.visited && (
                        <span className="absolute top-1.5 right-1.5 pill bg-teal text-white text-micro">
                          ✓
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="aspect-[4/3] bg-cream-soft border-b border-sand flex items-center justify-center text-muted text-micro uppercase tracking-wider">
                      No photo
                    </div>
                  )}
                  <div className="p-2.5">
                    <h3 className="text-ink-deep font-medium leading-tight truncate text-small">
                      {r.pin.name}
                    </h3>
                    <p className="mt-0.5 text-label text-muted tabular-nums">
                      {formatDistance(r.distanceKm)} away
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* "More hotels Mike has reviewed in <city>" — only on hotel
          detail pages, only when the pin has a known city. Compounds
          the city's hotel cluster: 3 sibling cards + a link to the
          dedicated /cities/<slug>/hotels hub. The hub page handles its
          own indexability gate (noindex below 3 hotels), so showing
          the link from a hotel detail page is safe regardless of how
          many siblings the bbox surfaced. */}
      {pin.kind === 'hotel' && cityName && citySlug && (siblingHotels.length > 0 || true) && (
        <section className="mt-12 pt-8 border-t border-sand">
          <h2 className="text-h2 text-ink-deep mb-1">More hotels in {cityName} I have reviewed</h2>
          <p className="text-prose text-muted mb-4">
            Other places in {cityName} I have actually slept at, with the same kind of room-and-breakfast notes you just read.
          </p>
          {siblingHotels.length > 0 && (
            <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {siblingHotels.map(h => (
                <li key={h.id}>
                  <Link
                    href={`/pins/${h.slug ?? h.id}`}
                    className="block card overflow-hidden hover:shadow-paper transition-shadow"
                  >
                    {h.images?.[0]?.url ? (
                      <div className="relative aspect-[4/3] bg-cream-soft overflow-hidden">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={thumbUrl(h.images[0].url, { size: 320 }) ?? h.images[0].url}
                          alt=""
                          loading="lazy"
                          className="w-full h-full object-cover"
                        />
                        {h.visited && (
                          <span className="absolute top-1.5 right-1.5 pill bg-teal text-white text-micro">
                            ✓
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="aspect-[4/3] bg-cream-soft border-b border-sand flex items-center justify-center text-muted text-micro uppercase tracking-wider">
                        No photo
                      </div>
                    )}
                    <div className="p-2.5">
                      <h3 className="text-ink-deep font-medium leading-tight truncate text-small">
                        {h.name}
                      </h3>
                      {h.personalRating != null && (
                        <p className="mt-0.5 text-label text-muted tabular-nums">
                          {h.personalRating}/5
                        </p>
                      )}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-prose">
            <Link
              href={`/cities/${citySlug}/hotels`}
              className="text-teal hover:underline"
            >
              See every hotel I have reviewed in {cityName} →
            </Link>
          </p>
        </section>
      )}
    </article>
  );
}
