// Migrate the markdown `## Pairs with` tables into the structured
// `pairs_with:` frontmatter block. Run once after the chip component lands.
//
// For each guide:
//   1. Locate the `## Pairs with` heading.
//   2. Parse the table that follows: City link | Travel | Why pair.
//   3. Extract slug from the markdown link.
//   4. Build a pairs_with frontmatter block.
//   5. Remove the markdown section from the body.
//   6. Write the updated file.
//
// Run: node scripts/migrate-pairs-with.mjs
// Dry-run by default. Pass --apply to actually write.

import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

const dir = 'content/lists';
const apply = process.argv.includes('--apply');

let migrated = 0;
let skipped = 0;
const failures = [];

for (const f of fs.readdirSync(dir).sort()) {
  if (!f.endsWith('.md')) continue;
  const p = path.join(dir, f);
  const text = fs.readFileSync(p, 'utf8');
  if (!/\n## Pairs with\b/.test(text)) continue;

  // Split frontmatter / body
  const fm = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!fm) { failures.push(`${f}: no frontmatter`); continue; }
  const fmRaw = fm[1];
  const body = fm[2];
  let fmData;
  try { fmData = yaml.load(fmRaw) ?? {}; }
  catch (e) { failures.push(`${f}: yaml parse ${e.message}`); continue; }

  if (fmData.pairs_with) {
    skipped++;
    continue; // already migrated
  }

  // Find the Pairs with section
  const pwMatch = body.match(/\n## Pairs with\n+(\| City \| Travel \| Why pair \|\n\|[-\| ]+\|\n(?:\|[^\n]+\n)+)\n/);
  if (!pwMatch) {
    failures.push(`${f}: Pairs-with section present but table shape did not match`);
    continue;
  }

  const tableMd = pwMatch[1];
  const rows = tableMd.split('\n').slice(2).filter(r => r.trim().startsWith('|'));

  const pairs = [];
  for (const r of rows) {
    const cells = r.split('|').slice(1, -1).map(c => c.trim());
    if (cells.length < 3) { failures.push(`${f}: row has ${cells.length} cells: ${r}`); continue; }
    const [cityCell, travel, why] = cells;
    const linkMatch = cityCell.match(/\[([^\]]+)\]\(\/lists\/([^)\s]+)\)/);
    if (!linkMatch) { failures.push(`${f}: could not parse city link: ${cityCell}`); continue; }
    const slug = linkMatch[2];
    pairs.push({ city: slug, travel, why });
  }

  if (pairs.length === 0) { failures.push(`${f}: no pairs parsed`); continue; }

  // Inject pairs_with into frontmatter object
  fmData.pairs_with = pairs;

  // Re-serialize frontmatter. Keep stable key order: respect original keys,
  // append pairs_with at the position where related/topics/day_trips live.
  // Simplest: re-dump everything via yaml. Cosmetic key order is fine.
  const fmOut = yaml.dump(fmData, { lineWidth: -1, noRefs: true });

  // Remove the markdown section from the body
  const bodyOut = body.replace(/\n## Pairs with\n+\| City \| Travel \| Why pair \|\n\|[-\| ]+\|\n(?:\|[^\n]+\n)+\n?/, '\n');

  const out = `---\n${fmOut}---\n${bodyOut}`;

  if (apply) {
    fs.writeFileSync(p, out);
    console.log(`MIGRATED ${f}: ${pairs.length} pairs`);
  } else {
    console.log(`WOULD MIGRATE ${f}: ${pairs.length} pairs (${pairs.map(p => p.city).join(', ')})`);
  }
  migrated++;
}

console.log(`\n${apply ? 'Migrated' : 'Would migrate'}: ${migrated}`);
console.log(`Skipped (already had pairs_with): ${skipped}`);
if (failures.length > 0) {
  console.log(`\nFailures (${failures.length}):`);
  for (const f of failures) console.log(`  ${f}`);
}
if (!apply) console.log('\nDry run. Re-run with --apply to write.');
