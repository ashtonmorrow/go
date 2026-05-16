import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';

import JsonLd from '@/components/JsonLd';
import { SITE_URL, clip, breadcrumbJsonLd, collectionJsonLd } from '@/lib/seo';
import { TOPICS, getTopic } from '@/lib/topics';
import { getAllGuideTopicEntries } from '@/lib/content';
import { getAllPosts } from '@/lib/posts';

type Props = { params: Promise<{ slug: string }> };

// One static param per registered topic. New topics ship by appending to
// the lib/topics.ts registry — no route change needed.
export function generateStaticParams() {
  return TOPICS.map(t => ({ slug: t.slug }));
}

// ISR: rebuild hourly so guides newly tagged with a topic surface on the
// hub without a redeploy.
export const revalidate = 3600;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const topic = getTopic(slug);
  if (!topic) return { title: 'Topic not found' };

  const description =
    clip(topic.intro) ??
    `Travel guides and notes across the atlas tagged ${topic.name.toLowerCase()}.`;

  return {
    title: topic.name,
    description,
    alternates: { canonical: `/topics/${slug}` },
    // Rolling release: a topic hub is index-ready once it carries an
    // editorial intro in the registry. Until then it renders and
    // aggregates, but stays noindex,follow so Google can still crawl
    // outward through the guide links without indexing a thin hub.
    robots: topic.intro ? undefined : { index: false, follow: true },
    openGraph: {
      title: topic.name,
      description,
      type: 'website',
      url: `${SITE_URL}/topics/${slug}`,
    },
  };
}

type HubItem = {
  key: string;
  href: string;
  title: string;
  description: string | null;
  heroImage: string | null;
  kind: 'Guide' | 'Article';
};

export default async function TopicHub({ params }: Props) {
  const { slug } = await params;
  const topic = getTopic(slug);
  if (!topic) notFound();

  const [guides, posts] = await Promise.all([
    getAllGuideTopicEntries(),
    getAllPosts(),
  ]);

  const guideItems: HubItem[] = guides
    .filter(g => g.topics.includes(slug))
    .sort((a, b) => a.title.localeCompare(b.title))
    .map(g => ({
      key: `guide:${g.slug}`,
      href: `/lists/${g.slug}`,
      title: g.title,
      description: g.description,
      heroImage: g.heroImage,
      kind: 'Guide',
    }));

  const postItems: HubItem[] = posts
    .filter(p => p.topics.includes(slug))
    .map(p => ({
      key: `post:${p.slug}`,
      href: `/posts/${p.slug}`,
      title: p.title,
      description: p.subtitle,
      heroImage: p.heroImage,
      kind: 'Article',
    }));

  const items = [...guideItems, ...postItems];
  const url = `${SITE_URL}/topics/${slug}`;

  const breadcrumb = breadcrumbJsonLd([
    { name: 'Home', item: SITE_URL },
    { name: 'Topics', item: `${SITE_URL}/topics` },
    { name: topic.name },
  ]);
  const collection = collectionJsonLd({
    url,
    name: topic.name,
    description:
      topic.intro ??
      `Travel guides and notes tagged ${topic.name.toLowerCase()}.`,
    items: items.map(it => ({ url: `${SITE_URL}${it.href}`, name: it.title })),
    totalItems: items.length,
  });

  return (
    <article className="max-w-page mx-auto px-5 py-8">
      <JsonLd data={breadcrumb} />
      <JsonLd data={collection} />

      <nav className="text-small text-muted mb-3" aria-label="Breadcrumb">
        <Link href="/topics" className="hover:text-ink-deep">
          Topics
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-slate">{topic.name}</span>
      </nav>

      <header className="mb-6">
        <h1 className="text-display text-ink-deep leading-none">{topic.name}</h1>
        {topic.intro ? (
          <p className="mt-3 text-slate max-w-prose leading-relaxed">
            {topic.intro}
          </p>
        ) : null}
        <p className="mt-3 text-label uppercase tracking-wider text-muted">
          {items.length} {items.length === 1 ? 'guide' : 'guides'}
        </p>
      </header>

      {items.length === 0 ? (
        <div className="card p-8 text-center text-slate">
          No guides tagged {topic.name.toLowerCase()} yet.
        </div>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {items.map(item => (
            <li key={item.key}>
              <Link
                href={item.href}
                className="group block card overflow-hidden hover:shadow-paper transition-shadow"
              >
                {item.heroImage && (
                  <div className="relative aspect-[16/9] bg-cream-soft overflow-hidden">
                    <Image
                      src={item.heroImage}
                      alt={item.title}
                      fill
                      sizes="(max-width: 640px) 100vw, 50vw"
                      className="object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                    />
                  </div>
                )}
                <div className="p-5">
                  <p className="text-label uppercase tracking-wider text-muted mb-1">
                    {item.kind}
                  </p>
                  <h2 className="text-h3 text-ink-deep group-hover:text-teal transition-colors">
                    {item.title}
                  </h2>
                  {item.description && (
                    <p className="mt-1 text-slate leading-relaxed">
                      {item.description}
                    </p>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
