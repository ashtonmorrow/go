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
  // === Legacy URL redirects =============================================
  // The atlas now uses an Object × View URL shape: /<object>/<view> with
  // <object> ∈ {cities, countries, pins} and <view> ∈ {cards, map, table}.
  // The original routes listed below predate that scheme; we 308-redirect
  // them to the canonical paths so existing links and search results
  // don't break.
  async redirects() {
    return [
      // Object indexes → cards (the default view)
      { source: '/cities',    destination: '/cities/cards',    permanent: true },
      { source: '/countries', destination: '/countries/cards', permanent: true },
      { source: '/pins',      destination: '/pins/cards',      permanent: true },
      // Standalone view pages → object/view canonicals
      { source: '/map',   destination: '/cities/map',     permanent: true },
      { source: '/table', destination: '/cities/table',   permanent: true },
      { source: '/world', destination: '/countries/map', permanent: true },
    ];
  },
};
module.exports = nextConfig;
