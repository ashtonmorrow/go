// === Guide anchors =========================================================
//
// Resolves each featured list guide to one or more lat/lng anchors so the
// home globe can render a "Guides" layer on top of the city dots. The
// resolution order, per list slug:
//
//   1. Curated `THEMATIC_ANCHORS` map below. Lists that cover multiple
//      cities (spa-day, balkan-green-markets) or that don't share a slug
//      with their headline city (bath-uk → Bath, salisbury-stonehenge →
//      Salisbury) live here. Each entry emits one anchor per listed city.
//   2. Frontmatter `related.city` slug from /content/lists/<slug>.md.
//   3. The list slug itself, matched against a city slug.
//
// Each anchor produces one map pin pointing back to /lists/<slug>. A list
// with three thematic anchors renders three pins, all clicking through
// to the same guide. Lists with no resolvable anchor (pure-theme lists
// like "top-castles-in-spain" if/when they ship) are silently skipped on
// the map and still surface as Guide cards on /lists.

import path from 'node:path';
import { promises as fs } from 'node:fs';
import { readListContent } from './content';

/** Lists that cover multiple cities, OR whose slug doesn't match a city
 *  slug directly. Values are city slugs (must exist in go_cities). */
const THEMATIC_ANCHORS: Record<string, string[]> = {
  // Thematic / cross-destination lists
  'spa-day':              ['vaterstetten', 'pamukkale', 'budapest', 'bath', 'vienna', 'bucharest'],
  'balkan-green-markets': ['zagreb', 'split', 'kotor', 'sarajevo', 'belgrade', 'bucharest'],
  // Slug ≠ city slug
  'bath-uk':              ['bath'],
  'salisbury-stonehenge': ['salisbury'],
  'cabo-verde':           [], // country-only, no useful city anchor in the current atlas
  'kusttram-stations':    ['oostende'],
  // Multi-base lists where every base is worth its own pin
  'bali':                 ['ubud', 'seminyak', 'canggu'],
  // Route guides: anchor at the southern and northern endpoints plus
  // the two big intermediate stops, so the home globe shows the line
  // as a thread of pins rather than a single dot.
  'bernina-express-route': ['tirano', 'st-moritz', 'chur'],
};

export type GuideAnchor = {
  slug: string;        // /lists/<slug>
  title: string;       // guide title for hover/tap
  description: string; // short description
  cityName: string;    // anchor city's name (for label)
  lat: number;
  lng: number;
};

type CityLookup = {
  byName: Map<string, { name: string; slug: string; lat: number; lng: number }>;
  bySlug: Map<string, { name: string; slug: string; lat: number; lng: number }>;
};

/** Walk /content/lists, find every featured: true guide, resolve to
 *  city anchors. Skips lists with no resolvable anchor. */
export async function getGuideAnchors(
  cities: { name: string; slug: string; lat: number | null; lng: number | null }[],
): Promise<GuideAnchor[]> {
  const dir = path.join(process.cwd(), 'content', 'lists');
  let files: string[] = [];
  try {
    files = await fs.readdir(dir);
  } catch {
    return [];
  }
  const slugs = files.filter(f => f.endsWith('.md')).map(f => f.replace(/\.md$/, ''));

  // Build city lookup maps once.
  const lookup: CityLookup = { byName: new Map(), bySlug: new Map() };
  for (const c of cities) {
    if (c.lat == null || c.lng == null) continue;
    const row = { name: c.name, slug: c.slug, lat: c.lat, lng: c.lng };
    lookup.byName.set(c.name.toLowerCase(), row);
    lookup.bySlug.set(c.slug.toLowerCase(), row);
  }

  const contents = await Promise.all(
    slugs.map(async slug => ({ slug, content: await readListContent(slug) })),
  );

  const anchors: GuideAnchor[] = [];
  for (const { slug, content } of contents) {
    if (!content?.featured) continue;
    const title = content.title ?? slug;
    const description = content.description ?? '';

    const citySlugs = resolveCitySlugs(slug, content.related?.city ?? null);
    if (citySlugs.length === 0) continue;

    for (const citySlug of citySlugs) {
      const city = lookup.bySlug.get(citySlug.toLowerCase());
      if (!city) continue;
      anchors.push({
        slug,
        title,
        description,
        cityName: city.name,
        lat: city.lat,
        lng: city.lng,
      });
    }
  }
  return anchors;
}

function resolveCitySlugs(listSlug: string, frontmatterCity: string | null): string[] {
  // Thematic / curated wins first. Lets a multi-base list emit several
  // anchors and lets odd-slug lists (bath-uk → bath) map cleanly.
  if (listSlug in THEMATIC_ANCHORS) {
    return THEMATIC_ANCHORS[listSlug];
  }
  // Frontmatter explicit city slug.
  if (frontmatterCity) return [frontmatterCity];
  // Fall back to the list slug itself.
  return [listSlug];
}
