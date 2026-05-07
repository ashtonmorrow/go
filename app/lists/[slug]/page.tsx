import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { fetchPinsForLists } from '@/lib/pins';
import { fetchCityByName, fetchCountryByName } from '@/lib/notion';
import {
  listNameToSlug,
  slugToListName,
  fetchAllSavedListsMeta,
} from '@/lib/savedLists';
import SavedListSection, { type SavedListPin } from '@/components/SavedListSection';
import ListMapAndCards from '@/components/ListMapAndCardsLoader';
import JsonLd from '@/components/JsonLd';
import {
  SITE_URL,
  AUTHOR_ID,
  WEBSITE_ID,
  breadcrumbJsonLd,
  collectionJsonLd,
} from '@/lib/seo';
import { readPlaceContent, paragraphs } from '@/lib/content';
import KusttramRouteMap from '@/components/KusttramRouteMapLoader';

// === /lists/[slug] =========================================================
// Public list detail page. The dedicated home for one of Mike's saved lists.
// Pulls every pin whose savedLists[] array includes this list name and renders
// them as a rich card grid with a sort dropdown.
//
// What lives here that doesn't on the embedded city/country sections:
//   * Editorial intro from content/lists/<slug>.md (when present).
//   * Anchor link to a city / country whose name matches this list.
//   * Stats line (visited %, avg rating, # reviewed, free/UNESCO counts).
//   * Sort dropdown — defaults to "Reviewed first" so the most useful cards
//     surface immediately.
//
// SEO: Article schema (the editorial intro is the headline) plus
// CollectionPage / ItemList carrying every pin on the list. Each pin
// contributes a ListItem so search engines can read the membership directly.

type Props = { params: Promise<{ slug: string }> };

const KUSTTRAM_LIST_SLUG = 'kusttram-stations';
const ALICANTE_TRAM_LIST_SLUG = 'alicante-metro-stops';
const KUSTTRAM_OFFICIAL_STOP_COUNT = 67;
const KUSTTRAM_DESCRIPTION =
  "A personal station-pin index for Belgium's coastal tram, useful if you are already near the Flemish coast and want to ride a short section.";
const ALICANTE_TRAM_DESCRIPTION =
  "A personal station-pin index for using Alicante as a Costa Blanca tram base, from the city center toward El Campello, Benidorm, and the northern beaches.";

const KUSTTRAM_GUIDE_CARDS = [
  {
    title: 'Good base',
    body:
      'Oostende is the easy starting point because mainline trains meet the coast there and the tram is simple to use in pieces.',
  },
  {
    title: 'Good short ride',
    body:
      'Oostende to De Haan is the section I would start with: enough coastline to feel the idea, with a town at the end that makes sense on foot.',
  },
  {
    title: 'Keep going if',
    body:
      'The weather is decent, you are enjoying the ride, and you want more of the resort-town sequence toward Blankenberge or Knokke.',
  },
  {
    title: 'Skip it if',
    body:
      'You are not already nearby and do not care much about trams, public transport, or ordinary coastal towns.',
  },
] as const;

const KUSTTRAM_FAQS = [
  {
    question: 'Is the Kusttram worth a special trip?',
    answer:
      'Not for most travelers. It is more useful as an add-on if you are already near the Belgian coast, Bruges, Ghent, or Brussels and want an easy coastal day.',
  },
  {
    question: 'What is a good short section of the Kusttram?',
    answer:
      'I would start with Oostende to De Haan. It is easy to reach by train, gives you a real sample of the line, and ends somewhere pleasant to walk around.',
  },
  {
    question: 'Should I use this page as a timetable?',
    answer:
      'No. This page is an atlas index of station pins. Use De Lijn for current times, service changes, works, and ticket rules.',
  },
] as const;

const ALICANTE_TRAM_ROUTE_SEGMENTS = [
  [
    'luceros',
    'mercat',
    'marq-castillo',
    'sangueta',
    'la-isleta',
    'albufereta',
    'lucentum',
    'miriam-blasco',
    'sergio-cardell',
    'tridente',
    'el-campello',
    'poble-espanyol',
    'amerador',
    'coveta-fuma',
    'cala-piteres',
    'venta-lanuza',
    'paradis',
    'costera-pastor',
    'creueta',
    'hospital-vila',
    'c-c-la-marina-finestrat',
    'terra-mitica',
    'benidorm',
  ],
  [
    'luceros',
    'mercat',
    'marq-castillo',
    'la-goteta-plaza-mar-2',
    'bulevar-del-pla',
    'garbinet',
    'hospital',
    'maestro-alonso',
    'gaston-castello',
    'virgen-del-remedio',
    'ciutat-jardi',
    'santa-isabel',
    'universitat',
    'sant-vicent-del-raspeig',
  ],
  ['porta-del-mar', 'la-marina', 'sangueta'],
] as const;

const ALICANTE_TRAM_GUIDE_CARDS = [
  {
    title: 'Best first ride',
    body:
      'Ride north from the center toward El Campello. It gives you the practical point of the system without turning the day into a transport project.',
  },
  {
    title: 'Beach logic',
    body:
      'Use the tram to treat San Juan, El Campello, Coveta Fuma, and Cala Piteres as choices, not separate car trips.',
  },
  {
    title: 'Longer day',
    body:
      'Benidorm is the obvious long target. It is useful if you are curious about the coast, or if you want to transfer farther north.',
  },
  {
    title: 'Skip it if',
    body:
      'If you only have one short day in Alicante, stay in the center, walk up to the castle, and use Postiguet Beach instead.',
  },
] as const;

const ALICANTE_TRAM_FAQS = [
  {
    question: 'Why use the tram in Alicante?',
    answer:
      'The tram makes Alicante work as a coastal base. You can stay in the center and still reach northern beaches and towns without renting a car.',
  },
  {
    question: 'What is the easiest beach trip from Alicante by tram?',
    answer:
      'El Campello is the easiest first ride. It is far enough from the center to feel different, but simple enough for a half day.',
  },
  {
    question: 'Should I use this page as a timetable?',
    answer:
      "No. This page is an atlas index of station pins. Use TRAM d'Alacant or FGV for current times, works, transfers, and ticket rules.",
  },
] as const;

function isKusttramList(slug: string): boolean {
  return slug === KUSTTRAM_LIST_SLUG;
}

function isAlicanteTramList(slug: string): boolean {
  return slug === ALICANTE_TRAM_LIST_SLUG;
}

async function findList(slug: string) {
  // Resolve slug → list name. The metadata table holds every list name
  // (seeded after every saved-list import + create), so the common path
  // doesn't walk the pin corpus.
  const listsMeta = await fetchAllSavedListsMeta();
  const allNames = new Set<string>(listsMeta.keys());

  const candidate = slugToListName(slug);
  if (allNames.has(candidate)) return { name: candidate, listsMeta };
  for (const name of allNames) {
    if (listNameToSlug(name) === slug) return { name, listsMeta };
  }
  // Fallback: the meta table may have drifted out of sync with what's
  // referenced in pins.saved_lists (this happens when a Google Takeout
  // import lands new pins on a list that was never explicitly created
  // through admin, like "random saves" with 112 pins but no meta row).
  // Probe pins.saved_lists for the candidate name; if any pin actually
  // references this list, render the page and synthesize a meta entry
  // on the fly so downstream code (CTAs, descriptions, etc) can rely on
  // listsMeta.get() returning at least a stub.
  if (await pinsReferenceList(candidate)) {
    listsMeta.set(candidate, {
      name: candidate,
      googleShareUrl: null,
      description: null,
      coverPinId: null,
      coverPhotoId: null,
      coverPhotoUrl: null,
      pinOrder: [],
      updatedAt: null,
    });
    return { name: candidate, listsMeta };
  }
  return null;
}

/** Cheap server-side existence check: does any pin actually have this
 *  list name in its saved_lists array? Used as the fallback for slugs
 *  the meta table doesn't know about. Returns true on the first match
 *  via .limit(1) — never loads the full pin corpus. */
async function pinsReferenceList(name: string): Promise<boolean> {
  if (!name) return false;
  const { supabase } = await import('@/lib/supabase');
  const { data, error } = await supabase
    .from('pins')
    .select('id')
    .overlaps('saved_lists', [name])
    .limit(1);
  if (error) {
    console.error('[lists/[slug]] pinsReferenceList probe failed:', error);
    return false;
  }
  return (data?.length ?? 0) > 0;
}

export async function generateStaticParams() {
  // Returning an empty array opts out of build-time prerendering. Each
  // list page is rendered on first request and cached for `revalidate`
  // seconds afterward. We previously enumerated every list slug here,
  // but with the layout now static, Next started actually honoring it
  // and prerendered every list page at build time — fanning out the
  // full sidebar corpus + per-list pin queries concurrently and
  // overwhelming Supabase. On-demand ISR scales much more gracefully:
  // only slugs that actually get traffic ever fetch, and unstable_cache
  // smooths the burst.
  return [];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const found = await findList(slug);
  if (!found) return { title: 'List not found' };
  const title = isAlicanteTramList(slug)
    ? 'Alicante Tram Stops'
    : found.name.replace(/\b\w/g, c => c.toUpperCase());
  const url = `${SITE_URL}/lists/${slug}`;
  const meta = found.listsMeta.get(found.name) ?? null;
  // Prefer the metadata description for the meta tag — it's the curator's
  // own framing. Fall back to a generic line so we never ship an empty.
  const description =
    isKusttramList(slug)
      ? KUSTTRAM_DESCRIPTION
      : isAlicanteTramList(slug)
      ? ALICANTE_TRAM_DESCRIPTION
      : meta?.description ??
    `Pins on Mike's ${title} list — curated travel saves, mirrored from Google Maps with personal reviews.`;
  return {
    title,
    description,
    alternates: { canonical: `/lists/${slug}` },
    openGraph: {
      title,
      description,
      type: 'website',
      url,
    },
  };
}

export const revalidate = 3600;

/** Truncate a personal-review snippet to roughly the first sentence-or-two so
 *  it fits two lines in a card without running long. The card itself
 *  line-clamps; this just trims the payload so we don't ship 800-character
 *  reviews to every card on a 184-pin Barcelona list. */
function reviewSnippet(text: string | null, max = 140): string | null {
  if (!text) return null;
  const t = text.trim();
  if (!t) return null;
  if (t.length <= max) return t;
  // Try to break at the first sentence boundary, otherwise word boundary.
  const sentence = t.slice(0, max).match(/^.+?[.!?](?=\s|$)/);
  if (sentence) return sentence[0];
  const cut = t.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max - 30 ? cut.slice(0, lastSpace) : cut).trim() + '…';
}

function pinUrl(pin: Pick<SavedListPin, 'id' | 'slug'>): string {
  return `${SITE_URL}/pins/${pin.slug ?? pin.id}`;
}

function kusttramCollectionJsonLd(url: string, pins: SavedListPin[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': url,
    url,
    name: 'Kusttram Stations',
    description: KUSTTRAM_DESCRIPTION,
    isPartOf: { '@id': WEBSITE_ID },
    about: [
      { '@type': 'Thing', name: 'Kusttram' },
      { '@type': 'Place', name: 'Belgian coast' },
      { '@type': 'Country', name: 'Belgium' },
    ],
    mainEntity: {
      '@type': 'ItemList',
      name: 'Kusttram station pins in this atlas',
      description:
        "Station pins for Belgium's coastal tram, linked to individual pin pages in Mike Lee's travel atlas.",
      numberOfItems: pins.length,
      itemListOrder: 'https://schema.org/ItemListOrderAscending',
      itemListElement: pins.map((pin, i) => {
        const url = pinUrl(pin);
        return {
          '@type': 'ListItem',
          position: i + 1,
          url,
          item: {
            '@type': 'Place',
            '@id': url,
            url,
            name: pin.name,
            description: `${pin.name} station pin on Mike's Kusttram Stations list.`,
            address: {
              '@type': 'PostalAddress',
              ...(pin.city ? { addressLocality: pin.city } : {}),
              addressCountry: pin.country ?? 'Belgium',
            },
            ...(pin.lat != null && pin.lng != null
              ? {
                  geo: {
                    '@type': 'GeoCoordinates',
                    latitude: pin.lat,
                    longitude: pin.lng,
                  },
                }
              : {}),
          },
        };
      }),
    },
  };
}

function kusttramFaqJsonLd(url: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    '@id': `${url}#quick-answers`,
    mainEntity: KUSTTRAM_FAQS.map(faq => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };
}

function alicanteTramCollectionJsonLd(url: string, pins: SavedListPin[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': url,
    url,
    name: 'Alicante Tram Stops',
    description: ALICANTE_TRAM_DESCRIPTION,
    isPartOf: { '@id': WEBSITE_ID },
    about: [
      { '@type': 'Thing', name: "TRAM d'Alacant" },
      { '@type': 'Place', name: 'Alicante' },
      { '@type': 'Place', name: 'Costa Blanca' },
      { '@type': 'Country', name: 'Spain' },
    ],
    mainEntity: {
      '@type': 'ItemList',
      name: "TRAM d'Alacant station pins in this atlas",
      description:
        "Station pins for using Alicante's tram network as a practical Costa Blanca beach and day-trip tool.",
      numberOfItems: pins.length,
      itemListOrder: 'https://schema.org/ItemListOrderAscending',
      itemListElement: pins.map((pin, i) => {
        const url = pinUrl(pin);
        return {
          '@type': 'ListItem',
          position: i + 1,
          url,
          item: {
            '@type': 'Place',
            '@id': url,
            url,
            name: pin.name,
            description: `${pin.name} station pin on Mike's Alicante Tram Stops list.`,
            address: {
              '@type': 'PostalAddress',
              ...(pin.city ? { addressLocality: pin.city } : {}),
              addressCountry: pin.country ?? 'Spain',
            },
            ...(pin.lat != null && pin.lng != null
              ? {
                  geo: {
                    '@type': 'GeoCoordinates',
                    latitude: pin.lat,
                    longitude: pin.lng,
                  },
                }
              : {}),
          },
        };
      }),
    },
  };
}

function alicanteTramFaqJsonLd(url: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    '@id': `${url}#quick-answers`,
    mainEntity: ALICANTE_TRAM_FAQS.map(faq => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };
}

function KusttramListGuide({
  stationCount,
  pins,
}: {
  stationCount: number;
  pins: SavedListPin[];
}) {
  return (
    <section className="mt-5 rounded-lg border border-sand bg-cream-soft/60 p-5">
      <div className="max-w-prose">
        <h2 className="text-h2 text-ink-deep">How I would use this list</h2>
        <p className="mt-3 text-prose leading-relaxed text-ink">
          This is a working list, not a challenge to ride every stop. De Lijn
          describes the Kusttram as serving {KUSTTRAM_OFFICIAL_STOP_COUNT}{' '}
          stops; this atlas currently has {stationCount} station pins. That is
          enough to browse the coast, pick a section, and link through to the
          places that are already in the atlas.
        </p>
      </div>

      <KusttramRouteMap pins={pins} />

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {KUSTTRAM_GUIDE_CARDS.map(card => (
          <div key={card.title} className="rounded border border-sand bg-white p-4">
            <h3 className="text-h3 text-ink-deep">{card.title}</h3>
            <p className="mt-2 text-small leading-relaxed text-slate">
              {card.body}
            </p>
          </div>
        ))}
      </div>

      <div id="quick-answers" className="mt-6 max-w-prose">
        <h2 className="text-h2 text-ink-deep">Quick answers</h2>
        <dl className="mt-3 space-y-4">
          {KUSTTRAM_FAQS.map(faq => (
            <div key={faq.question}>
              <dt className="font-semibold text-ink-deep">{faq.question}</dt>
              <dd className="mt-1 text-prose leading-relaxed text-ink">
                {faq.answer}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

function AlicanteTramListGuide({
  stationCount,
  pins,
}: {
  stationCount: number;
  pins: SavedListPin[];
}) {
  return (
    <section className="mt-5 rounded-lg border border-sand bg-cream-soft/60 p-5">
      <div className="max-w-prose">
        <h2 className="text-h2 text-ink-deep">
          How I would use the Alicante tram
        </h2>
        <p className="mt-3 text-prose leading-relaxed text-ink">
          The tram is one reason Alicante works better as a base than it looks
          on the map. You can stay near the old town, Postiguet, or the rail
          station, then ride north to wider beaches and smaller coastal stops
          without renting a car.
        </p>
        <p className="mt-3 text-prose leading-relaxed text-ink">
          This atlas currently has {stationCount} station pins from the list.
          I would treat the map as orientation, not as a timetable. Check{' '}
          <a
            href="https://www.tramalacant.es/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-teal hover:underline"
          >
            TRAM d&apos;Alacant
          </a>{' '}
          before traveling for current service, works, transfers, and ticket
          rules.
        </p>
      </div>

      <KusttramRouteMap
        pins={pins}
        label="TRAM d'Alacant"
        lineColor="#b65f28"
        routeSegments={ALICANTE_TRAM_ROUTE_SEGMENTS}
      />

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {ALICANTE_TRAM_GUIDE_CARDS.map(card => (
          <div key={card.title} className="rounded border border-sand bg-white p-4">
            <h3 className="text-h3 text-ink-deep">{card.title}</h3>
            <p className="mt-2 text-small leading-relaxed text-slate">
              {card.body}
            </p>
          </div>
        ))}
      </div>

      <div id="quick-answers" className="mt-6 max-w-prose">
        <h2 className="text-h2 text-ink-deep">Quick answers</h2>
        <dl className="mt-3 space-y-4">
          {ALICANTE_TRAM_FAQS.map(faq => (
            <div key={faq.question}>
              <dt className="font-semibold text-ink-deep">{faq.question}</dt>
              <dd className="mt-1 text-prose leading-relaxed text-ink">
                {faq.answer}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

export default async function ListPage({ params }: Props) {
  const { slug } = await params;
  const found = await findList(slug);
  if (!found) notFound();

  const meta = found.listsMeta.get(found.name) ?? null;
  const titleCase = isAlicanteTramList(slug)
    ? 'Alicante Tram Stops'
    : found.name.replace(/\b\w/g, c => c.toUpperCase());
  const kusttramList = isKusttramList(slug);
  const alicanteTramList = isAlicanteTramList(slug);
  const routeMapList = kusttramList || alicanteTramList;

  // City / country anchor detection — when the list name exactly matches a
  // known city or country name, surface a clear link in the header so the
  // reader can pivot to the place page.
  // Editorial intro + city/country anchor lookups + the pin slice for this
  // list, all in one Promise.all. fetchPinsForLists is a single Supabase
  // query with a server-side `saved_lists && ARRAY[name]` predicate — much
  // cheaper than walking the full corpus to find ~50 matching rows.
  const [cityMatch, countryMatch, content, listPins] = await Promise.all([
    fetchCityByName(found.name),
    fetchCountryByName(countryLookupName(found.name)),
    readPlaceContent('lists', slug),
    fetchPinsForLists([found.name]),
  ]);

  // Pins on this exact list. The component handles sorting client-side via
  // the sort dropdown; we still pass a stable default so SSR HTML is
  // stable and accessible without JS. When the list has a curated
  // pin_order, honour it: pins listed there render in that order, and
  // any members not in the array fall to the end alphabetically. The
  // 'rated' default lives in the SavedListSection's initialSort prop;
  // the user can flip the dropdown to override.
  const orderIndex = new Map<string, number>();
  (meta?.pinOrder ?? []).forEach((id, i) => orderIndex.set(id, i));
  const onListPins = listPins.slice().sort((a, b) => {
    const ai = orderIndex.has(a.id) ? orderIndex.get(a.id)! : Number.MAX_SAFE_INTEGER;
    const bi = orderIndex.has(b.id) ? orderIndex.get(b.id)! : Number.MAX_SAFE_INTEGER;
    if (ai !== bi) return ai - bi;
    return a.name.localeCompare(b.name);
  });

  const onList: SavedListPin[] = onListPins.map(p => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    visited: p.visited,
    cover: p.images?.[0]?.url ?? null,
    city: p.cityNames?.[0] ?? null,
    country: p.statesNames?.[0] ?? null,
    rating: p.personalRating,
    review: reviewSnippet(p.personalReview),
    visitYear: p.visitYear,
    kind: p.kind ?? null,
    priceTier: p.priceTier ?? null,
    free: !!p.free,
    unesco: p.unescoId != null,
    // Coordinates power the new map view on /lists/[slug]. Pins
    // without coords still appear in the cards; they just don't show
    // on the globe.
    lat: p.lat,
    lng: p.lng,
  }));

  // === Cover hero ============================================================
  // Same precedence as the /lists index card: curated photo > curated pin >
  // anchor city's hero/personal photo > first visited pin's photo. Renders
  // a wide banner above the H1 when any tier resolves; otherwise the page
  // stays text-first (the previous behaviour).
  const coverFromCurated = meta?.coverPhotoUrl ?? null;
  const coverFromPin = meta?.coverPinId
    ? listPins.find(p => p.id === meta.coverPinId)?.images?.[0]?.url ?? null
    : null;
  // Anchor city's personal photo only — heroImage is a Wikimedia
  // photograph and we no longer use Wikimedia images outside the city
  // detail page hero (which has ImageCredit). When the city has no
  // personal photo, fall through to coverFromPinPile below.
  const coverFromCity = cityMatch ? cityMatch.personalPhoto ?? null : null;
  const coverFromPinPile = (() => {
    // Prefer a visited pin's first photo over a draft's so the hero feels
    // like a real travel snapshot rather than placeholder Wikidata art.
    const visitedFirst = listPins
      .slice()
      .sort((a, b) => (a.visited === b.visited ? 0 : a.visited ? -1 : 1));
    for (const p of visitedFirst) {
      const url = p.images?.[0]?.url;
      if (url) return url;
    }
    return null;
  })();
  const coverUrl =
    coverFromCurated ?? coverFromPin ?? coverFromCity ?? coverFromPinPile;

  // Stats — only the non-zero ones render. Avg rating is over rated pins
  // only so an empty list with no ratings doesn't show "0.0 stars".
  const visitedCount = onList.filter(p => p.visited).length;
  const reviewedCount = onList.filter(p => p.review).length;
  const ratedPins = onList.filter(p => p.rating != null && p.rating > 0);
  const avgRating = ratedPins.length
    ? ratedPins.reduce((acc, p) => acc + (p.rating ?? 0), 0) / ratedPins.length
    : null;
  const freeCount = onList.filter(p => p.free).length;
  const unescoCount = onList.filter(p => p.unesco).length;

  const url = `${SITE_URL}/lists/${slug}`;
  const breadcrumb = breadcrumbJsonLd([
    { name: 'Home', item: SITE_URL },
    { name: 'Lists', item: `${SITE_URL}/lists` },
    { name: titleCase },
  ]);
  const collection = kusttramList
    ? kusttramCollectionJsonLd(url, onList)
    : alicanteTramList
    ? alicanteTramCollectionJsonLd(url, onList)
    : collectionJsonLd({
        url,
        name: titleCase,
        description:
          meta?.description ??
          `${onList.length} ${onList.length === 1 ? 'pin' : 'pins'} on Mike's ${titleCase} list.`,
        totalItems: onList.length,
        items: onList.slice(0, 30).map(p => ({
          url: `${SITE_URL}/pins/${p.slug ?? p.id}`,
          name: p.name,
          image: p.cover,
        })),
      });
  // Article schema only when there's editorial intro — generic CollectionPage
  // is enough for membership-only lists.
  const article = content
    ? {
        '@context': 'https://schema.org',
        '@type': 'Article',
        '@id': url,
        url,
        headline: kusttramList
          ? 'Kusttram station list'
          : alicanteTramList
          ? 'Alicante tram stop list'
          : titleCase,
        description: kusttramList
          ? KUSTTRAM_DESCRIPTION
          : alicanteTramList
          ? ALICANTE_TRAM_DESCRIPTION
          : meta?.description ?? `Mike's ${titleCase} list.`,
        author: { '@id': AUTHOR_ID },
        publisher: { '@id': AUTHOR_ID },
        isPartOf: { '@id': WEBSITE_ID },
        inLanguage: 'en-US',
      }
    : null;

  return (
    <article className="max-w-page mx-auto px-5 py-8">
      <JsonLd data={breadcrumb} />
      <JsonLd data={collection} />
      {article && <JsonLd data={article} />}
      {kusttramList && <JsonLd data={kusttramFaqJsonLd(url)} />}
      {alicanteTramList && <JsonLd data={alicanteTramFaqJsonLd(url)} />}

      {/* Cover hero — only renders when the precedence chain finds an image,
          so theme lists with no anchor city and no curated cover stay
          text-first. The 21:9 aspect keeps it banner-shaped on desktop and
          legible at narrow widths; rounded edges echo the pin cards. */}
      {coverUrl && (
        <div className="mb-5 relative aspect-[21/9] rounded-lg overflow-hidden bg-cream-soft border border-sand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={coverUrl}
            alt=""
            className="w-full h-full object-cover"
          />
        </div>
      )}

      <nav className="text-small text-muted mb-3" aria-label="Breadcrumb">
        <Link href="/lists" className="hover:text-teal">Lists</Link>
        <span className="mx-1.5" aria-hidden>›</span>
        <span className="text-ink-deep capitalize">{titleCase}</span>
      </nav>

      <header className="mb-6">
        <h1 className="text-display text-ink-deep leading-none capitalize">
          {titleCase}
        </h1>

        {/* Anchor link — only renders for lists named after a city or country
            that exists in the atlas. Lets a traveler hop from a Barcelona
            list straight to the Barcelona detail page. */}
        {(cityMatch || countryMatch) && (
          <p className="mt-3 text-small text-slate">
            {cityMatch && (
              <Link
                href={`/cities/${cityMatch.slug}`}
                className="inline-flex items-center gap-1 text-teal hover:underline"
              >
                <span aria-hidden>📮</span>
                <span>See {cityMatch.name} city page</span>
                <span aria-hidden>→</span>
              </Link>
            )}
            {countryMatch && (
              <Link
                href={`/countries/${countryMatch.slug}`}
                className="inline-flex items-center gap-1 text-teal hover:underline ml-3"
              >
                <span aria-hidden>🌍</span>
                <span>See {countryMatch.name} country page</span>
                <span aria-hidden>→</span>
              </Link>
            )}
          </p>
        )}

        {meta?.description && (
          <p className="mt-3 text-prose text-slate max-w-prose">{meta.description}</p>
        )}

        {/* Editorial intro — markdown-friendly prose lives at
            content/lists/<slug>.md. Shows above the cards when present. */}
        {content && (
          <div className="mt-4 post-prose max-w-prose">
            {paragraphs(content.body).map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        )}

        {kusttramList && (
          <KusttramListGuide stationCount={onList.length} pins={onList} />
        )}

        {alicanteTramList && (
          <AlicanteTramListGuide stationCount={onList.length} pins={onList} />
        )}

        {/* Stats row — only emits items that are non-zero so a list with
            no reviews doesn't show "0 reviewed". Tabular nums keep the
            counts aligned across the row when the user re-sorts. */}
        <div className="mt-4 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-small text-slate tabular-nums">
          <span>
            <strong className="text-ink-deep">{onList.length}</strong>
            {' '}{onList.length === 1 ? 'pin' : 'pins'}
          </span>
          {visitedCount > 0 && (
            <span>
              <strong className="text-ink-deep">{visitedCount}</strong> visited
            </span>
          )}
          {reviewedCount > 0 && (
            <span>
              <strong className="text-ink-deep">{reviewedCount}</strong> reviewed
            </span>
          )}
          {avgRating != null && (
            <span>
              <strong className="text-ink-deep">{avgRating.toFixed(1)}</strong>
              <span className="text-muted">&nbsp;avg ⭐</span>
            </span>
          )}
          {freeCount > 0 && (
            <span>
              <strong className="text-ink-deep">{freeCount}</strong> free
            </span>
          )}
          {unescoCount > 0 && (
            <span>
              <strong className="text-ink-deep">{unescoCount}</strong> UNESCO
            </span>
          )}
        </div>

        {/* Promoted CTA — Open the live Google Maps list in a new tab.
            Larger and more visible than the small text link the embedded
            city/country sections render, because here it's the primary
            action a traveler will take after skimming the cards. */}
        {meta?.googleShareUrl && (
          <a
            href={meta.googleShareUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 px-3 py-2 rounded border border-sand bg-white text-small text-accent hover:border-accent hover:bg-cream-soft transition-colors"
          >
            <span aria-hidden>📍</span>
            Open in Google Maps
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M7 17 17 7" />
              <path d="M7 7h10v10" />
            </svg>
          </a>
        )}
      </header>

      {onList.length === 0 ? (
        <div className="card p-8 text-center text-slate">
          No pins on this list yet.
        </div>
      ) : routeMapList ? (
        <SavedListSection
          title={`Pins on ${titleCase}`}
          listSlug={null}
          googleShareUrl={meta?.googleShareUrl ?? null}
          pins={onList}
          pageSize={48}
          showSort
          initialSort="rated"
          pinOrder={meta?.pinOrder ?? []}
        />
      ) : (
        // ListMapAndCards is a thin client wrapper: it renders a globe
        // map of every pin with coords above the SavedListSection
        // grid, and lets a click on a map dot filter the cards down to
        // that one pin. The SavedListSection inside keeps the same
        // sort + pagination semantics as the city/country embeds.
        // listSlug={null} suppresses the "Open list" footer link
        // since this IS the list page.
        <ListMapAndCards
          title={`Pins on ${titleCase}`}
          listSlug={null}
          googleShareUrl={meta?.googleShareUrl ?? null}
          pins={onList}
          pageSize={48}
          showSort
          initialSort="rated"
          // Curated tier: pinned pins always lead in their assigned
          // order; the rest of the list falls through to the user's
          // sort dropdown (default 'rated' = reviewed-first).
          pinOrder={meta?.pinOrder ?? []}
        />
      )}
    </article>
  );
}

function countryLookupName(name: string): string {
  const lcName = name.toLowerCase();
  const aliases: Record<string, string> = {
    usa: 'united states',
    'u.s.a.': 'united states',
    us: 'united states',
    uk: 'united kingdom',
    'u.k.': 'united kingdom',
    uae: 'united arab emirates',
  };
  return aliases[lcName] ?? name;
}
