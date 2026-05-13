// scripts/find-orphan-pin-links.ts
//
// Scan every prose surface for [Name](/pins/<slug>) references and report
// which slugs don't exist in the pins table. Orphan links render as
// blue "see this pin" anchors that 404 on click — visible breakage.
//
// Sources scanned:
//   - /content/lists/*.md (body markdown only — frontmatter is ignored
//     because pin links in description/title strings should be plain text)
//   - /content/posts/*.md
//
// Output: a table of orphan slug -> [files referencing it], so the next
// step is either creating the pin or rewriting the prose to plain text.
//
// Usage: npx tsx scripts/find-orphan-pin-links.ts

import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://pdjrvlhepiwkshxerkpz.supabase.co';
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  'sb_publishable_NrfBsFhfj0DSKqDEKeUCMQ_H5oDG-Zv';
const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

const PIN_LINK_RE = /\]\(\/pins\/([a-z0-9-]+)(?:[?#][^)]*)?\)/g;

type Ref = { slug: string; file: string };

async function scanFolder(dir: string, includeFrontmatter: boolean): Promise<Ref[]> {
  const out: Ref[] = [];
  let files: string[] = [];
  try {
    files = (await fs.readdir(dir)).filter((f) => f.endsWith('.md'));
  } catch {
    return out;
  }
  for (const f of files) {
    const raw = await fs.readFile(path.join(dir, f), 'utf8');
    const parsed = matter(raw);
    const text = includeFrontmatter ? raw : parsed.content;
    PIN_LINK_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = PIN_LINK_RE.exec(text))) {
      out.push({ slug: m[1], file: path.relative(process.cwd(), path.join(dir, f)) });
    }
  }
  return out;
}

async function main() {
  console.log('Scanning prose surfaces for /pins/<slug> references...');
  // Include frontmatter for lists because guide_cards bodies and FAQs do
  // cross-link to pins, and those render on the page. Posts don't have
  // long YAML bodies, just title + hero, so frontmatter is fine to skip.
  const lists = await scanFolder('content/lists', true);
  const posts = await scanFolder('content/posts', false);
  const refs = [...lists, ...posts];
  console.log(`Found ${refs.length} pin links across ${new Set(refs.map(r => r.file)).size} files.`);

  const slugs = [...new Set(refs.map((r) => r.slug))];
  console.log(`Unique slugs: ${slugs.length}.`);

  // Resolve in chunks.
  const CHUNK = 100;
  const existing = new Set<string>();
  for (let i = 0; i < slugs.length; i += CHUNK) {
    const chunk = slugs.slice(i, i + CHUNK);
    const { data, error } = await sb.from('pins').select('slug').in('slug', chunk);
    if (error) throw error;
    for (const r of (data ?? []) as Array<{ slug: string }>) existing.add(r.slug);
  }
  const orphanSlugs = slugs.filter((s) => !existing.has(s));
  console.log(`Orphan slugs (referenced but missing): ${orphanSlugs.length}.\n`);

  // Group orphans by slug → files
  const byOrphan = new Map<string, string[]>();
  for (const r of refs) {
    if (!existing.has(r.slug)) {
      const arr = byOrphan.get(r.slug) ?? [];
      if (!arr.includes(r.file)) arr.push(r.file);
      byOrphan.set(r.slug, arr);
    }
  }

  // Print table sorted by file count desc.
  const rows = [...byOrphan.entries()].sort((a, b) => b[1].length - a[1].length);
  if (rows.length === 0) {
    console.log('No orphans. Every /pins/<slug> in published prose resolves to a real pin.');
    return;
  }
  console.log('Slug'.padEnd(45) + 'Files referencing');
  console.log('-'.repeat(80));
  for (const [slug, files] of rows) {
    const head = files[0]!;
    console.log(slug.padEnd(45) + head);
    for (const f of files.slice(1)) {
      console.log(' '.repeat(45) + f);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
