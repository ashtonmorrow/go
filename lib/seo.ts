// === SEO + structured-data helpers ==========================================
// One place to keep the canonical site identity (URL, name, author) and the
// JSON-LD builders for the different page types we ship.
//
// Every page in the site composes from these helpers so a tweak to the
// author name, the site URL, or the brand description shows up everywhere
// without grep-and-replace.
//
// Schema-type choices, page by page:
//   /cities          — CollectionPage + ItemList    (a curated collection)
//   /cities/[slug]   — City + BreadcrumbList        (a Place subclass)
//   /countries/[slug]— Country + BreadcrumbList
//   /pins            — CollectionPage + ItemList
//   /pins/[slug]     — TouristAttraction + BreadcrumbList
//   /map             — WebPage                       (interactive view)
//   /about           — TechArticle                   (technical write-up)
//   layout (site)    — Person + WebSite              (sitewide)
//
// Meta-description rule: ≤155 characters. Front-loaded with what the page
// is about. Third-person voice (no "I"; "you" only for direct advice).

export const SITE_URL = 'https://go.mike-lee.me';
export const SITE_NAME = 'Travel · Mike Lee';
export const SITE_DESCRIPTION =
  'A travel atlas of 1,341 cities and 213 countries, drawn from a personal Notion workspace. Postcards, an interactive globe, and notes worth keeping.';
export const PARENT_SITE_NAME = 'mike-lee.me';
export const AUTHOR_NAME = 'Mike Lee';
export const AUTHOR_ALT_NAME = 'Whisker Leaks';
export const AUTHOR_URL = 'https://mike-lee.me';
export const AUTHOR_LINKEDIN = 'https://www.linkedin.com/in/mikelee89/';
// Stable @id for the Person entity — referenced from author/publisher
// fields on every JSON-LD block via { "@id": AUTHOR_ID }.
export const AUTHOR_ID = `${AUTHOR_URL}/#person`;
export const WEBSITE_ID = `${SITE_URL}/#website`;

// Truncate to <= max chars at a word boundary, no trailing whitespace.
// Used to clip long descriptions for meta snippets without breaking words.
export function clip(text: string | null | undefined, max = 155): string | undefined {
  if (!text) return undefined;
  const t = text.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max - 30 ? cut.slice(0, lastSpace) : cut).trim() + '…';
}

// === JSON-LD builders =======================================================

export function personJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    '@id': AUTHOR_ID,
    name: AUTHOR_NAME,
    alternateName: AUTHOR_ALT_NAME,
    url: AUTHOR_URL,
    sameAs: [AUTHOR_LINKEDIN],
    // Topical fingerprint — gives Google + LLM crawlers a clean signal
    // about what this Person is an authoritative source for. Kept
    // narrow to the actual content of the site so the entity stays
    // believable. Add jobTitle / worksFor here when ready.
    knowsAbout: [
      'travel',
      'geography',
      'cartography',
      'world heritage sites',
      'urbanism',
      'open data',
    ],
  };
}

export function websiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': WEBSITE_ID,
    url: SITE_URL,
    name: SITE_NAME,
    description: SITE_DESCRIPTION,
    publisher: { '@id': AUTHOR_ID },
    inLanguage: 'en-US',
  };
}

// Generic breadcrumb builder. Pass items in order from root to leaf.
// `item` should be an absolute URL (omit it on the last item per spec).
export function breadcrumbJsonLd(items: { name: string; item?: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((entry, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: entry.name,
      ...(entry.item ? { item: entry.item } : {}),
    })),
  };
}

// City detail page schema. Uses the schema.org City type (subclass of Place).
// `containedInPlace` references the parent Country if known.
export function cityJsonLd(city: {
  slug: string;
  name: string;
  localName?: string | null;
  description?: string | null;
  image?: string | null;
  lat?: number | null;
  lng?: number | null;
  population?: number | null;
}, country?: { slug: string; name: string } | null) {
  return {
    '@context': 'https://schema.org',
    '@type': 'City',
    '@id': `${SITE_URL}/cities/${city.slug}`,
    url: `${SITE_URL}/cities/${city.slug}`,
    name: city.name,
    ...(city.localName ? { alternateName: city.localName } : {}),
    ...(city.description ? { description: clip(city.description, 300) } : {}),
    ...(city.image ? { image: city.image } : {}),
    ...(city.lat != null && city.lng != null
      ? {
          geo: {
            '@type': 'GeoCoordinates',
            latitude: city.lat,
            longitude: city.lng,
          },
        }
      : {}),
    ...(country
      ? {
          containedInPlace: {
            '@type': 'Country',
            name: country.name,
            url: `${SITE_URL}/countries/${country.slug}`,
          },
        }
      : {}),
    isPartOf: { '@id': WEBSITE_ID },
  };
}

// Country detail page schema. Includes ISO and capital where known.
export function countryJsonLd(country: {
  slug: string;
  name: string;
  iso2?: string | null;
  iso3?: string | null;
  capital?: string | null;
  description?: string | null;
  image?: string | null;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Country',
    '@id': `${SITE_URL}/countries/${country.slug}`,
    url: `${SITE_URL}/countries/${country.slug}`,
    name: country.name,
    ...(country.iso2 ? { identifier: country.iso2 } : {}),
    ...(country.description ? { description: clip(country.description, 300) } : {}),
    ...(country.image ? { image: country.image } : {}),
    ...(country.capital
      ? {
          containsPlace: {
            '@type': 'City',
            name: country.capital,
          },
        }
      : {}),
    isPartOf: { '@id': WEBSITE_ID },
  };
}

// Listing page (CollectionPage + ItemList). Item list is intentionally
// truncated to the first N entries — full lists harm crawl efficiency
// without much SEO benefit.
//
// Each list item can optionally carry an image URL — useful on /pins
// where the photo is identity-defining for the place. When supplied,
// itemListElement.item becomes a Thing-shaped object so the image hangs
// off the entity itself rather than the ListItem wrapper.
export function collectionJsonLd(opts: {
  url: string;
  name: string;
  description: string;
  items: { url: string; name: string; image?: string | null }[];
  totalItems: number;
  maxItemsInList?: number;
}) {
  const max = opts.maxItemsInList ?? 30;
  const items = opts.items.slice(0, max);
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': opts.url,
    url: opts.url,
    name: opts.name,
    description: opts.description,
    isPartOf: { '@id': WEBSITE_ID },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: opts.totalItems,
      itemListElement: items.map((it, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: it.url,
        name: it.name,
        ...(it.image
          ? {
              item: {
                '@type': 'Thing',
                name: it.name,
                url: it.url,
                image: it.image,
              },
            }
          : {}),
      })),
    },
  };
}

// Pin (place-of-interest) detail page. Modelled as TouristAttraction
// (a Place subclass that Google's structured-data documentation
// explicitly supports) with geo, address, image, isAccessibleForFree,
// and `sameAs` links pointing at the attraction's official site and the
// UNESCO World Heritage entry where applicable.
//
// Notes on the modelling:
//   * `additionalType` lifts UNESCO sites into the more specific
//     LandmarksOrHistoricalBuilding subclass without losing
//     TouristAttraction (Google understands both).
//   * `address` is best-effort — pins only carry a city + country text
//     label, not full street addresses, so we emit a PostalAddress with
//     the locality / country slots only.
//   * `containedInPlace` references the country page on this site so
//     the entity graph is self-traversable.
type PinJsonLdAdmission = {
  adult?: number | null;
  child?: number | null;
  senior?: number | null;
  student?: number | null;
  currency?: string | null;
  notes?: string | null;
};

type PinJsonLdHours = {
  mon?: string[];
  tue?: string[];
  wed?: string[];
  thu?: string[];
  fri?: string[];
  sat?: string[];
  sun?: string[];
};

const DAY_TO_SCHEMA: Record<string, string> = {
  mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday',
  fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
};

function hoursToSchemaSpec(h: PinJsonLdHours) {
  const out: Array<Record<string, unknown>> = [];
  for (const day of ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']) {
    const intervals = (h as any)[day] as string[] | undefined;
    if (!intervals || !intervals.length) continue;
    for (const range of intervals) {
      const m = /^(\d{1,2}:\d{2})\s*[–-]\s*(\d{1,2}:\d{2})$/.exec(range);
      if (!m) continue;
      out.push({
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: DAY_TO_SCHEMA[day],
        opens: m[1].padStart(5, '0'),
        closes: m[2].padStart(5, '0'),
      });
    }
  }
  return out;
}

function admissionToOffers(a: PinJsonLdAdmission) {
  const offers: Array<Record<string, unknown>> = [];
  const tiers: Array<[string, number | null | undefined]> = [
    ['Adult', a.adult], ['Child', a.child], ['Senior', a.senior], ['Student', a.student],
  ];
  for (const [name, price] of tiers) {
    if (typeof price === 'number') {
      offers.push({
        '@type': 'Offer',
        name,
        price,
        ...(a.currency ? { priceCurrency: a.currency } : {}),
      });
    }
  }
  return offers;
}

export function pinJsonLd(pin: {
  slug: string;
  name: string;
  description?: string | null;
  image?: string | null;
  lat?: number | null;
  lng?: number | null;
  city?: string | null;
  country?: string | null;
  countrySlug?: string | null;
  category?: string | null;
  unescoId?: number | null;
  unescoUrl?: string | null;
  website?: string | null;
  isFree?: boolean | null;
  address?: string | null;
  openingHours?: PinJsonLdHours | null;
  admission?: PinJsonLdAdmission | null;
  wheelchairAccessible?: 'fully' | 'partially' | 'no' | 'unknown' | null;
  kidFriendly?: boolean | null;
  durationMinutes?: number | null;
}) {
  const url = `${SITE_URL}/pins/${pin.slug}`;
  const sameAs = [pin.website, pin.unescoUrl].filter(Boolean) as string[];
  const isUnesco = pin.unescoId != null;
  const hoursSpec = pin.openingHours ? hoursToSchemaSpec(pin.openingHours) : [];
  const offers = pin.admission ? admissionToOffers(pin.admission) : [];

  const accessibilityFeatures: string[] = [];
  if (pin.wheelchairAccessible === 'fully') accessibilityFeatures.push('wheelchairAccessible');
  if (pin.wheelchairAccessible === 'partially') accessibilityFeatures.push('wheelchairAccessibleEntrance');

  return {
    '@context': 'https://schema.org',
    '@type': 'TouristAttraction',
    '@id': url,
    url,
    name: pin.name,
    ...(pin.description ? { description: clip(pin.description, 300) } : {}),
    ...(pin.image ? { image: pin.image } : {}),
    ...(pin.category ? { keywords: pin.category } : {}),
    ...(isUnesco
      ? { additionalType: 'https://schema.org/LandmarksOrHistoricalBuildings' }
      : {}),
    ...(pin.lat != null && pin.lng != null
      ? {
          geo: {
            '@type': 'GeoCoordinates',
            latitude: pin.lat,
            longitude: pin.lng,
          },
        }
      : {}),
    ...(pin.address || pin.city || pin.country
      ? {
          address: {
            '@type': 'PostalAddress',
            ...(pin.address ? { streetAddress: pin.address } : {}),
            ...(pin.city ? { addressLocality: pin.city } : {}),
            ...(pin.country ? { addressCountry: pin.country } : {}),
          },
        }
      : {}),
    ...(pin.country && pin.countrySlug
      ? {
          containedInPlace: {
            '@type': 'Country',
            name: pin.country,
            url: `${SITE_URL}/countries/${pin.countrySlug}`,
          },
        }
      : pin.country
      ? { containedInPlace: { '@type': 'Country', name: pin.country } }
      : {}),
    ...(sameAs.length ? { sameAs } : {}),
    ...(pin.isFree != null ? { isAccessibleForFree: pin.isFree } : {}),
    ...(hoursSpec.length ? { openingHoursSpecification: hoursSpec } : {}),
    ...(offers.length ? { offers } : {}),
    ...(accessibilityFeatures.length ? { accessibilityFeature: accessibilityFeatures } : {}),
    ...(pin.kidFriendly === true
      ? { audience: { '@type': 'PeopleAudience', suggestedMinAge: 0 } }
      : {}),
    ...(typeof pin.durationMinutes === 'number'
      ? { timeRequired: `PT${pin.durationMinutes}M` }
      : {}),
    isPartOf: { '@id': WEBSITE_ID },
  };
}

// Generic WebPage schema for views that don't fit a more specific type
// (the /map view, future utility pages).
export function webPageJsonLd(opts: {
  url: string;
  name: string;
  description: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': opts.url,
    url: opts.url,
    name: opts.name,
    description: opts.description,
    isPartOf: { '@id': WEBSITE_ID },
    inLanguage: 'en-US',
  };
}
