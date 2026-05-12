// === Country → DeepL language mapping ======================================
// Curated map from ISO-2 country codes to the country's primary language
// for the survival-phrases panel. The language code is whatever DeepL
// accepts as `target_lang`.
//
// Where a country has multiple official languages (CH, BE, ZA, IN), the
// pick is the one a tourist arriving in the largest city is most likely
// to encounter. English-speaking countries are intentionally absent — the
// phrases panel is hidden on those.
//
// Edit one entry per country; this is static and easy to override.
//
export type CountryLanguage = {
  /** DeepL target language code (e.g., "DE", "PT-BR", "ZH"). */
  deeplCode: string;
  /** Plain English label of the language for the panel heading. */
  label: string;
};

export const COUNTRY_TO_LANGUAGE: Record<string, CountryLanguage> = {
  // German
  AT: { deeplCode: 'DE', label: 'German' },
  DE: { deeplCode: 'DE', label: 'German' },
  CH: { deeplCode: 'DE', label: 'German' },
  LI: { deeplCode: 'DE', label: 'German' },

  // French
  FR: { deeplCode: 'FR', label: 'French' },
  BE: { deeplCode: 'FR', label: 'French' },
  LU: { deeplCode: 'FR', label: 'French' },
  MC: { deeplCode: 'FR', label: 'French' },
  SN: { deeplCode: 'FR', label: 'French' },
  CI: { deeplCode: 'FR', label: 'French' },

  // Spanish
  ES: { deeplCode: 'ES', label: 'Spanish' },
  MX: { deeplCode: 'ES', label: 'Spanish' },
  AR: { deeplCode: 'ES', label: 'Spanish' },
  CL: { deeplCode: 'ES', label: 'Spanish' },
  PE: { deeplCode: 'ES', label: 'Spanish' },
  CO: { deeplCode: 'ES', label: 'Spanish' },
  CR: { deeplCode: 'ES', label: 'Spanish' },
  CU: { deeplCode: 'ES', label: 'Spanish' },
  UY: { deeplCode: 'ES', label: 'Spanish' },
  EC: { deeplCode: 'ES', label: 'Spanish' },
  BO: { deeplCode: 'ES', label: 'Spanish' },
  VE: { deeplCode: 'ES', label: 'Spanish' },
  GT: { deeplCode: 'ES', label: 'Spanish' },
  DO: { deeplCode: 'ES', label: 'Spanish' },
  PA: { deeplCode: 'ES', label: 'Spanish' },

  // Portuguese
  PT: { deeplCode: 'PT-PT', label: 'European Portuguese' },
  BR: { deeplCode: 'PT-BR', label: 'Brazilian Portuguese' },

  // Italian
  IT: { deeplCode: 'IT', label: 'Italian' },
  SM: { deeplCode: 'IT', label: 'Italian' },
  VA: { deeplCode: 'IT', label: 'Italian' },

  // Dutch
  NL: { deeplCode: 'NL', label: 'Dutch' },

  // Nordic
  SE: { deeplCode: 'SV', label: 'Swedish' },
  NO: { deeplCode: 'NB', label: 'Norwegian' },
  DK: { deeplCode: 'DA', label: 'Danish' },
  FI: { deeplCode: 'FI', label: 'Finnish' },

  // Baltic
  EE: { deeplCode: 'ET', label: 'Estonian' },
  LV: { deeplCode: 'LV', label: 'Latvian' },
  LT: { deeplCode: 'LT', label: 'Lithuanian' },

  // Central / Eastern Europe
  PL: { deeplCode: 'PL', label: 'Polish' },
  CZ: { deeplCode: 'CS', label: 'Czech' },
  SK: { deeplCode: 'SK', label: 'Slovak' },
  HU: { deeplCode: 'HU', label: 'Hungarian' },
  RO: { deeplCode: 'RO', label: 'Romanian' },
  BG: { deeplCode: 'BG', label: 'Bulgarian' },
  SI: { deeplCode: 'SL', label: 'Slovenian' },
  UA: { deeplCode: 'UK', label: 'Ukrainian' },

  // Russian
  RU: { deeplCode: 'RU', label: 'Russian' },
  BY: { deeplCode: 'RU', label: 'Russian' },
  KZ: { deeplCode: 'RU', label: 'Russian' },

  // Mediterranean / Near East
  GR: { deeplCode: 'EL', label: 'Greek' },
  CY: { deeplCode: 'EL', label: 'Greek' },
  TR: { deeplCode: 'TR', label: 'Turkish' },

  // East Asia
  JP: { deeplCode: 'JA', label: 'Japanese' },
  KR: { deeplCode: 'KO', label: 'Korean' },
  CN: { deeplCode: 'ZH', label: 'Chinese' },
  TW: { deeplCode: 'ZH', label: 'Chinese' },
  HK: { deeplCode: 'ZH', label: 'Chinese' },

  // Southeast Asia
  ID: { deeplCode: 'ID', label: 'Indonesian' },

  // Arabic-speaking
  SA: { deeplCode: 'AR', label: 'Arabic' },
  AE: { deeplCode: 'AR', label: 'Arabic' },
  EG: { deeplCode: 'AR', label: 'Arabic' },
  MA: { deeplCode: 'AR', label: 'Arabic' },
  JO: { deeplCode: 'AR', label: 'Arabic' },
  LB: { deeplCode: 'AR', label: 'Arabic' },
  TN: { deeplCode: 'AR', label: 'Arabic' },
  DZ: { deeplCode: 'AR', label: 'Arabic' },
  QA: { deeplCode: 'AR', label: 'Arabic' },
  KW: { deeplCode: 'AR', label: 'Arabic' },
  BH: { deeplCode: 'AR', label: 'Arabic' },
  OM: { deeplCode: 'AR', label: 'Arabic' },
};

/** Return null for countries with no mapping (typically English-speaking). */
export function languageForCountry(iso2: string | null | undefined): CountryLanguage | null {
  if (!iso2 || iso2.length !== 2) return null;
  return COUNTRY_TO_LANGUAGE[iso2.toUpperCase()] ?? null;
}
