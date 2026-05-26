// Indexable-flip readiness audit for content/lists/*.md.
//
// For every list with indexable:false, runs the voice-check pattern from
// CLAUDE.md and reports a pass/fail. Mike uses the output to decide which
// guides are ready to flip indexable:true.
//
// Output: scripts/indexable-readiness.md

import fs from 'node:fs';
import path from 'node:path';

const banned = [
  { name: 'em-dash', re: /—/ },
  { name: 'semicolon (body)', re: /;/ },
  { name: '"the move"', re: /\bthe move\b/i },
  { name: '"delivers"', re: /\bdelivers\b/ },
  { name: '"earns the X"', re: /\bearns the [a-z]+/i },
  { name: '"the headline X"', re: /\bthe headline [a-z]+/i },
  { name: '"the trick is"', re: /\bthe trick is\b/i },
  { name: '"the right move is"', re: /\bthe right move is\b/i },
  { name: '"the trade-off is"', re: /\bthe trade-off is\b/i },
  { name: '"worth every"', re: /\bworth every\b/i },
  { name: 'lazy solid', re: /\bsolid (pick|choice|option|mid|classic)\b/i },
  { name: '"genuinely"', re: /\bgenuinely\b/i },
  { name: '"honestly"', re: /\bhonestly\b/i },
  { name: '"frankly"', re: /\bfrankly\b/i },
  { name: 'pace-note boilerplate', re: /rewards going slowly more than it rewards covering ground/i },
];

const dir = 'content/lists';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort();

const lines = [
  '# Indexable-flip readiness',
  '',
  'Per-guide check against the voice rules from CLAUDE.md. PASS means no banned-phrase hits in the body.',
  'Hero column reports whether the guide has a `hero_image` set.',
  '',
  '| Guide | Body lines | Hero set? | Featured | Indexable | Voice check | Hits |',
  '|---|---|---|---|---|---|---|',
];

const summary = { pass: 0, fail: 0, alreadyIndexed: 0 };

for (const f of files) {
  const text = fs.readFileSync(path.join(dir, f), 'utf8');
  const fm = text.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) continue;
  const meta = {};
  for (const line of fm[1].split('\n')) {
    const m = line.match(/^(\w+):\s*(.*)$/);
    if (m) meta[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }

  const body = text.slice(fm[0].length).replace(/\n#[^\n]*\n[\s\S]*$/, ''); // ish

  // Find banned hits in body only (skip frontmatter)
  const bodyOnly = text.slice(fm[0].length);
  const hits = [];
  for (const b of banned) {
    if (b.re.test(bodyOnly)) hits.push(b.name);
  }

  const indexable = meta.indexable === 'true';
  const featured = meta.featured === 'true';
  const heroSet = meta.hero_image && meta.hero_image !== '""' && meta.hero_image !== '';

  if (indexable) summary.alreadyIndexed++;
  else if (hits.length === 0) summary.pass++;
  else summary.fail++;

  const guide = f.replace('.md', '');
  const bodyLines = bodyOnly.split('\n').length;
  const status = indexable ? 'ALREADY LIVE' : (hits.length === 0 ? 'PASS' : 'FAIL');

  lines.push(`| ${guide} | ${bodyLines} | ${heroSet ? 'Y' : 'N'} | ${featured ? 'Y' : 'N'} | ${indexable ? 'Y' : 'N'} | ${status} | ${hits.join(', ') || '-'} |`);
}

lines.push('', '---', '', `Summary: **${summary.pass} ready to flip**, ${summary.fail} need a voice pass first, ${summary.alreadyIndexed} already live.`);
lines.push('', 'Notes:');
lines.push('- "Hero set? = N" still passes the voice check, but per CLAUDE.md the indexable gate also covers the hero image. Pick a hero before flipping.');
lines.push('- "Voice check = FAIL" lists the patterns that hit. Each one needs a manual rewrite (most are 1-2 instances per guide).');
lines.push('- The body-lines column is a quick proxy for guide depth. Anything under ~80 lines is a thin scaffold worth padding first.');

fs.writeFileSync('scripts/indexable-readiness.md', lines.join('\n'));
console.log(`Wrote scripts/indexable-readiness.md`);
console.log(`Pass: ${summary.pass} / Fail: ${summary.fail} / Already live: ${summary.alreadyIndexed}`);
