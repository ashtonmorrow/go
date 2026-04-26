// === Wikipedia summary fetcher ============================================
// For pins (and cities) that have a Wikipedia URL, hit the REST API for a
// clean lead paragraph + thumbnail. The endpoint is purpose-built for
// "first paragraph of an article" — Wikipedia themselves use it for the
// link previews that pop up when you hover internal links.
//
// API: https://en.wikipedia.org/api/rest_v1/page/summary/{title}
// Public, no key, CC-BY-SA. Cached aggressively because article ledes
// don't change hourly.
//
import { cache } from 'react';

export type WikipediaSummary = {
  title: string;
  /** First paragraph, stripped of citations. */
  extract: string;
  /** Short Wikidata description, e.g. "national park in Colorado, US". */
  description: string | null;
  thumbnailUrl: string | null;
  thumbnailWidth: number | null;
  thumbnailHeight: number | null;
  /** Canonical Wikipedia URL (might differ slightly from the input on redirect). */
  url: string;
};

/**
 * Pull the article title out of a Wikipedia URL. Handles both
 * https://en.wikipedia.org/wiki/Mesa_Verde_National_Park
 * and locale variants. Returns null if the URL doesn't look like one.
 */
export function titleFromWikipediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (!u.hostname.endsWith('wikipedia.org')) return null;
    const m = u.pathname.match(/^\/wiki\/(.+)$/);
    if (!m) return null;
    return decodeURIComponent(m[1]).replace(/_/g, ' ');
  } catch {
    return null;
  }
}

/**
 * Fetch the article summary for a given title. Cached via React.cache()
 * (per-request) and Next ISR (30 days). Returns null on any failure so
 * callers fall through to whatever they had before.
 */
export const fetchWikipediaSummary = cache(
  async (title: string | null): Promise<WikipediaSummary | null> => {
    if (!title) return null;
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
    try {
      const res = await fetch(url, {
        next: { revalidate: 60 * 60 * 24 * 30 }, // 30 days
        headers: {
          // Wikipedia asks for a contact-able UA per their etiquette.
          'User-Agent': 'go.mike-lee.me (https://go.mike-lee.me) personal travel atlas',
          // Article summaries — drop the rest of the response shape.
          'Accept': 'application/json',
        },
      });
      if (!res.ok) return null;
      const data = await res.json();
      // The REST API can return disambiguation or notFound types; we
      // skip those and let the caller render its existing description.
      if (data.type !== 'standard') return null;
      return {
        title: data.title ?? title,
        extract: data.extract ?? '',
        description: data.description ?? null,
        thumbnailUrl: data.thumbnail?.source ?? null,
        thumbnailWidth: data.thumbnail?.width ?? null,
        thumbnailHeight: data.thumbnail?.height ?? null,
        url: data.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`,
      };
    } catch {
      return null;
    }
  }
);
