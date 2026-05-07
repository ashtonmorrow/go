import {
  fetchCityBySlug,
  fetchPageBlocks,
  fetchCountryById,
  fetchCitiesByIds,
} from '@/lib/notion';
import { renderBlocks } from '@/lib/blocks';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import JsonLd from '@/components/JsonLd';
import { SITE_URL, clip, cityJsonLd, breadcrumbJsonLd } from '@/lib/seo';
import MonthlyClimateChart from '@/components/MonthlyClimateChart';
import { fetchCityClimate } from '@/lib/cityClimate';
import { readPlaceContent, paragraphs } from '@/lib/content';
import { thumbUrl } from '@/lib/imageUrl';
import { fetchCoverForCity } from '@/lib/placeCovers';
import ImageCredit from '@/components/ImageCredit';
import HeroCollage, { type CollageImage } from '@/components/HeroCollage';
import HeroGallery, { type GalleryImage } from '@/components/HeroGallery';
import LiveClock from '@/components/LiveClock';
import SavedListSection, { type SavedListPin } from '@/components/SavedListSection';
import PinPhotoMasonry from '@/components/PinPhotoMasonry';
import { fetchPinsForLists } from '@/lib/pins';
import { fetchPinPhotosForCity } from '@/lib/personalPhotos';
import {
  fetchAllSavedListsMeta,
  listsMatchingPlace,
  listNameToSlug,
  snippet,
} from '@/lib/savedLists';
import type { Metadata } from 'next';

/** Slugify a place name the same way our atlas does, for capital-name → city
 *  link resolution. Lowercases, strips diacritics, replaces non-alphanumerics
 *  with hyphens. Most country capitals' city slugs follow this convention.
 *  Returns null for empty input so the caller can skip rendering the link. */
function slugifyCapital(name: string | null | undefined): string | null {
  if (!name) return null;
  const slug = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return slug || null;
}

// Dynamic per-request: searchParams.admin gates inline-edit affordances,
// and an ISR'd admin variant would leak edit links to the next visitor.
// Per-fetch caching still applies via unstable_cache wrappers in lib/
// so dropping ISR here doesn't turn the page into an N+1.
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  // generateMetadata runs above any route-segment error.tsx boundary,
  // so a throw here surfaces as the pages-router 500 fallback (no error
  // UI). Wrap defensively and log via Vercel runtime logs instead.
  try {
  const { slug } = await params;
  const city = await fetchCityBySlug(slug);
  if (!city) return { title: 'Not found' };

  // Description priority: curated `about` > Wikipedia summary > template.
  // The `about` field is the hand- or AI-curated travel-atlas blurb, which
  // is more on-voice than the Wikipedia lede. Both get clipped to 155.
  const description =
    clip(city.about, 155) ??
    clip(city.wikipediaSummary, 155) ??
    `${city.name}${city.country ? `, ${city.country}` : ''}. Population, climate, currency, language, travel notes.`;

  const url = `${SITE_URL}/cities/${city.slug}`;
  const image = city.personalPhoto ?? city.heroImage ?? undefined;

  // Pages with a /content/cities/<slug>.md become indexable; everything else
  // stays noindex by default to avoid bloating the search index with stub
  // pages that are essentially Wikipedia regurgitated.
  const fileContent = await readPlaceContent('cities', slug);

  return {
    title: city.name,
    description,
    alternates: { canonical: url },
    robots: fileContent?.indexable ? undefined : { index: false, follow: true },
    openGraph: {
      type: 'article',
      url,
      title: `${city.name} · Mike Lee`,
      description,
      ...(image ? { images: [{ url: image }] } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: `${city.name} · Mike Lee`,
      description,
      ...(image ? { images: [image] } : {}),
    },
  };
  } catch (err) {
    console.error('[cities/[slug] generateMetadata] failed:', err);
    return { title: 'City', robots: { index: false, follow: true } };
  }
}

export default async function CityPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ admin?: string }>;
}) {
  const adminMode = (await searchParams)?.admin === '1';
  const { slug } = await params;
  const city = await fetchCityBySlug(slug);
  if (!city) notFound();

  // Read the file-based content first — it's a fast disk read and lets us
  // decide whether to skip the slow Notion blocks fetch entirely. When a
  // content file exists, it IS the prose; the legacy Notion-blocks rendering
  // would just sit underneath it and we'd be paying 500ms-2s for nothing.
  const content = await readPlaceContent('cities', slug);

  // Fan everything else out in parallel. Each call is now a surgical query
  // (indexed lookup or filtered subset) — we used to call fetchAllCountries
  // + fetchAllCities here just to find one country and a handful of sister
  // cities, which shipped 1.5 MB of JSON for every cold render. Now we hit
  // exactly the rows we need.
  const needsCoverFallback = !city.personalPhoto && !city.heroImage;
  // First pass — everything that's cheap and unconditional. fetchAllSavedListsMeta
  // is needed up front to compute matchedLists, which gates the (potentially
  // expensive) pin query that follows.
  const [blocks, country, sisters, climate, fallbackCover, listsMeta, pinPhotos] = await Promise.all([
    !content && city.notionSyncedAt ? fetchPageBlocks(city.id) : Promise.resolve([]),
    city.countryPageId ? fetchCountryById(city.countryPageId) : Promise.resolve(null),
    city.sisterCities.length > 0 ? fetchCitiesByIds(city.sisterCities) : Promise.resolve([]),
    fetchCityClimate(city.lat, city.lng),
    needsCoverFallback ? fetchCoverForCity(city.name) : Promise.resolve(null),
    fetchAllSavedListsMeta(),
    // Personal photos that filter up from any pin in this city. Joined
    // server-side so we don't load all photos + filter client-side.
    fetchPinPhotosForCity(city.name, 24),
  ]);

  // Match the city's name/slug against saved-list names BEFORE fetching pins
  // — most cities have no matching list, so we skip the pin query entirely
  // for them. When there is a match, we fan out a surgical query keyed on
  // the matched list names instead of pulling the whole 5k-pin corpus.
  const allSavedListNames = Array.from(listsMeta.keys());
  const matchedLists = listsMatchingPlace(allSavedListNames, [city.name, slug]);
  const matchedSet = new Set(matchedLists);
  const cityPinsRaw = matchedLists.length === 0
    ? []
    : await fetchPinsForLists(matchedLists);

  // The Pin shape from fetchPinsForLists already has `saved_lists` populated;
  // we still filter to be safe (the OR predicate at the DB layer covers any
  // pin in any matched list, which is what we want, but the .some check
  // future-proofs against the helper expanding its predicate).
  const cityListPins: SavedListPin[] = cityPinsRaw
    .filter(p => p.savedLists?.some(l => matchedSet.has(l)))
    // Anchor to city AND country. City names collide across countries
    // (Manchester UK + NH, Salisbury UK + MD, etc.), so list-name
    // matching alone leaks foreign pins onto the page. Pin must be in
    // this exact city — and if the city's country is known, also in
    // that country — to render here.
    .filter(p => (p.cityNames ?? []).includes(city.name))
    .filter(p => !country?.name || (p.statesNames ?? []).includes(country.name))
    .sort((a, b) => {
      if (a.visited !== b.visited) return a.visited ? -1 : 1;
      return a.name.localeCompare(b.name);
    })
    .map(p => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      visited: p.visited,
      cover: p.images?.[0]?.url ?? null,
      city: p.cityNames?.[0] ?? null,
      country: p.statesNames?.[0] ?? null,
      rating: p.personalRating,
      // First sentence-or-two of the personal review — the snippet is the
      // click-bait that gets visitors into the pin detail page.
      review: snippet(p.personalReview, 140),
      visitYear: p.visitYear,
      kind: p.kind ?? null,
      priceTier: p.priceTier ?? null,
      free: !!p.free,
      unesco: p.unescoId != null,
    }));
  // Pick the saved-list metadata with the most members, prefer one with a
  // Google share URL set, so the "View live" link points at the most useful
  // collection when the city has multiple matching lists.
  const primaryListName = matchedLists
    .map(name => ({ name, meta: listsMeta.get(name) ?? null }))
    .sort((a, b) => {
      const aHasUrl = !!a.meta?.googleShareUrl;
      const bHasUrl = !!b.meta?.googleShareUrl;
      if (aHasUrl !== bHasUrl) return aHasUrl ? -1 : 1;
      return a.name.localeCompare(b.name);
    })[0]?.name ?? null;
  const primaryListMeta = primaryListName ? listsMeta.get(primaryListName) ?? null : null;
  const hasBody = blocks.length > 0;

  // Curated cities = ones I've been to or want to go to. The remaining
  // ~1,000 placeholder cities have AI-generated prose that isn't worth
  // showing — Wikipedia + raw facts are more honest signal there.
  const isCurated = city.been || city.go;

  const fmt = (n: number | null, unit = '', digits = 0) =>
    n == null ? '—' : (digits > 0 ? n.toFixed(digits) : Intl.NumberFormat('en').format(n)) + unit;
  const citySourceLinks = [
    city.wikipediaUrl ? ['Wikipedia', city.wikipediaUrl, 'Summary, canonical article, and some image fallbacks.'] : null,
    city.wikidataId ? ['Wikidata', `https://www.wikidata.org/wiki/${city.wikidataId}`, 'Population, area, image, coordinates, and linked identifiers where available.'] : null,
    city.lat != null && city.lng != null
      ? ['NASA POWER', `https://power.larc.nasa.gov/data-access-viewer/?start=1991&end=2020&latitude=${city.lat}&longitude=${city.lng}&community=ag`, 'Monthly temperature and rainfall climatology.']
      : null,
    city.lat != null && city.lng != null
      ? ['Open-Meteo historical weather', 'https://open-meteo.com/en/docs/historical-weather-api', '1991-2020 temperature and precipitation cross-check for compact climate fields.']
      : null,
    city.elevation != null && city.lat != null && city.lng != null
      ? ['Open-Elevation', 'https://open-elevation.com/', 'Coordinate-based elevation backfill.']
      : null,
    city.timeZone ? ['tz database', 'https://www.iana.org/time-zones', 'Coordinate-based IANA timezone lookup.'] : null,
    city.heroImageAttribution
      ? ['Hero image source', city.heroImageAttribution.sourceUrl, `${city.heroImageAttribution.license ?? 'License noted at source'}${city.heroImageAttribution.author ? `, ${city.heroImageAttribution.author}` : ''}.`]
      : null,
    city.cityFlagAttribution
      ? ['City flag source', city.cityFlagAttribution.sourceUrl, `${city.cityFlagAttribution.license ?? 'License noted at source'}${city.cityFlagAttribution.author ? `, ${city.cityFlagAttribution.author}` : ''}.`]
      : null,
  ].filter(Boolean) as [string, string, string][];

  // Structured data — City + BreadcrumbList. The breadcrumb gives Google
  // a clean trail to render in SERPs (Cities → Country → City).
  const cityData = cityJsonLd(
    {
      slug: city.slug,
      name: city.name,
      localName: city.localName,
      description: city.about ?? city.wikipediaSummary,
      image: city.personalPhoto ?? city.heroImage,
      lat: city.lat,
      lng: city.lng,
      population: city.population,
    },
    country ? { slug: country.slug, name: country.name } : null
  );
  const breadcrumbItems = [
    { name: 'Cities', item: `${SITE_URL}/cities` },
    ...(country
      ? [{ name: country.name, item: `${SITE_URL}/countries/${country.slug}` }]
      : []),
    { name: city.name },
  ];

  return (
    <article className="max-w-page mx-auto px-5 py-8">
      <JsonLd data={cityData} />
      <JsonLd data={breadcrumbJsonLd(breadcrumbItems)} />
      {/* Breadcrumbs + persistent View switcher (no pill highlighted —
          this is a detail page, not any of the four index views). */}
      <div className="mb-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="text-small text-muted">
          <Link href="/cities" className="hover:text-teal">Cities</Link>
          {country && <> <span> / </span>
            <Link href={`/countries/${country.slug}`} className="hover:text-teal">{country.name}</Link>
          </>}
        </div>
      </div>

      <header className="flex items-end gap-4 flex-wrap">
        <div>
          <h1 className="text-display text-ink-deep leading-none">{city.name}</h1>
          {city.localName && <p className="mt-2 text-h3 text-slate font-normal">{city.localName}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            {city.been && <span className="pill bg-teal/10 text-teal">Been</span>}
            {city.go && !city.been && <span className="pill bg-sky/20 text-slate">Go</span>}
            {country && <span className="pill">{country.name}</span>}
            {city.koppen && <span className="pill">{city.koppen}</span>}
            {/* Saved-list callout — when the city has a matching saved
                list, surface it in the header so visitors don't have to
                scroll past the city's prose to find the curated places.
                The same list also renders in full lower on the page; this
                chip is the click-target for "skip to the goods". */}
            {primaryListName && cityListPins.length > 0 && (
              <Link
                href={`/lists/${listNameToSlug(primaryListName)}`}
                className="pill bg-accent/10 text-accent border border-accent/20 inline-flex items-center gap-1.5 hover:bg-accent/15 transition-colors"
                title={`Mike's ${city.name} saved list — ${cityListPins.length} place${cityListPins.length === 1 ? '' : 's'}`}
              >
                <span aria-hidden>🗂️</span>
                <span>
                  {city.name} list · {cityListPins.length} place
                  {cityListPins.length === 1 ? '' : 's'}
                </span>
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Hero collage. Combines (in priority order):
            1. pinPhotos — Mike's personal photos from pins in this city
            2. city.personalPhoto — single curated cover for the city
            3. city.heroImage — Commons cover (curated landscape)
            4. fallbackCover — picked when no pinPhotos + no curated covers exist
          The collage component picks the feature tile and adapts the
          layout to the image count (1, 2, 3, 4, 5, 6+). When only one
          source is available it letterboxes object-contain like the
          old single-cover treatment. */}
      {(() => {
        // Curated path: when Mike has hand-picked hero photos for this city
        // in the admin panel, render them via HeroGallery — every image at
        // its native aspect ratio, no cropping. Falls back to HeroCollage's
        // auto-pick mosaic when no curation exists.
        // Defensive `?? []` — a stale cache entry from before the
        // heroPhotoUrls field existed would otherwise crash the page.
        const cityHeroPicks = city.heroPhotoUrls ?? [];
        if (cityHeroPicks.length > 0) {
          const meta = new Map(pinPhotos.map(p => [p.url, p]));
          const galleryImages: GalleryImage[] = cityHeroPicks.map(url => {
            const m = meta.get(url);
            return {
              url,
              alt: m?.pinName ?? city.name,
              width: m?.width ?? null,
              height: m?.height ?? null,
              isPersonal: !!m,
              caption: m?.caption ?? (m ? `From ${m.pinName}` : null),
            };
          });
          return (
            <HeroGallery
              className="mt-6"
              images={galleryImages}
              title={city.name}
              caption={`${galleryImages.length} hand-picked photo${galleryImages.length === 1 ? '' : 's'} of ${city.name}`}
            />
          );
        }

        const seen = new Set<string>();
        const collageImages: CollageImage[] = [];
        for (const p of pinPhotos) {
          if (seen.has(p.url)) continue;
          seen.add(p.url);
          collageImages.push({
            url: p.url,
            alt: p.pinName,
            width: p.width,
            height: p.height,
            isPersonal: true,
            caption: p.caption ?? `From ${p.pinName}`,
          });
        }
        if (city.personalPhoto && !seen.has(city.personalPhoto)) {
          seen.add(city.personalPhoto);
          collageImages.push({
            url: city.personalPhoto,
            alt: city.name,
            width: null,
            height: null,
            isPersonal: true,
          });
        }
        if (city.heroImage && !seen.has(city.heroImage)) {
          seen.add(city.heroImage);
          collageImages.push({
            url: city.heroImage,
            alt: city.name,
            width: null,
            height: null,
            isPersonal: false,
            caption: city.heroImageAttribution
              ? `Wikipedia / ${city.heroImageAttribution.author ?? 'Commons'}`
              : null,
          });
        }
        if (collageImages.length === 0 && fallbackCover && !seen.has(fallbackCover.url)) {
          collageImages.push({
            url: fallbackCover.url,
            alt: city.name,
            width: fallbackCover.width,
            height: fallbackCover.height,
            isPersonal: false,
            caption: `From a pin in ${city.name}`,
          });
        }
        if (collageImages.length === 0) return null;
        return (
          <>
            <HeroCollage
              className="mt-6"
              images={collageImages}
              title={city.name}
              caption={
                pinPhotos.length > 0
                  ? `${pinPhotos.length} photo${pinPhotos.length === 1 ? '' : 's'} from pins in ${city.name}`
                  : undefined
              }
            />
            {/* Commons attribution still surfaces below the collage when
                the heroImage made it in — license attribution belongs near
                the image, not behind a click. */}
            {city.heroImage && city.heroImageAttribution && (
              <ImageCredit
                attribution={city.heroImageAttribution}
                className="px-1 mt-1"
              />
            )}
          </>
        );
      })()}

      {adminMode && (
        <div className="mt-2 text-right">
          <Link
            href={`/admin/cities/${city.slug}`}
            className="text-small text-teal hover:underline"
          >
            Edit hero photos →
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-10 mt-8">
        {/* Main column */}
        <div className="md:col-span-2 min-w-0">
          {city.quote && (
            <blockquote className="border-l-4 border-teal pl-4 text-slate italic">{city.quote}</blockquote>
          )}

          {/* Personal-voice prose from /content/cities/<slug>.md, if present.
              Sits above Wikipedia so the page reads "what I think" first
              and "what the encyclopedia says" second. */}
          {content && (
            <section className={city.quote ? 'mt-6' : ''}>
              {paragraphs(content.body).map((p, i) => (
                <p key={i} className={'text-ink leading-relaxed text-prose' + (i > 0 ? ' mt-4' : '')}>
                  {p}
                </p>
              ))}
            </section>
          )}

          {city.wikipediaSummary && (
            <section className="mt-6">
              <h2 className="text-h2 text-ink-deep mb-4">About</h2>
              <p className="text-ink leading-relaxed">{city.wikipediaSummary}</p>
              {city.wikipediaUrl && (
                <a href={city.wikipediaUrl} target="_blank" rel="noopener noreferrer" className="text-small">
                  Wikipedia →
                </a>
              )}
            </section>
          )}

          {/* AI-curated travel prose only renders for cities I've actually
              been to or want to go to. Placeholder cities get Wikipedia +
              facts only — better to say less than to fake confidence. */}
          {isCurated && city.whyVisit && (
            <section className="mt-8">
              <h2 className="text-h2 text-ink-deep mb-4">Why visit</h2>
              <p className="text-ink leading-relaxed text-prose">{city.whyVisit}</p>
            </section>
          )}
          {isCurated && city.avoid && (
            <section className="mt-8">
              <h2 className="text-h2 text-ink-deep mb-4">When to avoid</h2>
              <p className="text-ink leading-relaxed text-prose">{city.avoid}</p>
            </section>
          )}

          {isCurated && (city.hotSeasonName || city.coldSeasonName) && (
            <section className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-5">
              {city.hotSeasonName && (
                <div>
                  <h3 className="text-ink-deep font-medium">{city.hotSeasonName}</h3>
                  {city.hotSeasonDescription && <p className="text-body text-slate mt-1">{city.hotSeasonDescription}</p>}
                </div>
              )}
              {city.coldSeasonName && (
                <div>
                  <h3 className="text-ink-deep font-medium">{city.coldSeasonName}</h3>
                  {city.coolerWetterSeason && <p className="text-body text-slate mt-1">{city.coolerWetterSeason}</p>}
                </div>
              )}
            </section>
          )}

          {/* NASA POWER monthly climatology — works for every city with
              coords, regardless of curation status. Pure data; safe. */}
          {climate && (
            <section className="mt-8">
              <h2 className="text-h2 text-ink-deep mb-4">Year-round climate</h2>
              <p className="text-prose text-slate mb-3">
                Monthly highs, lows, and rainfall (long-term averages, NASA POWER).
              </p>
              <MonthlyClimateChart data={climate} lat={city.lat} />
            </section>
          )}

          {hasBody && (
            <section className="mt-10 border-t border-sand pt-8">
              <h2 className="text-h2 text-ink-deep mb-4">Notes</h2>
              <div className="max-w-prose">{renderBlocks(blocks)}</div>
            </section>
          )}
        </div>

        {/* Sidebar facts */}
        <aside className="card p-5 text-small self-start md:sticky md:top-20">
          {/* Live clock at the top — replaces the static Time zone row in
              the Facts list below. Shows local hour:minute, weekday, and
              the IANA zone string. Renders nothing on the server to avoid
              a hydration mismatch. */}
          {city.timeZone && (
            <div className="pb-4 mb-4 border-b border-sand">
              <LiveClock timeZone={city.timeZone} />
            </div>
          )}

          <h3 className="text-muted uppercase tracking-wider text-label">Facts</h3>
          <dl className="mt-3 space-y-2">
            {[
              ['Population', fmt(city.population)],
              ['Area', fmt(city.area, ' km²', 0)],
              ['Elevation', fmt(city.elevation, ' m', 0)],
              ['Founded', city.founded || '—'],
              ['Demonym', city.demonym || '—'],
              ['Avg high', fmt(city.avgHigh, '°C', 1)],
              ['Avg low', fmt(city.avgLow, '°C', 1)],
              ['Rainfall', fmt(city.rainfall, ' mm/yr', 0)],
              ['Mayor', city.mayor || '—'],
              ['IATA', city.iataAirports || '—'],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3">
                <dt className="text-slate">{k}</dt>
                <dd className="text-ink-deep text-right">{v}</dd>
              </div>
            ))}
          </dl>

          {city.motto && (
            <p className="mt-4 text-slate italic text-small">"{city.motto}"</p>
          )}
          {city.nicknames && (
            <p className="mt-2 text-small text-slate">Also known as: {city.nicknames}</p>
          )}
          {country && (
            <div className="mt-4 pt-4 border-t border-sand flex items-center gap-3">
              {/* Whole flag + name unit links to the country page; capital
                  links separately to its own city page (slug derived from
                  the capital name — most capitals follow the lowercase-
                  hyphenated convention so the link resolves directly). */}
              <Link
                href={`/countries/${country.slug}`}
                className="flex items-center gap-3 hover:text-teal transition-colors"
                title={`Open ${country.name}`}
              >
                {country.flag && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={thumbUrl(country.flag, { size: 40 }) ?? country.flag}
                    alt={country.name}
                    width={40}
                    height={28}
                    loading="lazy"
                    decoding="async"
                    className="w-10 h-auto rounded"
                  />
                )}
                <span className="text-ink-deep font-medium hover:text-teal">
                  {country.name}
                </span>
              </Link>
              {country.capital && (() => {
                const capitalSlug = slugifyCapital(country.capital);
                return capitalSlug ? (
                  <Link
                    href={`/cities/${capitalSlug}`}
                    className="text-small text-slate hover:text-teal transition-colors"
                    title={`Open ${country.capital}`}
                  >
                    {country.capital}
                  </Link>
                ) : (
                  <span className="text-small text-slate">{country.capital}</span>
                );
              })()}
            </div>
          )}
          {city.myGooglePlaces && (
            <a
              href={city.myGooglePlaces}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 block text-small text-teal"
            >
              Open my saved places in Google Maps →
            </a>
          )}
        </aside>
      </div>

      {/* Photos from any pin in this city — full-bleed, mixed orientation,
          masonry. Personal photos surface up the hierarchy here so a city
          page actually feels like Mike's been there even before you scroll
          to the saved-list section. Renders nothing when there are no
          uploaded photos for the city's pins yet. */}
      {pinPhotos.length > 0 && (
        <section className="mt-12 border-t border-sand pt-8">
          <h2 className="text-h2 text-ink-deep mb-4">Photos from {city.name}</h2>
          <PinPhotoMasonry photos={pinPhotos} />
        </section>
      )}

      {sisters.length > 0 && (
        <section className="mt-12 border-t border-sand pt-8">
          <h2 className="text-h2 text-ink-deep mb-4">Sister cities</h2>
          <div className="flex flex-wrap gap-2">
            {sisters.map(s => (
              <Link key={s.id} href={`/cities/${s.slug}`} className="pill bg-cream-soft hover:bg-sand">
                {s.name}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Saved-list section — pins from any of Mike's saved lists that match
          this city's name. Renders nothing if the city has no matching list,
          so it only appears for places he's actively curated. */}
      {cityListPins.length > 0 && primaryListName && (
        <SavedListSection
          title={`Saved on my ${city.name} list`}
          listSlug={listNameToSlug(primaryListName)}
          googleShareUrl={primaryListMeta?.googleShareUrl ?? null}
          pins={cityListPins}
        />
      )}

      {citySourceLinks.length > 0 && (
        <section className="mt-12 border-t border-sand pt-8">
          <h2 className="text-h2 text-ink-deep mb-4">Sources</h2>
          <p className="text-prose text-slate max-w-prose">
            This page blends public reference data, climate/elevation services, and personal notes.
            Travel requirements can change, so visa and entry details should be checked again before booking.
          </p>
          <ul className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-small">
            {citySourceLinks.map(([label, href, note]) => (
              <li key={label} className="rounded border border-sand p-3 bg-cream-soft/40">
                <a href={href} target="_blank" rel="noopener noreferrer" className="text-teal font-medium">
                  {label} →
                </a>
                <p className="mt-1 text-muted">{note}</p>
              </li>
            ))}
            <li className="rounded border border-sand p-3 bg-cream-soft/40">
              <Link href="/credits" className="text-teal font-medium">Site credits →</Link>
              <p className="mt-1 text-muted">Global source notes, map tiles, flags, licenses, and attribution policy.</p>
            </li>
          </ul>
        </section>
      )}
    </article>
  );
}
