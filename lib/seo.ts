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
export function collectionJsonLd(opts: {
  url: string;
  name: string;
  description: string;
  items: { url: string; name: string }[];
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
      })),
    },
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
