import Link from 'next/link';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { fetchPinBySlug, fetchPinsInBbox, type Pin, type PinOpeningHours, type PinHoursDetails } from '@/lib/pins';
import { fetchPhotosForPin } from '@/lib/personalPhotos';
import { fetchCountryByName, fetchCityByName } from '@/lib/notion';
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
import { SITE_URL, clip, breadcrumbJsonLd, pinJsonLd, pinPageTitle } from '@/lib/seo';
import { withUtm } from '@/lib/utm';
import { thumbUrl } from '@/lib/imageUrl';
import { readPlaceContent, paragraphs } from '@/lib/content';
import { listNameToSlug } from '@/lib/savedLists';
import Lightbox from '@/components/Lightbox';
import HeroCollage, { type CollageImage } from '@/components/HeroCollage';
import HeroGallery, { type GalleryImage } from '@/components/HeroGallery';
import AdminEditLink from '@/components/AdminEditLink';
import WikipediaAttribution from '@/components/WikipediaAttribution';
import {
  fetchHotelStaysForPin,
  formatStayPeriod,
  formatStayNights,
  formatStayPerNight,
  type HotelStay,
} from '@/lib/hotelStays';

// 7-day ISR — bust via /api/revalidate when the underlying pin or its
// content file changes. The admin edit affordance has moved into a
// client-side <AdminEditLink>, so reading searchParams here is no
// longer necessary — the page can finally be statically cached.
export const revalidate = 604800;

/** A pin is "thin" when there's nothing on the page that adds value beyond
 *  Wikipedia: not visited, no personal review, no curated list membership,
 *  no hours / price / admission detail. Those pages get noindex,follow so
 *  Google doesn't treat them as duplicate content while still crawling
 *  outward through their internal links. They stay in the sitemap so the
 *  bot picks them up automatically once richer data lands. */
function isThinPin(pin: Pin, hasFileContent: boolean): boolean {
  if (hasFileContent) return false; // editorial markdown lifts the floor
  if (pin.visited) return false;
  if (pin.personalReview && pin.personalReview.trim().length > 0) return false;
  if ((pin.lists?.length ?? 0) > 0) return false;
  if (pin.hours && pin.hours.trim().length > 0) return false;
  if (pin.priceAmount != null || pin.priceText) return false;
  if (pin.hoursDetails && Object.keys(pin.hoursDetails).length > 0) return false;
  if (pin.priceDetails && Object.keys(pin.priceDetails).length > 0) return false;
  return true;
}

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
    // page only gets indexed once at least one row in hotel_stays has a
    // generated review attached. The page itself still renders for
    // anyone with the link, but search engines stay out until there's
    // real prose to read.
    const fileContent = await readPlaceContent('pins', pin.slug ?? '');
    const explicitIndexable = fileContent?.indexable === true || pin.indexable;
    let noindex: boolean;
    if (explicitIndexable) {
      noindex = false;
    } else if (pin.kind === 'hotel') {
      const stays = await fetchHotelStaysForPin(pin.id);
      const hasReview = stays.some(
        s => !!(s.generatedReview && s.generatedReview.trim()),
      );
      noindex = !hasReview;
    } else {
      noindex = isThinPin(pin, !!fileContent);
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
  // Hotel stays are fetched unconditionally (the helper short-circuits if
  // the pin has no rows in hotel_stays); the cost is a single anon-keyed
  // Supabase query, cached for 24h.
  const [countryRecord, cityRecord, personalPhotos, content, bboxCandidates, hotelStays] = await Promise.all([
    country ? fetchCountryByName(country) : Promise.resolve(null),
    cityName ? fetchCityByName(cityName) : Promise.resolve(null),
    fetchPhotosForPin(pin.id),
    readPlaceContent('pins', pin.slug ?? ''),
    pin.lat != null && pin.lng != null
      ? fetchPinsInBbox(
          pin.lat - BBOX_DELTA, pin.lat + BBOX_DELTA,
          pin.lng - BBOX_DELTA, pin.lng + BBOX_DELTA,
          pin.id,
        )
      : Promise.resolve([] as Pin[]),
    pin.kind === 'hotel' ? fetchHotelStaysForPin(pin.id) : Promise.resolve([] as HotelStay[]),
  ]);
  const citySlug = cityRecord?.slug ?? null;

  // Rank the bbox candidates by haversine distance and take the 4 nearest
  // inside the 5km soft radius. Empty array → the block hides entirely.
  const relatedPins = computeRelatedPins(pin, bboxCandidates);
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
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            {pin.visited && (
              <span className="text-teal text-label uppercase tracking-wider font-medium inline-flex items-center gap-1.5">
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
                  atlasObscuraSlug: pin.atlasObscuraSlug,
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
          {/* Saved-list chips. A pin can be on Mike's "Cape Town" list,
              "Coffee shops" list, etc. — these are the curated buckets
              that surface as /lists/<slug>. We render them after curated
              lists (UNESCO etc.) since they're the lowest-tier signal but
              the highest-value cross-link: clicking lands on the full
              list, which is the natural next step after viewing one pin
              from it. */}
          {pin.savedLists.map(name => (
            <Link
              key={`sl-${name}`}
              href={`/lists/${listNameToSlug(name)}`}
              className="pill bg-cream-soft text-slate hover:bg-sand hover:text-ink-deep transition-colors inline-flex items-center gap-1.5"
              title={`On Mike's ${name} list`}
            >
              <span aria-hidden>🗂️</span>
              <span className="capitalize">{name}</span>
            </Link>
          ))}
          </div>
        </div>
      </header>

      {/* Hero collage — combines personal photos + curated gallery images.
          When only one image exists the collage falls through to the same
          single-tile letterbox the page used to render. Mike's personal
          photos lead the priority order so they land in the feature tile. */}
      {(((pin.heroPhotoUrls?.length ?? 0) > 0) || personalPhotos.length > 0 || galleryImages.length > 0) && (() => {
        // Curated path: Mike picked the heroes for this pin in admin.
        // Render via HeroGallery — every image at native aspect, no crop.
        // Defensive `?? []` so a stale unstable_cache entry from before the
        // heroPhotoUrls field existed doesn't crash the page render.
        const heroPicks = pin.heroPhotoUrls ?? [];
        if (heroPicks.length > 0) {
          const personalByUrl = new Map(personalPhotos.map(p => [p.url, p]));
          const galleryImagesCurated: GalleryImage[] = heroPicks.map(url => {
            const personal = personalByUrl.get(url);
            return {
              url,
              alt: pin.name,
              width: personal?.width ?? null,
              height: personal?.height ?? null,
              isPersonal: !!personal,
              caption: personal?.caption ?? null,
            };
          });
          return (
            <HeroGallery
              className="mt-6"
              images={galleryImagesCurated}
              title={pin.name}
            />
          );
        }
        // Fallback: existing auto-pick collage.
        const seen = new Set<string>();
        const collageImages: CollageImage[] = [];
        for (const p of personalPhotos) {
          if (seen.has(p.url)) continue;
          seen.add(p.url);
          collageImages.push({
            url: p.url,
            alt: pin.name,
            width: p.width,
            height: p.height,
            isPersonal: true,
            caption: p.caption ?? null,
          });
        }
        for (const img of galleryImages) {
          if (seen.has(img.url)) continue;
          seen.add(img.url);
          collageImages.push({
            url: img.url,
            alt: pin.name,
            width: null,
            height: null,
            isPersonal: false,
            caption: null,
          });
        }
        if (collageImages.length === 0) return null;
        return (
          <HeroCollage
            className="mt-6"
            images={collageImages}
            title={pin.name}
          />
        );
      })()}

      {/* Admin-only inline edit link, opt in via ?admin=1 so the URL
          stays bookmarkable without surfacing the link to drive-by
          visitors. Rendered client-side so the page itself stays
          ISR-friendly. The /admin/* path is still gated by basic auth. */}
      <AdminEditLink href={`/admin/pins/${pin.id}`} />


      <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-10 mt-8">
        <div className="min-w-0">
          {/* Personal review leads — sits first in the main column so Mike's
              voice is the first thing readers see, right under the Visited
              mark + hero. Source-of-truth content (Wikipedia extract, source
              description, hand-written notes from /content/pins/<slug>.md)
              all land below it. Getting There moved out of the main column
              entirely into a card in the right rail. */}
          {hotelStays.length > 0 ? (
            <HotelStaysSection stays={hotelStays} pinName={pin.name} />
          ) : (
            <PersonalSection pin={pin} />
          )}

          {/* Personal-voice notes from /content/pins/<slug>.md, when present —
              long-form companion to the short Google review above. */}
          {content && (
            <section className="mt-8 pt-8 border-t border-sand">
              {paragraphs(content.body).map((p, i) => (
                <p key={i} className={'text-ink leading-relaxed text-prose' + (i > 0 ? ' mt-4' : '')}>
                  {p}
                </p>
              ))}
            </section>
          )}

          <Suspense fallback={null}>
            <WikipediaSection wikipediaUrl={pin.wikipediaUrl} />
          </Suspense>

          {pin.description && (
            <section className="mt-8 pt-8 border-t border-sand">
              <h2 className="text-h2 text-ink-deep mb-4">From the source</h2>
              <p className="text-ink leading-relaxed text-prose whitespace-pre-line">{pin.description}</p>
            </section>
          )}

          {hasPlanInfo && <PlanSection pin={pin} admissionLabel={admissionShortLabel(admission)} />}

          {amenityFacets.length > 0 && (
            <section className="mt-8 pt-8 border-t border-sand">
              <h2 className="text-h2 text-ink-deep mb-4">What to expect</h2>
              <FacetGrid items={amenityFacets} />
            </section>
          )}

          {pin.bring.length > 0 && (
            <section className="mt-8 pt-8 border-t border-sand">
              <h2 className="text-h2 text-ink-deep mb-4">What to bring</h2>
              {/* Same FacetGrid render as "What to expect" so the two
                  sections feel consistent — two columns of bullet items
                  scan faster than a scattered chip wall. */}
              <FacetGrid items={pin.bring.map(b => bringFacet(b))} />
            </section>
          )}

          {hasGoodToKnow && <GoodToKnowSection pin={pin} facets={goodToKnowFacets} />}

          {personalPhotos.length > 1 && (
            <section className="mt-8 pt-8 border-t border-sand">
              <h2 className="text-h2 text-ink-deep mb-4">Your photos</h2>
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
            </section>
          )}

          {galleryImages.length > 1 && (
            <section className="mt-8 pt-8 border-t border-sand">
              <h2 className="text-h2 text-ink-deep mb-4">Gallery</h2>
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
          {/* Wikipedia thumbnail card removed: per the user's image-attribution
              policy (May 2026), Wikimedia images stay only on city/country/pin
              detail-page heroes where ImageCredit renders alongside them. The
              sidebar thumbnail was a non-hero render of a Wikipedia REST API
              image and got stripped along with city heroImage tiles, list
              covers, etc. The Wikipedia article is still linked from Sources. */}

          <div className="card p-5 space-y-3 text-small">
            <h3 className="text-muted uppercase tracking-wider text-label">
              {isHotel
                ? 'Plan a stay'
                : isRestaurant
                ? 'Plan a meal'
                : isPark
                ? 'When to go'
                : isTransit
                ? 'Use this stop'
                : 'Plan a visit'}
            </h3>

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
                {isHotel
                  ? 'Book a room →'
                  : isRestaurant
                  ? 'Reserve a table →'
                  : isPark
                  ? 'Buy entry →'
                  : isTransit
                  ? 'Buy tickets →'
                  : 'Book tickets →'}
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
    </article>
  );
}

// === Geo helpers ============================================================

/** Haversine-formula great-circle distance in kilometers. Cheap enough to
 *  call once per pin in a single render — the sort below dominates. */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Pick up to 4 nearest pins inside `radiusKm`. Skips the source pin and
 *  any pin without coords. Returned in ascending-distance order. */
function computeRelatedPins(
  source: Pin,
  candidates: Pin[],
  limit = 4,
  radiusKm = 5,
): { pin: Pin; distanceKm: number }[] {
  if (source.lat == null || source.lng == null) return [];
  const out: { pin: Pin; distanceKm: number }[] = [];
  for (const c of candidates) {
    if (c.id === source.id) continue;
    if (c.lat == null || c.lng == null) continue;
    // Cheap pre-filter on lat/lng box before the haversine — at the equator
    // 5 km is ~0.045°. Saves the trig call on the 99% of pins that are
    // far away.
    if (Math.abs(c.lat - source.lat) > 0.1) continue;
    if (Math.abs(c.lng - source.lng) > 0.1) continue;
    const d = haversineKm(source.lat, source.lng, c.lat, c.lng);
    if (d <= radiusKm) out.push({ pin: c, distanceKm: d });
  }
  out.sort((a, b) => a.distanceKm - b.distanceKm);
  return out.slice(0, limit);
}

/** Human-readable distance string. Keeps three significant figures so
 *  "0.42 km" / "1.2 km" / "4.8 km" all round naturally. Sub-100m gets
 *  rendered as meters for a more concrete sense of proximity. */
function formatDistance(km: number): string {
  if (km < 0.1) return `${Math.round(km * 1000)} m`;
  if (km < 1) return `${(km * 1000 / 100 | 0) * 100} m`;
  return `${km.toFixed(km < 10 ? 1 : 0)} km`;
}

type PinSourceLink = {
  label: string;
  href: string;
  campaign: string;
};

function buildSourceLinks(pin: Pin): PinSourceLink[] {
  const links: PinSourceLink[] = [];
  const seen = new Set<string>();
  const add = (label: string, href: string | null, campaign: string) => {
    if (!href) return;
    const key = href.replace(/\/$/, '');
    if (seen.has(key)) return;
    seen.add(key);
    links.push({ label, href, campaign });
  };

  const hasGoogleSource = !!pin.googlePlaceUrl || !!pin.enrichmentSourceType?.startsWith('google');
  add('Official website', pin.website, 'official-website');
  add(
    pin.enrichmentSourceType === 'google_places_place_details' ? 'Google Places' : 'Google Maps',
    hasGoogleSource ? (pin.googlePlaceUrl ?? pin.googleMapsUrl) : null,
    'google-maps',
  );
  add('Hours source', pin.hoursSourceUrl, 'hours-source');
  add('Pricing source', pin.priceSourceUrl, 'pricing-source');
  add('UNESCO', pin.unescoUrl, 'unesco');
  add('Wikipedia', pin.wikipediaUrl, 'wikipedia');
  add(pin.wikidataQid ? `Wikidata (${pin.wikidataQid})` : 'Wikidata', pin.wikidataUrl, 'wikidata');

  return links;
}

function enrichmentSourceLabel(sourceType: string | null): string | null {
  switch (sourceType) {
    case 'google_places_place_details':
      return 'Google Places data';
    case 'google-location-lookup':
      return 'Google location data';
    case 'wikidata':
      return 'Wikidata data';
    case 'manual':
      return 'Manual data';
    default:
      return sourceType ? `${sourceType.replace(/[-_]/g, ' ')} data` : null;
  }
}

function formatSourceDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function PlanSection({ pin, admissionLabel }: { pin: Pin; admissionLabel: string | null }) {
  // Hotels and restaurants get their own pricing in the kind-specific section
  // (room_price_per_night, etc.), so admission/cost is suppressed here.
  const isHotel = pin.kind === 'hotel';
  const isRestaurant = pin.kind === 'restaurant';
  const isPark = pin.kind === 'park';
  const isTransit = pin.kind === 'transit';
  const heading =
    isHotel ? 'Plan your stay' :
    isRestaurant ? 'Plan your meal' :
    isPark ? 'When to visit' :
    isTransit ? 'Using this stop' :
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
      <h2 className="text-h2 text-ink-deep mb-4">{heading}</h2>

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

// GettingThereSection used to be a main-column section. The address +
// transit + parking + access-notes content moved into a card on the right
// rail (see the aside in PinDetailPage), since reference data reads better
// alongside the Facts card than as a sibling of the personal review.

/** Hotel pin Stays section. The latest stay's generated review takes
 *  the lede slot (where PersonalSection would otherwise sit); older
 *  stays stack underneath with their own quarter+year, room, price,
 *  rating, and review body. Renders in /pins/[slug] only when the
 *  pin is kind=hotel AND has at least one row in hotel_stays. */
function HotelStaysSection({ stays, pinName }: { stays: HotelStay[]; pinName: string }) {
  if (stays.length === 0) return null;
  const [latest, ...older] = stays;
  return (
    <section>
      {/* Latest stay leads. Generated review is the page hero copy when
          present; the metadata strip (period, room type, rating, price)
          sits above it as a small eyebrow. */}
      <StayCard stay={latest} pinName={pinName} isLead />
      {older.length > 0 && (
        <div className="mt-10 pt-8 border-t border-sand">
          <h2 className="text-h2 text-ink-deep mb-4">Earlier stays</h2>
          <div className="space-y-8">
            {older.map(s => (
              <StayCard key={s.id} stay={s} pinName={pinName} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function StayCard({
  stay,
  pinName,
  isLead = false,
}: {
  stay: HotelStay;
  pinName: string;
  isLead?: boolean;
}) {
  const period = formatStayPeriod(stay);
  const nights = formatStayNights(stay);
  const price = formatStayPerNight(stay);
  const meta = [period, nights, stay.roomType, price]
    .filter((s): s is string => !!s && s.length > 0)
    .join(' · ');
  const ratingStars =
    stay.personalRating != null && stay.personalRating > 0
      ? '⭐'.repeat(Math.min(5, stay.personalRating))
      : null;
  return (
    <article>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-small text-muted">
        {meta && <span>{meta}</span>}
        {ratingStars && (
          <span aria-label={`${stay.personalRating} out of 5`} className="text-amber-500">
            {ratingStars}
          </span>
        )}
        {stay.bookingSource && (
          <span className="text-muted">· booked via {stay.bookingSource}</span>
        )}
      </div>
      {stay.generatedReview ? (
        <div className="mt-3 text-ink leading-relaxed text-prose whitespace-pre-line">
          {stay.generatedReview}
        </div>
      ) : (
        <p className="mt-3 text-prose text-muted italic">
          Notes from this stay haven&rsquo;t been written up yet.
        </p>
      )}
      {isLead && stay.wouldStayAgain != null && (
        <p className="mt-3 text-small text-slate">
          {stay.wouldStayAgain
            ? `Would stay at ${pinName} again.`
            : `Would not stay at ${pinName} again.`}
        </p>
      )}
    </article>
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
      pin.pricePerPersonUsd != null ||
      // Google's price_level is a kind-of-personal-pick fallback when the
      // restaurant doesn't have a curated priceTier yet — still worth
      // unlocking the meal section for it.
      (pin.priceLevel != null && pin.priceLevel > 0));

  if (!universal && !hasHotel && !hasMeal) return null;

  // Heading reads in the third person — "Your visit" was confusing for
  // every reader except Mike. The kind variants mirror the prior structure
  // (stay / meal / review) so the page still cues whether this is a hotel,
  // restaurant, or other place.
  const heading =
    pin.kind === 'hotel' ? "Mike's stay" :
    pin.kind === 'restaurant' ? "Mike's meal" :
    "Mike's review";

  return (
    // No top margin: this section now leads the main column directly under
    // the page header, so the grid's gap-10 already provides separation.
    <section className="rounded-xl border border-sand bg-cream-soft/60 p-5 sm:p-6 shadow-sm">
      <header className="flex items-center justify-between gap-3 mb-4">
        <h2 className="text-h3 text-ink-deep leading-tight">{heading}</h2>
        {pin.visitYear != null && (
          <span className="text-label uppercase tracking-wider text-muted">
            Visited {pin.visitYear}
          </span>
        )}
      </header>

      {universal && (pin.personalRating != null || pin.bestFor.length > 0 || pin.companions.length > 0) && (
        <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-small">
          {pin.personalRating != null && (
            // Emoji stars — brand-warmer and more vivid than the unicode
            // glyphs, which read pale against the ink-deep text. Filled
            // stars are ⭐, empty ones are ☆ in slate.
            <span
              aria-label={`${pin.personalRating} out of 5 stars`}
              className="inline-flex items-center text-base leading-none tabular-nums"
            >
              <span aria-hidden>{'⭐'.repeat(pin.personalRating)}</span>
              <span aria-hidden className="text-slate/40 ml-0.5">
                {'☆'.repeat(5 - pin.personalRating)}
              </span>
            </span>
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
          {(pin.priceTier || pin.pricePerPersonUsd != null || (pin.priceLevel != null && pin.priceLevel > 0)) && (
            <FactRow label="Price">
              <span className="inline-flex items-baseline gap-2">
                {pin.priceTier ? (
                  <span className="font-mono text-ink-deep tabular-nums">{pin.priceTier}</span>
                ) : pin.priceLevel != null && pin.priceLevel > 0 ? (
                  // Fallback: render Google's price_level (1-4) as the same
                  // $-$$$$ glyphs the curated priceTier uses. Marked with
                  // a muted tone so it visually reads as "approximate, from
                  // Google" rather than "Mike's pick".
                  <span
                    className="font-mono text-slate tabular-nums"
                    title="Approximate price level from Google"
                  >
                    {'$'.repeat(Math.min(4, pin.priceLevel))}
                  </span>
                ) : null}
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
        // Review text styled as a slightly-indented blockquote with an
        // accent left rule so it reads as Mike's voice, not generic prose.
        // whitespace-pre-line preserves the line breaks Google's takeout
        // includes between paragraphs.
        <blockquote className="text-prose text-ink leading-relaxed whitespace-pre-line border-l-2 border-accent/50 pl-4">
          {pin.personalReview}
        </blockquote>
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
      <h2 className="text-h2 text-ink-deep mb-4">Good to know</h2>

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
                  <dt className="w-12 text-micro uppercase tracking-wider flex-shrink-0">
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
              <dt className="w-12 text-micro uppercase tracking-wider flex-shrink-0">
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
            <dt className="w-12 text-micro uppercase tracking-wider flex-shrink-0">
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

/** Streamed Wikipedia block. Lives behind a <Suspense> on the main page so
 *  the rest of the article doesn't gate first byte on a third-party REST
 *  call. Returns null on cache miss + slow Wikipedia (the helper has its
 *  own 3s timeout) so the section is invisible rather than empty. */
async function WikipediaSection({ wikipediaUrl }: { wikipediaUrl: string | null }) {
  const wp = await fetchWikipediaSummary(titleFromWikipediaUrl(wikipediaUrl));
  if (!wp?.extract) return null;
  return (
    <section className="mt-8 pt-8 border-t border-sand">
      <h2 className="text-h2 text-ink-deep mb-4">From Wikipedia</h2>
      <p className="text-ink leading-relaxed text-prose">{wp.extract}</p>
      <a
        href={wp.url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-block text-small text-teal hover:underline"
      >
        Read more on Wikipedia →
      </a>
      <WikipediaAttribution title={wp.title} url={wp.url} />
    </section>
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

/** Auto-generate a FAQPage JSON-LD from whatever structured fields the pin
 *  has. Only emits when at least two answer-worthy facts exist (Google's
 *  rich-result threshold for FAQPage). The generated Q&A is invisible on
 *  the page itself — it lives in head as schema. Lets pin pages compete
 *  for "what time does X close" / "how much does X cost" / "is X
 *  wheelchair accessible" long-tail queries via the People Also Ask
 *  surface. */
function pinFaqJsonLd(pin: Pin, url: string): Record<string, unknown> | null {
  const faqs: { q: string; a: string }[] = [];

  if (pin.hours && pin.hours.trim().length > 4) {
    faqs.push({
      q: `What are the opening hours of ${pin.name}?`,
      a: pin.hours,
    });
  }

  if (pin.priceText) {
    faqs.push({
      q: `How much does it cost to visit ${pin.name}?`,
      a: pin.priceText,
    });
  } else if (pin.priceAmount != null && pin.priceCurrency) {
    faqs.push({
      q: `How much does it cost to visit ${pin.name}?`,
      a: pin.priceAmount === 0
        ? `${pin.name} is free to visit.`
        : `Approximately ${pin.priceCurrency} ${pin.priceAmount} per person.`,
    });
  } else if (pin.free === true || pin.freeToVisit === true) {
    faqs.push({
      q: `Is ${pin.name} free to visit?`,
      a: `Yes — ${pin.name} is free to visit.`,
    });
  }

  if (pin.bookingRequired === true || pin.booking === 'required') {
    faqs.push({
      q: `Do you need to book in advance for ${pin.name}?`,
      a: 'Yes — advance booking is required.',
    });
  } else if (pin.booking === 'recommended') {
    faqs.push({
      q: `Do you need to book in advance for ${pin.name}?`,
      a: 'Booking in advance is recommended, especially during peak season.',
    });
  } else if (pin.booking === 'timed-entry-only') {
    faqs.push({
      q: `Do you need to book in advance for ${pin.name}?`,
      a: 'Yes — entry is by timed-ticket only and must be booked in advance.',
    });
  }

  if (pin.dressCode && pin.dressCode.trim().length > 0) {
    faqs.push({
      q: `Is there a dress code at ${pin.name}?`,
      a: pin.dressCode,
    });
  }

  if (pin.requiresGuide === 'required') {
    faqs.push({
      q: `Do you need a guide to visit ${pin.name}?`,
      a: 'Yes — a guide is required to enter.',
    });
  } else if (pin.requiresGuide === 'recommended') {
    faqs.push({
      q: `Do you need a guide to visit ${pin.name}?`,
      a: 'A guide is recommended for context but not required.',
    });
  }

  if (pin.wheelchairAccessible === 'fully') {
    faqs.push({
      q: `Is ${pin.name} wheelchair accessible?`,
      a: `Yes — ${pin.name} is fully wheelchair accessible.`,
    });
  } else if (pin.wheelchairAccessible === 'partially') {
    faqs.push({
      q: `Is ${pin.name} wheelchair accessible?`,
      a: 'Partially. Some areas are accessible; others are not.',
    });
  } else if (pin.wheelchairAccessible === 'no') {
    faqs.push({
      q: `Is ${pin.name} wheelchair accessible?`,
      a: 'No — the site is not wheelchair accessible.',
    });
  }

  if (pin.kidFriendly === true) {
    faqs.push({
      q: `Is ${pin.name} kid-friendly?`,
      a: `Yes — ${pin.name} is suitable for visiting with kids.`,
    });
  } else if (pin.kidFriendly === false) {
    faqs.push({
      q: `Is ${pin.name} kid-friendly?`,
      a: 'Not recommended for young children.',
    });
  }

  if (pin.durationMinutes != null && pin.durationMinutes > 0) {
    const hours = Math.floor(pin.durationMinutes / 60);
    const mins = pin.durationMinutes % 60;
    const dur =
      hours > 0
        ? mins > 0
          ? `${hours} hour${hours === 1 ? '' : 's'} and ${mins} minutes`
          : `${hours} hour${hours === 1 ? '' : 's'}`
        : `${mins} minutes`;
    faqs.push({
      q: `How long should you spend at ${pin.name}?`,
      a: `Plan for around ${dur}.`,
    });
  }

  if (faqs.length < 2) return null;

  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    '@id': `${url}#faqs`,
    mainEntity: faqs.map(f => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: f.a,
      },
    })),
  };
}
