/**
 * Enrich AO pins via the same generator the /admin/pins button uses,
 * bypassing the Vercel auth gate.
 *
 *   npx tsx --env-file=.env.local scripts/enrich-ao-pins.ts [--limit=N] [--dry]
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { enrichPins, type EnrichField } from '../lib/placesEnrichment';

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry');
  const limitArg = args.find(a => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : Infinity;

  const idsPath = path.join(__dirname, 'ao_ids.json');
  let ids: string[] = JSON.parse(fs.readFileSync(idsPath, 'utf8'));
  if (Number.isFinite(limit)) ids = ids.slice(0, limit);
  console.log(`Loaded ${ids.length} pin ids${dry ? ' (DRY RUN)' : ''}`);

  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const KEY = process.env.STRAY_SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !KEY) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or STRAY_SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const fields: EnrichField[] = ['price', 'hours', 'website', 'phone', 'kind'];
  let wrote = 0;
  let noData = 0;
  let noMatch = 0;
  let other = 0;
  const t0 = Date.now();

  for await (const ev of enrichPins({
    supabase, pinIds: ids, fields, refresh: false, dryRun: dry,
  })) {
    if (ev.type === 'start') {
      console.log(`Starting: ${ev.total} pins, fields=${ev.fields.join(',')}, tier=$${ev.tier}/req\n`);
      continue;
    }
    if (ev.type === 'done') {
      console.log(`\n=== ${dry ? 'DRY ' : ''}DONE in ${((Date.now()-t0)/1000).toFixed(0)}s — processed=${ev.processed} written=${ev.written} cost=$${ev.totalCost.toFixed(3)} ${ev.abortedAtCap ? 'ABORTED-AT-CAP' : ''} ===`);
      continue;
    }
    // progress
    if (ev.action === 'enriched' && ev.patch && Object.keys(ev.patch).length > 0) {
      wrote++;
      const keys = Object.keys(ev.patch).filter(k => !k.startsWith('enrichment_')).join(',');
      console.log(`OK ${ev.pinName.slice(0, 50).padEnd(50)} ${keys || '(metadata only)'}`);
    } else if (ev.action === 'no-data') {
      noData++;
    } else if (ev.action === 'no-match') {
      noMatch++;
      console.log(`?  ${ev.pinName.slice(0, 50)} (no place match)`);
    } else if (ev.action === 'cost-cap') {
      console.log(`!  Aborted at cost cap`);
    } else {
      other++;
    }
    const done = wrote + noData + noMatch + other;
    if (done > 0 && done % 25 === 0) {
      const dt = ((Date.now()-t0)/1000).toFixed(0);
      console.log(`  ... ${done}/${ids.length} wrote=${wrote} no-data=${noData} no-match=${noMatch} (${dt}s)`);
    }
  }

  console.log(`\nFinal: wrote=${wrote} no-data=${noData} no-match=${noMatch}`);
}

main().catch(e => { console.error(e); process.exit(1); });
