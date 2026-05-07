import 'server-only';
import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { supabase } from './supabase';

// === Hotel stays ===========================================================
// One row per visit to a hotel pin. Multiple stays at the same property
// stack chronologically; the most recent stay's generated review is
// what shows as the page lede on /pins/[slug] for hotel-kind pins.
//
// Date privacy: check_in / check_out stay private (admin-only). The
// public page reads only (visit_quarter, visit_year). Pricing splits
// cash and points so a mixed booking renders cleanly.
//
// Cached per-pin via unstable_cache so the public hotel pin page
// pays one Supabase round-trip per cache window. /api/revalidate on
// the supabase-pins tag busts both pins and stays together.

export type PointsProgram = 'ihg' | 'marriott' | 'hyatt' | 'hilton';

export type HotelStay = {
  id: string;
  pinId: string;
  visitYear: number | null;
  visitQuarter: number | null;
  nights: number | null;
  roomType: string | null;
  cashAmount: number | null;
  cashCurrency: string | null;
  pointsAmount: number | null;
  pointsProgram: PointsProgram | null;
  cashAddonAmount: number | null;
  cashAddonCurrency: string | null;
  bookingSource: string | null;
  propertyLikes: string | null;
  breakfastNotes: string | null;
  bedNotes: string | null;
  bathroomNotes: string | null;
  amenitiesNotes: string | null;
  specialTouches: string | null;
  locationNotes: string | null;
  travelerAdvice: string | null;
  personalRating: number | null;
  wouldStayAgain: boolean | null;
  generatedReview: string | null;
  generatedAt: string | null;
  generatedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Admin-only extension that includes the private check_in / check_out
 *  dates. Never returned to the public read path. */
export type HotelStayAdmin = HotelStay & {
  checkIn: string | null;
  checkOut: string | null;
  reservationPdfHash: string | null;
};

function rowToStay(row: Record<string, unknown>): HotelStay {
  return {
    id: row.id as string,
    pinId: row.pin_id as string,
    visitYear: (row.visit_year as number | null) ?? null,
    visitQuarter: (row.visit_quarter as number | null) ?? null,
    nights: (row.nights as number | null) ?? null,
    roomType: (row.room_type as string | null) ?? null,
    cashAmount:
      row.cash_amount == null ? null : Number(row.cash_amount as number | string),
    cashCurrency: (row.cash_currency as string | null) ?? null,
    pointsAmount: (row.points_amount as number | null) ?? null,
    pointsProgram: (row.points_program as PointsProgram | null) ?? null,
    cashAddonAmount:
      row.cash_addon_amount == null
        ? null
        : Number(row.cash_addon_amount as number | string),
    cashAddonCurrency: (row.cash_addon_currency as string | null) ?? null,
    bookingSource: (row.booking_source as string | null) ?? null,
    propertyLikes: (row.property_likes as string | null) ?? null,
    breakfastNotes: (row.breakfast_notes as string | null) ?? null,
    bedNotes: (row.bed_notes as string | null) ?? null,
    bathroomNotes: (row.bathroom_notes as string | null) ?? null,
    amenitiesNotes: (row.amenities_notes as string | null) ?? null,
    specialTouches: (row.special_touches as string | null) ?? null,
    locationNotes: (row.location_notes as string | null) ?? null,
    travelerAdvice: (row.traveler_advice as string | null) ?? null,
    personalRating: (row.personal_rating as number | null) ?? null,
    wouldStayAgain: (row.would_stay_again as boolean | null) ?? null,
    generatedReview: (row.generated_review as string | null) ?? null,
    generatedAt: (row.generated_at as string | null) ?? null,
    generatedBy: (row.generated_by as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

const PUBLIC_COLUMNS =
  'id, pin_id, visit_year, visit_quarter, nights, room_type, ' +
  'cash_amount, cash_currency, points_amount, points_program, ' +
  'cash_addon_amount, cash_addon_currency, booking_source, ' +
  'property_likes, breakfast_notes, bed_notes, bathroom_notes, ' +
  'amenities_notes, special_touches, location_notes, traveler_advice, ' +
  'personal_rating, would_stay_again, generated_review, generated_at, ' +
  'generated_by, created_at, updated_at';

const _fetchHotelStaysForPin = unstable_cache(
  async (pinId: string): Promise<HotelStay[]> => {
    if (!pinId) return [];
    const { data, error } = await supabase
      .from('hotel_stays')
      .select(PUBLIC_COLUMNS)
      .eq('pin_id', pinId)
      // Most recent stay first. visit_year is the public ordering key
      // (we never expose check_in), with quarter as a tiebreaker for
      // multiple stays in the same year, and updated_at as the final
      // tiebreaker for two stays in the same quarter.
      .order('visit_year', { ascending: false, nullsFirst: false })
      .order('visit_quarter', { ascending: false, nullsFirst: false })
      .order('updated_at', { ascending: false });
    if (error) {
      console.error('[hotelStays] fetchHotelStaysForPin failed:', error);
      return [];
    }
    // supabase-js's PostgREST embeds narrow each row to a GenericStringError
    // union when the select column list is long; double-cast through unknown
    // matches the lib/savedLists pattern and reads each row as a plain
    // map at runtime, where the embed never actually fails this way.
    const rows = (data ?? []) as unknown as Record<string, unknown>[];
    return rows.map(rowToStay);
  },
  ['hotel-stays-for-pin-v1'],
  { revalidate: 86400, tags: ['supabase-pins', 'supabase-hotel-stays'] },
);

/** Public read path. Returns the stays attached to a pin in
 *  most-recent-first order, with private dates stripped. Returns []
 *  on empty / on error. */
export const fetchHotelStaysForPin = cache(_fetchHotelStaysForPin);

// === Display helpers =======================================================

/** Long-form name for a points program, suitable for embedding in a
 *  rendered review or hover tooltip. */
export const POINTS_PROGRAM_LABELS: Record<PointsProgram, string> = {
  ihg: 'IHG One Rewards',
  marriott: 'Marriott Bonvoy',
  hyatt: 'World of Hyatt',
  hilton: 'Hilton Honors',
};

/** Map a 1-12 month to its quarter. Used at admin save time to derive
 *  visit_quarter from the parsed check_in date. */
export function quarterOfMonth(month: number): 1 | 2 | 3 | 4 {
  if (month <= 3) return 1;
  if (month <= 6) return 2;
  if (month <= 9) return 3;
  return 4;
}

/** "Q1 2024", "Q3 2025", or "" if neither field is set. */
export function formatStayPeriod(
  stay: Pick<HotelStay, 'visitQuarter' | 'visitYear'>,
): string {
  if (stay.visitQuarter && stay.visitYear) {
    return `Q${stay.visitQuarter} ${stay.visitYear}`;
  }
  if (stay.visitYear) return String(stay.visitYear);
  return '';
}

/** Human-readable nights summary: "3 nights", "1 night", "" when null. */
export function formatStayNights(stay: Pick<HotelStay, 'nights'>): string {
  if (!stay.nights || stay.nights <= 0) return '';
  return `${stay.nights} ${stay.nights === 1 ? 'night' : 'nights'}`;
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
  // Whole numbers for typical hotel rates; one decimal kept when the
  // amount is fractional (e.g., split across nights at $187.50).
  const rounded = Math.abs(amount % 1) > 0.005 ? amount.toFixed(2) : Math.round(amount).toString();
  if (glyph && glyph.length <= 2) return `${glyph}${rounded}`;
  return `${code} ${rounded}`;
}

function fmtPoints(amount: number, program: PointsProgram): string {
  const compact = amount >= 1000 ? `${Math.round(amount / 1000)},000` : amount.toString();
  return `${compact} ${POINTS_PROGRAM_LABELS[program]}`;
}

/** Per-night price formatted for the Stays card on the public hotel
 *  pin page. Handles cash-only, points-only, and cash + points add-on
 *  cases. Returns null when the stay has no usable pricing data. */
export function formatStayPerNight(stay: HotelStay): string | null {
  const nights = stay.nights && stay.nights > 0 ? stay.nights : null;

  // Cash-only path: divide total by nights when both are known.
  if (stay.cashAmount != null && stay.cashCurrency && !stay.pointsAmount) {
    const perNight = nights ? stay.cashAmount / nights : stay.cashAmount;
    return `${fmtCash(perNight, stay.cashCurrency)} / night`;
  }

  // Points path. Add-on cash (resort fees, taxes the award rate didn't
  // cover) renders alongside the points line so readers see the real
  // out-of-pocket cost.
  if (stay.pointsAmount != null && stay.pointsProgram) {
    const perNightPoints = nights ? stay.pointsAmount / nights : stay.pointsAmount;
    const pointsStr = fmtPoints(Math.round(perNightPoints), stay.pointsProgram);
    if (stay.cashAddonAmount != null && stay.cashAddonCurrency) {
      const addonPerNight = nights
        ? stay.cashAddonAmount / nights
        : stay.cashAddonAmount;
      return `${pointsStr} / night plus ${fmtCash(addonPerNight, stay.cashAddonCurrency)} in fees`;
    }
    return `${pointsStr} / night`;
  }

  return null;
}

/** Default sort comparator: most recent first. Matches the order the
 *  public read path applies, useful for client-side sorts after edits. */
export function compareStaysByRecency(a: HotelStay, b: HotelStay): number {
  const ay = a.visitYear ?? -Infinity;
  const by = b.visitYear ?? -Infinity;
  if (ay !== by) return by - ay;
  const aq = a.visitQuarter ?? 0;
  const bq = b.visitQuarter ?? 0;
  if (aq !== bq) return bq - aq;
  return b.updatedAt.localeCompare(a.updatedAt);
}
