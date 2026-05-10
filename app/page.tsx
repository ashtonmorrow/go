import Link from 'next/link';
import Image from 'next/image';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Metadata } from 'next';
import { readListContent, type ListContent } from '@/lib/content';
import { getAllArticleEntries, type ArticleEntry } from '@/lib/articles';
import { fetchAllPins } from '@/lib/pins';
import { fetchAllCities, fetchAllCountries } from '@/lib/notion';
import { fetchAllSavedListsMeta } from '@/lib/savedLists';
import { SITE_URL } from '@/lib/seo';

// === Home (/) ==============================================================
// Calm catalog landing. Three equal-weight sections — Guides, Articles,
// Atlas — no dominant hero image, no "featured story" treatment. The
// site is a working travel atlas with notes layered on, not a news
// magazine; the previous magazine-hero rebuild leaned too heavily into
// news patterns.
//
// Layout, top to bottom:
//   1. Quiet text header with a "by the numbers" line
//   2. Travel guides — small 4-up grid of indexable lists
//   3. Articles — small 4-up grid of recent posts
//   4. Atlas card — single row, low-visual-weight callout

export const metadata: Metadata = {
  title: "Mike Lee — Oh the places you'll go",
  description:
    "Travel notes, lists of places worth returning to, and long-form destination guides. Written from spending the majority of my adult life on the go.",
  alternates: { canonical: SITE_URL },
};

export const revalidate = 3600;

type GuideCard = {
  slug: string;
  title: string;
  description: string;
  heroImage: string | null;
  heroAlt: string | null;
  publishedAt: string | null;
};

/** Read every /content/lists/*.md file, parse frontmatter, return the
 *  ones flagged `featured: true`. Featured is decoupled from
 *  `indexable` (see lib/content.ts ListContent.featured): featured
 *  controls home-page surfacing; indexable controls Google. Cape Town
 *  is both. Madrid / Bristol / Bangkok are featured but not yet
 *  indexable while their writeups are scaffolded. Route-map indexes
 *  (Alicante / Kusttram) are indexable but not featured. */
async function listFeaturedGuides(): Promise<GuideCard[]> {
  const dir = path.join(process.cwd(), 'content', 'lists');
  let entries: string[] = [];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }
  const slugs = entries
    .filter(f => f.endsWith('.md'))
    .map(f => f.replace(/\.md$/, ''));
  const contents = await Promise.all(
    slugs.map(async slug => {
      const c = await readListContent(slug);
      return c ? { slug, content: c } : null;
    }),
  );
  return contents
    .filter((x): x is { slug: string; content: ListContent } => !!x)
    .filter(({ content }) => content.featured)
    .map(({ slug, content }) => ({
      slug,
      title: content.title ?? slug,
      description: content.description ?? '',
      heroImage: content.heroImage,
      heroAlt: content.heroAlt,
      publishedAt: content.published,
    }))
    .sort((a, b) => {
      const ad = a.publishedAt ?? '';
      const bd = b.publishedAt ?? '';
      if (ad !== bd) return bd.localeCompare(ad);
      return a.title.localeCompare(b.title);
    });
}

/** Pick a hero image for a guide card when the content frontmatter did
 *  not specify one. Falls back to the saved-list's curated cover. */
function pickGuideCover(
  guide: GuideCard,
  meta:
    | { coverImageUrl?: string | null; coverPhotoUrl?: string | null }
    | undefined,
): string | null {
  return guide.heroImage || meta?.coverImageUrl || meta?.coverPhotoUrl || null;
}

export default async function HomePage() {
  const [guides, articles, pins, cities, countries, listsMeta] =
    await Promise.all([
      listFeaturedGuides(),
      getAllArticleEntries(),
      fetchAllPins(),
      fetchAllCities(),
      fetchAllCountries(),
      fetchAllSavedListsMeta(),
    ]);

  // Cap each section at 8 — enough to feel like a real catalog page,
  // small enough to keep the home compact. The full archives are one
  // click away via "All guides" / "All articles" CTAs.
  const guidesShown = guides.slice(0, 8);
  const articlesShown = articles.slice(0, 8);

  // "By the numbers" line under the header. Concrete and honest,
  // no superlatives.
  const byNumbers = [
    `${guides.length} ${guides.length === 1 ? 'guide' : 'guides'}`,
    `${articles.length} ${articles.length === 1 ? 'article' : 'articles'}`,
    `${cities.length.toLocaleString()} cities`,
    `${countries.length} countries`,
    `${pins.length.toLocaleString()} pins`,
  ].join(' · ');

  return (
    <article className="max-w-page mx-auto px-5 py-8">
      <header className="mb-10 max-w-prose">
        <h1 className="text-display text-ink-deep leading-none">
          Oh the places you&rsquo;ll go
        </h1>
        <p className="mt-3 text-prose text-slate leading-relaxed">
          My travel notes, lists of places I felt were worth returning to,
          and long-form destination guides. All written up from spending
          the majority of my adult life on the go.
        </p>
        <p className="mt-3 text-small text-muted tabular-nums">{byNumbers}</p>
      </header>

      {guidesShown.length > 0 && (
        <section className="mb-12">
          <header className="flex items-baseline justify-between gap-3 mb-4 flex-wrap">
            <h2 className="text-h2 text-ink-deep">Travel guides</h2>
            <Link
              href="/lists"
              className="text-small text-teal hover:underline"
            >
              All guides &amp; saved lists →
            </Link>
          </header>
          <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {guidesShown.map(g => (
              <li key={g.slug}>
                <GuideCardLink
                  guide={g}
                  cover={pickGuideCover(g, listsMeta.get(g.slug))}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {articlesShown.length > 0 && (
        <section className="mb-12">
          <header className="flex items-baseline justify-between gap-3 mb-4 flex-wrap">
            <h2 className="text-h2 text-ink-deep">Articles</h2>
            <Link
              href="/articles"
              className="text-small text-teal hover:underline"
            >
              All articles →
            </Link>
          </header>
          <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {articlesShown.map(a => (
              <li key={a.key}>
                <ArticleCardLink item={a} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mb-4">
        <Link
          href="/atlas"
          className="group block card p-5 hover:shadow-paper transition-shadow"
        >
          <div className="flex items-baseline gap-3 flex-wrap">
            <span aria-hidden className="text-h3 leading-none">
              🧭
            </span>
            <h2 className="text-h3 text-ink-deep group-hover:text-teal transition-colors flex-1 leading-tight">
              The atlas
            </h2>
            <span className="text-small text-muted tabular-nums">
              {cities.length.toLocaleString()} cities ·{' '}
              {countries.length} countries ·{' '}
              {pins.length.toLocaleString()} pins
            </span>
          </div>
          <p className="mt-2 text-prose text-slate leading-snug">
            The full reference dataset behind the atlas. Browse cities,
            countries, and curated pins; filter by climate, visa, water,
            drive-side; flip the world map.
          </p>
        </Link>
      </section>
    </article>
  );
}

// === Guide card ============================================================
// Compact 4:3 card. Smaller than the previous home-page hero treatment —
// matches the density of /articles and the "More saved lists" section
// on /lists so the home reads as a catalog index, not a magazine front.
function GuideCardLink({
  guide,
  cover,
}: {
  guide: GuideCard;
  cover: string | null;
}) {
  return (
    <Link
      href={`/lists/${guide.slug}`}
      className="group block card overflow-hidden hover:shadow-paper transition-shadow h-full"
    >
      {cover ? (
        <div className="relative aspect-[4/3] bg-cream-soft overflow-hidden">
          {/* next/image rather than <img> so local /public paths
              ("/images/posts/...") and the remote allowlist (Supabase /
              Wikimedia / Airtable / etc) all route through the same
              optimizer and render reliably. */}
          <Image
            src={cover}
            alt={guide.heroAlt ?? guide.title}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.02]"
          />
        </div>
      ) : (
        <div className="aspect-[4/3] bg-cream-soft border-b border-sand flex items-center justify-center text-muted text-micro uppercase tracking-wider">
          No hero yet
        </div>
      )}
      <div className="p-3">
        <h3 className="text-ink-deep font-semibold leading-tight group-hover:text-teal transition-colors">
          {guide.title}
        </h3>
        {guide.description && (
          <p className="mt-1.5 text-label text-slate leading-snug line-clamp-2">
            {guide.description}
          </p>
        )}
      </div>
    </Link>
  );
}

// === Article card ==========================================================
// Same compact shape as the guide card so the two sections render at
// matching density. Inlined here rather than imported from /articles
// to keep the visual contract local.
function ArticleCardLink({ item }: { item: ArticleEntry }) {
  const date = item.publishedAt ? new Date(item.publishedAt) : null;
  const dateLabel =
    date && !Number.isNaN(date.getTime())
      ? date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' })
      : null;

  return (
    <Link
      href={item.href}
      className="group block card overflow-hidden hover:shadow-paper transition-shadow h-full"
    >
      {item.heroImage ? (
        <div className="relative aspect-[4/3] bg-cream-soft overflow-hidden">
          <Image
            src={item.heroImage}
            alt={item.heroAlt ?? item.title}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.02]"
          />
        </div>
      ) : (
        <div className="aspect-[4/3] bg-cream-soft border-b border-sand flex items-center justify-center text-muted text-micro uppercase tracking-wider">
          {item.emoji ? (
            <span aria-hidden className="text-h2">
              {item.emoji}
            </span>
          ) : (
            'Article'
          )}
        </div>
      )}
      <div className="p-3">
        <h3 className="text-ink-deep font-semibold leading-tight group-hover:text-teal transition-colors">
          {item.title}
        </h3>
        {item.description && (
          <p className="mt-1.5 text-label text-slate leading-snug line-clamp-2">
            {item.description}
          </p>
        )}
        {dateLabel && (
          <p className="mt-2 text-micro text-muted uppercase tracking-wider">
            {dateLabel}
          </p>
        )}
      </div>
    </Link>
  );
}
