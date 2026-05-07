import 'server-only';
import { promises as fs } from 'fs';
import path from 'path';
import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import matter from 'gray-matter';
import { marked } from 'marked';

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
};

const CONTENT_ROOT = path.join(process.cwd(), 'content');

/**
 * Strict slug pattern. Avoids escapes into ../ or absolute paths since the
 * slug is taken straight from the URL.
 */
const SAFE_SLUG = /^[a-z0-9][a-z0-9-]*$/;

function parseFrontmatter(raw: string): { meta: Record<string, string | boolean | number>; body: string } {
  // Reject anything that doesn't open with the YAML fence on line one.
  if (!raw.startsWith('---')) {
    return { meta: {}, body: raw };
  }
  // Find the closing fence on its own line. Search starts past the opener.
  const close = raw.indexOf('\n---', 3);
  if (close === -1) return { meta: {}, body: raw };
  const fmRaw = raw.slice(3, close).replace(/^\r?\n/, '');
  const body = raw.slice(close + 4).replace(/^\r?\n/, '');
  const meta: Record<string, string | boolean | number> = {};
  for (const line of fmRaw.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.+?)\s*$/);
    if (!match) continue;
    const [, key, raw] = match;
    if (raw === 'true') meta[key] = true;
    else if (raw === 'false') meta[key] = false;
    else if (/^-?\d+(?:\.\d+)?$/.test(raw)) meta[key] = Number(raw);
    else meta[key] = raw.replace(/^["']|["']$/g, '');
  }
  return { meta, body };
}

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
    const { meta, body } = parseFrontmatter(raw);
    const trimmed = body.trim();
    if (!trimmed) return null;
    return {
      body: trimmed,
      indexable: meta.indexable === true,
    };
  },
  ['place-content'],
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
  title: string | null;
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

const _readListContent = unstable_cache(
  async (slug: string): Promise<ListContent | null> => {
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
      // Nothing to render — neither prose nor blocks.
      return null;
    }
    const bodyHtml = bodyMd ? await marked.parse(bodyMd, { async: true }) : '';
    return {
      body: bodyMd,
      bodyHtml,
      indexable: data.indexable === true,
      title: asString(data.title),
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
    };
  },
  ['list-content-v1'],
  { revalidate: 86400, tags: ['place-content'] },
);

/**
 * Read a list's editorial markdown + opt-in frontmatter blocks. Distinct
 * from readPlaceContent (which serves pin/city/country prose) because
 * lists can opt into rendered blocks like guide cards and FAQs.
 */
export const readListContent = cache(_readListContent);
