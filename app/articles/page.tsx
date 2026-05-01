import Link from 'next/link';
import type { Metadata } from 'next';
import { articlesByDate, type Article } from '@/lib/articles';
import { SITE_URL } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Articles',
  description:
    'Long-form cheat sheets and travel notes from the atlas — airline programs, visas, plug types, all the things worth knowing once and looking up forever.',
  alternates: { canonical: `${SITE_URL}/articles` },
};

// Rebuild on demand; the registry is in source so the data only changes
// when a new article is shipped (and that's a deploy anyway).
export const revalidate = false;

export default function ArticlesIndex() {
  const articles = articlesByDate();
  return (
    <article className="max-w-page mx-auto px-5 py-8">
      <header className="mb-6">
        <h1 className="text-display text-ink-deep leading-none">Articles</h1>
        <p className="mt-3 text-slate max-w-prose">
          Cheat sheets, deep dives, and the kinds of notes I&rsquo;d send a friend.
          Add-as-I-write, no rhythm.
        </p>
      </header>

      {articles.length === 0 ? (
        <div className="card p-8 text-center text-slate">
          No articles yet — first one drops soon.
        </div>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {articles.map(a => (
            <li key={a.slug}>
              <ArticleCard article={a} />
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

// === ArticleCard ===
// Boring on purpose for now. Fields, not flourish. We can iterate to a richer
// card layout (cover image, reading-time pill, alliance/topic chip) once we
// have 3-4 articles to compare patterns against — same approach we used for
// the postcard layout: build something concrete, then design from it.
function ArticleCard({ article }: { article: Article }) {
  const date = new Date(article.publishedAt);
  const dateLabel = Number.isNaN(date.getTime())
    ? null
    : date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });

  return (
    <Link
      href={article.href}
      className="block card p-5 hover:shadow-paper transition-shadow"
    >
      <div className="flex items-baseline gap-2 mb-2">
        {article.emoji && (
          <span aria-hidden className="text-base leading-none">
            {article.emoji}
          </span>
        )}
        <h2 className="text-h3 text-ink-deep group-hover:text-teal transition-colors flex-1">
          {article.title}
        </h2>
      </div>
      <p className="text-slate leading-relaxed">{article.description}</p>
      {dateLabel && (
        <p className="mt-3 text-label text-muted uppercase tracking-[0.14em]">
          {dateLabel}
        </p>
      )}
    </Link>
  );
}
