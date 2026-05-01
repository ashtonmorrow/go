import type { Metadata } from "next";

import { getAllPosts } from "@/lib/posts";

import { PostCard } from "./_components/PostCard";

export const metadata: Metadata = {
  title: "Posts",
  description:
    "Travel notes, guides, and reference articles by Mike Lee.",
  alternates: { canonical: "/posts" },
};

export default async function PostsIndexPage() {
  const posts = (await getAllPosts()).filter((p) => p.indexable);

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
      <header className="mb-10">
        <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl dark:text-gray-100">
          Posts
        </h1>
        <p className="mt-3 text-lg text-gray-700 dark:text-gray-300">
          Travel notes, guides, and reference articles.
        </p>
      </header>

      {posts.length === 0 ? (
        <p className="text-gray-600 dark:text-gray-400">No posts yet.</p>
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
