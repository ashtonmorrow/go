// scripts/test-inline-pin-photos.ts
//
// Smoke test for the inline pin-photo injection. Reads cairo.md (the guide
// with the most personal photos), fetches the slug→photo map from Supabase,
// runs the markdown through enhanceBodyWithPinPhotos, and prints the diff
// (before/after counts + the first few injected figures).
//
// Usage: npx tsx scripts/test-inline-pin-photos.ts [slug]
//        defaults to cairo

import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import {
  extractPinSlugsFromBody,
  enhanceBodyWithPinPhotos,
  type InlinePinPhotoEntry,
} from '../lib/inlinePinPhotos';
import { createClient } from '@supabase/supabase-js';

// Inline a slim slug→photos lookup so this test doesn't drag in
// lib/personalPhotos.ts (which imports 'server-only' and won't load under
// the standalone tsx runtime).
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://pdjrvlhepiwkshxerkpz.supabase.co',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    'sb_publishable_NrfBsFhfj0DSKqDEKeUCMQ_H5oDG-Zv',
  { auth: { persistSession: false } },
);
async function fetchPersonalPhotosBySlugs(slugs: string[]) {
  type PinRow = { id: string; slug: string; name: string };
  const pins: PinRow[] = [];
  for (let i = 0; i < slugs.length; i += 100) {
    const chunk = slugs.slice(i, i + 100);
    const { data } = await sb.from('pins').select('id, slug, name').in('slug', chunk);
    if (data) pins.push(...(data as PinRow[]));
  }
  const idToPin = new Map(pins.map((p) => [p.id, p]));
  type PhotoRow = { pin_id: string; url: string; caption: string | null; width: number | null; height: number | null; taken_at: string | null };
  const photos: PhotoRow[] = [];
  for (let i = 0; i < pins.length; i += 100) {
    const chunk = pins.slice(i, i + 100).map((p) => p.id);
    const { data } = await sb
      .from('personal_photos')
      .select('pin_id, url, caption, width, height, taken_at')
      .in('pin_id', chunk)
      .eq('hidden', false)
      .order('taken_at', { ascending: false, nullsFirst: false });
    if (data) photos.push(...(data as PhotoRow[]));
  }
  const out = new Map<string, { pinName: string; photos: PhotoRow[] }>();
  for (const p of pins) out.set(p.slug, { pinName: p.name, photos: [] });
  for (const r of photos) {
    const pin = idToPin.get(r.pin_id);
    if (pin) out.get(pin.slug)?.photos.push(r);
  }
  return out;
}

async function main() {
  const slug = process.argv[2] ?? 'cairo';
  const file = path.join(process.cwd(), 'content/lists', `${slug}.md`);
  const raw = await fs.readFile(file, 'utf8');
  const parsed = matter(raw);
  const body = parsed.content.trim();

  const refs = extractPinSlugsFromBody(body);
  console.log(`Guide: ${slug}`);
  console.log(`Referenced pin slugs: ${refs.length}`);
  console.log(refs.slice(0, 10).join(', '), refs.length > 10 ? '...' : '');

  const slugPhotoMap = await fetchPersonalPhotosBySlugs(refs);
  const inlineMap = new Map<string, InlinePinPhotoEntry>();
  for (const [s, row] of slugPhotoMap) {
    if (row.photos.length === 0) continue;
    inlineMap.set(s, {
      pinName: row.pinName,
      photos: row.photos.map((p) => ({
        url: p.url,
        caption: p.caption,
        width: p.width,
        height: p.height,
      })),
    });
  }
  console.log(`\nPins with personal photos: ${inlineMap.size}`);
  for (const [s, entry] of inlineMap) {
    console.log(`  ${s.padEnd(45)} ${entry.photos.length} photo(s) — ${entry.pinName}`);
  }

  const enhanced = enhanceBodyWithPinPhotos(body, inlineMap);

  // Count figures injected
  const figureCount = (enhanced.match(/<figure /g) ?? []).length;
  console.log(`\nFigures injected: ${figureCount}`);

  // Show the first 2 figures + the markdown context around each
  const lines = enhanced.split('\n');
  let shown = 0;
  for (let i = 0; i < lines.length && shown < 2; i++) {
    if (lines[i].startsWith('<figure ')) {
      console.log('\n--- Figure context ---');
      // Print preceding paragraph + the figure
      const start = Math.max(0, i - 6);
      const end = Math.min(lines.length, i + 7);
      for (let j = start; j < end; j++) {
        const marker = j === i ? '>>> ' : '    ';
        console.log(marker + lines[j]);
      }
      shown++;
    }
  }

  // Sanity: enhanced body size delta
  console.log(`\nBody size: ${body.length} → ${enhanced.length} chars`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
