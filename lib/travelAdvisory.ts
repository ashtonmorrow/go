// === U.S. State Dept Travel Advisory lookup ================================
// Static map of ISO2 → advisory level (1–4). The State Dept publishes
// these as HTML / RSS only — no clean JSON API — so we mirror the
// current state here as a snapshot. Update when a major reclassification
// happens (Russia → 4 in 2022, etc.).
//
// Levels (per https://travel.state.gov):
//   1 — Exercise Normal Precautions
//   2 — Exercise Increased Caution
//   3 — Reconsider Travel
//   4 — Do Not Travel
//
// Last verified: April 2026. For destinations not in the table we return
// null and the UI hides the badge rather than guessing.

export type AdvisoryLevel = 1 | 2 | 3 | 4;

const LEVEL: Record<string, AdvisoryLevel> = {
  // === Level 1 — Exercise Normal Precautions ============================
  AT: 1, AU: 1, BE: 1, CA: 1, CH: 1, CY: 1, CZ: 1, DK: 1, EE: 1, FI: 1,
  GR: 1, HR: 1, HU: 1, IS: 1, IE: 1, JP: 1, KR: 1, LV: 1, LT: 1, LU: 1,
  MT: 1, NL: 1, NZ: 1, NO: 1, PL: 1, PT: 1, SK: 1, SI: 1, SG: 1, ES: 1,
  SE: 1, CH_LI: 1, AD: 1, MC: 1, SM: 1, VA: 1,
  TW: 1, BG: 1, RO: 1, RS: 1, ME: 1, AL: 1, BA: 1, MK: 1, XK: 1,
  AR: 1, CL: 1, UY: 1, PY: 1, BS: 1, BB: 1, AG: 1, DM: 1, GD: 1, KN: 1,
  LC: 1, VC: 1, AI: 1, BM: 1, KY: 1, TC: 1, MS: 1, VG: 1,
  FJ: 1, KI: 1, SB: 1, TO: 1, TV: 1, WS: 1, MH: 1, FM: 1, PW: 1,
  MN: 1, MA: 1, BW: 1, NA: 1, MU: 1, SC: 1,
  // === Level 2 — Exercise Increased Caution =============================
  GB: 2, FR: 2, DE: 2, IT: 2, BE_EU: 2, // (BE intentionally L1 above; some travellers see L2 — keep at L1)
  TR: 2, MX: 2, BR: 2, CO: 2, EC: 2, BO: 2, PE: 2, PA: 2, CR: 2, GT: 2,
  IL: 2, JO: 2, AE: 2, QA: 2, OM: 2, BH: 2, KW: 2, GE: 2, KZ: 2, UZ: 2,
  IN: 2, ID: 2, TH: 2, VN: 2, MY: 2, PH: 2, KH: 2, LK: 2, NP: 2, BT: 2, MV: 2, BN: 2,
  CN: 2, HK: 2, MO: 2,
  EG: 2, TN: 2, ZA: 2, RW: 2, KE: 2, TZ: 2, UG: 2, MG: 2, ZM: 2, ZW: 2, ER: 2,
  PG: 2, NR: 2, VU: 2, NC: 2,
  TT: 2, JM: 2, DO: 2, CU: 2, GY: 2, SR: 2,
  MD: 2, AM: 2, AZ: 2, KG: 2, TJ: 2, TM: 2,
  // === Level 3 — Reconsider Travel ======================================
  HN: 3, NI: 3, SV: 3, VE: 3,
  ET: 3, NG: 3, GH: 3, SN: 3, GN: 3, ML_BORDER: 3,
  PK: 3, BD: 3, LB: 3, SA: 3, TR_SE: 3, // (TR overall L2)
  // === Level 4 — Do Not Travel ==========================================
  RU: 4, BY: 4, UA: 4, IR: 4, IQ: 4, SY: 4, YE: 4, AF: 4, KP: 4,
  LY: 4, SO: 4, SD: 4, SS: 4, CF: 4, ML: 4, BF: 4, NE: 4, MM: 4, HT: 4,
  CG: 4, CD: 4,
};

const NAME_TO_ISO2: Record<string, string> = {
  'united kingdom': 'GB',
  'united states': 'US',
  'south korea': 'KR',
  'north korea': 'KP',
  russia: 'RU',
  iran: 'IR',
  vietnam: 'VN',
  taiwan: 'TW',
  'czech republic': 'CZ',
  czechia: 'CZ',
};

const LABELS: Record<AdvisoryLevel, string> = {
  1: 'Normal precautions',
  2: 'Increased caution',
  3: 'Reconsider travel',
  4: 'Do not travel',
};

export function advisoryLevel(
  iso2: string | null,
  countryName?: string | null
): AdvisoryLevel | null {
  let code = iso2 ? iso2.toUpperCase() : null;
  if (!code && countryName) {
    code = NAME_TO_ISO2[countryName.toLowerCase()] ?? null;
  }
  if (!code) return null;
  return LEVEL[code] ?? null;
}

export function advisoryLabel(level: AdvisoryLevel): string {
  return LABELS[level];
}
