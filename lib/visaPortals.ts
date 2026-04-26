// === eVisa portal lookup ===================================================
// Static map of ISO2 → official eVisa / electronic-travel-authorisation URL
// for the country, where one exists. Surfaces on the country detail page
// next to the visa requirement so a traveller can jump straight to the
// application.
//
// Last verified: April 2026. Government portals occasionally rebrand or
// move under new sub-domains — when a portal 404s, update here.

const PORTALS: Record<string, string> = {
  // eVisa (official online application)
  IN: 'https://indianvisaonline.gov.in/evisa/tvoa.html',
  VN: 'https://evisa.xuatnhapcanh.gov.vn/',
  LK: 'https://www.eta.gov.lk/',
  KH: 'https://www.evisa.gov.kh/',
  TR: 'https://www.evisa.gov.tr/',
  EG: 'https://visa2egypt.gov.eg/',
  KE: 'https://accounts.ecitizen.go.ke/',
  ET: 'https://www.evisa.gov.et/',
  SA: 'https://visa.visitsaudi.com/',
  AZ: 'https://evisa.gov.az/',
  GE: 'https://www.evisa.gov.ge/',
  UZ: 'https://e-visa.gov.uz/',
  KZ: 'https://vmp.gov.kz/en',
  IQ: 'https://evisa.iq/',
  OM: 'https://evisa.rop.gov.om/',
  BH: 'https://www.evisa.gov.bh/',
  KW: 'https://evisa.moi.gov.kw/',
  TM: 'https://evisa.gov.tm/',
  PK: 'https://visa.nadra.gov.pk/',
  BD: 'https://www.evisa.gov.bd/',
  MM: 'https://evisa.moip.gov.mm/',
  LA: 'https://laoevisa.gov.la/',
  NP: 'https://nepalimmigration.gov.np/online-visa',
  BT: 'https://visit.doi.gov.bt/',
  RW: 'https://www.migration.gov.rw/visa/online-visa-application/',
  TZ: 'https://eservices.immigration.go.tz/',
  UG: 'https://visas.immigration.go.ug/',
  GA: 'https://evisa.dgdi.ga/',
  // ETA-style pre-authorisation (functionally an eVisa for travellers)
  AU: 'https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/electronic-travel-authority-601',
  NZ: 'https://www.immigration.govt.nz/new-zealand-visas/apply-for-a-visa/about-visa/nzeta',
  CA: 'https://onlineservices-servicesenligne.cic.gc.ca/eta/welcome',
};

const NAME_TO_ISO2: Record<string, string> = {
  india: 'IN',
  vietnam: 'VN',
  'sri lanka': 'LK',
  cambodia: 'KH',
  turkey: 'TR',
  türkiye: 'TR',
  egypt: 'EG',
  kenya: 'KE',
  ethiopia: 'ET',
  'saudi arabia': 'SA',
  australia: 'AU',
  'new zealand': 'NZ',
  canada: 'CA',
};

/**
 * Returns the eVisa portal URL for the given ISO2 (or country name as
 * fallback), or null if no portal is recorded.
 */
export function visaPortal(iso2: string | null, countryName?: string | null): string | null {
  let code = iso2 ? iso2.toUpperCase() : null;
  if (!code && countryName) {
    code = NAME_TO_ISO2[countryName.toLowerCase()] ?? null;
  }
  if (!code) return null;
  return PORTALS[code] ?? null;
}
