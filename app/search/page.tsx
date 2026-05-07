import Link from 'next/link';
import type { Metadata } from 'next';

import JsonLd from '@/components/JsonLd';
import { getAllPosts } from '@/lib/posts';
import { fetchAllSavedListsMeta, listNameToSlug } from '@/lib/savedLists';
import { supabase } from '@/lib/supabase';
import { SITE_URL, webPageJsonLd } from '@/lib/seo';

type Props = {
  searchParams: Promise<{ q?: string }>;
};

type SearchHit = {
  href: string;
  title: string;
  eyebrow: string;
  description: string | null;
};

export const metadata: Metadata = {
  title: 'Search',
  description: "Search Mike Lee's travel atlas by article, city, country, saved list, or pin.",
  alternates: { canonical: '/search' },
  robots: {
    index: false,
    follow: true,
  },
};

function cleanQuery(raw: string | undefined): string {
  return (raw ?? '').trim().slice(0, 80);
}

function likePattern(query: string): string {
  return `%${query.replace(/[%_]/g, '\\$&')}%`;
}

function includesQuery(values: Array<string | null | undefined>, query: string): boolean {
  const q = query.toLowerCase();
  return values.some((value) => value?.toLowerCase().includes(q));
}

function excerpt(text: string | null | undefined, max = 150): string | null {
  if (!text) return null;
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return null;
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max - 30 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}

async function searchPosts(query: string): Promise<SearchHit[]> {
  const posts = await getAllPosts();
  return posts
    .filter((post) => post.indexable)
    .filter((post) =>
      includesQuery(
        [post.title, post.subtitle, post.bodyMd, ...post.tags],
        query,
      ),
    )
    .slice(0, 8)
    .map((post) => ({
      href: post.externalRoute ?? `/posts/${post.slug}`,
      title: post.title,
      eyebrow: 'Article',
      description: post.subtitle ?? excerpt(post.bodyMd),
    }));
}

async function searchCities(query: string): Promise<SearchHit[]> {
  const { data, error } = await supabase
    .from('go_cities')
    .select('name, slug, country, about')
    .ilike('name', likePattern(query))
    .not('slug', 'like', 'delete-%')
    .order('name', { ascending: true })
    .limit(10);
  if (error) {
    console.error('[search] city search failed:', error);
    return [];
  }
  return (data ?? []).map((city: any) => ({
    href: `/cities/${city.slug}`,
    title: city.name,
    eyebrow: city.country ? `City · ${city.country}` : 'City',
    description: excerpt(city.about),
  }));
}

async function searchCountries(query: string): Promise<SearchHit[]> {
  const { data, error } = await supabase
    .from('go_countries')
    .select('name, slug, wikipedia_summary')
    .ilike('name', likePattern(query))
    .order('name', { ascending: true })
    .limit(10);
  if (error) {
    console.error('[search] country search failed:', error);
    return [];
  }
  return (data ?? []).map((country: any) => ({
    href: `/countries/${country.slug}`,
    title: country.name,
    eyebrow: 'Country',
    description: excerpt(country.wikipedia_summary),
  }));
}

async function searchPins(query: string): Promise<SearchHit[]> {
  const { data, error } = await supabase
    .from('pins')
    .select('name, slug, id, kind, city_names, states_names, description')
    .ilike('name', likePattern(query))
    .order('name', { ascending: true })
    .limit(12);
  if (error) {
    console.error('[search] pin search failed:', error);
    return [];
  }
  return (data ?? []).map((pin: any) => {
    const place = [...(pin.city_names ?? []), ...(pin.states_names ?? [])]
      .filter(Boolean)
      .join(', ');
    const kind = pin.kind ? `${pin.kind[0].toUpperCase()}${pin.kind.slice(1)}` : 'Pin';
    return {
      href: `/pins/${pin.slug ?? pin.id}`,
      title: pin.name,
      eyebrow: place ? `${kind} · ${place}` : kind,
      description: excerpt(pin.description),
    };
  });
}

async function searchLists(query: string): Promise<SearchHit[]> {
  const meta = await fetchAllSavedListsMeta();
  return Array.from(meta.values())
    .filter((list) => includesQuery([list.name, list.description], query))
    .slice(0, 10)
    .map((list) => ({
      href: `/lists/${listNameToSlug(list.name)}`,
      title: list.name.replace(/\b\w/g, (c) => c.toUpperCase()),
      eyebrow: 'Saved list',
      description: list.description,
    }));
}

async function runSearch(query: string) {
  if (query.length < 2) {
    return {
      posts: [] as SearchHit[],
      cities: [] as SearchHit[],
      countries: [] as SearchHit[],
      pins: [] as SearchHit[],
      lists: [] as SearchHit[],
    };
  }
  const [posts, cities, countries, pins, lists] = await Promise.all([
    searchPosts(query),
    searchCities(query),
    searchCountries(query),
    searchPins(query),
    searchLists(query),
  ]);
  return { posts, cities, countries, pins, lists };
}

function ResultsSection({
  title,
  hits,
}: {
  title: string;
  hits: SearchHit[];
}) {
  if (hits.length === 0) return null;
  return (
    <section className="mt-8">
      <h2 className="text-h2 text-ink-deep">{title}</h2>
      <div className="mt-3 grid gap-3">
        {hits.map((hit) => (
          <Link
            key={`${hit.eyebrow}:${hit.href}`}
            href={hit.href}
            className="block rounded-lg border border-sand bg-white p-4 transition hover:border-slate hover:bg-cream-soft"
          >
            <p className="text-label uppercase tracking-wider text-muted">
              {hit.eyebrow}
            </p>
            <h3 className="mt-1 text-h3 text-ink-deep">{hit.title}</h3>
            {hit.description ? (
              <p className="mt-1 text-small leading-relaxed text-slate">
                {hit.description}
              </p>
            ) : null}
          </Link>
        ))}
      </div>
    </section>
  );
}

export default async function SearchPage({ searchParams }: Props) {
  const params = await searchParams;
  const query = cleanQuery(params.q);
  const results = await runSearch(query);
  const total =
    results.posts.length +
    results.cities.length +
    results.countries.length +
    results.pins.length +
    results.lists.length;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <JsonLd
        data={webPageJsonLd({
          url: `${SITE_URL}/search`,
          name: 'Search',
          description: "Search Mike Lee's travel atlas by article, city, country, saved list, or pin.",
        })}
      />

      <header>
        <h1 className="text-display text-ink-deep leading-none">Search</h1>
        <p className="mt-3 max-w-prose text-prose leading-relaxed text-slate">
          Search articles, cities, countries, saved lists, and pins in the atlas.
        </p>
      </header>

      <form action="/search" className="mt-6 flex gap-2">
        <input
          name="q"
          type="search"
          defaultValue={query}
          placeholder="Barcelona, Bernina, Cape Town..."
          className="min-w-0 flex-1 rounded-lg border border-sand bg-white px-4 py-2 text-body text-ink outline-none focus:border-teal"
        />
        <button
          type="submit"
          className="rounded-lg border border-teal bg-teal px-4 py-2 text-body font-medium text-white transition hover:bg-ink-deep"
        >
          Search
        </button>
      </form>

      {query.length > 0 && query.length < 2 ? (
        <p className="mt-5 text-small text-muted">
          Use at least two characters.
        </p>
      ) : null}

      {query.length >= 2 && total === 0 ? (
        <p className="mt-8 text-prose text-slate">
          No matches found for &quot;{query}&quot;.
        </p>
      ) : null}

      <ResultsSection title="Articles" hits={results.posts} />
      <ResultsSection title="Cities" hits={results.cities} />
      <ResultsSection title="Countries" hits={results.countries} />
      <ResultsSection title="Pins" hits={results.pins} />
      <ResultsSection title="Saved Lists" hits={results.lists} />
    </main>
  );
}
