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
import VisitedMap from '@/components/VisitedMap';

// === Home (/) ==============================================================
// Calm catalog landing in Mike's voice. Three bands stacked vertically:
//
//   1. Header — "Oh the places you'll go" + intro paragraph + a stats
//      tile strip (countries visited, cities visited, pins curated,
//      guides & articles published)
//   2. Recent travel writing — UNIFIED feed of featured guides AND
//      articles, sorted newest-first, with a small kind chip on each
//      card distinguishing "Guide" from "Article"
//   3. Atlas card — single-row callout linking the data layer
//
// The unified feed is what made /articles redundant in primary nav —
// articles surface here alongside guides automatically. A separate
// /articles flat-link index still exists, demoted to the sidebar
// footer.

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

/** A unified feed entry. Guides and articles render through the same
 *  card component; the `kind` field drives the chip. */
type FeedItem = {
  key: string;
  href: string;
  title: string;
  description: string;
  heroImage: string | null;
  heroAlt: string | null;
  publishedAt: string | null;
  kind: 'guide' | 'article';
  emoji: string | null;
};

/** Read every /content/lists/*.md file, parse frontmatter, return the
 *  ones flagged `featured: true`. Featured is decoupled from
 *  `indexable`: featured controls home-page surfacing; indexable
 *  controls Google. Cape Town is both. Madrid / Bristol / Bangkok /
 *  Amsterdam are featured but not yet indexable while their writeups
 *  are being polished. Route-map indexes (Alicante / Kusttram) are
 *  indexable but not featured. */
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

  // ---- Stats: numbers that tell the lookback story ----------------------
  // Countries visited: derived from pins, since the Country type does
  // not currently carry a `been` field. Any pin with visited=true
  // contributes its `states_names[0]` to the visited-country set.
  // Names are lowercased so VisitedMap can look them up against
  // TopoJSON country names with the same normalization.
  const visitedCountries = new Set<string>();
  let visitedPinCount = 0;
  for (const p of pins) {
    if (!p.visited) continue;
    visitedPinCount++;
    const c = p.statesNames?.[0];
    if (c) visitedCountries.add(c.toLowerCase());
  }
  const visitedCities = cities.filter(c => c.been).length;

  // ---- Unified feed: guides + articles, newest-first --------------------
  const feed: FeedItem[] = [
    ...guides.map(g => ({
      key: `guide:${g.slug}`,
      href: `/lists/${g.slug}`,
      title: g.title,
      description: g.description,
      heroImage: pickGuideCover(g, listsMeta.get(g.slug)),
      heroAlt: g.heroAlt,
      publishedAt: g.publishedAt,
      kind: 'guide' as const,
      emoji: null,
    })),
    ...articles.map(a => ({
      key: `article:${a.key}`,
      href: a.href,
      title: a.title,
      description: a.description,
      heroImage: a.heroImage,
      heroAlt: a.heroAlt,
      publishedAt: a.publishedAt,
      kind: 'article' as const,
      emoji: a.emoji,
    })),
  ];
  feed.sort((a, b) => {
    const ad = a.publishedAt ?? '';
    const bd = b.publishedAt ?? '';
    if (ad !== bd) return bd.localeCompare(ad);
    return a.title.localeCompare(b.title);
  });
  const feedShown = feed.slice(0, 12);

  return (
    <article className="max-w-page mx-auto px-5 py-8">
      <header className="mb-8 max-w-prose">
        <h1 className="text-display text-ink-deep leading-none">
          Oh the places you&rsquo;ll go
        </h1>
        <p className="mt-3 text-prose text-slate leading-relaxed">
          My travel notes, lists of places I felt were worth returning to,
          and long-form destination guides. All written up from spending
          the majority of my adult life on the go.
        </p>
      </header>

      {/* Visited-world map — server-rendered SVG, no client JS. The
          point is the lookback: where I've been, shaded teal against
          a quiet ground. Click opens the country map. */}
      <section className="mb-8">
        <VisitedMap
          visitedCountryNames={visitedCountries}
          visitedCount={visitedCountries.size}
        />
      </section>

      {/* Stats tile strip — five tiles. Visited counts come first so the
          "lookback" reads up top: where I've been, then how much
          writing has come out of it. */}
      <section className="mb-12">
        <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <StatTile
            label="Countries visited"
            value={visitedCountries.size}
            sublabel={`of ${countries.length}`}
            href="/countries/cards"
          />
          <StatTile
            label="Cities visited"
            value={visitedCities}
            sublabel={`of ${cities.length.toLocaleString()}`}
            // Cities tile routes to the globe view rather than the
            // cards index. The map is the place where "all the cities
            // I've been to" reads at a glance, with visited shaded
            // teal against the planned and unvisited layers.
            href="/cities/map"
          />
          <StatTile
            label="Pins curated"
            value={pins.length}
            sublabel={`${visitedPinCount.toLocaleString()} visited`}
            href="/pins/cards"
          />
          <StatTile
            label="Guides published"
            value={guides.length}
            sublabel="and growing"
            href="/lists"
          />
          <StatTile
            label="Articles published"
            value={articles.length}
            sublabel="and growing"
            href="/articles"
          />
        </ul>
      </section>

      {/* Unified recent-writing feed. Guides and articles share a card
          shape; the chip in the corner says which kind. */}
      {feedShown.length > 0 && (
        <section className="mb-12">
          <header className="flex items-baseline justify-between gap-3 mb-4 flex-wrap">
            <h2 className="text-h2 text-ink-deep">Recent writing</h2>
            <div className="flex items-center gap-3 text-small">
              <Link href="/lists" className="text-teal hover:underline">
                All guides &amp; lists →
              </Link>
              <Link href="/articles" className="text-teal hover:underline">
                All articles →
              </Link>
            </div>
          </header>
          <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {feedShown.map(item => (
              <li key={item.key}>
                <FeedCardLink item={item} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mb-4">
        <Link
          href="/cities/map"
          className="group block card p-5 hover:shadow-paper transition-shadow"
        >
          <div className="flex items-baseline gap-3 flex-wrap">
            <span aria-hidden className="text-h3 leading-none">
              🧭
            </span>
            <h2 className="text-h3 text-ink-deep group-hover:text-teal transition-colors flex-1 leading-tight">
              Open the atlas
            </h2>
            <span className="text-small text-muted tabular-nums">
              {cities.length.toLocaleString()} cities ·{' '}
              {countries.length} countries ·{' '}
              {pins.length.toLocaleString()} pins
            </span>
          </div>
          <p className="mt-2 text-prose text-slate leading-snug">
            Browse the underlying data on the world map. Switch the lens
            between cities, pins, and countries; filter by climate, visa,
            water, drive-side; click any marker for the detail page.
          </p>
        </Link>
      </section>
    </article>
  );
}

// === Stat tile =============================================================
// Single tile in the stats strip. Big number, small label below, optional
// sublabel for context (e.g. "53 of 226"). Whole tile is a link so the
// reader can drill into the underlying data view.
function StatTile({
  label,
  value,
  sublabel,
  href,
}: {
  label: string;
  value: number;
  sublabel?: string;
  href: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className="group block card p-4 hover:shadow-paper transition-shadow h-full"
      >
        <p className="text-h2 text-ink-deep tabular-nums leading-none group-hover:text-teal transition-colors">
          {value.toLocaleString()}
        </p>
        <p className="mt-1.5 text-label text-ink-deep font-medium leading-tight">
          {label}
        </p>
        {sublabel && (
          <p className="mt-0.5 text-micro text-muted tabular-nums">
            {sublabel}
          </p>
        )}
      </Link>
    </li>
  );
}

// === Feed card =============================================================
// One card shape for both guides and articles. The chip in the corner is
// the only visual distinction between kinds; same image treatment, same
// title + description + date layout.
function FeedCardLink({ item }: { item: FeedItem }) {
  const date = item.publishedAt ? new Date(item.publishedAt) : null;
  const dateLabel =
    date && !Number.isNaN(date.getTime())
      ? date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' })
      : null;
  const kindLabel = item.kind === 'guide' ? 'Guide' : 'Article';

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
          <span className="absolute top-2 left-2 pill bg-black/60 text-white border-white/10 backdrop-blur-sm text-micro font-medium uppercase tracking-wider">
            {kindLabel}
          </span>
        </div>
      ) : (
        <div className="relative aspect-[4/3] bg-cream-soft border-b border-sand flex items-center justify-center text-muted text-micro uppercase tracking-wider">
          {item.emoji ? (
            <span aria-hidden className="text-h2">
              {item.emoji}
            </span>
          ) : (
            kindLabel
          )}
          <span className="absolute top-2 left-2 pill bg-ink-deep/80 text-white text-micro font-medium uppercase tracking-wider">
            {kindLabel}
          </span>
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
