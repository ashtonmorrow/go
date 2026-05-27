// One-shot fix for the Ebisu / The Square Belgrade location error.
//
// Both restaurants are at Square Nine Hotel (Studentski trg 9, old town
// Belgrade), not the Hyatt Regency in Novi Beograd. The Ebisu pin was
// created during the May 2026 interview-pass session with a wrong address
// (Hyatt Regency), and the Belgrade guide propagated that error.
//
// Mike confirmed the location is Square Nine Hotel.
//
// Run: node scripts/fix-ebisu-belgrade.mjs           (dry-run)
//      node scripts/fix-ebisu-belgrade.mjs --apply   (writes)

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

const updates = [
  {
    slug: 'ebisu-belgrade',
    address: 'Studentski trg 9, Square Nine Hotel, 11000 Beograd, Serbia',
    description: 'Japanese restaurant at Square Nine Hotel in central Belgrade, sharing the property with The Square Restaurant.',
    // Approximate Square Nine lat/lng. Override if known.
    lat: 44.819400,
    lng: 20.457000,
  },
  {
    slug: 'the-square-restaurant',
    address: 'Studentski trg 9, Square Nine Hotel, 11000 Beograd, Serbia',
    description: 'Modern dining room at Square Nine Hotel in central Belgrade, sharing the property with Ebisu.',
    lat: 44.819400,
    lng: 20.457000,
  },
];

for (const u of updates) {
  const { data: before } = await sb.from('pins')
    .select('slug,name,address,lat,lng,description')
    .eq('slug', u.slug)
    .single();

  console.log(`\n=== ${u.slug} ===`);
  console.log('BEFORE address:', before?.address);
  console.log('AFTER  address:', u.address);
  console.log('BEFORE description:', before?.description);
  console.log('AFTER  description:', u.description);

  if (!apply) continue;
  const { error } = await sb.from('pins').update({
    address: u.address,
    description: u.description,
    lat: u.lat,
    lng: u.lng,
  }).eq('slug', u.slug);
  if (error) console.error(`  update failed: ${error.message}`);
  else console.log('  applied.');
}

if (!apply) console.log('\nDry run. Re-run with --apply to write.');
