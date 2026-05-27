// Find plain-text mentions of place names in guide bodies where a matching
// pin now exists in the DB. Authoring-notes blocks often flag "pins to
// create" — once the pin exists, the body still references it as plain text
// and needs the link swapped in.
//
// This is heuristic: it matches pin names (case-sensitive substring) against
// the body text. False positives are likely on short common names. The
// output is a worksheet for review, not an auto-apply.

import fs from 'node:fs';
import path from 'node:path';
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

// Pull every pin with its name and slug
const { data: pins, error } = await sb.from('pins').select('slug,name,saved_lists');
if (error) { console.error(error); process.exit(1); }

// Build slug -> name and a map of saved_list -> [pins on that list]
const pinByName = new Map();
const pinsByList = new Map();
for (const p of pins) {
  if (p.name && p.name.length >= 6) pinByName.set(p.name, p.slug);
  for (const list of (p.saved_lists || [])) {
    if (!pinsByList.has(list)) pinsByList.set(list, []);
    pinsByList.get(list).push(p);
  }
}

const dir = 'content/lists';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort();

const lines = [
  '# Pin-link backfill worksheet',
  '',
  'Heuristic match of pin names against guide body text. Pins flagged here',
  'appear as plain text in the body but a matching pin exists in the DB.',
  'Some matches will be false positives on common names; review before',
  'swapping. The fix is to wrap the mention in `[Name](/pins/<slug>)`.',
  '',
];

let totalCandidates = 0;

for (const f of files) {
  const guideSlug = f.replace('.md', '');
  const text = fs.readFileSync(path.join(dir, f), 'utf8');
  const fm = text.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) continue;
  const body = text.slice(fm[0].length);
  // Strip authoring-note comments (lines that start with #)
  const bodyClean = body.split('\n').filter(l => !l.match(/^\s*#/)).join('\n');

  // Find pins specifically on this list (via saved_lists membership)
  const candidatePins = pinsByList.get(guideSlug) || [];
  const missing = [];
  for (const p of candidatePins) {
    if (!p.name || p.name.length < 6) continue;
    // Already linked?
    if (bodyClean.includes(`/pins/${p.slug}`)) continue;
    // Mentioned as plain text? Match the pin name as a whole word/phrase
    const escapedName = p.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`\\b${escapedName}\\b`);
    if (re.test(bodyClean)) {
      missing.push({ pinSlug: p.slug, pinName: p.name });
    }
  }
  if (missing.length > 0) {
    lines.push(`## ${guideSlug} (${missing.length} candidates)`);
    for (const m of missing) {
      lines.push(`- **${m.pinName}** -> \`[${m.pinName}](/pins/${m.pinSlug})\``);
    }
    lines.push('');
    totalCandidates += missing.length;
  }
}

lines.push('---', '', `Total: ${totalCandidates} plain-text mentions where a pin link could be wired in.`);
fs.writeFileSync('scripts/pin-link-backfill.md', lines.join('\n'));
console.log(`Wrote scripts/pin-link-backfill.md with ${totalCandidates} candidates`);
