// Run AO pin enrichment locally, bypassing the Vercel admin auth gate.
// Uses the same enrichPins() generator the /admin/pins button calls,
// but with the service-role client + a static pinIds list.
//
//   node --env-file=.env.local --experimental-strip-types scripts/enrich-ao-pins.mjs
//
// Reads ao_ids.json from the same directory.

import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { register } from 'node:module';

// We need to import a TypeScript module from a JS file. Easiest path is
// shelling to tsx — but a plain dynamic import works too because the
// repo's tsconfig is set up for bundler resolution. Use tsx.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const idsPath = process.argv[2] || path.join(__dirname, 'ao_ids.json');
  const ids = JSON.parse(fs.readFileSync(idsPath, 'utf8'));
  console.log(`Loaded ${ids.length} pin ids from ${idsPath}`);

  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const KEY = process.env.STRAY_SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !KEY) {
    console.error('Missing env. Need NEXT_PUBLIC_SUPABASE_URL + STRAY_SUPABASE_SERVICE_ROLE_KEY (run with --env-file=.env.local)');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { enrichPins } = await import('../lib/placesEnrichment.ts');

  const fields = ['price', 'hours', 'website', 'phone', 'kind'];
  let wrote = 0, skipped = 0, errored = 0;
  const t0 = Date.now();
  console.log(`Starting enrichment with fields: ${fields.join(', ')}\n`);
  for await (const ev of enrichPins({
    supabase, pinIds: ids, fields, refresh: false, dryRun: false,
  })) {
    if (ev.type === 'progress') {
      const wasWrite = ev.patch && Object.keys(ev.patch).length > 0;
      if (wasWrite) {
        wrote++;
        console.log(`✓ ${ev.pinName?.slice(0,60).padEnd(60)} ${Object.keys(ev.patch).join(',')}`);
      } else {
        skipped++;
      }
      if ((wrote + skipped) % 20 === 0) {
        console.log(`  ... ${wrote+skipped}/${ids.length}  wrote=${wrote} skipped=${skipped} errors=${errored}  ${((Date.now()-t0)/1000).toFixed(0)}s`);
      }
    } else if (ev.type === 'error') {
      errored++;
      console.log(`! ${ev.pinId?.slice(0,8)} ${ev.error}`);
    } else if (ev.type === 'done') {
      console.log(`\n=== DONE in ${((Date.now()-t0)/1000).toFixed(0)}s ===`);
    }
  }
  console.log(`\nTotal: wrote=${wrote} skipped=${skipped} errors=${errored}`);
}

main().catch(e => { console.error(e); process.exit(1); });
