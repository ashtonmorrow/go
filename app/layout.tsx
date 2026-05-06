import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Sidebar from '@/components/Sidebar';
import AppHeader from '@/components/AppHeader';
import { CityFiltersProvider } from '@/components/CityFiltersContext';
import { PinFiltersProvider } from '@/components/PinFiltersContext';
import { CountryFiltersProvider } from '@/components/CountryFiltersContext';
import JsonLd from '@/components/JsonLd';
import CookieBanner from '@/components/CookieBanner';
import GoogleAnalytics from '@/components/GoogleAnalytics';
import {
  SITE_URL,
  SITE_NAME,
  SITE_DESCRIPTION,
  AUTHOR_NAME,
  personJsonLd,
  websiteJsonLd,
} from '@/lib/seo';

// Self-hosted Inter via next/font. Replaces the previous render-blocking
// `@import url(rsms.me/inter/inter.css)` in globals.css — that was a critical
// path round-trip, this one inlines the @font-face and preloads the file.
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

// The root chrome reads the request pathname in <Sidebar /> so it can avoid
// loading heavy city/pin corpuses on pages that do not render filter panels.
// Marking the shell dynamic makes that contract explicit and stops Next from
// probing ordinary routes as static, only to trip over headers() during build.
export const dynamic = 'force-dynamic';

// === Sitewide metadata =====================================================
// metadataBase makes relative URLs in metadata.openGraph etc. resolve to
// the production origin instead of localhost. Title template lets every
// page set its own short title; the framework appends ' · Mike Lee' if the
// page passes a string. Pages that want a fully custom title export their
// own metadata.title without going through the template.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_NAME,
    template: '%s · Mike Lee',
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  authors: [{ name: AUTHOR_NAME, url: 'https://mike-lee.me' }],
  creator: AUTHOR_NAME,
  publisher: AUTHOR_NAME,
  // Sane robots defaults — index everything, follow links, max-snippet so
  // Google can show longer descriptions when it wants.
  robots: {
    index: true,
    follow: true,
    'max-snippet': -1,
    'max-image-preview': 'large',
    'max-video-preview': -1,
  },
  // Default Open Graph + Twitter — pages can override.
  openGraph: {
    type: 'website',
    siteName: 'mike-lee.me',
    locale: 'en_US',
    url: SITE_URL,
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    creator: '@mikelee',
  },
  // Auto-discovery for the JSON Feed of pins. NetNewsWire and Inoreader
  // pick this up automatically when the user visits any page on the site
  // — saves them from having to know the feed URL by heart. Next.js
  // serializes `alternates.types` as <link rel="alternate" type="…">.
  alternates: {
    canonical: SITE_URL,
    types: {
      'application/feed+json': `${SITE_URL}/feeds/pins.json`,
    },
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className={inter.className}>
        {/* Google Analytics 4 — uses next/script with strategy
            'beforeInteractive' which is the only Next.js 15 strategy that
            injects scripts into the framework's static <head> at
            server-render time (the earlier raw <script>-in-<head>
            approach got streamed as part of the RSC payload, which
            Google's tag detector doesn't see). Mounted at the root of
            <body> per Next's beforeInteractive constraint; the actual
            placement in the rendered HTML is in <head>. */}
        <GoogleAnalytics />
        {/* Sitewide JSON-LD: Person (the author/publisher) and WebSite.
            Detail pages reference the Person via { "@id": AUTHOR_ID }. */}
        <JsonLd data={personJsonLd()} />
        <JsonLd data={websiteJsonLd()} />

        {/* Two-column app shell: persistent left sidebar, scrollable main.
            On mobile (< md) the sidebar collapses into a top bar + drawer
            (rendered inside <Sidebar /> itself) so this flex layout still
            works; the drawer is fixed-positioned and doesn't affect flow. */}
        <CityFiltersProvider>
          <CountryFiltersProvider>
            <PinFiltersProvider>
              <div className="md:flex md:min-h-screen">
                <Sidebar />
                <main className="flex-1 min-w-0">{children}</main>
              </div>
              {/* Sitewide ViewSwitcher — fixed top-right on every Object
                  route, hidden on chrome-less surfaces (admin, articles,
                  about, credits, privacy). Replaces 14 per-page invocations. */}
              <AppHeader />
              <CookieBanner />
            </PinFiltersProvider>
          </CountryFiltersProvider>
        </CityFiltersProvider>
      </body>
    </html>
  );
}
