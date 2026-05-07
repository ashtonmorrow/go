import { fetchAllPins } from '@/lib/pins';
import HotelsBulkEditor from './HotelsBulkEditor';

// === /admin/hotels =========================================================
// Bulk editor for the price/year/nights/points columns on every hotel
// pin. The atlas tracks rooms across years and currencies, and editing
// each one through /admin/pins/[id] is a lot of clicks. This grid puts
// every hotel in one place with inline cells, batched save through the
// existing /api/admin/bulk-edit-pins endpoint.
//
// The Q&A and generated review still live on /admin/pins/[id] — those
// are per-property prose and don't lend themselves to a flat table.

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function HotelsBulkAdminPage() {
  const pins = await fetchAllPins();
  const hotels = pins
    .filter(p => p.kind === 'hotel')
    .sort((a, b) => {
      // Most-recently-edited first, then alpha. The pin shape doesn't
      // expose updatedAt at the top level, so we fall back to airtable
      // mod time when present.
      const A = a.updatedAt ?? a.airtableModifiedAt ?? '';
      const B = b.updatedAt ?? b.airtableModifiedAt ?? '';
      if (A && B && A !== B) return A < B ? 1 : -1;
      return a.name.localeCompare(b.name);
    })
    .map(p => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      city: p.cityNames[0] ?? '',
      country: p.statesNames[0] ?? '',
      visitYear: p.visitYear,
      nightsStayed: p.nightsStayed,
      roomType: p.roomType,
      roomPricePerNight: p.roomPricePerNight,
      roomPriceCurrency: p.roomPriceCurrency,
      pointsAmount: p.pointsAmount,
      pointsProgram: p.pointsProgram,
      personalRating: p.personalRating,
      hasReview: !!(p.generatedReview && p.generatedReview.trim()),
    }));

  return (
    <div className="max-w-page mx-auto px-5 py-8">
      <h1 className="text-h2 text-ink-deep mb-2">Hotel prices</h1>
      <p className="text-small text-muted mb-6 max-w-2xl leading-relaxed">
        Inline edit price, points, year, nights, and rating across every
        hotel pin. Per-pin notes and review still live on the regular pin
        editor. Click <strong>Save changes</strong> to commit.
      </p>
      <HotelsBulkEditor initialRows={hotels} />
    </div>
  );
}
