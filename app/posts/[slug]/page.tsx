import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { fetchPinsForLists } from "@/lib/pins";
import { getAllPosts, getPost } from "@/lib/posts";
import { fetchAllSavedListsMeta, listNameToSlug } from "@/lib/savedLists";

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
  const absolutizeUrl = (href: string | null) => {
    if (!href) return null;
    if (/^https?:\/\//i.test(href)) return href;
    return `${SITE_URL}${href.startsWith("/") ? href : `/${href}`}`;
  };
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
  const itemLists = post.structuredItemLists.map((list, listIndex) => ({
    "@context": "https://schema.org",
    "@type": "ItemList",
    "@id": `${url}#item-list-${listIndex + 1}`,
    name: list.name,
    description: list.description ?? undefined,
    itemListOrder: "https://schema.org/ItemListOrderAscending",
    numberOfItems: list.items.length,
    itemListElement: list.items.map((item, itemIndex) => {
      const itemUrl = absolutizeUrl(item.url);
      return {
        "@type": "ListItem",
        position: itemIndex + 1,
        ...(itemUrl ? { url: itemUrl } : {}),
        item: {
          "@type": item.type ?? "Place",
          name: item.name,
          ...(item.description ? { description: item.description } : {}),
          ...(itemUrl ? { url: itemUrl } : {}),
        },
      };
    }),
  }));
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
      {itemLists.map((itemList) => (
        <script
          key={itemList["@id"]}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(itemList) }}
        />
      ))}
    </>
  );
}

/** Turn "khao-yai" into "Khao Yai" — used for the Places-mentioned chips,
 *  since posts list raw slugs and slugs don't read well to humans. Doesn't
 *  perfectly handle every casing rule (Saint-Tropez stays Saint Tropez, not
 *  Saint-Tropez), but it's close enough for chip text. */
function prettifySlug(slug: string): string {
  return slug
    .split('-')
    .map((part) => (part.length === 0 ? part : part[0].toUpperCase() + part.slice(1)))
    .join(' ');
}

function titleCase(value: string): string {
  return value.replace(/\b\w/g, (c) => c.toUpperCase());
}

async function getRelatedListCards(slugs: string[] = []) {
  if (slugs.length === 0) return [];

  const listsMeta = await fetchAllSavedListsMeta();
  const metaBySlug = new Map(
    Array.from(listsMeta.values()).map((meta) => [listNameToSlug(meta.name), meta])
  );
  const metas = slugs
    .map((slug) => {
      const meta = metaBySlug.get(slug);
      return meta ? { slug, meta } : null;
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  if (metas.length === 0) return [];

  const names = metas.map((item) => item.meta.name);
  const pins = await fetchPinsForLists(names);
  return metas.map(({ slug, meta }) => {
    const count = pins.filter((pin) => pin.savedLists.includes(meta.name)).length;
    const title = `${titleCase(meta.name)} list`;
    const description =
      meta.description ??
      `${count} ${count === 1 ? "pin" : "pins"} from this saved list, with map view and place cards.`;
    return {
      slug,
      href: `/lists/${slug}`,
      title,
      description,
      count,
    };
  });
}

export default async function PostPage({ params }: Props) {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) notFound();

  const dateLabel = formatDate(post.published ?? post.updated);
  const author = post.authors[0] ?? null;
  const relatedLists = await getRelatedListCards(post.links.lists);
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
        <h1 className="text-display text-ink-deep leading-[1.1]">
          {post.title}
        </h1>
        {post.subtitle ? (
          <p className="mt-3 text-prose text-slate leading-relaxed">
            {post.subtitle}
          </p>
        ) : null}
        {(author || dateLabel) && (
          <p className="mt-4 text-label uppercase tracking-wider text-muted">
            {author ? `By ${author}` : null}
            {author && dateLabel ? " · " : null}
            {dateLabel ? `Updated ${dateLabel}` : null}
          </p>
        )}
      </header>

      {/* Hero — only renders when the post's frontmatter explicitly carries
          a hero_image path AND we want to show it. Posts that don't yet have
          a photo on disk should leave hero_image off the frontmatter; that
          way no broken-image placeholder appears on the rendered page. */}
      {post.heroImage ? (
        <figure className="mb-10 overflow-hidden rounded-xl border border-sand bg-cream-soft">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={post.heroImage}
            alt={post.heroAlt ?? post.title}
            className="h-auto w-full"
          />
        </figure>
      ) : null}

      {/* === Article body =====================================================
          Tailwind Typography (`prose`) produces the base. We override with
          site tokens so it doesn't drift into a generic gray/dark-mode look.
          Headings use the same display/h2/h3 sizes the rest of the site uses;
          body copy is text-prose at ~17px. Tables get full borders, a shaded
          header row, alternating row stripes, and breathing-room padding so
          they read as data, not paragraphs. */}
      {/* Post body — styled by the .post-prose CSS block in app/globals.css.
          The previous prose-* Tailwind modifiers were no-ops because the
          @tailwindcss/typography plugin isn't installed; we instead drive
          the typography from a small handwritten sheet that targets headings,
          lists, tables, links, and code blocks scoped under .post-prose. */}
      <article
        className="post-prose max-w-none"
        dangerouslySetInnerHTML={{ __html: post.bodyHtml }}
      />

      {relatedLists.length > 0 ? (
        <section className="mt-12 border-t border-sand pt-6">
          <h2 className="text-label uppercase tracking-wider text-muted font-semibold">
            Saved lists
          </h2>
          <div className="mt-3 grid gap-3">
            {relatedLists.map((list) => (
              <Link
                key={list.slug}
                href={list.href}
                className="group block rounded-lg border border-sand bg-cream-soft p-5 transition hover:border-slate hover:bg-white"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-h3 text-ink-deep">{list.title}</h3>
                    <p className="mt-1 text-small leading-relaxed text-slate">
                      {list.description}
                    </p>
                    {list.count > 0 ? (
                      <p className="mt-2 text-label uppercase tracking-wider text-muted">
                        {list.count} {list.count === 1 ? "pin" : "pins"}
                      </p>
                    ) : null}
                  </div>
                  <span className="shrink-0 rounded border border-sand bg-white px-2.5 py-1 text-label font-medium text-ink-deep transition group-hover:border-slate">
                    Open list
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {placeLinks.length > 0 ? (
        <footer className="mt-12 border-t border-sand pt-6">
          <h2 className="text-label uppercase tracking-wider text-muted font-semibold">
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
                    className="inline-block rounded-full border border-sand bg-white px-3 py-1 text-small text-ink hover:border-slate hover:text-ink-deep transition-colors"
                  >
                    {prettifySlug(p.slug)}
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
