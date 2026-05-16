/**
 * One-shot backfill: derive `topics:` frontmatter for /content/lists/*.md
 * from the H2 section headings each guide actually contains.
 *
 * Only the *discriminating* topics are derived. festivals plus the
 * selective themes (scams-safety, beaches, wine, spa, architecture,
 * markets, museums, nightlife, day-trips). The near-universal sections
 * (where-to-stay, food, getting-around) are intentionally NOT backfilled:
 * they sit on nearly every guide, so tagging them would make those hubs
 * "every guide" and the tag would carry no signal. They stay in the
 * registry for later if the framing changes.
 *
 * Insertion is pure text manipulation — never a gray-matter re-stringify —
 * because the authoring-note `#` comment block lives INSIDE the frontmatter
 * fence and a YAML round-trip would silently drop it.
 *
 * Run: npx tsx scripts/backfill-list-topics.ts          (dry run, prints plan)
 *      npx tsx scripts/backfill-list-topics.ts --write   (apply)
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';

const LISTS_DIR = path.join(process.cwd(), 'content', 'lists');
const WRITE = process.argv.includes('--write');

// Heading-text (lowercased) → topic slug. Each entry is a substring/regex
// test against a single H2 heading. A guide gets a topic if ANY of its H2
// headings matches that topic's pattern.
const HEADING_PATTERNS: { topic: string; test: RegExp }[] = [
  { topic: 'festivals',    test: /festivals and big annual events|ramadan and other big annual events/ },
  { topic: 'scams-safety', test: /\bscam|is it safe|^safety\b|safety[,:]| safety\b/ },
  { topic: 'beaches',      test: /\bbeach/ },
  { topic: 'wine',         test: /\bwine\b|\bwiner|\bcava\b|vineyard|producers to book/ },
  { topic: 'spa',          test: /thermae|thermal|sulfur bath|sulphur bath|roman baths|hot spring|hammam|\bspa\b/ },
  { topic: 'architecture', test: /architecture/ },
  { topic: 'markets',      test: /\bmarket/ },
  { topic: 'museums',      test: /\bmuseum/ },
  { topic: 'nightlife',    test: /nightlife|\bat night\b|where to drink|bar crawl|pub crawl|beer crawl/ },
  { topic: 'day-trips',    test: /day ?trip|day-trip/ },
];

/** Pull H2 heading text from a markdown body, excluding the TOC heading.
 *  Strips `{#anchor}` suffixes and `[text](url)` link syntax. */
function extractHeadings(body: string): string[] {
  const out: string[] = [];
  for (const line of body.split('\n')) {
    const m = /^##\s+(.+?)\s*$/.exec(line);
    if (!m) continue;
    let text = m[1]
      .replace(/\s*\{#[^}]*\}\s*$/, '')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .trim()
      .toLowerCase();
    if (text === 'on this page') continue;
    out.push(text);
  }
  return out;
}

function deriveTopics(headings: string[]): string[] {
  const found = new Set<string>();
  for (const { topic, test } of HEADING_PATTERNS) {
    if (headings.some(h => test.test(h))) found.add(topic);
  }
  return [...found];
}

async function main() {
  const files = (await fs.readdir(LISTS_DIR)).filter(f => f.endsWith('.md')).sort();
  let changed = 0;
  let skippedHasTopics = 0;
  let skippedNoTopics = 0;

  for (const file of files) {
    const full = path.join(LISTS_DIR, file);
    const raw = await fs.readFile(full, 'utf8');
    const lines = raw.split('\n');

    if (lines[0] !== '---') {
      console.warn(`SKIP ${file}: no frontmatter fence`);
      continue;
    }
    const fmEnd = lines.indexOf('---', 1);
    if (fmEnd === -1) {
      console.warn(`SKIP ${file}: unterminated frontmatter`);
      continue;
    }
    const frontmatter = lines.slice(1, fmEnd);
    const body = lines.slice(fmEnd + 1).join('\n');

    if (frontmatter.some(l => /^topics:/.test(l))) {
      skippedHasTopics++;
      continue;
    }

    const topics = deriveTopics(extractHeadings(body));
    if (topics.length === 0) {
      skippedNoTopics++;
      continue;
    }

    const block = ['topics:', ...topics.map(t => `  - ${t}`)];

    // Insert before the authoring-note comment block when present, else
    // before the closing fence. A blank line keeps the YAML readable.
    const notesIdx = lines.findIndex(
      (l, i) => i > 0 && i < fmEnd && /^#\s*Authoring notes/.test(l),
    );
    const insertAt = notesIdx !== -1 ? notesIdx : fmEnd;
    const insertion = notesIdx !== -1 ? [...block, ''] : block;
    const next = [...lines.slice(0, insertAt), ...insertion, ...lines.slice(insertAt)];

    console.log(`${file}: ${topics.join(', ')}`);
    changed++;

    if (WRITE) await fs.writeFile(full, next.join('\n'), 'utf8');
  }

  console.log(
    `\n${WRITE ? 'WROTE' : 'DRY RUN'} — ${changed} files tagged, ` +
      `${skippedHasTopics} already had topics, ${skippedNoTopics} matched nothing.`,
  );
  if (!WRITE) console.log('Re-run with --write to apply.');
}

main();
