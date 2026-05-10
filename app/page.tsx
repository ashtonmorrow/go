import Link from 'next/link';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Metadata } from 'next';
import { readListContent, type ListContent } from '@/lib/content';
import { getAllArticleEntries, type ArticleEntry } from '@/lib/articles';
import { fetchAllPins } from '@/lib/pins';
import { fetchAllCities, fetchAllCountries } from '@/lib/notion';
import { fetchAllSavedListsMeta } from '@/lib/savedLists';
import { thumbUrl } from '@/lib/imageUrl';
import { SITE_URL } from '@/lib/seo';

// === Home (/) ==============================================================
// Replaces the old `redirect('/cities')` that put a 1,341-row data grid as
// the front door. The new home is a magazine-style landing that leads with
// the editorial moat: latest published travel guide as the hero, the rest
// of the indexable guides as a featured strip, recent articles below, and
// a small Atlas card at the bottom that links into the data layer
// (/cities, /countries, /pins, the world map) for visitors who want to
// browse the full reference rather than read.
//
// Why this matters for the portfolio narrative: the site is a "I can build
// traffic quickly" demo. The front door now demonstrates the writing —
// what a hiring manager actually evaluates — instead of demonstrating the
// ingestion plumbing. Internal-link equity flows from / down to the
// indexable guides, which is the direction Google rewards.

export const metadata: Metadata = {
  title: "Mike Lee — Travel notes, guides, and an atlas",
  description:
    'Travel guides, field notes, and a 1,300-city reference atlas from Mike Lee. Hotel reviews, neighborhood walks, and the practical bits that take a city from "interesting" to "I can plan it."',
  alternates: { canonical: SITE_URL },
};

// Rebuild hourly so new guides and articles surface without a redeploy.
// The underlying data fetches are unstable_cache'd for 24h anyway; this
// just sets the page-level revalidate window.
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
 *  ones flagged indexable. Sorted newest-first by published date so the
 *  hero picks up the most recent published guide automatically. */
async function listIndexableGuides(): Promise<GuideCard[]> {
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
    .filter(({ content }) => content.indexable)
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
 *  not specify one. Falls back to the saved-list's curated cover (set
 *  in /admin/lists/<slug>) so newly-indexed guides always render with
 *  some kind of image rather than the "no hero yet" placeholder. */
function pickGuideHero(
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
      listIndexableGuides(),
      getAllArticleEntries(),
      fetchAllPins(),
      fetchAllCities(),
      fetchAllCountries(),
      fetchAllSavedListsMeta(),
    ]);

  // Hero is the most-recent indexable guide (Cape Town today; whatever
  // ships next on top of that). Featured strip is the next 3 newest
  // guides. If there are fewer than 4 indexable guides total, the hero
  // takes whatever exists and the strip silently shrinks.
  const hero = guides[0] ?? null;
  const featured = guides.slice(1, 4);
  // Articles are already sorted newest-first by getAllArticleEntries.
  const recentArticles: ArticleEntry[] = articles.slice(0, 4);

  return (
    <article className="max-w-page mx-auto px-5 py-8">
      {/* Hero — full-bleed image with the headline + lede over a dark
          gradient at the bottom. Falls back to a clean text-only hero
          when no image is set on the latest guide. */}
      {hero ? (
        <HeroBlock
          guide={hero}
          heroImage={pickGuideHero(hero, listsMeta.get(hero.slug))}
        />
      ) : (
        <header className="mb-12 max-w-prose">
          <h1 className="text-display text-ink-deep leading-none">
            Travel notes, guides, and an atlas
          </h1>
          <p className="mt-4 text-prose text-slate leading-relaxed">
            Long-form destination guides, field notes from the road, and a
            1,300-city reference atlas. Start with the guides; the atlas is
            here for when you want to browse the data underneath.
          </p>
        </header>
      )}

      {/* Featured guides — the next 3 newest indexable ones. Three-up on
          desktop so each card carries enough room for the description.
          Hidden when there is only the hero guide and nothing behind it. */}
      {featured.length > 0 && (
        <section className="mt-14">
          <header className="flex items-baseline justify-between gap-3 mb-5 flex-wrap">
            <h2 className="text-h2 text-ink-deep">More travel guides</h2>
            <Link
              href="/lists"
              className="text-small text-teal hover:underline"
            >
              All guides &amp; saved lists →
            </Link>
          </header>
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {featured.map(g => (
              <li key={g.slug}>
                <GuideCardLink
                  guide={g}
                  heroImage={pickGuideHero(g, listsMeta.get(g.slug))}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Recent stories — articles + posts in one feed (the same shape
          /articles uses). Capped at 4 here; the full archive is one
          click away. */}
      {recentArticles.length > 0 && (
        <section className="mt-14">
          <header className="flex items-baseline justify-between gap-3 mb-5 flex-wrap">
            <h2 className="text-h2 text-ink-deep">Recent articles</h2>
            <Link
              href="/articles"
              className="text-small text-teal hover:underline"
            >
              All articles →
            </Link>
          </header>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {recentArticles.map(a => (
              <li key={a.key}>
                <ArticleCardLink item={a} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Atlas card — single-row callout linking the data layer. Live
          counts make the breadth claim concrete. Frames the data as
          proof-of-depth, not the front door. */}
      <section className="mt-14 mb-4">
        <Link
          href="/atlas"
          className="group block card p-6 hover:shadow-paper transition-shadow"
        >
          <div className="flex items-baseline gap-3 mb-2 flex-wrap">
            <span aria-hidden className="text-h2 leading-none">
              🧭
            </span>
            <h2 className="text-h2 text-ink-deep group-hover:text-teal transition-colors flex-1 leading-tight">
              Explore the atlas
            </h2>
            <span className="text-small text-muted tabular-nums">
              {cities.length.toLocaleString()} cities ·{' '}
              {countries.length.toLocaleString()} countries ·{' '}
              {pins.length.toLocaleString()} pins
            </span>
          </div>
          <p className="text-prose text-slate leading-relaxed">
            Browse the full reference dataset behind the atlas: every city,
            country, and curated pin. The travel writing lives above; this
            is the data layer, with filters by climate, visa, water,
            drive-side, continent, and more.
          </p>
        </Link>
      </section>
    </article>
  );
}

// === Hero block ============================================================
// Big card, image-led when a hero photo exists, otherwise text-only.
// Renders the guide's title and description from /content/lists/<slug>.md
// so the language matches what the guide page itself shows.
function HeroBlock({
  guide,
  heroImage,
}: {
  guide: GuideCard;
  heroImage: string | null;
}) {
  return (
    <Link
      href={`/lists/${guide.slug}`}
      className="group block relative rounded-lg overflow-hidden card hover:shadow-paper transition-shadow"
    >
      {heroImage ? (
        <div className="relative aspect-[16/9] sm:aspect-[21/9] bg-cream-soft overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={thumbUrl(heroImage, { size: 1600, quality: 88 }) ?? heroImage}
            alt={guide.heroAlt ?? guide.title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
          />
          {/* Gradient + content. The text sits in the bottom third with
              a darker base so headlines stay readable across hero
              choices. */}
          <div
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/85 via-black/55 to-transparent"
          />
          <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8 max-w-prose">
            <p className="text-micro uppercase tracking-[0.18em] text-white/75 font-medium mb-2">
              Latest travel guide
            </p>
            <h1 className="text-h1 sm:text-display text-white leading-tight group-hover:text-cream-soft transition-colors">
              {guide.title}
            </h1>
            {guide.description && (
              <p className="mt-3 text-prose text-white/90 leading-relaxed">
                {guide.description}
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="p-6 sm:p-10">
          <p className="text-micro uppercase tracking-[0.18em] text-muted font-medium mb-2">
            Latest travel guide
          </p>
          <h1 className="text-h1 sm:text-display text-ink-deep leading-tight group-hover:text-teal transition-colors">
            {guide.title}
          </h1>
          {guide.description && (
            <p className="mt-3 text-prose text-slate leading-relaxed max-w-prose">
              {guide.description}
            </p>
          )}
        </div>
      )}
    </Link>
  );
}

// === Guide card ============================================================
// 16:9 hero on top, title + short description below. Used for the
// "More travel guides" strip. Mirrors the card style on /lists for the
// guides section so the visual language stays consistent across pages.
function GuideCardLink({
  guide,
  heroImage,
}: {
  guide: GuideCard;
  heroImage: string | null;
}) {
  return (
    <Link
      href={`/lists/${guide.slug}`}
      className="group block card overflow-hidden hover:shadow-paper transition-shadow h-full"
    >
      {heroImage ? (
        <div className="relative aspect-[16/9] bg-cream-soft overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={thumbUrl(heroImage, { size: 800 }) ?? heroImage}
            alt={guide.heroAlt ?? guide.title}
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
          />
        </div>
      ) : (
        <div className="aspect-[16/9] bg-cream-soft border-b border-sand flex items-center justify-center text-muted text-micro uppercase tracking-wider">
          No hero yet
        </div>
      )}
      <div className="p-4">
        <h3 className="text-h3 text-ink-deep leading-tight group-hover:text-teal transition-colors">
          {guide.title}
        </h3>
        {guide.description && (
          <p className="mt-2 text-prose text-slate leading-snug line-clamp-3">
            {guide.description}
          </p>
        )}
      </div>
    </Link>
  );
}

// === Article card ==========================================================
// Same shape as /articles' ArticleCard. Inlined here rather than imported
// so the home page doesn't take a hard dependency on the articles page's
// internal component.
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
      {item.heroImage && (
        <div className="relative aspect-[16/9] bg-cream-soft overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.heroImage}
            alt={item.heroAlt ?? item.title}
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
          />
        </div>
      )}
      <div className="p-5">
        <div className="flex items-baseline gap-2 mb-2">
          {item.emoji && (
            <span aria-hidden className="text-base leading-none">
              {item.emoji}
            </span>
          )}
          <h3 className="text-h3 text-ink-deep group-hover:text-teal transition-colors flex-1 leading-tight">
            {item.title}
          </h3>
        </div>
        {item.description && (
          <p className="text-prose text-slate leading-snug line-clamp-3">
            {item.description}
          </p>
        )}
        {dateLabel && (
          <p className="mt-3 text-label text-muted uppercase tracking-wider">
            {dateLabel}
          </p>
        )}
      </div>
    </Link>
  );
}
