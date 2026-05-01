// === /pins/views ===========================================================
// Index of curated landing pages over the pin set. Each entry in PIN_VIEWS
// gets a card here with its label + description; click-through goes to
// /pins/views/<slug>. The index itself is a simple CollectionPage — no
// filters, no map, just navigation.

import Link from 'next/link';
import type { Metadata } from 'next';
import { listPinViews } from '@/lib/pinViews';
import JsonLd from '@/components/JsonLd';
import { SITE_URL, collectionJsonLd } from '@/lib/seo';

export const revalidate = 604800;

const DESCRIPTION =
  'Curated angles on the pin atlas — places I’ve reviewed, UNESCO sites, free admission, kid-friendly stops, and more.';

export const metadata: Metadata = {
  title: 'Pin views',
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/pins/views` },
  openGraph: {
    type: 'website',
    url: `${SITE_URL}/pins/views`,
    title: 'Pin views · Mike Lee',
    description: DESCRIPTION,
  },
};

export default function PinViewsIndex() {
  const views = listPinViews();
  const data = collectionJsonLd({
    url: `${SITE_URL}/pins/views`,
    name: 'Pin views',
    description: DESCRIPTION,
    totalItems: views.length,
    items: views.map(v => ({
      url: `${SITE_URL}/pins/views/${v.slug}`,
      name: v.label,
    })),
  });

  return (
    <article className="max-w-page mx-auto px-5 py-8">
      <JsonLd data={data} />

      <nav className="text-small text-muted mb-3" aria-label="Breadcrumb">
        <Link href="/pins/cards" className="hover:text-teal">Pins</Link>
        <span className="mx-1.5" aria-hidden>›</span>
        <span className="text-ink-deep">Views</span>
      </nav>

      <header className="mb-6">
        <h1 className="text-h1 text-ink-deep leading-tight">Pin views</h1>
        <p className="mt-2 text-prose text-slate max-w-prose">{DESCRIPTION}</p>
      </header>

      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {views.map(v => (
          <li key={v.slug}>
            <Link
              href={`/pins/views/${v.slug}`}
              className="block card p-4 hover:shadow-paper transition-shadow"
            >
              <h2 className="text-h3 text-ink-deep leading-tight">{v.label}</h2>
              <p className="mt-1.5 text-small text-slate">{v.description}</p>
              <p className="mt-2 text-label text-muted uppercase tracking-[0.12em]">
                {v.surface ?? 'map'} view →
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </article>
  );
}
