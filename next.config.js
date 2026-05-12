/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'upload.wikimedia.org' },
      { protocol: 'https', hostname: 'commons.wikimedia.org' },
      { protocol: 'http', hostname: 'commons.wikimedia.org' },
      { protocol: 'https', hostname: 'www.notion.so' },
      { protocol: 'https', hostname: 'prod-files-secure.s3.us-west-2.amazonaws.com' },
      { protocol: 'https', hostname: 's3.us-west-2.amazonaws.com' },
      { protocol: 'https', hostname: 'flagcdn.com' },
      { protocol: 'https', hostname: 'hatscripts.github.io' },
      { protocol: 'https', hostname: 'tile.openstreetmap.org' },
      // Pin images. Airtable attachment URLs are short-lived; we keep
      // the host on the allowlist so the index/detail pages render
      // until task #83 (rehost into Supabase Storage) lands.
      { protocol: 'https', hostname: 'v5.airtableusercontent.com' },
      // Supabase Storage CDN — used by the future rehost target as well
      // as anything we serve from the Stray bucket directly.
      { protocol: 'https', hostname: 'pdjrvlhepiwkshxerkpz.supabase.co' },
    ],
    // Image sizes Next.js will produce when proxying through /_next/image.
    // Vercel returns 400 INVALID_IMAGE_OPTIMIZE_REQUEST when a `w=` query
    // doesn't match any value in deviceSizes ∪ imageSizes — so every
    // width thumbUrl()/heroUrl() can emit (×2 for retina) needs to be
    // listed here. Current callsites emit widths:
    //   80  (size 40 retina×2) — country flags
    //   112 (size 56 retina×2) — pin-card thumbs in PinsGrid
    //   160 (size 80 retina×2) — country flag detail
    //   192 (size 96 retina×2) — pin-detail icon tile
    //   480 (size 240 retina×2) — gallery / saved-list cards
    //   640 (size 320 retina×2) — list cover / related-pin cards
    //   800 (size 400 retina×2) — list cards on /lists index
    //   2400 (heroUrl width 1200 retina×2) — detail-page heroes
    // Anything not in the union below 400s. Keep the defaults plus the
    // custom widths we use; lib/imageUrl.ts ALSO snaps to the nearest
    // allowed size so a stray request for, say, 100px lands on 96.
    imageSizes: [16, 32, 48, 64, 80, 96, 112, 128, 160, 192, 240, 256, 384, 480],
    deviceSizes: [640, 750, 800, 828, 1080, 1200, 1920, 2048, 2400, 3840],
    // Cache resized variants for a year — saved-list and pin photos don't
    // change after upload, so the long TTL keeps Vercel's image-CDN hits
    // reusable across deploys instead of re-rendering on every revalidate.
    minimumCacheTTL: 60 * 60 * 24 * 365,
    // Prefer modern formats when the browser supports them. Next picks
    // automatically based on the Accept header; both fall back to JPEG.
    formats: ['image/avif', 'image/webp'],
  },
  // Ship the file-based content collection (lib/content.ts reads from /content
  // at request time) inside the serverless function bundles. Next.js can't
  // statically trace the dynamic fs.readFile path so we tell it explicitly.
  outputFileTracingIncludes: {
    '/pins/[slug]':      ['./content/**/*'],
    '/cities/[slug]':    ['./content/**/*'],
    '/countries/[slug]': ['./content/**/*'],
  },
  experimental: {
    // Fine-tune if needed
  },
  // Ship source maps to production so PSI's "Missing source maps for
  // large first-party JavaScript" check passes and stack traces in
  // Vercel's runtime logs are readable. Source maps are uploaded
  // separately from the JS bundles, so users don't pay the byte cost
  // unless they open DevTools.
  productionBrowserSourceMaps: true,
  // === Legacy URL redirects =============================================
  // The atlas now uses an Object × View URL shape: /<object>/<view> with
  // <object> ∈ {cities, countries, pins} and <view> ∈ {cards, map, table}.
  // The original routes listed below predate that scheme; we 308-redirect
  // them to the canonical paths so existing links and search results
  // don't break.
  async redirects() {
    // === Legacy saved-list slug redirects ==================================
    // Saved lists were renamed during the May 2026 dedup pass. Slugs without
    // an existing meta row would otherwise 404; we permanent-redirect them
    // at their new canonical slug instead. Add to this table when you
    // merge or rename a list and want old bookmarks to keep working. The
    // name/slug split (saved_lists.slug column, May 2026) makes future
    // renames URL-stable, so this table should not grow much.
    const legacyListSlugs = [
      ['cordoba',                       'cordoba-ar'],     // Spain vs Argentina disambig
      ['den-haag',                      'the-hague'],      // Dutch name → English canonical
      ['santiago-de',                   'santiago-chile'], // fragment merged into Chile list

      // May 2026 Bali consolidation: four sub-region lists folded into a
      // single 'bali' list since the trip-planning question for visitors
      // is which Bali base, not whether to keep four separate lists.
      ['bali-(seminyak)',               'bali'],
      ['canggu-(bali)',                 'bali'],
      ['seminyak-(bali)',               'bali'],
      ['ubud-(bali)',                   'bali'],

      // Misc duplicate-list cleanup at the same pass.
      ['bruges(1)',                     'bruges'],         // import-time accidental dupe
      ['budapest-&-closeby-attractions','budapest'],       // subset of the main list
      ['london,-food-&-sites',          'london'],         // subset of the main list
      ['lyon-fr',                       'lyon'],           // redundant country suffix
      ['seoul-(all-sites)',             'seoul'],          // renamed for cleaner slug

      // Belgian-coast consolidation: the destinations lists were folded
      // into kusttram-stations and the narrative was broadened to cover
      // the eat/stop places along the line.
      ['belgian-coast',                 'kusttram-stations'],
      ['belgian-coastal-town-stops',    'kusttram-stations'],
    ];
    const listSlugRedirects = legacyListSlugs.flatMap(([from, to]) => [
      { source: `/lists/${from}`,       destination: `/lists/${to}`,       permanent: true },
      { source: `/admin/lists/${from}`, destination: `/admin/lists/${to}`, permanent: true },
    ]);

    // === Legacy pin slug redirects =========================================
    // When a duplicate pin gets merged and the surviving pin is renamed to
    // a shorter / cleaner slug, this catches anyone who bookmarked the
    // old longer slug.
    const legacyPinSlugs = [
      ['hopa-taproom-craft-beer-bar', 'hopa-taproom'], // Tbilisi dup merge
    ];
    const pinSlugRedirects = legacyPinSlugs.flatMap(([from, to]) => [
      { source: `/pins/${from}`,       destination: `/pins/${to}`,       permanent: true },
      { source: `/admin/pins/${from}`, destination: `/admin/pins/${to}`, permanent: true },
    ]);

    return [
      // Object indexes → cards (the default view)
      { source: '/cities',    destination: '/cities/cards',    permanent: true },
      // Countries default to the globe — visited countries on a map is the
      // headline visual for that object; flag cards lose to it on first
      // impression. Cards still reachable via the ViewSwitcher.
      { source: '/countries', destination: '/countries/map', permanent: true },
      { source: '/pins',      destination: '/pins/cards',      permanent: true },
      // Standalone view pages → object/view canonicals
      { source: '/map',   destination: '/cities/map',     permanent: true },
      { source: '/table', destination: '/cities/table',   permanent: true },
      { source: '/world', destination: '/countries/map', permanent: true },
      // Merged/renamed saved-list slugs
      ...listSlugRedirects,
      // Merged/renamed pin slugs
      ...pinSlugRedirects,
    ];
  },
};
module.exports = nextConfig;
