// === Web App Manifest ======================================================
// PWA-style installability: served at /manifest.webmanifest by Next.js
// when this file is present. Lets Safari / Chrome offer "Add to Home
// Screen" with our brand chrome instead of a generic browser shortcut,
// and feeds OS-level dark/light theming hints.
//
// Icons reference the existing app/icon.png and app/apple-icon.png that
// Next.js already serves under stable hashed paths. The manifest is
// dynamic, so when those files change Next regenerates the URLs.
//
import type { MetadataRoute } from 'next';
import { SITE_NAME, SITE_DESCRIPTION } from '@/lib/seo';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_NAME,
    short_name: 'Travel',
    description: SITE_DESCRIPTION,
    // Open into the postcards index — the canonical home of the atlas.
    // The bare "/" redirects there anyway, but pinning the start_url
    // explicitly avoids a flash of the redirect when launched standalone.
    start_url: '/cities',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    // Match the cream-soft surface that the rest of the site sits on.
    background_color: '#faf9f7',
    // Browser chrome (status bar) tint. Kept dark so the brand reads as
    // serious / editorial rather than playful.
    theme_color: '#1c1b19',
    categories: ['travel', 'reference', 'lifestyle'],
    lang: 'en-US',
    icons: [
      // The PNG sources live at app/icon.png (32×32) and app/apple-icon.png
      // (180×180). Next.js serves them at the hashed paths it generates,
      // but the manifest references the public, stable URL.
      { src: '/icon.png', sizes: '32x32', type: 'image/png' },
      { src: '/apple-icon.png', sizes: '180x180', type: 'image/png', purpose: 'any' },
      { src: '/apple-icon.png', sizes: '180x180', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
