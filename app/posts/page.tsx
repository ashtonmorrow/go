import type { Metadata } from "next";

import { getAllPosts } from "@/lib/posts";

import { PostCard } from "./_components/PostCard";

export const metadata: Metadata = {
  title: "Posts",
  description:
    "Travel notes, place essays, and practical references by Mike Lee.",
  alternates: { canonical: "/posts" },
};

export default async function PostsIndexPage() {
  const posts = (await getAllPosts()).filter((p) => p.indexable);

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
      <header className="mb-10">
        <h1 className="text-h1 text-ink-deep">Posts</h1>
        <p className="mt-3 text-prose text-slate leading-relaxed">
          Notes from trips, route research, and places I want to understand
          before I recommend them to anyone else.
        </p>
      </header>

      {posts.length === 0 ? (
        <p className="text-ink">No posts yet.</p>
      ) : (
        <ul className="grid gap-6 sm:grid-cols-2">
          {posts.map((post) => (
            <li key={post.slug}>
              <PostCard post={post} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
