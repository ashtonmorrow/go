import type { Metadata } from 'next';
import './globals.css';
import Sidebar from '@/components/Sidebar';
import { CityFiltersProvider } from '@/components/CityFiltersContext';
import JsonLd from '@/components/JsonLd';
import {
  SITE_URL,
  SITE_NAME,
  SITE_DESCRIPTION,
  AUTHOR_NAME,
  personJsonLd,
  websiteJsonLd,
} from '@/lib/seo';

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
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/* Sitewide JSON-LD: Person (the author/publisher) and WebSite.
            Detail pages reference the Person via { "@id": AUTHOR_ID }. */}
        <JsonLd data={personJsonLd()} />
        <JsonLd data={websiteJsonLd()} />

        {/* Two-column app shell: persistent left sidebar, scrollable main.
            On mobile (< md) the sidebar collapses into a top bar + drawer
            (rendered inside <Sidebar /> itself) so this flex layout still
            works; the drawer is fixed-positioned and doesn't affect flow. */}
        <CityFiltersProvider>
          <div className="md:flex md:min-h-screen">
            <Sidebar />
            <main className="flex-1 min-w-0">{children}</main>
          </div>
        </CityFiltersProvider>
      </body>
    </html>
  );
}
