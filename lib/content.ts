import 'server-only';
import { promises as fs } from 'fs';
import path from 'path';
import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import matter from 'gray-matter';
import { marked } from 'marked';
import { filterValidTopics } from './topics';

/**
 * File-based content collection.
 *
 * The personal-voice prose for every place lives in this repo as a flat
 * markdown file:
 *
 *   /content/pins/<slug>.md
 *   /content/cities/<slug>.md
 *   /content/countries/<slug>.md
 *
 * Each file has a tiny YAML-ish frontmatter for the search-engine indexability
 * flag, then the body prose. Body is plain paragraphs separated by blank
 * lines — no markdown features needed (the content-authoring handoff prompt
 * already strips bullets, headings, bold, etc.).
 *
 *   ---
 *   indexable: true
 *   ---
 *
 *   First paragraph...
 *
 *   Second paragraph...
 *
 * Why files instead of a database table:
 *   - VS Code edits with full editor power
 *   - git history is the audit log
 *   - branch + preview deploys for tricky edits
 *   - works offline, syncs via push
 *   - no admin UI to maintain
 */

export type ContentScope = 'pins' | 'cities' | 'countries' | 'lists';

export type PlaceContent = {
  /** The prose body, trimmed. Paragraphs separated by blank lines. */
  body: string;
  /** When true, the page metadata can drop the noindex robots header. */
  indexable: boolean;
  /** Optional FAQ block — same shape as the lists schema. When set,
   *  the page renders a Q&A section + emits FAQPage JSON-LD. Empty
   *  array when no faqs are authored. */
  faqs: ListFaq[];
  /** Optional "how I would use this" card grid. Same shape as lists. */
  guideCards: ListGuideCards | null;
};

const CONTENT_ROOT = path.join(process.cwd(), 'content');

/**
 * Strict slug pattern. Avoids escapes into ../ or absolute paths since the
 * slug is taken straight from the URL.
 */
const SAFE_SLUG = /^[a-z0-9][a-z0-9-]*$/;

const _readContent = unstable_cache(
  async (scope: ContentScope, slug: string): Promise<PlaceContent | null> => {
    if (!SAFE_SLUG.test(slug)) return null;
    const file = path.join(CONTENT_ROOT, scope, `${slug}.md`);
    let raw: string;
    try {
      raw = await fs.readFile(file, 'utf8');
    } catch {
      return null;
    }
    // gray-matter so files can opt into structured blocks (`faqs:`,
    // `guide_cards:`) the same way list pages do. Existing pin / city
    // / country files with just `indexable: true` round-trip unchanged.
    const parsed = matter(raw);
    const data = (parsed.data ?? {}) as Record<string, unknown>;
    const trimmed = parsed.content.trim();
    if (!trimmed) return null;
    return {
      body: trimmed,
      indexable: data.indexable === true,
      faqs: parseFaqs(data.faqs),
      guideCards: parseGuideCards(data.guide_cards),
    };
  },
  // v2: shape gained faqs + guideCards. Bumping the cache key forces a
  // fresh read so v1 entries (which lacked those fields) don't leak
  // into the new typed shape.
  ['place-content-v2'],
  { revalidate: 86400, tags: ['place-content'] },
);

/**
 * Read the content file for a (scope, slug) pair. Returns null if the file
 * doesn't exist, the slug is unsafe, or the body is empty.
 */
export const readPlaceContent = cache(_readContent);

/**
 * Render a content body as JSX-ready paragraphs. Splits on one-or-more blank
 * lines; trims each paragraph; preserves intentional single-line breaks
 * inside a paragraph as `<br />`-equivalent spaces (we never use them, but
 * the prose handoff doesn't promise to never use them either).
 */
export function paragraphs(body: string): string[] {
  return body
    .split(/\r?\n\s*\r?\n/)
    .map(p => p.trim())
    .filter(Boolean);
}

// === Rich list content =====================================================
// Lists support a richer authoring layer than pin / city / country pages:
// proper markdown rendering (marked + post-prose) plus opt-in frontmatter
// blocks (faqs, guide_cards, related, route_map) that compose the page.
// pin / city / country content stays on the leaner readPlaceContent path
// because their bodies are still flat paragraphs.

export type ListGuideCard = { title: string; body: string };
export type ListGuideCards = {
  /** Optional eyebrow heading for the cards section. */
  title: string | null;
  /** Optional intro paragraph(s) above the card grid. */
  intro: string | null;
  cards: ListGuideCard[];
};

export type ListFaq = { question: string; answer: string };

/** One day-trip destination reachable from a guide's city. Authored in the
 *  list frontmatter `day_trips:` block; powers /cities/<slug>/day-trips. */
export type DayTrip = {
  name: string;
  /** How far / how to get there, e.g. "35 min by R2 train from Sants". */
  travel: string | null;
  /** One or two sentences on why the trip is worth it. */
  summary: string;
  /** Optional internal link to a guide for the destination. */
  list: string | null;
  /** Optional internal link to a pin for the destination. */
  pin: string | null;
};

export type DayTrips = {
  /** Optional editorial intro paragraph for the day-trips page. */
  intro: string | null;
  trips: DayTrip[];
};

export type ListRelated = {
  city: string | null;
  country: string | null;
  posts: string[];
};

export type ListContent = {
  /** Trimmed raw markdown — exposed for clients that want their own renderer. */
  body: string;
  /** Pre-rendered HTML (marked → string). Render with .post-prose styling. */
  bodyHtml: string;
  indexable: boolean;
  /** Decoupled from `indexable`. `featured: true` puts the list on the
   *  home page Travel guides section, regardless of whether Google is
   *  allowed to index it yet. Use this to surface scaffolded guides
   *  (Madrid, Bristol, Bangkok) on the home before they're polished
   *  enough to ship to search; conversely, route-map reference indexes
   *  (Alicante tram stops, Kusttram station guide) stay indexable for
   *  search but featured: false so they don't pollute the home. */
  featured: boolean;
  /** SEO `<title>` element — keyword-formatted, the Google SERP + browser
   *  tab line. Never rendered as the visible page headline. */
  title: string | null;
  /** Editorial headline in Mike's voice — the visible <h1> on the guide
   *  page and the /lists index card. Decoupled from `title` so the voice
   *  surface and the SEO surface never compete. Falls back to `title`
   *  (then the list name) when absent. */
  headline: string | null;
  /** Short summary used as the meta description and the page subhead. */
  description: string | null;
  heroImage: string | null;
  heroAlt: string | null;
  published: string | null;
  updated: string | null;
  authors: string[];
  /** Slug into the route-map registry (lib/listRouteMaps.ts). When set, the
   *  page renders a styled MapLibre route map above the cards. */
  routeMap: string | null;
  guideCards: ListGuideCards | null;
  faqs: ListFaq[];
  related: ListRelated;
  /** Cross-cutting topic slugs, validated against the lib/topics.ts
   *  registry. Frontmatter `topics:` values that are not registered are
   *  dropped here, so this array only ever contains real topic slugs.
   *  Powers the /topics/<slug> hub aggregation. */
  topics: string[];
  /** Authored day-trip destinations. Powers /cities/<slug>/day-trips.
   *  null when the frontmatter has no `day_trips:` block. */
  dayTrips: DayTrips | null;
};

function asString(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string');
}

function asIsoDate(v: unknown): string | null {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'string' && v.length > 0) return v;
  return null;
}

function parseGuideCards(v: unknown): ListGuideCards | null {
  if (!v || typeof v !== 'object') return null;
  const obj = v as Record<string, unknown>;
  // Accept either a bare array (cards: [...]) or the full shape
  // ({ title, intro, cards: [...] }). The bare-array form keeps simple
  // cases compact in the markdown frontmatter.
  if (Array.isArray(v)) {
    const cards = parseCardArray(v);
    if (cards.length === 0) return null;
    return { title: null, intro: null, cards };
  }
  const cards = parseCardArray(obj.cards);
  if (cards.length === 0) return null;
  return {
    title: asString(obj.title),
    intro: asString(obj.intro),
    cards,
  };
}

function parseCardArray(v: unknown): ListGuideCard[] {
  if (!Array.isArray(v)) return [];
  return v
    .map(entry => {
      if (!entry || typeof entry !== 'object') return null;
      const e = entry as Record<string, unknown>;
      const title = asString(e.title);
      const body = asString(e.body);
      if (!title || !body) return null;
      return { title, body };
    })
    .filter((c): c is ListGuideCard => c !== null);
}

function parseFaqs(v: unknown): ListFaq[] {
  if (!Array.isArray(v)) return [];
  return v
    .map(entry => {
      if (!entry || typeof entry !== 'object') return null;
      const e = entry as Record<string, unknown>;
      // Accept short keys (q/a) and long keys (question/answer); short
      // keys make hand-authoring less verbose without sacrificing the
      // typed shape downstream.
      const question = asString(e.q) ?? asString(e.question);
      const answer = asString(e.a) ?? asString(e.answer);
      if (!question || !answer) return null;
      return { question, answer };
    })
    .filter((f): f is ListFaq => f !== null);
}

/** Parse the `day_trips:` frontmatter block. Accepts either a bare array
 *  of trips, or the full `{ intro, trips: [...] }` shape — mirrors how
 *  parseGuideCards handles its two forms. Each trip needs at minimum a
 *  name and a summary; entries missing either are dropped. */
function parseDayTrips(v: unknown): DayTrips | null {
  if (!v || typeof v !== 'object') return null;
  const tripsRaw = Array.isArray(v) ? v : (v as Record<string, unknown>).trips;
  const trips = parseDayTripArray(tripsRaw);
  if (trips.length === 0) return null;
  const intro = Array.isArray(v)
    ? null
    : asString((v as Record<string, unknown>).intro);
  return { intro, trips };
}

function parseDayTripArray(v: unknown): DayTrip[] {
  if (!Array.isArray(v)) return [];
  return v
    .map(entry => {
      if (!entry || typeof entry !== 'object') return null;
      const e = entry as Record<string, unknown>;
      const name = asString(e.name);
      const summary = asString(e.summary);
      if (!name || !summary) return null;
      return {
        name,
        summary,
        travel: asString(e.travel),
        list: asString(e.list),
        pin: asString(e.pin),
      };
    })
    .filter((t): t is DayTrip => t !== null);
}

function parseRelated(v: unknown): ListRelated {
  const empty: ListRelated = { city: null, country: null, posts: [] };
  if (!v || typeof v !== 'object') return empty;
  const obj = v as Record<string, unknown>;
  return {
    city: asString(obj.city),
    country: asString(obj.country),
    posts: asStringArray(obj.posts),
  };
}

// _readListContent intentionally is NOT wrapped in unstable_cache.
// Previous versions used a 24-hour cross-request cache on this function,
// which caused a recurring class of bug: whenever a new /content/lists/<slug>.md
// file was added, if any request hit /lists/<slug> before the file was in
// the function bundle (e.g., during a partial deploy window), the function
// returned null, that null got cached for 24 hours under the v4 or v5 key,
// and the page kept rendering the generic "Pins on Mike's <slug> list"
// fallback even after the file was correctly bundled on subsequent
// deployments. We bumped the key (v4→v5) once after the Tbilisi batch and
// would have to bump it again after every new bulk-scaffold pass, which
// is not a sustainable pattern.
//
// The fix: do not cross-request-cache this. The file read is a single
// fs.readFile on a small bundled .md (microseconds). The matter() + marked
// parse is single-digit milliseconds on a ~5 KB file. React's cache()
// wrapper at export time still memoises within a single render. Across
// requests, every call re-reads the file fresh, which means a new
// deployment's bundled files are picked up immediately on the next
// request rather than 24 hours later.
async function _readListContent(slug: string): Promise<ListContent | null> {
  if (!SAFE_SLUG.test(slug)) return null;
  const file = path.join(CONTENT_ROOT, 'lists', `${slug}.md`);
  let raw: string;
  try {
    raw = await fs.readFile(file, 'utf8');
  } catch {
    return null;
  }
  const parsed = matter(raw);
  const data = parsed.data as Record<string, unknown>;
  const bodyMd = parsed.content.trim();
  if (!bodyMd && !data.faqs && !data.guide_cards && !data.route_map) {
    return null;
  }
  const bodyHtml = bodyMd ? await marked.parse(bodyMd, { async: true }) : '';
  return {
    body: bodyMd,
    bodyHtml,
    indexable: data.indexable === true,
    featured: data.featured === true,
    title: asString(data.title),
    headline: asString(data.headline),
    description: asString(data.description),
    heroImage: asString(data.hero_image),
    heroAlt: asString(data.hero_alt),
    published: asIsoDate(data.published),
    updated: asIsoDate(data.updated),
    authors: asStringArray(data.authors),
    routeMap: asString(data.route_map),
    guideCards: parseGuideCards(data.guide_cards),
    faqs: parseFaqs(data.faqs),
    related: parseRelated(data.related),
    topics: filterValidTopics(data.topics),
    dayTrips: parseDayTrips(data.day_trips),
  };
}

/**
 * Read a list's editorial markdown + opt-in frontmatter blocks. Distinct
 * from readPlaceContent (which serves pin/city/country prose) because
 * lists can opt into rendered blocks like guide cards and FAQs.
 */
export const readListContent = cache(_readListContent);

/** Lightweight per-guide shape for the /topics hub aggregation. */
export type GuideTopicEntry = {
  slug: string;
  /** Frontmatter title, or a prettified slug fallback. */
  title: string;
  description: string | null;
  heroImage: string | null;
  /** Validated topic slugs (see lib/topics.ts). */
  topics: string[];
  indexable: boolean;
};

/**
 * Scan /content/lists and return every guide with its validated topics.
 * Used by the /topics/<slug> hubs to aggregate guides by topic. readListContent
 * is React-cache'd within a request, so the per-file parse is cheap and the
 * whole scan is ISR-cached by the calling route.
 */
export async function getAllGuideTopicEntries(): Promise<GuideTopicEntry[]> {
  const dir = path.join(CONTENT_ROOT, 'lists');
  let files: string[];
  try {
    files = await fs.readdir(dir);
  } catch {
    return [];
  }
  const slugs = files
    .filter(f => f.endsWith('.md'))
    .map(f => f.slice(0, -3))
    .filter(s => SAFE_SLUG.test(s));
  const entries = await Promise.all(
    slugs.map(async slug => {
      const content = await readListContent(slug);
      if (!content) return null;
      return {
        slug,
        title: content.title ?? slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        description: content.description,
        heroImage: content.heroImage,
        topics: content.topics,
        indexable: content.indexable,
      } satisfies GuideTopicEntry;
    }),
  );
  return entries.filter((e): e is GuideTopicEntry => e !== null);
}

/** A guide's day-trips block, keyed by the city it belongs to. */
export type DayTripSet = {
  /** The city slug the day-trips page lives under (/cities/<citySlug>/day-trips).
   *  Frontmatter `related.city` when set, else the list slug. */
  citySlug: string;
  /** The source guide's list slug. */
  listSlug: string;
  dayTrips: DayTrips;
};

/**
 * Scan /content/lists and return every guide that has an authored
 * `day_trips:` block, keyed by city slug. Used by /cities/<slug>/day-trips
 * to find a city's trips and by the sitemap to list only the cities whose
 * page clears the substance gate.
 */
export async function getAllDayTripSets(): Promise<DayTripSet[]> {
  const dir = path.join(CONTENT_ROOT, 'lists');
  let files: string[];
  try {
    files = await fs.readdir(dir);
  } catch {
    return [];
  }
  const slugs = files
    .filter(f => f.endsWith('.md'))
    .map(f => f.slice(0, -3))
    .filter(s => SAFE_SLUG.test(s));
  const sets = await Promise.all(
    slugs.map(async listSlug => {
      const content = await readListContent(listSlug);
      if (!content?.dayTrips) return null;
      return {
        citySlug: content.related.city ?? listSlug,
        listSlug,
        dayTrips: content.dayTrips,
      } satisfies DayTripSet;
    }),
  );
  return sets.filter((s): s is DayTripSet => s !== null);
}

// === Inline pin photo injection =============================================
// The pure markdown-rewriting helpers live in lib/inlinePinPhotos.ts so they
// can be exercised from /scripts (tsx) without dragging the `server-only`
// import in this file. We re-export them here so callers have a single
// import surface, and add the rendered-HTML convenience that needs `marked`.

export {
  extractPinSlugsFromBody,
  enhanceBodyWithPinPhotos,
} from './inlinePinPhotos';
export type {
  InlinePinPhoto,
  InlinePinPhotoEntry,
} from './inlinePinPhotos';

import { enhanceBodyWithPinPhotos as _enhanceBody } from './inlinePinPhotos';
import type { InlinePinPhotoEntry as _Entry } from './inlinePinPhotos';

/**
 * Take a body markdown + the slug→photos map, run the inline-photo pass,
 * and return the final HTML. Lives here so the list page doesn't have to
 * know about marked.
 */
export async function renderListBodyWithPinPhotos(
  body: string,
  inlineSlugPhotos: Map<string, _Entry>,
): Promise<string> {
  if (!body) return '';
  const enhanced = _enhanceBody(body, inlineSlugPhotos);
  return await marked.parse(enhanced, { async: true });
}
