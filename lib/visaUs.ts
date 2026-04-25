// Static lookup: visa requirement for a US passport holder entering each
// country for tourism. Same shape as lib/driveSide.ts — keyed by ISO 3166-1
// alpha-2, with an optional country-name fallback.
//
// IMPORTANT — this is a 2026 snapshot. Visa policies change frequently
// (Schengen ETIAS rollout, new bilateral agreements, post-conflict
// reopenings). When Notion's `Visa (US Passport)` field is populated for a
// country, that value wins; this lookup is the fallback for empty cells.
//
// Categorisation (matches the Notion select options):
//   • Visa-free  — show passport at the border, no advance authorisation
//   • eVisa      — apply online before travel; includes ETA-style systems
//                  for Australia / NZ / Canada (technically not "visas" but
//                  function the same way for a traveller)
//   • On arrival — visa issued at the airport / land border
//   • Required   — apply at consulate or extended online process
//   • null       — country not in any list; UI should fall through to
//                  "data not available"
//
// Sources used: U.S. Department of State country information pages,
// IATA Travel Centre, Project Visa, country tourism boards. Cross-checked
// April 2026.

export type VisaUs = 'Visa-free' | 'eVisa' | 'On arrival' | 'Required' | 'Varies';

const VISA_FREE = new Set<string>([
  // Europe — Schengen + UK + Ireland + Western Balkans
  'AD', 'AT', 'BE', 'BG', 'CH', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES',
  'FI', 'FR', 'GB', 'GR', 'HR', 'HU', 'IE', 'IS', 'IT', 'LI', 'LT',
  'LU', 'LV', 'MC', 'MT', 'NL', 'NO', 'PL', 'PT', 'RO', 'SE', 'SI',
  'SK', 'SM', 'VA',
  'AL', 'BA', 'ME', 'MK', 'RS', 'XK',
  // Asia-Pacific developed economies + ASEAN free-entry
  'BN', 'HK', 'JP', 'KR', 'MO', 'MY', 'PH', 'SG', 'TH', 'TW',
  // Americas — Mexico + most of Central America + Caribbean + most of South America
  'AR', 'BR', 'BS', 'BB', 'BZ', 'BO', 'CL', 'CO', 'CR', 'DM', 'DO',
  'EC', 'GD', 'GT', 'GY', 'HN', 'JM', 'KN', 'LC', 'MX', 'NI',
  'PA', 'PE', 'PY', 'SR', 'SV', 'TT', 'UY', 'VC', 'AG',
  // Middle East
  'IL', 'AE', 'QA',
  // Africa (limited — most of the continent requires an eVisa or VOA)
  'MA', 'TN', 'BW', 'MU', 'SC', 'NA',
  // Pacific
  'FJ', 'WS', 'TO', 'TV', 'VU', 'KI', 'NU', 'CK', 'MH', 'FM', 'PW',
]);

const E_VISA = new Set<string>([
  // Includes ETA-style pre-authorisation (AU/NZ/CA) — they're not formal
  // visas but the traveller experience is identical: register online before
  // boarding, get approval to a passport, no consulate visit.
  'AU', 'NZ', 'CA',
  'IN', 'VN', 'LK', 'KH', 'MM', 'BD', 'PK', 'NP', 'BT',
  'TR',
  'EG', 'KE', 'ET', 'TZ', 'UG', 'RW', 'GA',
  'AZ', 'AM', 'GE', 'KZ', 'KG', 'TJ', 'UZ', 'TM',
  'OM', 'BH', 'KW', 'SA', 'IQ',
]);

const ON_ARRIVAL = new Set<string>([
  'ID', 'MV', 'TL', 'LA',
  'JO', 'LB',
  'CV', 'MG', 'ZM', 'ZW', 'TG', 'CD',
]);

const REQUIRED = new Set<string>([
  'CN', 'RU', 'CU', 'KP', 'BY', 'IR', 'SY', 'YE', 'AF', 'SO',
  'DZ', 'LY', 'SD', 'CF', 'GQ', 'ER', 'CG',
]);

// Country-name fallback for the (rare) records where ISO2 isn't populated.
// Names match the Notion country page title (case-insensitive).
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
  'syria': 'SY',
  'vietnam': 'VN',
  'taiwan': 'TW',
  'hong kong': 'HK',
  'macau': 'MO',
  'macao': 'MO',
};

export function visaUs(iso2: string | null, countryName?: string | null): VisaUs | null {
  let code = iso2 ? iso2.toUpperCase() : null;
  if (!code && countryName) {
    code = NAME_TO_ISO2[countryName.toLowerCase()] ?? null;
  }
  if (!code) return null;
  if (VISA_FREE.has(code)) return 'Visa-free';
  if (E_VISA.has(code)) return 'eVisa';
  if (ON_ARRIVAL.has(code)) return 'On arrival';
  if (REQUIRED.has(code)) return 'Required';
  return null;
}
