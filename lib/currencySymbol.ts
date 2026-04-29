// === Currency code → glyph ================================================
// ISO 4217 code (USD, EUR, GBP) → its conventional symbol ($, €, £).
// Notion's Country.Currency Code field carries the 3-letter ISO; the
// postcard wants the glyph for visual recognition.
//
// We try Intl.NumberFormat first because it handles localised symbols
// (₹ for INR, ฿ for THB, etc.) without us baking a lookup table — but
// fall through to a curated map for codes the runtime doesn't resolve
// cleanly (some Node versions return the bare 3-letter code instead of
// a glyph).

const FALLBACK: Record<string, string> = {
  USD: '$',  CAD: 'CA$', AUD: 'A$',  NZD: 'NZ$', SGD: 'S$',
  EUR: '€',  GBP: '£',   JPY: '¥',   CNY: '¥',   KRW: '₩',
  INR: '₹',  THB: '฿',   VND: '₫',   PHP: '₱',   IDR: 'Rp',
  MYR: 'RM', BRL: 'R$',  ARS: 'AR$', CLP: 'CL$', MXN: 'MX$',
  COP: 'CO$',ZAR: 'R',   EGP: 'E£',  ILS: '₪',   AED: 'د.إ',
  SAR: 'ر.س',CHF: 'CHF', SEK: 'kr',  NOK: 'kr',  DKK: 'kr',
  PLN: 'zł', CZK: 'Kč',  HUF: 'Ft',  RON: 'lei', BGN: 'лв',
  RUB: '₽',  UAH: '₴',   TRY: '₺',   ISK: 'kr',  RSD: 'дин',
  HRK: 'kn', HKD: 'HK$', TWD: 'NT$', PKR: '₨',   LKR: '₨',
  NPR: '₨',  MMK: 'K',   KZT: '₸',   UZS: 'soʻm',MNT: '₮',
};

/**
 * Resolve a 3-letter ISO 4217 code (e.g. "EUR") to its display glyph
 * ("€"). Returns null when the input is empty or doesn't look like a
 * currency code. Falls back to the literal code when no glyph is
 * known (better than nothing — readers still see "ZWL" and know
 * what currency the postcard belongs to).
 */
export function currencySymbol(code: string | null | undefined): string | null {
  if (!code) return null;
  const upper = code.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(upper)) return null;

  // Try Intl first — handles many edge cases without a static map.
  try {
    const parts = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: upper,
      currencyDisplay: 'narrowSymbol',
    }).formatToParts(0);
    const sym = parts.find(p => p.type === 'currency')?.value;
    if (sym && sym !== upper) return sym;
  } catch {
    // ignore — fall through to lookup
  }

  return FALLBACK[upper] ?? upper;
}
