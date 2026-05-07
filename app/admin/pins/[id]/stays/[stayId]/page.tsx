import Link from 'next/link';
import { notFound } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import StayEditorClient, { type StayEditorState } from './StayEditorClient';

// === /admin/pins/[id]/stays/[stayId] =======================================
// Single-form editor for a hotel_stays row. stayId === 'new' creates a
// fresh row attached to the pin. Otherwise it loads the existing row
// into the form. Submit calls /api/admin/hotel-stays POST or PATCH.

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type Props = {
  params: Promise<{ id: string; stayId: string }>;
};

const EMPTY: Omit<StayEditorState, 'pin_id'> = {
  id: null,
  check_in: '',
  check_out: '',
  room_type: '',
  cash_amount: '',
  cash_currency: 'USD',
  points_amount: '',
  points_program: '',
  cash_addon_amount: '',
  cash_addon_currency: 'USD',
  booking_source: '',
  property_likes: '',
  breakfast_notes: '',
  bed_notes: '',
  bathroom_notes: '',
  amenities_notes: '',
  special_touches: '',
  location_notes: '',
  traveler_advice: '',
  personal_rating: '',
  would_stay_again: null,
  generated_review: '',
  generated_at: null,
  generated_by: null,
};

export default async function StayEditorPage({ params }: Props) {
  const { id: pinId, stayId } = await params;
  const sb = supabaseAdmin();

  const { data: pin } = await sb
    .from('pins')
    .select('id, name, slug, kind')
    .eq('id', pinId)
    .maybeSingle();
  if (!pin) notFound();

  let initial: StayEditorState;
  if (stayId === 'new') {
    initial = { ...EMPTY, pin_id: pinId };
  } else {
    const { data: stay } = await sb
      .from('hotel_stays')
      .select('*')
      .eq('id', stayId)
      .eq('pin_id', pinId)
      .maybeSingle();
    if (!stay) notFound();
    const s = stay as Record<string, unknown>;
    initial = {
      id: s.id as string,
      pin_id: pinId,
      check_in: ((s.check_in as string | null) ?? '') || '',
      check_out: ((s.check_out as string | null) ?? '') || '',
      room_type: ((s.room_type as string | null) ?? '') || '',
      cash_amount: s.cash_amount == null ? '' : String(s.cash_amount),
      cash_currency: ((s.cash_currency as string | null) ?? 'USD') || 'USD',
      points_amount: s.points_amount == null ? '' : String(s.points_amount),
      points_program: ((s.points_program as string | null) ?? '') || '',
      cash_addon_amount:
        s.cash_addon_amount == null ? '' : String(s.cash_addon_amount),
      cash_addon_currency:
        ((s.cash_addon_currency as string | null) ?? 'USD') || 'USD',
      booking_source: ((s.booking_source as string | null) ?? '') || '',
      property_likes: ((s.property_likes as string | null) ?? '') || '',
      breakfast_notes: ((s.breakfast_notes as string | null) ?? '') || '',
      bed_notes: ((s.bed_notes as string | null) ?? '') || '',
      bathroom_notes: ((s.bathroom_notes as string | null) ?? '') || '',
      amenities_notes: ((s.amenities_notes as string | null) ?? '') || '',
      special_touches: ((s.special_touches as string | null) ?? '') || '',
      location_notes: ((s.location_notes as string | null) ?? '') || '',
      traveler_advice: ((s.traveler_advice as string | null) ?? '') || '',
      personal_rating:
        s.personal_rating == null ? '' : String(s.personal_rating),
      would_stay_again: (s.would_stay_again as boolean | null) ?? null,
      generated_review: ((s.generated_review as string | null) ?? '') || '',
      generated_at: (s.generated_at as string | null) ?? null,
      generated_by: (s.generated_by as string | null) ?? null,
    };
  }

  const pinName = pin.name as string;
  const pinSlug = pin.slug as string | null;

  return (
    <div className="max-w-page mx-auto px-5 py-8">
      <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="text-small text-muted">
          <Link href={`/admin/pins/${pinId}`} className="hover:text-teal">
            ← {pinName}
          </Link>
          <span className="mx-2">·</span>
          <span className="text-ink-deep">
            {stayId === 'new' ? 'New stay' : 'Edit stay'}
          </span>
        </div>
        {pinSlug && (
          <Link
            href={`/pins/${pinSlug}`}
            target="_blank"
            className="text-small text-teal hover:underline"
          >
            View public page →
          </Link>
        )}
      </div>
      <h1 className="text-h2 text-ink-deep mb-2">
        {stayId === 'new' ? 'New stay' : 'Edit stay'} · {pinName}
      </h1>
      <p className="text-small text-muted mb-6">
        Capture the dates, the room, the price (cash and / or points), and
        whatever notes you want the review to draw on. Generate a review
        from the notes; edit it directly before saving if anything reads
        wrong.
      </p>
      <StayEditorClient initial={initial} />
    </div>
  );
}
