import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';

// Single-rule allow-all robots.txt with a pointer to the dynamic sitemap.
// If we ever need to block routes (preview, /api, etc.) add a second rule
// with `disallow`.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/' }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
