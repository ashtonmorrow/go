import 'server-only';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { readListContent } from '@/lib/content';

// === featuredGuides ==========================================================
// Surface picker used by the home-page DestinationPicker. Returns the N
// most-recently-touched featured guides (content/lists/<slug>.md with
// `featured: true`) shaped for a photo-card grid.
//
// Recency: content.updated wins; published is the fallback; alphabetical
// is the tiebreak. Picking by recency rather than alpha keeps the home
// signaling editorial freshness without making the owner manually
// curate a featured set.
//
// Cached behind unstable_cache for 24h since the source data is
// filesystem-bound + small.

export type FeaturedGuide = {
  slug: string;
  title: string;
  /** One-sentence editorial pitch from frontmatter.description. */
  description: string | null;
  heroImage: string | null;
  /** ISO date used for ordering; null sinks to the back. */
  updatedAt: string | null;
};

const _fetchFeaturedGuides = unstable_cache(
  async (limit: number): Promise<FeaturedGuide[]> => {
    const dir = path.join(process.cwd(), 'content', 'lists');
    let files: string[] = [];
    try {
      files = await fs.readdir(dir);
    } catch {
      return [];
    }
    const slugs = files
      .filter(f => f.endsWith('.md'))
      .map(f => f.replace(/\.md$/, ''));
    const contents = await Promise.all(slugs.map(slug => readListContent(slug)));
    const rows: FeaturedGuide[] = [];
    for (let i = 0; i < slugs.length; i++) {
      const c = contents[i];
      if (!c?.featured) continue;
      rows.push({
        slug: slugs[i],
        // Editorial title first, SEO title second, slug last. The
        // headline is Mike's voice line and isn't always a destination
        // name, so it's not safe for the picker card title.
        title: c.title ?? slugs[i],
        description: c.description,
        heroImage: c.heroImage,
        updatedAt: c.updated ?? c.published ?? null,
      });
    }
    rows.sort((a, b) => {
      const at = a.updatedAt ? Date.parse(a.updatedAt) : 0;
      const bt = b.updatedAt ? Date.parse(b.updatedAt) : 0;
      if (at !== bt) return bt - at;
      return a.title.localeCompare(b.title);
    });
    return rows.slice(0, limit);
  },
  ['featured-guides-v1'],
  { revalidate: 86400, tags: ['featured-guides'] },
);

export const fetchFeaturedGuides = cache(
  async (limit = 12): Promise<FeaturedGuide[]> => _fetchFeaturedGuides(limit),
);
