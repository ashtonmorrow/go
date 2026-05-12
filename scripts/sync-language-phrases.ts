// === sync-language-phrases =================================================
// Translate the twelve standard survival phrases into every language in
// lib/languages.ts via Gemini, routed through the Stray
// "generate-stay-review" edge function (the same gateway lib/geminiPin*
// and lib/geminiReview use).
//
// Output: data/languages.json keyed by language slug. Each value is an
// array of 12 { english, translated } pairs in the order defined by
// SURVIVAL_PHRASES_EN in lib/languages.ts.
//
// Usage:
//   npm run languages:sync                  # fill in any languages not
//                                            yet populated
//   npm run languages:sync -- --force       # regenerate every language
//   npm run languages:sync -- --only=spanish  # one language only
//
// Idempotent by default: existing entries are kept unless --force is
// passed, so reruns after adding a new language to lib/languages.ts only
// translate the new one.
//
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LANGUAGES, SURVIVAL_PHRASES_EN, type Language, type Phrase } from '../lib/languages';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const OUTPUT_PATH = resolve(__dirname, '..', 'data', 'languages.json');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.STRAY_SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    '[languages] missing env. Need NEXT_PUBLIC_SUPABASE_URL + STRAY_SUPABASE_SERVICE_ROLE_KEY.',
  );
  process.exit(1);
}

const FORCE = process.argv.includes('--force');
const ONLY_ARG = process.argv.find(a => a.startsWith('--only='));
const ONLY = ONLY_ARG ? ONLY_ARG.split('=').slice(1).join('=').trim() : null;

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

const SYSTEM_PROMPT = (lang: Language) =>
  `You are a fluent native ${lang.name} (${lang.nativeName}) speaker translating short travel phrases. Use natural, contemporary phrasing as a native speaker would actually say or write. Match formality to typical traveler-to-local register: polite but not overly formal.

Output ONLY a JSON array of 12 strings, in the same order as the input. No preamble, no markdown code fence, no numbering, no commentary. Just the JSON array.`;

const USER_PROMPT = (lang: Language) =>
  `Translate the following English travel phrases into ${lang.name}. Return a JSON array of exactly 12 strings.\n\n` +
  SURVIVAL_PHRASES_EN.map((p, i) => `${i + 1}. ${p}`).join('\n') +
  `\n\nReturn ONLY the JSON array of 12 strings.`;

// Strip ```json ... ``` code fences if the model wrapped its output.
function unwrapCodeFence(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('```')) {
    return trimmed
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/, '')
      .trim();
  }
  return trimmed;
}

async function translateOne(lang: Language): Promise<string[] | null> {
  const { data, error } = await sb.functions.invoke('generate-stay-review', {
    body: {
      system_prompt: SYSTEM_PROMPT(lang),
      user_prompt: USER_PROMPT(lang),
    },
  });
  if (error) {
    console.error(`[error] ${lang.slug}:`, error.message ?? error);
    return null;
  }
  const obj = data as { review?: string };
  const text = (obj?.review ?? '').trim();
  if (!text) {
    console.error(`[error] ${lang.slug}: empty response`);
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(unwrapCodeFence(text));
  } catch {
    console.error(`[error] ${lang.slug}: not parseable JSON:`, text.slice(0, 120));
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length !== SURVIVAL_PHRASES_EN.length) {
    console.error(
      `[error] ${lang.slug}: expected ${SURVIVAL_PHRASES_EN.length} strings, got`,
      Array.isArray(parsed) ? parsed.length : typeof parsed,
    );
    return null;
  }
  if (!parsed.every(s => typeof s === 'string' && s.trim().length > 0)) {
    console.error(`[error] ${lang.slug}: non-string or empty entries in array`);
    return null;
  }
  return parsed as string[];
}

async function main(): Promise<void> {
  let existing: Record<string, Phrase[]> = {};
  try {
    const raw = readFileSync(OUTPUT_PATH, 'utf8');
    existing = JSON.parse(raw) as Record<string, Phrase[]>;
  } catch {
    existing = {};
  }

  const targets = ONLY ? LANGUAGES.filter(l => l.slug === ONLY) : LANGUAGES;
  if (ONLY && targets.length === 0) {
    console.error(`[languages] no language with slug ${ONLY}`);
    process.exit(1);
  }

  let translated = 0;
  let skipped = 0;
  let failed = 0;

  for (const lang of targets) {
    const already = existing[lang.slug];
    if (already && already.length === SURVIVAL_PHRASES_EN.length && !FORCE) {
      console.log(`[skip] ${lang.slug} already populated (use --force to regenerate)`);
      skipped++;
      continue;
    }

    console.log(`[translate] ${lang.slug} (${lang.name})...`);
    const result = await translateOne(lang);
    if (!result) {
      failed++;
      continue;
    }
    existing[lang.slug] = SURVIVAL_PHRASES_EN.map((english, i) => ({
      english,
      translated: result[i],
    }));
    translated++;
    // Mild rate-limiting; the edge function is sync but Gemini upstream
    // is happier with a beat between requests.
    await new Promise(r => setTimeout(r, 600));
  }

  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(existing, null, 2) + '\n');

  console.log(
    `[languages] done. translated=${translated} skipped=${skipped} failed=${failed} total=${Object.keys(existing).length}`,
  );
  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error('[languages] fatal:', err);
  process.exit(1);
});
