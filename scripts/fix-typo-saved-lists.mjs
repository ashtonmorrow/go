// Fix two typo'd saved_lists names and the pin references that point to them.
//
// 1. "belluno *& caviola" (literal asterisk in the name) -> "belluno-caviola"
//    saved_lists row: name change only. slug is already "belluno-caviola".
//    13 pins have "belluno *& caviola" in their saved_lists arrays.
//
// 2. "st. malo & mt. sant michel" -> "saint-malo-mont-saint-michel"
//    saved_lists row: name AND slug change ("sant" should be "saint",
//    slug typo "saint-malo-mt-sant-michel" needs the same fix).
//    2 pins have the bad name in saved_lists.
//
// Run with --apply to write. Without it, prints the plan only.

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

const fixes = [
  {
    badName: 'belluno *& caviola',
    newName: 'belluno-caviola',
    newSlug: 'belluno-caviola',
    description: 'Belluno + Caviola, Italian Dolomites',
  },
  {
    badName: 'st. malo & mt. sant michel',
    newName: 'saint-malo-mont-saint-michel',
    newSlug: 'saint-malo-mont-saint-michel',
    description: 'Saint-Malo + Mont-Saint-Michel, Normandy/Brittany',
  },
];

for (const f of fixes) {
  console.log(`\n=== ${f.badName} -> ${f.newName} ===`);

  // 1. Find pins referencing the bad name
  const { data: pins } = await sb.from('pins')
    .select('id,slug,saved_lists')
    .contains('saved_lists', [f.badName]);

  console.log(`Pins to update: ${(pins || []).length}`);
  for (const p of pins || []) console.log(`  - ${p.slug}`);

  // 2. Find the saved_lists row
  const { data: lists } = await sb.from('saved_lists')
    .select('*').eq('name', f.badName);

  console.log(`saved_lists row(s) to update: ${(lists || []).length}`);
  for (const l of lists || []) console.log(`  - name='${l.name}' slug='${l.slug}'`);

  if (!apply) continue;

  // 3. Apply: update each pin
  for (const p of pins || []) {
    const newArr = (p.saved_lists || []).map(s => s === f.badName ? f.newName : s);
    const { error } = await sb.from('pins').update({ saved_lists: newArr }).eq('id', p.id);
    if (error) console.error(`  pin ${p.slug} update failed: ${error.message}`);
  }

  // 4. Apply: update the saved_lists row(s)
  for (const l of lists || []) {
    const { error } = await sb.from('saved_lists')
      .update({ name: f.newName, slug: f.newSlug })
      .eq('name', l.name);
    if (error) console.error(`  saved_lists update failed: ${error.message}`);
  }

  console.log(`  Applied.`);
}

if (!apply) {
  console.log(`\nDry run only. Re-run with --apply to write.`);
}
