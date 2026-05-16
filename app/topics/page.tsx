import type { Metadata } from 'next';
import Link from 'next/link';

import { SITE_URL } from '@/lib/seo';
import { TOPICS, anyTopicHasIntro } from '@/lib/topics';
import { getAllGuideTopicEntries } from '@/lib/content';
import { getAllPosts } from '@/lib/posts';

export const metadata: Metadata = {
  title: 'Topics',
  description:
    'Cross-cutting travel themes across the atlas — festivals, food, where to stay, getting around, scams and safety, and more.',
  alternates: { canonical: `${SITE_URL}/topics` },
  // The /topics index opens to search automatically once the first topic
  // hub has an editorial intro. Until every hub is an empty aggregation,
  // keep it noindex,follow so a thin directory page doesn't get indexed.
  robots: anyTopicHasIntro() ? undefined : { index: false, follow: true },
};

// Rebuild hourly so newly tagged guides update the per-topic counts.
export const revalidate = 3600;

export default async function TopicsIndex() {
  const [guides, posts] = await Promise.all([
    getAllGuideTopicEntries(),
    getAllPosts(),
  ]);

  // Count tagged guides + posts per topic for the index cards.
  const countBySlug = new Map<string, number>();
  for (const g of guides) {
    for (const t of g.topics) countBySlug.set(t, (countBySlug.get(t) ?? 0) + 1);
  }
  for (const p of posts) {
    for (const t of p.topics) countBySlug.set(t, (countBySlug.get(t) ?? 0) + 1);
  }

  return (
    <article className="max-w-page mx-auto px-5 py-8">
      <header className="mb-6">
        <h1 className="text-display text-ink-deep leading-none">Topics</h1>
        <p className="mt-3 text-slate max-w-prose">
          Cross-cutting themes that recur across the destination guides.
          Each topic gathers every guide and article that covers it.
        </p>
      </header>

      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {TOPICS.map(topic => {
          const count = countBySlug.get(topic.slug) ?? 0;
          return (
            <li key={topic.slug}>
              <Link
                href={`/topics/${topic.slug}`}
                className="group flex items-baseline justify-between gap-3 card p-5 hover:shadow-paper transition-shadow"
              >
                <span className="text-h3 text-ink-deep group-hover:text-teal transition-colors">
                  {topic.name}
                </span>
                <span className="shrink-0 text-label uppercase tracking-wider text-muted">
                  {count}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </article>
  );
}
