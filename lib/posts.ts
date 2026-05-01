import fs from "node:fs/promises";
import path from "node:path";

import matter from "gray-matter";
import { marked } from "marked";
import { unstable_cache } from "next/cache";

const POSTS_DIR = path.join(process.cwd(), "content/posts");

export type PostScope = "pins" | "cities" | "countries";

export type PostLinks = {
  pins: string[];
  cities: string[];
  countries: string[];
};

export type Post = {
  slug: string;
  title: string;
  subtitle: string | null;
  heroImage: string | null;
  heroAlt: string | null;
  published: string | null;
  updated: string | null;
  indexable: boolean;
  authors: string[];
  links: PostLinks;
  tags: string[];
  bodyHtml: string;
  bodyMd: string;
};

function normalizeLinks(raw: unknown): PostLinks {
  const empty: PostLinks = { pins: [], cities: [], countries: [] };
  if (!raw || typeof raw !== "object") return empty;
  const r = raw as Record<string, unknown>;
  const toSlugArray = (v: unknown): string[] => {
    if (!Array.isArray(v)) return [];
    return v.filter((x): x is string => typeof x === "string");
  };
  return {
    pins: toSlugArray(r.pins),
    cities: toSlugArray(r.cities),
    countries: toSlugArray(r.countries),
  };
}

function normalizeStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === "string");
}

function normalizeIsoDate(raw: unknown): string | null {
  if (!raw) return null;
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  if (typeof raw === "string") return raw;
  return null;
}

async function readPostFile(slug: string): Promise<Post | null> {
  const filePath = path.join(POSTS_DIR, `${slug}.md`);
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch {
    return null;
  }
  const parsed = matter(raw);
  const data = parsed.data as Record<string, unknown>;
  const title =
    typeof data.title === "string" && data.title.length > 0 ? data.title : slug;

  const bodyMd = parsed.content.trim();
  const bodyHtml = await marked.parse(bodyMd, { async: true });

  return {
    slug,
    title,
    subtitle: typeof data.subtitle === "string" ? data.subtitle : null,
    heroImage: typeof data.hero_image === "string" ? data.hero_image : null,
    heroAlt: typeof data.hero_alt === "string" ? data.hero_alt : null,
    published: normalizeIsoDate(data.published),
    updated: normalizeIsoDate(data.updated),
    indexable: data.indexable === true,
    authors: normalizeStringArray(data.authors),
    links: normalizeLinks(data.links),
    tags: normalizeStringArray(data.tags),
    bodyHtml,
    bodyMd,
  };
}

async function readAllPostsUncached(): Promise<Post[]> {
  let entries: string[] = [];
  try {
    entries = await fs.readdir(POSTS_DIR);
  } catch {
    return [];
  }
  const slugs = entries
    .filter((e) => e.endsWith(".md"))
    .map((e) => e.replace(/\.md$/, ""));
  const posts = await Promise.all(slugs.map((slug) => readPostFile(slug)));
  return posts
    .filter((p): p is Post => p !== null)
    .sort((a, b) => {
      const ad = a.published ?? a.updated ?? "";
      const bd = b.published ?? b.updated ?? "";
      return bd.localeCompare(ad);
    });
}

/** Cached read of every post. 24h revalidate, busts on `posts` tag. */
export const getAllPosts = unstable_cache(readAllPostsUncached, ["all-posts"], {
  revalidate: 60 * 60 * 24,
  tags: ["posts"],
});

/** Single post by slug. Returns null if the file does not exist. */
export async function getPost(slug: string): Promise<Post | null> {
  const all = await getAllPosts();
  return all.find((p) => p.slug === slug) ?? null;
}

/**
 * Posts that link to a given place. Used by the RelatedPosts component on
 * city, country, and pin detail pages.
 */
export async function getPostsForScope(
  scope: PostScope,
  slug: string
): Promise<Post[]> {
  const all = await getAllPosts();
  return all.filter((p) => p.links[scope].includes(slug));
}

/** All distinct slugs referenced in any post's links, by scope. */
export async function getReferencedSlugs(
  scope: PostScope
): Promise<Set<string>> {
  const all = await getAllPosts();
  const out = new Set<string>();
  for (const p of all) {
    for (const s of p.links[scope]) out.add(s);
  }
  return out;
}
