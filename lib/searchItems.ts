import 'server-only';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { readListContent } from '@/lib/content';
import { getAllArticleEntries } from '@/lib/articles';
import type { SearchItem } from '@/components/SearchModal';

// === searchItems ===========================================================
// Builds the suggestion list shown in the ⌘K SearchModal. Pulls together:
//   - Featured destination guides (from /content/lists/*.md featured: true)
//   - Published articles (the same union getAllArticleEntries serves
//     /articles)
//   - Top-level pages so the modal can navigate to /, /lists, /atlas,
//     /about even before the user types anything
//
// All three sources are pre-filtered to user-facing content. Hidden
// admin routes, raw saved lists, and not-yet-published guides do not
// surface here. The list is small (typically under 30 items today),
// so client-side filtering on each keystroke stays cheap.

const TOP_LEVEL_PAGES: SearchItem[] = [
  { key: 'page:home', href: '/', title: 'Home', subtitle: 'Travel notes, guides, and an atlas', kind: 'page' },
  { key: 'page:lists', href: '/lists', title: 'Lists', subtitle: 'Travel guides and saved lists', kind: 'page' },
  { key: 'page:articles', href: '/articles', title: 'Articles', subtitle: 'Field notes and reference pieces', kind: 'page' },
  { key: 'page:atlas', href: '/cities/map', title: 'Atlas', subtitle: 'Cities, countries, pins, world map', kind: 'page' },
  { key: 'page:about', href: '/about', title: 'About', subtitle: 'About this atlas', kind: 'page' },
];

/** Read every /content/lists/*.md file, return SearchItem entries for
 *  the ones flagged `featured: true`. Cached for 24h via the same
 *  layer readListContent uses. */
async function _featuredGuideItems(): Promise<SearchItem[]> {
  const dir = path.join(process.cwd(), 'content', 'lists');
  let entries: string[] = [];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }
  const slugs = entries
    .filter(f => f.endsWith('.md'))
    .map(f => f.replace(/\.md$/, ''));
  const out: SearchItem[] = [];
  for (const slug of slugs) {
    const content = await readListContent(slug);
    if (!content?.featured) continue;
    out.push({
      key: `guide:${slug}`,
      href: `/lists/${slug}`,
      title: content.title ?? slug,
      subtitle: content.description ?? null,
      kind: 'guide',
    });
  }
  // Stable sort by title so the same set appears in the same order
  // on every render (prevents the modal's "first 8" snapshot from
  // flickering between revalidates).
  out.sort((a, b) => a.title.localeCompare(b.title));
  return out;
}

const _cachedFeaturedGuideItems = unstable_cache(
  _featuredGuideItems,
  ['search-featured-guide-items-v1'],
  { revalidate: 86400, tags: ['place-content'] },
);

/** Build the full SearchItem list for the SearchModal. Called from the
 *  Sidebar server component; result is cached at the per-request level
 *  via React.cache so multiple sidebars on the same render share. */
export const buildSearchItems = cache(async (): Promise<SearchItem[]> => {
  const [guides, articles] = await Promise.all([
    _cachedFeaturedGuideItems(),
    getAllArticleEntries(),
  ]);

  const articleItems: SearchItem[] = articles.map(a => ({
    key: `article:${a.key}`,
    href: a.href,
    title: a.title,
    subtitle: a.description,
    kind: 'article',
  }));

  // Order: guides first (they're the headline content), articles next,
  // pages last. The empty-state snapshot in the modal shows the top 8
  // of this combined list, so guides taking the top slots gives
  // strangers a useful first glimpse.
  return [...guides, ...articleItems, ...TOP_LEVEL_PAGES];
});
