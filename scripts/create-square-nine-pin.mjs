// Create the Square Nine Hotel pin (Belgrade). Wire it into the belgrade
// saved_list. Mike confirmed both Ebisu and The Square Restaurant sit at
// this property, so the hotel itself is now worth pinning.
//
// Run: node scripts/create-square-nine-pin.mjs          (dry-run)
//      node scripts/create-square-nine-pin.mjs --apply  (writes)

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

const pin = {
  name: 'Square Nine Hotel',
  slug: 'square-nine-hotel',
  lat: 44.8194,
  lng: 20.4570,
  city_names: ['Belgrade'],
  kind: 'hotel',
  category: 'hotel',
  address: 'Studentski trg 9, 11000 Beograd, Serbia',
  description: 'Leading Hotels of the World property on Studentski trg in central old-town Belgrade. Houses two on-property restaurants: Ebisu (Japanese / sushi) and The Square (modern dining room).',
  website: 'https://squarenine.rs',
  source: 'manual-2026-05',
  enrichment_status: 'partial',
  booking: 'required',
};

// Idempotency: if a pin with this slug already exists, skip.
const { data: existing } = await sb.from('pins')
  .select('slug,name,address')
  .eq('slug', pin.slug)
  .maybeSingle();

if (existing) {
  console.log(`Pin already exists, skipping insert: ${existing.slug}`);
} else {
  console.log('Will insert pin:');
  for (const [k, v] of Object.entries(pin)) {
    const s = JSON.stringify(v);
    console.log(`  ${k} = ${s.length > 90 ? s.slice(0, 90) + '...' : s}`);
  }
  if (apply) {
    const { error } = await sb.from('pins').insert(pin);
    if (error) {
      console.error(`Insert failed: ${error.message}`);
      process.exit(1);
    }
    console.log('Inserted.');
  }
}

// Add the new pin to the belgrade saved_list (via the pins.saved_lists
// text[] column, which is the source of truth the list pages read).
const { data: pinRow } = await sb.from('pins')
  .select('slug,saved_lists')
  .eq('slug', pin.slug)
  .maybeSingle();

const current = pinRow?.saved_lists ?? [];
if (current.includes('belgrade')) {
  console.log('Already on the belgrade saved_list, skipping.');
} else if (apply) {
  const newSavedLists = [...current, 'belgrade'];
  const { error } = await sb.from('pins')
    .update({ saved_lists: newSavedLists })
    .eq('slug', pin.slug);
  if (error) console.error(`saved_lists update failed: ${error.message}`);
  else console.log(`Added to belgrade saved_list.`);
} else {
  console.log(`Would add to belgrade saved_list (currently ${JSON.stringify(current)}).`);
}

if (!apply) console.log('\nDry run. Re-run with --apply to write.');
