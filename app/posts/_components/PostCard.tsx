import Link from "next/link";

import type { Post } from "@/lib/posts";

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  // Accept either YYYY-MM-DD or full ISO; render as "April 30, 2026".
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function PostCard({ post }: { post: Post }) {
  const dateLabel = formatDate(post.published ?? post.updated);
  const places = [
    ...post.links.cities.map((s) => ({ kind: "city", slug: s })),
    ...post.links.countries.map((s) => ({ kind: "country", slug: s })),
  ].slice(0, 3);

  return (
    <Link
      href={`/posts/${post.slug}`}
      className="group block overflow-hidden rounded-xl border border-sand bg-white transition hover:shadow-md"
    >
      {post.heroImage ? (
        <div className="aspect-[16/9] w-full overflow-hidden bg-cream-soft">
          {/* Plain img so the component works whether or not next/image is
              configured for this host. Swap to next/image when you wire up
              optimization for the /images path. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={post.heroImage}
            alt={post.heroAlt ?? ""}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.02]"
          />
        </div>
      ) : null}
      <div className="p-5">
        <h3 className="text-h3 text-ink-deep">{post.title}</h3>
        {post.subtitle ? (
          <p className="mt-1 text-small text-muted">{post.subtitle}</p>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center gap-2 text-micro text-muted">
          {dateLabel ? <span>{dateLabel}</span> : null}
          {places.length > 0 ? (
            <>
              {dateLabel ? <span aria-hidden="true">·</span> : null}
              <span className="flex flex-wrap gap-1">
                {places.map((p) => (
                  <span
                    key={`${p.kind}-${p.slug}`}
                    className="rounded-full bg-cream-soft px-2 py-0.5 text-label font-medium text-ink"
                  >
                    {p.slug}
                  </span>
                ))}
              </span>
            </>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
