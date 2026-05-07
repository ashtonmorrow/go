// === commonsAttributionLookup ==============================================
// Server-side cached wrapper around fetchCommonsAttribution. Returns the
// attribution metadata for a Commons URL so a page-level render can pass
// it down to <CommonsAttributionBadge> for inline credit display
// ("Photo: Author · CC BY-SA 4.0" instead of the bare "via Commons" link).
//
// Cached via unstable_cache for 30 days because attribution rarely
// changes once published. Bust manually if a Commons file's metadata
// gets corrected and you need the new credit to show up sooner.
//
// Usage (server component):
//   const attribution = await getCommonsAttribution(url);
//   <CommonsAttributionBadge url={url} attribution={attribution} />

import 'server-only';
import { unstable_cache } from 'next/cache';
import {
  fetchCommonsAttribution,
  isCommonsUrl,
  type CommonsAttribution,
} from './commonsAttribution';

const CACHE_REVALIDATE_SECONDS = 60 * 60 * 24 * 30; // 30 days

const _getCommonsAttribution = unstable_cache(
  async (url: string): Promise<CommonsAttribution | null> => {
    if (!isCommonsUrl(url)) return null;
    return fetchCommonsAttribution(url);
  },
  ['commons-attribution-v1'],
  { revalidate: CACHE_REVALIDATE_SECONDS, tags: ['commons-attribution'] },
);

export async function getCommonsAttribution(
  url: string | null | undefined,
): Promise<CommonsAttribution | null> {
  if (!url) return null;
  return _getCommonsAttribution(url);
}

export type { CommonsAttribution };
