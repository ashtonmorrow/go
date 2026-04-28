// Static lookup: drinking-tap-water safety for a typical visiting traveller.
// Same shape as lib/driveSide.ts and lib/visaUs.ts. Country-name fallback
// for the rare records missing ISO2.
//
// Categorisation (matches Notion select options):
//   • Safe        — direct from the tap is fine for a tourist
//   • Treat first — locals drink it, but visitors may want to filter, boil
//                   or stick to bottled (e.g. due to mineral differences,
//                   older infrastructure in secondary cities)
//   • Not safe    — bottled / filtered water only. The default for any
//                   country not explicitly listed.
//
// Sources: CDC Yellow Book (travel.gc.ca), WHO drinking water reports,
// "Drinking water by country" on Wikipedia. Cross-checked April 2026. As
// always, advice for an individual visitor — assume cautious — not for a
// resident.

export type TapWater = 'Safe' | 'Treat first' | 'Not safe' | 'Varies';

const SAFE = new Set<string>([
  // Western & Northern Europe
  'GB', 'IE', 'IS', 'NO', 'SE', 'FI', 'DK', 'NL', 'BE', 'LU',
  'FR', 'DE', 'AT', 'CH', 'LI', 'MC', 'AD', 'IT', 'ES', 'PT',
  'MT', 'SM', 'VA',
  // Central / Eastern Europe (developed)
  'CZ', 'EE', 'HU', 'LV', 'LT', 'PL', 'SI', 'SK', 'HR',
  // Mediterranean
  'CY', 'GR',
  // North America
  'US', 'CA',
  // Oceania
  'AU', 'NZ',
  // Asia (developed economies with audited utilities)
  'JP', 'KR', 'SG', 'HK', 'MO', 'TW', 'IL', 'BN',
]);

const TREAT_FIRST = new Set<string>([
  // Eastern Europe / Western Balkans / Caucasus
  'RO', 'BG', 'RS', 'ME', 'BA', 'MK', 'AL', 'XK', 'TR',
  'RU', 'BY', 'UA', 'MD', 'GE', 'AM', 'AZ',
  // Central Asia
  'KZ', 'UZ', 'KG', 'TJ', 'TM',
  // Gulf states (urban supplies tested, but desalinated water tastes off)
  'AE', 'QA', 'BH', 'KW', 'OM',
  // North Africa coastal
  'MA', 'TN',
  // Latin America with widely safe major-city water but cautious overall
  'AR', 'CL', 'UY', 'CR',
  // Southern Africa (Cape Town, Joburg generally safe, but advise caution)
  'ZA',
]);

// Anything not in SAFE or TREAT_FIRST defaults to 'Not safe' — overly
// cautious is the right default for traveller advice. Mark a country as
// 'Varies' explicitly only if regional differences are large enough that
// a single label is misleading.
const VARIES = new Set<string>([
  // Add countries here if they're genuinely too variable to label.
]);

// Places with no civilian tap-water infrastructure to assess. The
// deny-by-default 'Not safe' is wrong here because it implies a hazard
// that doesn't exist (the right answer is "there's no tap"). Returns
// null for these so the country page suppresses the row entirely.
const NO_PUBLIC_SUPPLY = new Set<string>([
  'AQ',  // Antarctica — Antarctic Treaty area, only research stations
  'BV',  // Bouvet Island (Norwegian dependency, uninhabited)
  'GS',  // South Georgia & the South Sandwich Islands (uninhabited)
  'HM',  // Heard Island & McDonald Islands (uninhabited)
  'TF',  // French Southern & Antarctic Lands (no permanent civilian pop)
  'IO',  // British Indian Ocean Territory (military only)
  'UM',  // US Minor Outlying Islands (uninhabited)
  'CC',  // Cocos (Keeling) Islands — minor case; ~600 pop, water tankered
  'AX',  // Åland — keep Finland as the practical signal
]);

const NAME_TO_ISO2: Record<string, string> = {
  'united kingdom': 'GB',
  'united states': 'US',
  'united states of america': 'US',
  'south korea': 'KR',
  'north korea': 'KP',
  'czech republic': 'CZ',
  'czechia': 'CZ',
  'russia': 'RU',
  'russian federation': 'RU',
  'iran': 'IR',
  'vietnam': 'VN',
  'taiwan': 'TW',
  'hong kong': 'HK',
  'macau': 'MO',
  'macao': 'MO',
};

export function tapWater(iso2: string | null, countryName?: string | null): TapWater | null {
  let code = iso2 ? iso2.toUpperCase() : null;
  if (!code && countryName) {
    code = NAME_TO_ISO2[countryName.toLowerCase()] ?? null;
  }
  if (!code) return null;
  if (NO_PUBLIC_SUPPLY.has(code)) return null;  // suppress the row entirely
  if (SAFE.has(code)) return 'Safe';
  if (TREAT_FIRST.has(code)) return 'Treat first';
  if (VARIES.has(code)) return 'Varies';
  return 'Not safe';
}
