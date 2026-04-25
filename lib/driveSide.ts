// Static lookup: countries that drive on the LEFT side of the road, keyed by
// ISO2 code. Source: standard public-domain list (Wikipedia "Left- and
// right-hand traffic"). Everything not in this set drives on the RIGHT.
//
// We keep this as a static table because:
//   1. It changes maybe once per decade (last switch: Samoa 2009)
//   2. It's not in the Notion country DB — would otherwise need a new field
//   3. Lookups are O(1) by ISO2 — already on every Country
const LEFT_HAND_DRIVE = new Set<string>([
  'AI', 'AU', 'BB', 'BD', 'BM', 'BN', 'BS', 'BT', 'BW',
  'CK', 'CY', 'DM', 'FJ', 'FK', 'GB', 'GD', 'GG', 'GI', 'GY',
  'HK', 'IE', 'IM', 'IN', 'JE', 'JM', 'JP', 'KE', 'KI', 'KN',
  'KY', 'LC', 'LK', 'LS', 'MO', 'MS', 'MT', 'MU', 'MV', 'MW',
  'MY', 'MZ', 'NA', 'NF', 'NP', 'NR', 'NZ', 'PG', 'PK', 'PN',
  'SB', 'SC', 'SG', 'SH', 'SR', 'SZ', 'TC', 'TH', 'TL', 'TO',
  'TT', 'TV', 'TZ', 'UG', 'VC', 'VG', 'WS', 'ZA', 'ZM', 'ZW',
]);

export function driveSide(iso2: string | null): 'L' | 'R' | null {
  if (!iso2) return null;
  return LEFT_HAND_DRIVE.has(iso2.toUpperCase()) ? 'L' : 'R';
}
