// R2: Unify list-membership source by switching pins.saved_lists[] from
// storing list NAMES to storing list SLUGS.
//
// Today the seam:
//   saved_lists table       — metadata, keyed by SLUG
//   pins.saved_lists text[] — membership, stores NAMES
//
// app/lists/[slug]/page.tsx's findList() compensates with a 4-step
// fallback chain (slug exact match -> slugToListName match -> reverse
// listNameToSlug walk -> probe pins.saved_lists). Caused the Penedes
// 404 once, documented in CLAUDE.md.
//
// After this migration:
//   - pins.saved_lists holds slugs only.
//   - findList collapses to one lookup.
//
// Audit: ~38 of 149 saved_lists rows have name != slug, so most pin
// entries already match. The migration touches only pins that reference
// a name-vs-slug-differing list.
//
// Run with no flags: dry-run.
// Run with --apply to write.

import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = fs.readFileSync('.env.local', 'utf8')
  .split('\n').filter(l => l && !l.startsWith('#'));
for (const l of env) {
  const [k, ...v] = l.split('=');
  if (k) process.env[k.trim()] = v.join('=').trim().replace(/^["']|["']$/g, '');
}

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.STRAY_SUPABASE_SERVICE_ROLE_KEY
);

const apply = process.argv.includes('--apply');

// Build the name -> slug lookup table from saved_lists.
const { data: lists, error: listsErr } = await sb.from('saved_lists').select('name,slug');
if (listsErr) { console.error(listsErr); process.exit(1); }
const nameToSlug = new Map();
for (const l of lists) {
  if (l.name && l.slug) nameToSlug.set(l.name, l.slug);
}
console.log(`Loaded ${nameToSlug.size} name→slug mappings.`);

// Pull every pin that has at least one entry in saved_lists. Paginated
// because Supabase caps default queries at 1,000 rows.
const PAGE = 1000;
const pins = [];
for (let from = 0; ; from += PAGE) {
  const { data, error } = await sb.from('pins')
    .select('id,slug,saved_lists')
    .not('saved_lists', 'is', null)
    .order('id', { ascending: true })
    .range(from, from + PAGE - 1);
  if (error) { console.error(error); process.exit(1); }
  if (!data || data.length === 0) break;
  pins.push(...data);
  if (data.length < PAGE) break;
}
console.log(`Scanning ${pins.length} pins.`);

let changedPins = 0;
let orphanReferences = 0;
const orphans = new Set();
const updates = [];

for (const p of pins) {
  const list = p.saved_lists ?? [];
  if (list.length === 0) continue;
  const mapped = list.map(entry => {
    const slug = nameToSlug.get(entry);
    if (slug && slug !== entry) return slug;     // name -> slug rewrite
    if (slug) return entry;                       // already a slug match
    // No mapping at all: the entry references a list with no row.
    orphanReferences++;
    orphans.add(entry);
    return entry;                                 // leave as-is (preserve data)
  });
  const dedup = Array.from(new Set(mapped));
  if (JSON.stringify(dedup) !== JSON.stringify(list)) {
    changedPins++;
    updates.push({ id: p.id, slug: p.slug, before: list, after: dedup });
  }
}

console.log(`\nWould rewrite ${changedPins} pins.`);
console.log(`Orphan list references (no saved_lists row): ${orphanReferences} across ${orphans.size} distinct names.`);
if (orphans.size > 0) {
  for (const o of Array.from(orphans).slice(0, 12)) console.log(`  orphan: ${JSON.stringify(o)}`);
}

console.log('\nSample updates:');
for (const u of updates.slice(0, 6)) {
  console.log(`  ${u.slug}`);
  console.log(`    before: ${JSON.stringify(u.before)}`);
  console.log(`    after:  ${JSON.stringify(u.after)}`);
}

if (!apply) {
  console.log('\nDry run. Re-run with --apply to write.');
  process.exit(0);
}

console.log('\nApplying...');
let ok = 0, fail = 0;
for (const u of updates) {
  const { error } = await sb.from('pins').update({ saved_lists: u.after }).eq('id', u.id);
  if (error) { console.error(`  ${u.slug}: ${error.message}`); fail++; }
  else { ok++; }
}
console.log(`Done. ${ok} updated, ${fail} failed.`);
