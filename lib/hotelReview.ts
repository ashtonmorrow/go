// === Hotel review helpers =================================================
// Pure formatters used by the public hotel pin page and the admin pin
// editor. Hotel review/notes/price live directly on the pin row — no
// separate "stay" object — so this file is just display + label glue.

export type PointsProgram = 'ihg' | 'marriott' | 'hyatt' | 'hilton';

export const POINTS_PROGRAM_LABELS: Record<PointsProgram, string> = {
  ihg: 'IHG One Rewards',
  marriott: 'Marriott Bonvoy',
  hyatt: 'World of Hyatt',
  hilton: 'Hilton Honors',
};

export function isPointsProgram(v: unknown): v is PointsProgram {
  return v === 'ihg' || v === 'marriott' || v === 'hyatt' || v === 'hilton';
}

const CURRENCY_GLYPHS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  CAD: 'C$',
  AUD: 'A$',
  CHF: 'CHF',
  THB: '฿',
};

function fmtCash(amount: number, currency: string): string {
  const code = currency.toUpperCase();
  const glyph = CURRENCY_GLYPHS[code];
  const rounded =
    Math.abs(amount % 1) > 0.005 ? amount.toFixed(2) : Math.round(amount).toString();
  if (glyph && glyph.length <= 2) return `${glyph}${rounded}`;
  return `${code} ${rounded}`;
}

function fmtPoints(amount: number, program: PointsProgram): string {
  const compact =
    amount >= 1000 ? `${Math.round(amount / 1000)},000` : amount.toString();
  return `${compact} ${POINTS_PROGRAM_LABELS[program]}`;
}

/**
 * Per-night price for a hotel pin. Reads cash / points fields off any
 * shape that carries them — the caller passes raw values so this helper
 * works for both the public (camelCase Pin shape) and admin (snake_case
 * row) call sites without a coupling.
 *
 * Returns null when there's nothing to show.
 */
export function formatPerNightPrice(input: {
  cashAmount: number | null;
  cashCurrency: string | null;
  pointsAmount: number | null;
  pointsProgram: PointsProgram | string | null;
  nights: number | null;
}): string | null {
  const nights = input.nights && input.nights > 0 ? input.nights : null;

  if (input.cashAmount != null && input.cashCurrency && !input.pointsAmount) {
    const perNight = nights ? input.cashAmount / nights : input.cashAmount;
    return `${fmtCash(perNight, input.cashCurrency)} / night`;
  }

  if (input.pointsAmount != null && isPointsProgram(input.pointsProgram)) {
    const perNightPoints = nights
      ? input.pointsAmount / nights
      : input.pointsAmount;
    return `${fmtPoints(Math.round(perNightPoints), input.pointsProgram)} / night`;
  }

  return null;
}

/** "2024", or empty string when null. */
export function formatVisitYear(year: number | null | undefined): string {
  return year ? String(year) : '';
}

/** "3 nights" / "1 night" / "" */
export function formatNightsCount(n: number | null | undefined): string {
  if (!n || n <= 0) return '';
  return `${n} ${n === 1 ? 'night' : 'nights'}`;
}
