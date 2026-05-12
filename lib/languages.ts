// === Languages registry ====================================================
// Static catalog of languages the atlas covers, plus a thin reader over
// data/languages.json (the translated survival phrases for each one).
//
// Phrases are generated once per language by `npm run languages:sync`,
// which routes through the Stray "generate-stay-review" edge function
// (Gemini) using STRAY_SUPABASE_SERVICE_ROLE_KEY. The script is
// idempotent; rerunning it without --force preserves existing entries.
//
// Country → language mapping is one-to-many in real life but one-to-one
// here. We pick the language a tourist arriving in the largest city is
// most likely to encounter. English-speaking countries are intentionally
// absent — the language guide panel is hidden on those.
//
import phrasesData from '@/data/languages.json';

export type Language = {
  /** URL slug, e.g., "spanish", "japanese". */
  slug: string;
  /** English name (e.g., "Spanish"). */
  name: string;
  /** Native name (e.g., "Español"). Used in headings on the guide page. */
  nativeName: string;
  /** Coarse family label for one-line context. */
  family: string;
  /** ISO-2 country codes where this language is the primary travel language. */
  countries: readonly string[];
};

export type Phrase = {
  english: string;
  translated: string;
};

export const LANGUAGES: readonly Language[] = [
  { slug: 'spanish', name: 'Spanish', nativeName: 'Español', family: 'Romance', countries: ['ES', 'MX', 'AR', 'CL', 'PE', 'CO', 'CR', 'CU', 'UY', 'EC', 'BO', 'VE', 'GT', 'DO', 'PA'] },
  { slug: 'french', name: 'French', nativeName: 'Français', family: 'Romance', countries: ['FR', 'BE', 'LU', 'MC', 'SN', 'CI'] },
  { slug: 'german', name: 'German', nativeName: 'Deutsch', family: 'Germanic', countries: ['DE', 'AT', 'CH', 'LI'] },
  { slug: 'italian', name: 'Italian', nativeName: 'Italiano', family: 'Romance', countries: ['IT', 'SM', 'VA'] },
  { slug: 'portuguese', name: 'Portuguese', nativeName: 'Português', family: 'Romance', countries: ['PT', 'BR'] },
  { slug: 'dutch', name: 'Dutch', nativeName: 'Nederlands', family: 'Germanic', countries: ['NL'] },
  { slug: 'swedish', name: 'Swedish', nativeName: 'Svenska', family: 'Germanic', countries: ['SE'] },
  { slug: 'norwegian', name: 'Norwegian', nativeName: 'Norsk', family: 'Germanic', countries: ['NO'] },
  { slug: 'danish', name: 'Danish', nativeName: 'Dansk', family: 'Germanic', countries: ['DK'] },
  { slug: 'finnish', name: 'Finnish', nativeName: 'Suomi', family: 'Uralic', countries: ['FI'] },
  { slug: 'estonian', name: 'Estonian', nativeName: 'Eesti', family: 'Uralic', countries: ['EE'] },
  { slug: 'latvian', name: 'Latvian', nativeName: 'Latviešu', family: 'Baltic', countries: ['LV'] },
  { slug: 'lithuanian', name: 'Lithuanian', nativeName: 'Lietuvių', family: 'Baltic', countries: ['LT'] },
  { slug: 'polish', name: 'Polish', nativeName: 'Polski', family: 'Slavic', countries: ['PL'] },
  { slug: 'czech', name: 'Czech', nativeName: 'Čeština', family: 'Slavic', countries: ['CZ'] },
  { slug: 'slovak', name: 'Slovak', nativeName: 'Slovenčina', family: 'Slavic', countries: ['SK'] },
  { slug: 'hungarian', name: 'Hungarian', nativeName: 'Magyar', family: 'Uralic', countries: ['HU'] },
  { slug: 'romanian', name: 'Romanian', nativeName: 'Română', family: 'Romance', countries: ['RO'] },
  { slug: 'bulgarian', name: 'Bulgarian', nativeName: 'Български', family: 'Slavic', countries: ['BG'] },
  { slug: 'slovenian', name: 'Slovenian', nativeName: 'Slovenščina', family: 'Slavic', countries: ['SI'] },
  { slug: 'ukrainian', name: 'Ukrainian', nativeName: 'Українська', family: 'Slavic', countries: ['UA'] },
  { slug: 'russian', name: 'Russian', nativeName: 'Русский', family: 'Slavic', countries: ['RU', 'BY', 'KZ'] },
  { slug: 'greek', name: 'Greek', nativeName: 'Ελληνικά', family: 'Hellenic', countries: ['GR', 'CY'] },
  { slug: 'turkish', name: 'Turkish', nativeName: 'Türkçe', family: 'Turkic', countries: ['TR'] },
  { slug: 'japanese', name: 'Japanese', nativeName: '日本語', family: 'Japonic', countries: ['JP'] },
  { slug: 'korean', name: 'Korean', nativeName: '한국어', family: 'Koreanic', countries: ['KR'] },
  { slug: 'chinese', name: 'Chinese (Mandarin)', nativeName: '中文', family: 'Sino-Tibetan', countries: ['CN', 'TW', 'HK', 'SG'] },
  { slug: 'indonesian', name: 'Indonesian', nativeName: 'Bahasa Indonesia', family: 'Austronesian', countries: ['ID'] },
  { slug: 'arabic', name: 'Arabic', nativeName: 'العربية', family: 'Semitic', countries: ['SA', 'AE', 'EG', 'MA', 'JO', 'LB', 'TN', 'DZ', 'QA', 'KW', 'BH', 'OM'] },
];

/** The English source phrases the sync script translates per language.
 *  Order is preserved through the JSON; the guide page renders them in
 *  this sequence. */
export const SURVIVAL_PHRASES_EN: readonly string[] = [
  'Hello',
  'Thank you',
  'Yes',
  'No',
  'Please',
  'Excuse me',
  'Where is the bathroom?',
  'How much is it?',
  'Do you speak English?',
  "I don't understand",
  'The bill, please',
  'Cheers!',
] as const;

const PHRASES_BY_SLUG = phrasesData as Record<string, Phrase[]>;

export function languageBySlug(slug: string): Language | null {
  return LANGUAGES.find(l => l.slug === slug) ?? null;
}

export function languageByCountry(iso2: string | null | undefined): Language | null {
  if (!iso2 || iso2.length !== 2) return null;
  const code = iso2.toUpperCase();
  return LANGUAGES.find(l => l.countries.includes(code)) ?? null;
}

export function phrasesForLanguage(slug: string): Phrase[] {
  return PHRASES_BY_SLUG[slug] ?? [];
}

/** Languages that have been populated by `npm run languages:sync`. */
export function populatedLanguages(): Language[] {
  return LANGUAGES.filter(l => (PHRASES_BY_SLUG[l.slug]?.length ?? 0) > 0);
}
