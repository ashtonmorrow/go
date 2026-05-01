import 'server-only';
import { promises as fs } from 'fs';
import path from 'path';
import { cache } from 'react';
import { unstable_cache } from 'next/cache';

/**
 * File-based content collection.
 *
 * The personal-voice prose for every place lives in this repo as a flat
 * markdown file:
 *
 *   /content/pins/<slug>.md
 *   /content/cities/<slug>.md
 *   /content/countries/<slug>.md
 *
 * Each file has a tiny YAML-ish frontmatter for the search-engine indexability
 * flag, then the body prose. Body is plain paragraphs separated by blank
 * lines — no markdown features needed (the content-authoring handoff prompt
 * already strips bullets, headings, bold, etc.).
 *
 *   ---
 *   indexable: true
 *   ---
 *
 *   First paragraph...
 *
 *   Second paragraph...
 *
 * Why files instead of a database table:
 *   - VS Code edits with full editor power
 *   - git history is the audit log
 *   - branch + preview deploys for tricky edits
 *   - works offline, syncs via push
 *   - no admin UI to maintain
 */

export type ContentScope = 'pins' | 'cities' | 'countries' | 'lists';

export type PlaceContent = {
  /** The prose body, trimmed. Paragraphs separated by blank lines. */
  body: string;
  /** When true, the page metadata can drop the noindex robots header. */
  indexable: boolean;
};

const CONTENT_ROOT = path.join(process.cwd(), 'content');

/**
 * Strict slug pattern. Avoids escapes into ../ or absolute paths since the
 * slug is taken straight from the URL.
 */
const SAFE_SLUG = /^[a-z0-9][a-z0-9-]*$/;

function parseFrontmatter(raw: string): { meta: Record<string, string | boolean | number>; body: string } {
  // Reject anything that doesn't open with the YAML fence on line one.
  if (!raw.startsWith('---')) {
    return { meta: {}, body: raw };
  }
  // Find the closing fence on its own line. Search starts past the opener.
  const close = raw.indexOf('\n---', 3);
  if (close === -1) return { meta: {}, body: raw };
  const fmRaw = raw.slice(3, close).replace(/^\r?\n/, '');
  const body = raw.slice(close + 4).replace(/^\r?\n/, '');
  const meta: Record<string, string | boolean | number> = {};
  for (const line of fmRaw.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.+?)\s*$/);
    if (!match) continue;
    const [, key, raw] = match;
    if (raw === 'true') meta[key] = true;
    else if (raw === 'false') meta[key] = false;
    else if (/^-?\d+(?:\.\d+)?$/.test(raw)) meta[key] = Number(raw);
    else meta[key] = raw.replace(/^["']|["']$/g, '');
  }
  return { meta, body };
}

const _readContent = unstable_cache(
  async (scope: ContentScope, slug: string): Promise<PlaceContent | null> => {
    if (!SAFE_SLUG.test(slug)) return null;
    const file = path.join(CONTENT_ROOT, scope, `${slug}.md`);
    let raw: string;
    try {
      raw = await fs.readFile(file, 'utf8');
    } catch {
      return null;
    }
    const { meta, body } = parseFrontmatter(raw);
    const trimmed = body.trim();
    if (!trimmed) return null;
    return {
      body: trimmed,
      indexable: meta.indexable === true,
    };
  },
  ['place-content'],
  { revalidate: 86400, tags: ['place-content'] },
);

/**
 * Read the content file for a (scope, slug) pair. Returns null if the file
 * doesn't exist, the slug is unsafe, or the body is empty.
 */
export const readPlaceContent = cache(_readContent);

/**
 * Render a content body as JSX-ready paragraphs. Splits on one-or-more blank
 * lines; trims each paragraph; preserves intentional single-line breaks
 * inside a paragraph as `<br />`-equivalent spaces (we never use them, but
 * the prose handoff doesn't promise to never use them either).
 */
export function paragraphs(body: string): string[] {
  return body
    .split(/\r?\n\s*\r?\n/)
    .map(p => p.trim())
    .filter(Boolean);
}
