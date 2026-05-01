import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getAllPosts, getPost } from "@/lib/posts";

const SITE_URL = "https://go.mike-lee.me";

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  const posts = await getAllPosts();
  return posts.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) return { title: "Post not found" };

  const description = post.subtitle ?? post.title;
  const url = `${SITE_URL}/posts/${post.slug}`;

  return {
    title: post.title,
    description,
    alternates: { canonical: `/posts/${post.slug}` },
    robots: post.indexable
      ? undefined
      : { index: false, follow: false },
    openGraph: {
      title: post.title,
      description,
      type: "article",
      url,
      publishedTime: post.published ?? undefined,
      modifiedTime: post.updated ?? undefined,
      authors: post.authors.length > 0 ? post.authors : undefined,
      images: post.heroImage ? [{ url: post.heroImage }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description,
      images: post.heroImage ? [post.heroImage] : undefined,
    },
  };
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function StructuredData({
  post,
}: {
  post: NonNullable<Awaited<ReturnType<typeof getPost>>>;
}) {
  const url = `${SITE_URL}/posts/${post.slug}`;
  const article = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.subtitle ?? post.title,
    datePublished: post.published ?? undefined,
    dateModified: post.updated ?? post.published ?? undefined,
    author:
      post.authors.length > 0
        ? post.authors.map((name) => ({ "@type": "Person", name }))
        : undefined,
    publisher:
      post.authors.length > 0
        ? { "@type": "Person", name: post.authors[0] }
        : undefined,
    image: post.heroImage ? [post.heroImage] : undefined,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    url,
    inLanguage: "en",
  };
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      {
        "@type": "ListItem",
        position: 2,
        name: "Posts",
        item: `${SITE_URL}/posts`,
      },
      { "@type": "ListItem", position: 3, name: post.title, item: url },
    ],
  };
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(article) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}
      />
    </>
  );
}

export default async function PostPage({ params }: Props) {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) notFound();

  const dateLabel = formatDate(post.published ?? post.updated);
  const author = post.authors[0] ?? null;
  const placeLinks = [
    ...post.links.cities.map((s) => ({ kind: "cities" as const, slug: s })),
    ...post.links.countries.map((s) => ({
      kind: "countries" as const,
      slug: s,
    })),
    ...post.links.pins.map((s) => ({ kind: "pins" as const, slug: s })),
  ];

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <StructuredData post={post} />

      <header className="mb-8">
        <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl dark:text-gray-100">
          {post.title}
        </h1>
        {post.subtitle ? (
          <p className="mt-3 text-lg text-gray-700 dark:text-gray-300">
            {post.subtitle}
          </p>
        ) : null}
        {(author || dateLabel) && (
          <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
            {author ? `By ${author}` : null}
            {author && dateLabel ? ". " : null}
            {dateLabel ? `Last updated ${dateLabel}.` : null}
          </p>
        )}
      </header>

      {post.heroImage ? (
        <figure className="mb-10">
          <div className="overflow-hidden rounded-xl bg-gray-100 dark:bg-gray-800">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={post.heroImage}
              alt={post.heroAlt ?? ""}
              className="h-auto w-full"
            />
          </div>
          {post.heroAlt ? (
            <figcaption className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              {post.heroAlt}
            </figcaption>
          ) : null}
        </figure>
      ) : null}

      <article
        className="prose prose-gray max-w-none dark:prose-invert prose-headings:font-semibold prose-headings:tracking-tight prose-h2:mt-10 prose-h2:text-2xl prose-h3:text-xl prose-p:leading-relaxed prose-a:underline-offset-4"
        dangerouslySetInnerHTML={{ __html: post.bodyHtml }}
      />

      {placeLinks.length > 0 ? (
        <footer className="mt-12 border-t border-gray-200 pt-6 dark:border-gray-800">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Places mentioned
          </h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {placeLinks.map((p) => {
              const href =
                p.kind === "cities"
                  ? `/cities/${p.slug}`
                  : p.kind === "countries"
                    ? `/countries/${p.slug}`
                    : `/pins/${p.slug}`;
              return (
                <li key={`${p.kind}-${p.slug}`}>
                  <Link
                    href={href}
                    className="inline-block rounded-full border border-gray-200 px-3 py-1 text-sm text-gray-700 hover:border-gray-400 dark:border-gray-700 dark:text-gray-300 dark:hover:border-gray-500"
                  >
                    {p.slug}
                  </Link>
                </li>
              );
            })}
          </ul>
        </footer>
      ) : null}
    </main>
  );
}
