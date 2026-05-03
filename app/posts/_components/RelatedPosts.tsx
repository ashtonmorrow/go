import Link from "next/link";

import { getPostsForScope, type PostScope } from "@/lib/posts";

/**
 * Renders a "Related posts" block on a city, country, or pin detail page.
 *
 * Usage on the existing detail pages:
 *   import { RelatedPosts } from "@/app/posts/_components/RelatedPosts";
 *   ...
 *   <RelatedPosts scope="cities" slug={city.slug} placeName={city.name} />
 *
 * Renders nothing if no posts link to the place, so it is safe to drop in.
 */
export async function RelatedPosts({
  scope,
  slug,
  placeName,
}: {
  scope: PostScope;
  slug: string;
  placeName?: string;
}) {
  const posts = await getPostsForScope(scope, slug);
  if (posts.length === 0) return null;

  const heading = placeName ? `Posts mentioning ${placeName}` : "Related posts";

  return (
    <section
      aria-labelledby="related-posts-heading"
      className="mt-12 border-t border-sand pt-8"
    >
      <h2 id="related-posts-heading" className="text-h2 text-ink-deep mb-4">
        {heading}
      </h2>
      <ul className="mt-4 space-y-3">
        {posts.map((post) => (
          <li key={post.slug}>
            <Link
              href={`/posts/${post.slug}`}
              className="group block rounded-lg border border-sand p-5 transition hover:border-slate"
            >
              <h3 className="text-base font-medium text-ink-deep group-hover:underline">
                {post.title}
              </h3>
              {post.subtitle ? (
                <p className="mt-1 text-small text-muted">{post.subtitle}</p>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
