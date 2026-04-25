// Static lookup: countries that drive on the LEFT side of the road, keyed by
// ISO2 code. Source: Wikipedia "Left- and right-hand traffic" + worldstandards.eu.
// Everything not in this set drives on the RIGHT.
//
// We keep this as a static table because:
//   1. It changes maybe once per decade (last switch: Samoa 2009)
//   2. It's not in the Notion country DB — would otherwise need a new field
//   3. Lookups are O(1) by ISO2 — already on every Country
//
// Notable inclusions: Indonesia (ID), Japan (JP), India (IN), UK (GB), Ireland
// (IE), Australia (AU), Thailand (TH), Malaysia (MY), South Africa (ZA), and
// the British/former-British Caribbean islands (JM, BS, BB, AG, etc.).
const LEFT_HAND_DRIVE = new Set<string>([
  // Europe
  'GB', 'IE', 'CY', 'MT', 'IM', 'JE', 'GG', 'GI',
  // Asia
  'JP', 'IN', 'PK', 'ID', 'TH', 'MY', 'SG', 'LK', 'BD', 'NP',
  'BT', 'BN', 'TL', 'MV', 'MO', 'HK',
  // Africa
  'KE', 'TZ', 'UG', 'ZA', 'ZM', 'ZW', 'NA', 'MZ', 'MW', 'BW',
  'SZ', 'LS', 'SC', 'MU',
  // Oceania
  'AU', 'NZ', 'FJ', 'KI', 'SB', 'TO', 'TV', 'PG', 'NR', 'NU',
  'NF', 'CK', 'PN', 'WS', 'TK',
  // Caribbean / Americas
  'JM', 'AG', 'BB', 'DM', 'GD', 'KN', 'LC', 'VC', 'TT', 'BS',
  'GY', 'SR',
  // Atlantic / overseas territories
  'FK', 'AI', 'BM', 'KY', 'MS', 'SH', 'TC', 'VG', 'CX', 'CC',
]);

// Country-name fallback for cases where ISO2 isn't populated on the linked
// Country record. Names match the Notion "Country" select / page title (case-
// insensitive). Keep this list short — only the most common LHT countries by
// English name. Anything missing here just defaults to right-hand drive.
const LEFT_HAND_DRIVE_NAMES = new Set<string>(
  [
    'United Kingdom', 'England', 'Scotland', 'Wales', 'Northern Ireland',
    'Ireland', 'Cyprus', 'Malta', 'Isle of Man', 'Jersey', 'Guernsey',
    'Japan', 'India', 'Pakistan', 'Indonesia', 'Thailand', 'Malaysia',
    'Singapore', 'Sri Lanka', 'Bangladesh', 'Nepal', 'Bhutan', 'Brunei',
    'Timor-Leste', 'East Timor', 'Maldives', 'Macau', 'Hong Kong',
    'Kenya', 'Tanzania', 'Uganda', 'South Africa', 'Zambia', 'Zimbabwe',
    'Namibia', 'Mozambique', 'Malawi', 'Botswana', 'Eswatini', 'Swaziland',
    'Lesotho', 'Seychelles', 'Mauritius',
    'Australia', 'New Zealand', 'Fiji', 'Kiribati', 'Solomon Islands',
    'Tonga', 'Tuvalu', 'Papua New Guinea', 'Nauru', 'Samoa',
    'Jamaica', 'Antigua and Barbuda', 'Barbados', 'Dominica', 'Grenada',
    'Saint Kitts and Nevis', 'Saint Lucia', 'Saint Vincent and the Grenadines',
    'Trinidad and Tobago', 'Bahamas', 'The Bahamas', 'Guyana', 'Suriname',
  ].map(n => n.toLowerCase())
);

export function driveSide(iso2: string | null, countryName?: string | null): 'L' | 'R' | null {
  if (iso2) {
    return LEFT_HAND_DRIVE.has(iso2.toUpperCase()) ? 'L' : 'R';
  }
  if (countryName) {
    return LEFT_HAND_DRIVE_NAMES.has(countryName.toLowerCase()) ? 'L' : 'R';
  }
  return null;
}
