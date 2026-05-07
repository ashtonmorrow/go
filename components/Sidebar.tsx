// Server Component sidebar — pulls a small pre-aggregated chip payload
// from lib/sidebarData and the (small) article entries list, then hands
// them to the interactive client shell. SidebarShell decides which
// chrome to render based on usePathname, so this server component
// stays route-agnostic.
//
// Performance contract: this runs on every page render across the entire
// site. Both fetchSidebarChipData (chip arrays + counts) and
// getAllArticleEntries return small payloads (~few KB each), so they
// cache properly through Next's data cache (which rejects items over
// 2 MB). On warm cache, both calls are in-memory lookups — no Supabase
// round-trip. On cold cache, the underlying corpus fetches happen
// once per 24h cache window across the whole edge fleet.

import { fetchSidebarChipData } from '@/lib/sidebarData';
import { getAllArticleEntries } from '@/lib/articles';
import SidebarShell from './SidebarShell';

const ZERO_COUNTS = {
  cities: 0, countries: 0, been: 0, go: 0, saved: 0, pins: 0, lists: 0,
};

export default async function Sidebar() {
  // Sidebar is rendered from the root layout. If THIS server component
  // throws, the App Router's per-route error.tsx can't catch it (those
  // run at the route segment level, below the layout). Wrapping the
  // body in SafeSidebar returns a stub on any unexpected throw rather
  // than tearing down the page.
  return <SafeSidebar />;
}

async function SafeSidebar() {
  try {
    return await SidebarBody();
  } catch (err) {
    console.error('[Sidebar] failed:', err);
    return (
      <SidebarShell
        counts={ZERO_COUNTS}
        countryOptions={[]}
        pinCountryOptions={[]}
        pinCategoryOptions={[]}
        pinListOptions={[]}
        pinTagOptions={[]}
        pinSavedListOptions={[]}
        articleEntries={[]}
      />
    );
  }
}

async function SidebarBody() {
  const [chipData, articleEntries] = await Promise.all([
    fetchSidebarChipData().catch(err => {
      console.error('[Sidebar] fetchSidebarChipData failed:', err);
      return null;
    }),
    getAllArticleEntries().catch(err => {
      console.error('[Sidebar] getAllArticleEntries failed:', err);
      return [];
    }),
  ]);

  if (!chipData) {
    return (
      <SidebarShell
        counts={ZERO_COUNTS}
        countryOptions={[]}
        pinCountryOptions={[]}
        pinCategoryOptions={[]}
        pinListOptions={[]}
        pinTagOptions={[]}
        pinSavedListOptions={[]}
        articleEntries={articleEntries}
      />
    );
  }

  return (
    <SidebarShell
      counts={chipData.counts}
      countryOptions={chipData.countryOptions}
      pinCountryOptions={chipData.pinCountryOptions}
      pinCategoryOptions={chipData.pinCategoryOptions}
      pinListOptions={chipData.pinListOptions}
      pinTagOptions={chipData.pinTagOptions}
      pinSavedListOptions={chipData.pinSavedListOptions}
      articleEntries={articleEntries}
    />
  );
}
