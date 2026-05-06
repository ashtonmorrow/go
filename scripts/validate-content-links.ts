import fs from 'node:fs/promises';
import path from 'node:path';

import matter from 'gray-matter';
import { createClient } from '@supabase/supabase-js';

const ROOT = process.cwd();
const POSTS_DIR = path.join(ROOT, 'content/posts');
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://pdjrvlhepiwkshxerkpz.supabase.co';
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'sb_publishable_NrfBsFhfj0DSKqDEKeUCMQ_H5oDG-Zv';

type Scope = 'pins' | 'cities' | 'countries' | 'lists';

type Problem = {
  file: string;
  line?: number;
  message: string;
};

type InternalLink = {
  file: string;
  line?: number;
  scope: Scope;
  slug: string;
  source: string;
};

const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

function listNameToSlug(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '-');
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&amp;/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function decodeSlug(slug: string): string {
  try {
    return decodeURIComponent(slug);
  } catch {
    return slug;
  }
}

function scopedLink(scope: Scope, rawSlug: string, file: string, source: string, line?: number): InternalLink {
  const withoutHash = rawSlug.split('#')[0].replace(/\/$/, '');
  return {
    file,
    line,
    scope,
    slug: decodeSlug(withoutHash),
    source,
  };
}

function markdownInternalLinks(file: string, body: string): InternalLink[] {
  const out: InternalLink[] = [];
  const lines = body.split(/\r?\n/);
  const linkRe = /\[[^\]]+\]\(\/(pins|cities|countries|lists)\/([^)#\s]+)(?:#[^)]+)?\)/g;
  lines.forEach((line, index) => {
    for (const match of line.matchAll(linkRe)) {
      out.push(scopedLink(match[1] as Scope, match[2], file, 'markdown', index + 1));
    }
  });
  return out;
}

function frontmatterLinks(file: string, data: Record<string, unknown>): InternalLink[] {
  const out: InternalLink[] = [];
  const rawLinks = data.links;
  if (rawLinks && typeof rawLinks === 'object') {
    const links = rawLinks as Record<string, unknown>;
    for (const scope of ['pins', 'cities', 'countries', 'lists'] as const) {
      const values = links[scope];
      if (!Array.isArray(values)) continue;
      for (const value of values) {
        if (typeof value === 'string') {
          out.push(scopedLink(scope, value, file, 'frontmatter'));
        }
      }
    }
  }

  const structuredLists = data.structured_item_lists;
  if (Array.isArray(structuredLists)) {
    for (const list of structuredLists) {
      if (!list || typeof list !== 'object') continue;
      const items = (list as Record<string, unknown>).items;
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        const url = (item as Record<string, unknown>).url;
        if (typeof url !== 'string') continue;
        const match = /^\/(pins|cities|countries|lists)\/([^#\s]+)/.exec(url);
        if (match) {
          out.push(scopedLink(match[1] as Scope, match[2], file, 'structured_item_lists'));
        }
      }
    }
  }
  return out;
}

function tableLinkSuggestions(
  file: string,
  body: string,
  knownNames: Map<string, { scope: Scope; slug: string; title: string }>,
): Problem[] {
  const problems: Problem[] = [];
  const lines = body.split(/\r?\n/);
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) return;

    const cells = trimmed
      .slice(1, -1)
      .split('|')
      .map((cell) => cell.trim());
    if (cells.every((cell) => /^:?-{3,}:?$/.test(cell))) return;
    const first = cells[0];
    if (!first || first.includes('](')) return;
    if (/^(site|stop|base|place|term|benefit type)$/i.test(first)) return;

    const candidates = first
      .split(',')
      .map((part) => part.replace(/[*_`]/g, '').trim())
      .filter(Boolean);
    for (const candidate of candidates) {
      const match = knownNames.get(normalizeName(candidate));
      if (match) {
        problems.push({
          file,
          line: index + 1,
          message: `Table cell "${candidate}" matches ${match.scope}/${match.slug} and should probably be linked.`,
        });
      }
    }
  });
  return problems;
}

async function fetchKnownSlugs() {
  const pageSize = 1000;
  const fetchPaged = async <T,>(label: string, build: () => any): Promise<T[]> => {
    const out: T[] = [];
    for (let start = 0; ; start += pageSize) {
      const { data, error } = await build().range(start, start + pageSize - 1);
      if (error) throw new Error(`${label} lookup failed: ${error.message}`);
      out.push(...((data ?? []) as T[]));
      if (!data || data.length < pageSize) break;
    }
    return out;
  };

  const [pins, cities, countries, lists] = await Promise.all([
    fetchPaged<{ name: string; slug: string }>('pins', () =>
      sb.from('pins').select('name, slug').not('slug', 'is', null),
    ),
    fetchPaged<{ name: string; slug: string }>('cities', () =>
      sb.from('go_cities').select('name, slug').not('slug', 'like', 'delete-%'),
    ),
    fetchPaged<{ name: string; slug: string }>('countries', () =>
      sb.from('go_countries').select('name, slug'),
    ),
    fetchPaged<{ name: string }>('saved_lists', () =>
      sb.from('saved_lists').select('name'),
    ),
  ]);

  const slugs: Record<Scope, Set<string>> = {
    pins: new Set(pins.map((row) => row.slug)),
    cities: new Set(cities.map((row) => row.slug)),
    countries: new Set(countries.map((row) => row.slug)),
    lists: new Set(lists.map((row) => listNameToSlug(row.name))),
  };

  const names = new Map<string, { scope: Scope; slug: string; title: string }>();
  const addName = (scope: Scope, slug: string, title: string) => {
    names.set(normalizeName(title), { scope, slug, title });
    names.set(normalizeName(slug.replace(/-/g, ' ')), { scope, slug, title });
  };

  for (const row of pins) addName('pins', row.slug, row.name);
  for (const row of cities) addName('cities', row.slug, row.name);
  for (const row of countries) addName('countries', row.slug, row.name);
  for (const row of lists) addName('lists', listNameToSlug(row.name), row.name);

  return { slugs, names };
}

async function readPosts() {
  const entries = await fs.readdir(POSTS_DIR);
  const posts: Array<{ file: string; body: string; data: Record<string, unknown> }> = [];
  for (const entry of entries) {
    if (!entry.endsWith('.md')) continue;
    const filePath = path.join(POSTS_DIR, entry);
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = matter(raw);
    posts.push({
      file: `content/posts/${entry}`,
      body: parsed.content,
      data: parsed.data as Record<string, unknown>,
    });
  }
  return posts;
}

async function main() {
  const [{ slugs, names }, posts] = await Promise.all([
    fetchKnownSlugs(),
    readPosts(),
  ]);

  const problems: Problem[] = [];
  const suggestions: Problem[] = [];
  const links: InternalLink[] = [];

  for (const post of posts) {
    links.push(...frontmatterLinks(post.file, post.data));
    links.push(...markdownInternalLinks(post.file, post.body));
    suggestions.push(...tableLinkSuggestions(post.file, post.body, names));
  }

  for (const link of links) {
    if (!slugs[link.scope].has(link.slug)) {
      problems.push({
        file: link.file,
        line: link.line,
        message: `${link.source} link points to missing /${link.scope}/${link.slug}`,
      });
    }
  }

  const uniqueProblems = Array.from(
    new Map(problems.map((p) => [`${p.file}:${p.line ?? 0}:${p.message}`, p])).values(),
  );
  const uniqueSuggestions = Array.from(
    new Map(suggestions.map((p) => [`${p.file}:${p.line ?? 0}:${p.message}`, p])).values(),
  );

  console.log(`Checked ${posts.length} posts and ${links.length} internal content links.`);

  if (uniqueSuggestions.length > 0) {
    console.log('\nPotential table links:');
    for (const item of uniqueSuggestions) {
      console.log(`- ${item.file}${item.line ? `:${item.line}` : ''} ${item.message}`);
    }
  }

  if (uniqueProblems.length > 0) {
    console.error('\nBroken content links:');
    for (const item of uniqueProblems) {
      console.error(`- ${item.file}${item.line ? `:${item.line}` : ''} ${item.message}`);
    }
    process.exit(1);
  }

  console.log('No broken content links found.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
