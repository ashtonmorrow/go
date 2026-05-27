// === Topic taxonomy =========================================================
// The controlled vocabulary for cross-cutting topics. This registry is the
// SINGLE source of truth. Frontmatter `topics:` values on guides and posts
// are validated against it at parse time, so a typo'd or invented tag is
// dropped rather than added — the taxonomy cannot sprawl the way a free-text
// tag field does.
//
// A topic becomes an indexable hub page at /topics/<slug> the moment its
// `intro` is filled in. Until then the hub still renders (auto-aggregating
// every guide and post tagged with it) but stays noindex,follow — the same
// rolling-release rule the destination guides use.
//
// To add a topic: append an entry below. To open a hub to search: write its
// `intro`. Nothing else has to change — the route, the sitemap entry, and
// the /topics index all derive their state from this file.

export type Topic = {
  /** URL segment, and the only valid frontmatter `topics:` value. */
  slug: string;
  /** Human display name. */
  name: string;
  /** Editorial intro paragraph for the hub page. While null, the hub stays
   *  noindex (not yet index-ready). Write a paragraph here to open it to
   *  search and add it to the sitemap. */
  intro: string | null;
  /** Optional /public-relative hero image path for the hub page. */
  hero: string | null;
};

// Keep this list short and durable. Each entry is a genuine cross-cutting
// theme that recurs across many destinations — not a one-off label. If a
// candidate topic would only ever apply to two or three guides, it is a
// guide section, not a topic.
export const TOPICS: Topic[] = [
  {
    slug: 'festivals',
    name: 'Festivals & annual events',
    intro: 'Festivals reshape a destination far more than weather does. The hotel-price spike around La Tomatina, the unbookable week of MWC, the Day-of-the-Dead window in CDMX, the Songkran water fights in Chiang Mai. Every guide on this site has a festivals-and-big-annual-events section, and the hub here aggregates the trip-shaping ones across the atlas so you can either plan around a specific event or steer your dates clear of one.',
    hero: null,
  },
  { slug: 'food',           name: 'Food & restaurants',        intro: null, hero: null },
  { slug: 'where-to-stay',  name: 'Where to stay',             intro: null, hero: null },
  { slug: 'getting-around', name: 'Getting around',            intro: null, hero: null },
  {
    slug: 'scams-safety',
    name: 'Scams & safety',
    intro: 'Scam patterns are local. The Bangkok tuk-tuk taking you to a gem shop instead of the temple, the Cairo camel ride that does not end where it started, the Paris ring-on-the-ground, the Prague drink-bill-switch in Wenceslas Square. Each writeup names the player, names the pitch, names the response. This hub collects the destinations where the scam culture is mature enough to need a section in the guide.',
    hero: null,
  },
  { slug: 'unesco',         name: 'UNESCO World Heritage',     intro: null, hero: null },
  {
    slug: 'beaches',
    name: 'Beaches',
    intro: 'Beach trips reward picking by intent. The party-crowded version (Phuket Patong, Mykonos), the family-quiet version (Kata Noi, Cala del Moraig), the photo-postcard version (Zlatni Rat, Ksamil), and the lesser-known cove that costs an extra Uber. This hub aggregates the guides where the beach pick is half the trip decision.',
    hero: null,
  },
  {
    slug: 'wine',
    name: 'Wine country',
    intro: 'Wine country trips are part transport, part tasting strategy. The Cape Winelands run on a wine-tram pass, the Penedès an hour from Barcelona runs on a rental car, the Kakheti region east of Tbilisi runs on a hired driver and a longer day. This hub collects the destinations where the wine day is its own decision rather than an add-on to the city.',
    hero: null,
  },
  { slug: 'spa',            name: 'Spas & thermal baths',      intro: null, hero: null },
  {
    slug: 'day-trips',
    name: 'Day trips',
    intro: 'A good day trip is the second-best thing about the city you booked. Sintra from Lisbon, Toledo from Madrid, the Cu Chi Tunnels from Saigon, Lovćen from Kotor, the Cape Winelands from Cape Town. Each guide here has a structured day_trips: block with timings, transport, and a short summary so the picks are scannable rather than buried in prose.',
    hero: null,
  },
  {
    slug: 'museums',
    name: 'Museums & galleries',
    intro: 'Most major-city museums need timed-entry booking, free-entry windows worth knowing about, and a quick decision between the famous-collection visit and the one tourists usually skip. The Prado vs Reina Sofía, the Mauritshuis vs the Rijksmuseum, the Royal Air Force Museum vs the British Museum. The hub aggregates guides where the museum decision is its own planning step.',
    hero: null,
  },
  {
    slug: 'nightlife',
    name: 'Nightlife',
    intro: 'Nightlife shapes where you base. Berlin\'s late-Friday-into-Sunday techno scene, Bangkok\'s Sukhumvit-vs-Silom split, Belgrade\'s splavovi clubs on the river, the Saigon craft-beer crawl. This hub collects destinations where the bar-and-club rhythm is part of why you came.',
    hero: null,
  },
  {
    slug: 'markets',
    name: 'Markets',
    intro: 'Markets are where a city eats and where most travelers eat tourist prices. La Boqueria vs Mercat de Santa Caterina in Barcelona, Mercado de San Miguel vs Mercado de la Cebada in Madrid, Borough vs Spitalfields in London, the Dezerter Bazaar in Tbilisi. The pattern is the same everywhere: the famous market is for a photo and a snack, the one five minutes away is for an actual meal.',
    hero: null,
  },
  {
    slug: 'architecture',
    name: 'Architecture',
    intro: 'A few destinations make architecture the trip. Tbilisi flips between Parisian, Soviet brutalist, and Ottoman block by block. Berlin holds Bauhaus, GDR plattenbau, and 1990s post-reunification glass on the same block. Singapore reads as 1990s skyline plus deliberate preserved shophouse rows. The hub collects the guides where reading the buildings is half the visit.',
    hero: null,
  },
  { slug: 'with-kids',      name: 'Travel with kids',          intro: null, hero: null },
];

const BY_SLUG = new Map(TOPICS.map(t => [t.slug, t]));

/** Look up a topic by slug. Returns null for an unknown slug. */
export function getTopic(slug: string): Topic | null {
  return BY_SLUG.get(slug) ?? null;
}

/** True when `slug` is a registered topic. */
export function isTopicSlug(slug: string): boolean {
  return BY_SLUG.has(slug);
}

/** True when at least one topic hub has an editorial intro, i.e. at least
 *  one /topics/<slug> is index-ready. The /topics index and its sitemap
 *  entry gate on this so they open to search automatically once the first
 *  hub is written. */
export function anyTopicHasIntro(): boolean {
  return TOPICS.some(t => t.intro != null);
}

/** Validate a raw frontmatter `topics:` value against the registry. Keeps
 *  only registered slugs, dedupes, and drops everything else (typos,
 *  invented tags, non-strings). Invalid input collapses to []. This is the
 *  single chokepoint that keeps the taxonomy from sprawling. */
export function filterValidTopics(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of raw) {
    if (typeof v === 'string' && BY_SLUG.has(v) && !seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}
