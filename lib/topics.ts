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
  { slug: 'festivals',      name: 'Festivals & annual events', intro: null, hero: null },
  { slug: 'food',           name: 'Food & restaurants',        intro: null, hero: null },
  { slug: 'where-to-stay',  name: 'Where to stay',             intro: null, hero: null },
  { slug: 'getting-around', name: 'Getting around',            intro: null, hero: null },
  { slug: 'scams-safety',   name: 'Scams & safety',            intro: null, hero: null },
  { slug: 'unesco',         name: 'UNESCO World Heritage',     intro: null, hero: null },
  { slug: 'beaches',        name: 'Beaches',                   intro: null, hero: null },
  { slug: 'wine',           name: 'Wine country',              intro: null, hero: null },
  { slug: 'spa',            name: 'Spas & thermal baths',      intro: null, hero: null },
  { slug: 'day-trips',      name: 'Day trips',                 intro: null, hero: null },
  { slug: 'museums',        name: 'Museums & galleries',       intro: null, hero: null },
  { slug: 'nightlife',      name: 'Nightlife',                 intro: null, hero: null },
  { slug: 'markets',        name: 'Markets',                   intro: null, hero: null },
  { slug: 'architecture',   name: 'Architecture',              intro: null, hero: null },
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
