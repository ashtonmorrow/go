import { fetchCountryBySlug, fetchCitiesByCountryId, fetchPageBlocks } from '@/lib/notion';
import { renderBlocks } from '@/lib/blocks';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import JsonLd from '@/components/JsonLd';
import { SITE_URL, clip, countryJsonLd, breadcrumbJsonLd } from '@/lib/seo';
import CurrencyWidget from '@/components/CurrencyWidget';
import AdvisoryBadge from '@/components/AdvisoryBadge';
import { visaPortal } from '@/lib/visaPortals';
import { fetchCountryFactByIso2, compactNumber, compactUsd, gdpPerCapita } from '@/lib/countryFacts';
import { readPlaceContent, paragraphs } from '@/lib/content';
import { thumbUrl, heroUrl } from '@/lib/imageUrl';
import { fetchCoverForCountry } from '@/lib/placeCovers';
import SavedListSection, { type SavedListPin } from '@/components/SavedListSection';
import PinPhotoMasonry from '@/components/PinPhotoMasonry';
import { fetchPinsForLists } from '@/lib/pins';
import { fetchPinPhotosForCountry } from '@/lib/personalPhotos';
import {
  fetchAllSavedListsMeta,
  listsMatchingPlace,
  listNameToSlug,
  snippet,
} from '@/lib/savedLists';
import type { Metadata } from 'next';

export const revalidate = 604800; // 7 days — bust via /api/revalidate when Notion/Supabase data changes

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const country = await fetchCountryBySlug(slug);
  if (!country) return { title: 'Not found' };

  // Description: lead with capital + practicalities, then Wikipedia lede if room.
  const practicalParts = [
    country.capital ? `Capital: ${country.capital}` : null,
    country.language ? country.language : null,
    country.currency ? country.currency : null,
  ].filter(Boolean) as string[];
  const lede = practicalParts.length
    ? `${country.name}. ${practicalParts.join('. ')}.`
    : `${country.name}. Travel notes and cities from a personal atlas.`;
  const description = clip(lede, 155);

  const url = `${SITE_URL}/countries/${country.slug}`;

  // Indexable iff /content/countries/<slug>.md exists with indexable:true.
  const fileContent = await readPlaceContent('countries', slug);

  return {
    title: country.name,
    description,
    alternates: { canonical: url },
    robots: fileContent?.indexable ? undefined : { index: false, follow: true },
    openGraph: {
      type: 'article',
      url,
      title: `${country.name} · Mike Lee`,
      description,
      ...(country.flag ? { images: [{ url: country.flag }] } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: `${country.name} · Mike Lee`,
      description,
      ...(country.flag ? { images: [country.flag] } : {}),
    },
  };
}

export default async function CountryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const country = await fetchCountryBySlug(slug);
  if (!country) notFound();

  // Read the local content file first; if present, skip the slow Notion
  // blocks fetch entirely (the file IS the prose now).
  const content = await readPlaceContent('countries', slug);

  // First pass — cheap fetches and the saved-list metadata we need to
  // compute matchedLists. Pin data is gated on the result: most countries
  // match at least one list (the country itself), but skipping fetchAllPins
  // entirely on a no-match render is the win we're after.
  const [cities, fact, blocks, fallbackCover, listsMeta, pinPhotos] = await Promise.all([
    fetchCitiesByCountryId(country.id),
    fetchCountryFactByIso2(country.iso2),
    content ? Promise.resolve([]) : fetchPageBlocks(country.id),
    fetchCoverForCountry(country.name),
    fetchAllSavedListsMeta(),
    // Photos from any pin in this country — joined server-side via
    // pins.states_names overlap. Larger limit than cities (36 vs 24)
    // since a country aggregates multiple cities' photos.
    fetchPinPhotosForCountry(country.name, 36),
  ]);

  // Saved-list cards. Match against the country name, slug, and every city
  // in the country (so the Spain page surfaces madrid/barcelona/alicante
  // lists). Then a single surgical Supabase query pulls only the pins on
  // those lists — replacing what used to be a 5k-pin walk per render.
  const allListNames = Array.from(listsMeta.keys());
  const cityNamesInCountry = cities.map(c => c.name);
  const matchedLists = listsMatchingPlace(allListNames, [
    country.name,
    slug,
    ...cityNamesInCountry,
  ]);
  const matchedSet = new Set(matchedLists);
  const countryPinsRaw = matchedLists.length === 0
    ? []
    : await fetchPinsForLists(matchedLists);
  const countryListPins: SavedListPin[] = countryPinsRaw
    .filter(p => p.savedLists?.some(l => matchedSet.has(l)))
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
      review: snippet(p.personalReview, 140),
      visitYear: p.visitYear,
      free: !!p.free,
      unesco: p.unescoId != null,
    }));
  // Pick a representative list — prefer one whose name exactly matches the
  // country name (so "spain" wins over "madrid" on the Spain country page).
  const exactCountryMatch = matchedLists.find(
    l => l.toLowerCase() === country.name.toLowerCase(),
  );
  const primaryListName = exactCountryMatch ?? matchedLists[0] ?? null;
  const primaryListMeta = primaryListName ? listsMeta.get(primaryListName) ?? null : null;
  const perCapita = fact ? gdpPerCapita(fact) : null;
  const hasBody = blocks.length > 0;

  // eVisa portal lookup. The portal map (lib/visaPortals.ts) is
  // the source of truth — many countries that take U.S. travellers via
  // eVisa don't say so explicitly in the Notion visaUs field, and we
  // don't want to gate the link on a fragile string match.
  const evisaUrl = visaPortal(country.iso2, country.name);
  const countrySourceLinks = [
    ['Travel.State.gov', 'https://travel.state.gov/content/travel/en/international-travel/International-Travel-Country-Information-Pages.html', 'Entry, safety, emergency, and advisory context for U.S. travelers.'],
    country.wikidataId ? ['Wikidata', `https://www.wikidata.org/wiki/${country.wikidataId}`, 'Country identifiers, baseline facts, and linked reference data.'] : null,
    country.wikipediaSummary ? ['Wikipedia', `https://en.wikipedia.org/wiki/${encodeURIComponent(country.name.replace(/ /g, '_'))}`, 'Public encyclopedia summary and context.'] : null,
    country.iso2 ? ['FlagCDN', `https://flagcdn.com/${country.iso2.toLowerCase()}.svg`, 'Country flag image fallback from ISO code.'] : null,
    evisaUrl ? ['Official eVisa portal', evisaUrl, 'Direct government application link where we have one recorded.'] : null,
    ['Exchange-rate feed', 'https://github.com/fawazahmed0/exchange-api', 'Currency-rate widget data.'],
  ].filter(Boolean) as [string, string, string][];

  // Structured data — Country + BreadcrumbList.
  const countryData = countryJsonLd({
    slug: country.slug,
    name: country.name,
    iso2: country.iso2,
    iso3: country.iso3,
    capital: country.capital,
    description: country.wikipediaSummary,
    image: country.flag,
  });
  const breadcrumbItems = [
    { name: 'Cities', item: `${SITE_URL}/cities` },
    { name: country.name },
  ];

  return (
    <article className="max-w-page mx-auto px-5 py-8">
      <JsonLd data={countryData} />
      <JsonLd data={breadcrumbJsonLd(breadcrumbItems)} />
      {/* Breadcrumb + persistent View switcher (no pill highlighted —
          this is a country detail page, not any of the four index views). */}
      <div className="mb-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="text-small text-muted">
          <Link href="/countries/cards" className="hover:text-teal">Countries</Link>
        </div>
      </div>

      <header className="flex items-center gap-5 flex-wrap">
        {country.flag && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbUrl(country.flag, { size: 80 }) ?? country.flag}
            alt={country.name}
            width={80}
            height={56}
            decoding="async"
            className="w-20 h-auto rounded border border-sand"
          />
        )}
        <div>
          <h1 className="text-h1 text-ink-deep">{country.name}</h1>
          {country.capital && <p className="text-slate mt-1">Capital: {country.capital}</p>}
          {/* Saved-list callout — surfaces matching list(s) up at the
              header so the curated places aren't buried under the
              country prose. Mirrors the same chip on /cities/[slug]. */}
          {primaryListName && countryListPins.length > 0 && (
            <Link
              href={`/lists/${listNameToSlug(primaryListName)}`}
              className="mt-3 pill bg-accent/10 text-accent border border-accent/20 inline-flex items-center gap-1.5 hover:bg-accent/15 transition-colors"
              title={`Mike's ${country.name} saved list — ${countryListPins.length} place${countryListPins.length === 1 ? '' : 's'}`}
            >
              <span aria-hidden>🗂️</span>
              <span>
                {country.name} list · {countryListPins.length} place
                {countryListPins.length === 1 ? '' : 's'}
              </span>
            </Link>
          )}
        </div>
      </header>

      {/* Cover hero from a pin in this country — only renders when at least
          one pin in the country has a personal photo attached. Country
          pages don't carry their own photo column, so the fallback chain
          is the entire source for this hero. */}
      {fallbackCover && (
        <figure className="mt-6 rounded overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={heroUrl(fallbackCover.url, 1200) ?? fallbackCover.url}
            alt={country.name}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            {...({ fetchpriority: 'high' } as any)}
            decoding="async"
            width={fallbackCover.width ?? 1200}
            height={fallbackCover.height ?? 800}
            className="w-full max-h-[60vh] object-cover"
          />
          <figcaption className="text-label text-muted px-1 mt-1">
            From a pin in {country.name}
          </figcaption>
        </figure>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-10 mt-8">
        <div className="md:col-span-2 min-w-0">
          {/* Personal-voice prose from /content/countries/<slug>.md, if present.
              Reads first; the Wikipedia summary follows for breadth. */}
          {content && (
            <section>
              {paragraphs(content.body).map((p, i) => (
                <p key={i} className={'text-ink leading-relaxed text-prose' + (i > 0 ? ' mt-4' : '')}>
                  {p}
                </p>
              ))}
            </section>
          )}

          {country.wikipediaSummary && (
            <section className={content ? 'mt-8 pt-8 border-t border-sand' : ''}>
              <h2 className="text-h2 text-ink-deep mb-4">About</h2>
              <p className="text-ink leading-relaxed">{country.wikipediaSummary}</p>
            </section>
          )}

          {hasBody && (
            <section className="mt-8 border-t border-sand pt-8 max-w-prose">
              <h2 className="text-h2 text-ink-deep mb-4">Notes</h2>
              {renderBlocks(blocks)}
            </section>
          )}

          <section className="mt-10">
            <h2 className="text-h2 text-ink-deep mb-4">Cities ({cities.length})</h2>
            <div className="flex flex-wrap gap-2">
              {cities.map(c => (
                <Link
                  key={c.id}
                  href={`/cities/${c.slug}`}
                  className={
                    'pill ' +
                    (c.been ? 'bg-teal/10 text-teal' : c.go ? 'bg-sky/20 text-slate' : 'bg-cream-soft')
                  }
                >
                  {c.name}
                </Link>
              ))}
            </div>
          </section>
        </div>

        {/* Sidebar — stacked cards: currency, advisory, eVisa, facts */}
        <aside className="self-start md:sticky md:top-20 space-y-4">
          {/* Live FX rate from fawazahmed0/currency-api (24 h ISR). */}
          <CurrencyWidget currency={country.currency} />

          {/* U.S. State Department travel advisory level. */}
          <AdvisoryBadge iso2={country.iso2} countryName={country.name} />

          {/* eVisa shortcut — direct link to the official portal. */}
          {evisaUrl && (
            <a
              href={evisaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="card p-5 block text-small hover:bg-cream-soft transition"
            >
              <div className="text-muted uppercase tracking-wider text-label">eVisa portal</div>
              <div className="mt-2 text-teal font-medium">Apply online →</div>
              <div className="mt-1 text-muted text-label truncate" title={evisaUrl}>
                {evisaUrl.replace(/^https?:\/\//, '').split('/')[0]}
              </div>
            </a>
          )}

          {/* Wikidata baselines — population, area, GDP, HDI, life
              expectancy. Only renders when at least one is non-null
              so the card doesn't appear empty for places without
              fact rows (e.g. small dependencies). data_year hint
              tells the reader how fresh the value is. */}
          {fact && (fact.population != null || fact.gdpNominalUsd != null || fact.hdi != null) && (
            <div className="card p-5 text-small">
              <h3 className="text-muted uppercase tracking-wider text-label">By the numbers</h3>
              <dl className="mt-3 space-y-2">
                {fact.population != null && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate">Population</dt>
                    <dd className="text-ink-deep tabular-nums">{compactNumber(fact.population)}</dd>
                  </div>
                )}
                {fact.areaKm2 != null && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate">Area</dt>
                    <dd className="text-ink-deep tabular-nums">
                      {compactNumber(fact.areaKm2)} km²
                    </dd>
                  </div>
                )}
                {fact.gdpNominalUsd != null && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate">GDP (nominal)</dt>
                    <dd className="text-ink-deep tabular-nums">{compactUsd(fact.gdpNominalUsd)}</dd>
                  </div>
                )}
                {perCapita != null && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate">GDP per capita</dt>
                    <dd className="text-ink-deep tabular-nums">
                      {compactUsd(Math.round(perCapita))}
                    </dd>
                  </div>
                )}
                {fact.hdi != null && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate">HDI</dt>
                    <dd className="text-ink-deep tabular-nums">{fact.hdi.toFixed(3)}</dd>
                  </div>
                )}
                {fact.lifeExpectancy != null && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate">Life expectancy</dt>
                    <dd className="text-ink-deep tabular-nums">{fact.lifeExpectancy.toFixed(1)} yr</dd>
                  </div>
                )}
              </dl>
              {fact.dataYear != null && (
                <p className="mt-2 text-muted text-micro">
                  Wikidata · most recent values circa {fact.dataYear}.
                </p>
              )}
            </div>
          )}

          <div className="card p-5 text-small">
            <h3 className="text-muted uppercase tracking-wider text-label">Travel</h3>
            <dl className="mt-3 space-y-2">
              {[
                ['Language', country.language],
                ['Currency', country.currency],
                ['Calling code', country.callingCode],
                ['Schengen', country.schengen ? 'Yes' : 'No'],
                ['Voltage', country.voltage],
                ['Plugs', country.plugTypes.length ? country.plugTypes.join(', ') : null],
                ['Tap water', country.tapWater],
                ['Emergency', country.emergencyNumber],
                ['Tipping', country.tipping],
                ['US visa', country.visaUs],
              ]
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k as string} className="flex justify-between gap-3">
                    <dt className="text-slate">{k}</dt>
                    <dd className="text-ink-deep text-right">{v}</dd>
                  </div>
                ))}
            </dl>
          </div>
        </aside>
      </div>

      {/* Photos from any pin in this country — full-bleed masonry of
          Mike's personal uploads, mixed orientations. Sits above the
          saved-list section so visiting a country page leads with what
          Mike actually shot there. Renders nothing for countries with
          no uploaded photos yet. */}
      {pinPhotos.length > 0 && (
        <section className="mt-12 border-t border-sand pt-8">
          <h2 className="text-h2 text-ink-deep mb-4">Photos from {country.name}</h2>
          <PinPhotoMasonry photos={pinPhotos} />
        </section>
      )}

      {/* Saved-list section — pins from any of Mike's saved lists that match
          this country or its cities. Renders nothing for countries with no
          curated lists yet. Caps at ~80 visible (page size 40 with one
          load-more) so country pages with hundreds of pins don't bloat. */}
      {countryListPins.length > 0 && primaryListName && (
        <SavedListSection
          title={`Saved on my ${country.name} lists`}
          listSlug={listNameToSlug(primaryListName)}
          googleShareUrl={primaryListMeta?.googleShareUrl ?? null}
          pins={countryListPins}
          pageSize={40}
        />
      )}

      <section className="mt-12 border-t border-sand pt-8">
        <h2 className="text-h2 text-ink-deep mb-4">Sources</h2>
        <p className="text-small text-slate max-w-prose">
          This page blends public reference data, travel-planning lookups, and personal atlas notes.
          Visa and entry rules move quickly, so treat the travel fields as planning prompts and verify before booking.
        </p>
        <ul className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-small">
          {countrySourceLinks.map(([label, href, note]) => (
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
    </article>
  );
}
