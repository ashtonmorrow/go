// Apply the voice fixes previewed in scripts/go_cities-voice-dry-run.md.
// Run: node scripts/apply-go-cities-voice.mjs
//
// Same patterns as the dry-run script. Run the dry-run first and review the
// before/after diffs before running this apply.

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

const patterns = [
  { re: /\bgenuinely\b\s*/gi, replacement: '' },
  { re: /\bhonestly\b\s*/gi,  replacement: '' },
  { re: /\bfrankly\b\s*/gi,   replacement: '' },
  { re: /—/g,                 replacement: ', ' },
  { re: /\bdelivers\b/g,      replacement: 'is as good as advertised' },
];

const { data: cit, error } = await sb.from('go_cities')
  .select('id,slug,about,why_visit,avoid');

if (error) { console.error(error); process.exit(1); }

let n = 0, errs = 0;
for (const c of cit) {
  const after = { about: c.about, why_visit: c.why_visit, avoid: c.avoid };
  let changed = false;

  for (const fld of ['about', 'why_visit', 'avoid']) {
    if (!after[fld]) continue;
    let v = after[fld];
    for (const p of patterns) {
      const nv = v.replace(p.re, p.replacement);
      if (nv !== v) { v = nv; changed = true; }
    }
    v = v.replace(/\s+/g, ' ').replace(/\s+([.,;:])/g, '$1').trim();
    after[fld] = v;
  }

  if (changed) {
    const { error } = await sb.from('go_cities').update({
      about: after.about,
      why_visit: after.why_visit,
      avoid: after.avoid,
    }).eq('id', c.id);
    if (error) { console.error(c.slug, error.message); errs++; }
    else { n++; }
  }
}

console.log(`Updated ${n} cities. ${errs} errors.`);
