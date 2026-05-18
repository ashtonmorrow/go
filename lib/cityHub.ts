// === City sub-hub helpers ===================================================
// /cities/<slug>/<hub> pages — things-to-do, hotels, day-trips — share an
// identical metadata shape, JSON-LD shape, and indexability gate. Only the
// data fetch, the copy, and the rendered body differ. These builders hold
// the shared 80% so each hub page is just: fetch -> build copy -> render.
//
// Pair with <CityHubShell> (components/CityHubShell.tsx), which renders the
// shared <article> wrapper, breadcrumb, and header.

import type { Metadata } from 'next';
import {
  SITE_URL,
  AUTHOR_ID,
  WEBSITE_ID,
  breadcrumbJsonLd,
  collectionJsonLd,
  clip,
} from '@/lib/seo';

/** Build the <head> metadata for a city sub-hub. The title/description copy
 *  is hub-specific; the canonical, robots gate, and OG/Twitter shape are not. */
export function cityHubMetadata(input: {
  citySlug: string;
  /** URL segment: 'things-to-do' | 'hotels' | 'day-trips'. */
  hub: string;
  title: string;
  description: string;
  /** When false the page emits noindex,follow (the substance gate). */
  indexable: boolean;
}): Metadata {
  const url = `${SITE_URL}/cities/${input.citySlug}/${input.hub}`;
  const ogTitle = `${input.title} · Mike Lee`;
  return {
    title: input.title,
    description: clip(input.description, 155) ?? input.description,
    alternates: { canonical: url },
    robots: input.indexable ? undefined : { index: false, follow: true },
    openGraph: {
      type: 'article',
      title: ogTitle,
      description: input.description,
      url,
    },
    twitter: {
      card: 'summary_large_image',
      title: ogTitle,
      description: input.description,
    },
  };
}

/** Build the three JSON-LD blocks every city sub-hub emits: a BreadcrumbList,
 *  a CollectionPage + ItemList, and an Article (only above the substance
 *  gate — a thin hub should not claim to be a piece of writing). */
export function cityHubSchema(input: {
  citySlug: string;
  cityName: string;
  hub: string;
  /** Breadcrumb leaf + collection/article name pieces. */
  leafLabel: string;
  collectionName: string;
  collectionDescription: string;
  items: { url: string; name: string; image?: string | null }[];
  indexable: boolean;
  articleHeadline: string;
  articleDescription: string;
}) {
  const url = `${SITE_URL}/cities/${input.citySlug}/${input.hub}`;
  const breadcrumb = breadcrumbJsonLd([
    { name: 'Home', item: SITE_URL },
    { name: 'Cities', item: `${SITE_URL}/cities/cards` },
    { name: input.cityName, item: `${SITE_URL}/cities/${input.citySlug}` },
    { name: input.leafLabel },
  ]);
  const collection = collectionJsonLd({
    url,
    name: input.collectionName,
    description: input.collectionDescription,
    totalItems: input.items.length,
    items: input.items.slice(0, 30),
  });
  const article = input.indexable
    ? {
        '@context': 'https://schema.org',
        '@type': 'Article',
        '@id': url,
        url,
        headline: input.articleHeadline,
        description: input.articleDescription,
        author: { '@id': AUTHOR_ID },
        publisher: { '@id': AUTHOR_ID },
        isPartOf: { '@id': WEBSITE_ID },
        inLanguage: 'en-US',
      }
    : null;
  return { breadcrumb, collection, article };
}

export type CityHubSchema = ReturnType<typeof cityHubSchema>;
