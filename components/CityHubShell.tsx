// Shared page shell for the /cities/<slug>/<hub> sub-hubs (things-to-do,
// hotels, day-trips). Renders the JSON-LD, the breadcrumb, and the header
// (H1 + country line + intro). The hub-specific body is passed as children
// and renders after the header.

import Link from 'next/link';
import JsonLd from '@/components/JsonLd';
import type { CityHubSchema } from '@/lib/cityHub';

export default function CityHubShell({
  citySlug,
  cityName,
  country,
  leafLabel,
  h1,
  schema,
  intro,
  children,
}: {
  citySlug: string;
  cityName: string;
  country: { name: string; continent?: string | null } | null;
  /** Breadcrumb leaf, e.g. "Things to do". */
  leafLabel: string;
  h1: string;
  schema: CityHubSchema;
  /** Intro paragraph(s), rendered inside <header> under the country line. */
  intro: React.ReactNode;
  /** The hub body (pin grid, day-trips table…), rendered after the header. */
  children?: React.ReactNode;
}) {
  return (
    <article className="max-w-page mx-auto px-5 py-8">
      <JsonLd data={schema.breadcrumb} />
      <JsonLd data={schema.collection} />
      {schema.article && <JsonLd data={schema.article} />}

      <nav className="text-small text-muted mb-3" aria-label="Breadcrumb">
        <Link href="/cities/cards" className="hover:text-teal">Cities</Link>
        <span className="mx-1.5" aria-hidden>›</span>
        <Link href={`/cities/${citySlug}`} className="hover:text-teal">{cityName}</Link>
        <span className="mx-1.5" aria-hidden>›</span>
        <span className="text-ink-deep">{leafLabel}</span>
      </nav>

      <header className="mb-8 max-w-prose">
        <h1 className="text-h1 text-ink-deep leading-tight">{h1}</h1>
        {country && (
          <p className="mt-2 text-prose text-slate leading-snug">
            {country.name}
            {country.continent ? `, ${country.continent}` : ''}
          </p>
        )}
        {intro}
      </header>

      {children}
    </article>
  );
}
