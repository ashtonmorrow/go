import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';
import { getAllArticleEntries, type ArticleEntry } from '@/lib/articles';
import { SITE_URL } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Articles',
  description:
    'Travel notes and reference pieces from the atlas: stopovers, gardens, trains, markets, castles, and places worth understanding before booking.',
  alternates: { canonical: `${SITE_URL}/articles` },
};

// Rebuild hourly so new posts dropped into /content/posts surface without
// a redeploy. The hand-coded ARTICLES registry only changes on deploy anyway.
export const revalidate = 3600;

export default async function ArticlesIndex() {
  const entries = await getAllArticleEntries();
  return (
    <article className="max-w-page mx-auto px-5 py-8">
      <header className="mb-6">
        <h1 className="text-display text-ink-deep leading-none">Articles</h1>
        <p className="mt-3 text-slate max-w-prose">
          Field notes, practical references, and short travel essays from the
          atlas. Some are written from trips I have taken. Others are working
          notes for routes, places, and programs I want to understand before I
          book.
        </p>
      </header>

      {entries.length === 0 ? (
        <div className="card p-8 text-center text-slate">
          No articles yet. First one drops soon.
        </div>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {entries.map(item => (
            <li key={item.key}>
              <ArticleCard item={item} />
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

// === ArticleCard ===
// One layout for both flavors: hero image when one's available (file-based
// posts always carry one in frontmatter), otherwise the older fields-only
// layout used by the airline stopover reference. Same surface, two visual densities.
function ArticleCard({ item }: { item: ArticleEntry }) {
  const date = item.publishedAt ? new Date(item.publishedAt) : null;
  const dateLabel = date && !Number.isNaN(date.getTime())
    ? date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' })
    : null;

  return (
    <Link
      href={item.href}
      className="group block card overflow-hidden hover:shadow-paper transition-shadow"
    >
      {item.heroImage && (
        <div className="relative aspect-[16/9] bg-cream-soft overflow-hidden">
          <Image
            src={item.heroImage}
            alt={item.heroAlt ?? item.title}
            fill
            sizes="(max-width: 640px) 100vw, 50vw"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.02]"
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
          <h2 className="text-h3 text-ink-deep group-hover:text-teal transition-colors flex-1">
            {item.title}
          </h2>
        </div>
        {item.description && (
          <p className="text-slate leading-relaxed">{item.description}</p>
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
