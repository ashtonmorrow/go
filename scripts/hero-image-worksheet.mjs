// For each list guide without a hero_image, list the candidate URLs from
// go_cities.hero_photo_urls. Output a worksheet Mike can use in the admin
// picker rather than auto-applying (hero choice is editorial).
//
// Output: scripts/hero-image-worksheet.md

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

const dir = 'content/lists';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort();

const lines = [
  '# Hero-image worksheet',
  '',
  'For each guide without `hero_image` set, lists candidate photo URLs from',
  '`go_cities.hero_photo_urls`. Pick one in `/admin/lists/<slug>`; the picker',
  'writes it back to the guide frontmatter. Choices flagged as `(Wikipedia',
  'stock)` are the fallback `go_cities.hero_image` and should usually NOT be',
  'used as the guide hero (that field is for personal photos).',
  '',
];

const noCandidates = [];
const withCandidates = [];

for (const f of files) {
  const text = fs.readFileSync(path.join(dir, f), 'utf8');
  const fm = text.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) continue;

  const heroMatch = fm[1].match(/^hero_image:\s*(.*)$/m);
  const hero = heroMatch ? heroMatch[1].trim().replace(/^["']|["']$/g, '') : '';
  if (hero) continue; // already set

  const indexableMatch = fm[1].match(/^indexable:\s*(.*)$/m);
  const featuredMatch = fm[1].match(/^featured:\s*(.*)$/m);
  const cityMatch = fm[1].match(/related:[\s\S]*?city:\s*([^\n]+)/);
  const citySlug = cityMatch ? cityMatch[1].trim().replace(/^["']|["']$/g, '') : '';

  if (!citySlug) {
    noCandidates.push({ guide: f.replace('.md', ''), citySlug: null, reason: 'no related.city' });
    continue;
  }

  const { data: city } = await sb.from('go_cities')
    .select('hero_image,hero_photo_urls')
    .eq('slug', citySlug)
    .maybeSingle();

  const candidates = (city?.hero_photo_urls || []).filter(Boolean);

  if (candidates.length === 0 && !city?.hero_image) {
    noCandidates.push({ guide: f.replace('.md', ''), citySlug, reason: 'no hero_photo_urls or hero_image on city' });
  } else {
    withCandidates.push({
      guide: f.replace('.md', ''),
      citySlug,
      indexable: indexableMatch?.[1].trim() === 'true',
      featured:  featuredMatch?.[1].trim() === 'true',
      candidates,
      wikipediaFallback: city?.hero_image || null,
    });
  }
}

// Categorize each candidate
function classify(url) {
  if (!url) return 'none';
  if (url.includes('/personal-photos/')) return 'personal';
  if (url.includes('/pin-images/') && url.includes('art-deco-travel-poster')) return 'ai-poster';
  if (url.includes('/pin-images/')) return 'pin';
  if (url.includes('wikipedia.org') || url.includes('wikimedia.org')) return 'wikipedia';
  return 'other';
}

// Split into the categories we actually want to differentiate
const buckets = { personal: [], pinPhoto: [], aiPoster: [], wikiOnly: [] };
for (const w of withCandidates) {
  const types = w.candidates.map(classify);
  if (types.includes('personal')) buckets.personal.push(w);
  else if (types.includes('pin')) buckets.pinPhoto.push(w);
  else if (types.includes('ai-poster')) buckets.aiPoster.push(w);
  else buckets.wikiOnly.push(w);
}

lines.push(`## ${buckets.personal.length} guides with a Mike personal photo ready (the easy picks)`);
lines.push('');
lines.push('Convention used by tbilisi/bristol/madrid/bangkok is the first `/personal-photos/` URL.');
lines.push('');
lines.push('| Guide | City | Featured? | First personal-photo URL |');
lines.push('|---|---|---|---|');
for (const w of buckets.personal) {
  const firstPersonal = w.candidates.find(u => classify(u) === 'personal');
  lines.push(`| ${w.guide} | ${w.citySlug} | ${w.featured ? 'Y' : 'N'} | ${firstPersonal} |`);
}

lines.push('', `## ${buckets.pinPhoto.length} guides with a pin photo but no personal photo`);
lines.push('Pin photos can work if the pin is iconic enough (e.g. a single landmark).');
lines.push('');
lines.push('| Guide | City | First pin photo |');
lines.push('|---|---|---|');
for (const w of buckets.pinPhoto) {
  const firstPin = w.candidates.find(u => classify(u) === 'pin');
  lines.push(`| ${w.guide} | ${w.citySlug} | ${firstPin} |`);
}

lines.push('', `## ${buckets.aiPoster.length} guides where the only candidate is an AI-generated poster`);
lines.push('These need a real photo uploaded.');
lines.push('');
for (const w of buckets.aiPoster) lines.push(`- **${w.guide}** (${w.citySlug})`);

lines.push('', `## ${buckets.wikiOnly.length} guides with only a Wikipedia stock fallback`);
lines.push('These would render with go_cities.hero_image if left empty, which is the standard fallback.');
lines.push('A personal photo would be better, but the fallback is fine for now.');
lines.push('');
for (const w of buckets.wikiOnly) lines.push(`- **${w.guide}** (${w.citySlug})`);

lines.push('');
lines.push(`## ${noCandidates.length} guides with no candidates`);
lines.push('');
lines.push('These need a personal photo uploaded to `go_cities.hero_photo_urls` first.');
lines.push('');
for (const n of noCandidates) {
  lines.push(`- **${n.guide}** (${n.citySlug || 'no city'}): ${n.reason}`);
}

fs.writeFileSync('scripts/hero-image-worksheet.md', lines.join('\n'));
console.log(`Wrote scripts/hero-image-worksheet.md`);
console.log(`  ${withCandidates.length} guides with personal-photo candidates`);
console.log(`  ${noCandidates.length} guides need a photo uploaded first`);
