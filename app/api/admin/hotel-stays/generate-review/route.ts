import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { generateStayReview } from '@/lib/geminiReview';

// === /api/admin/hotel-stays/generate-review ================================
// Reads a stay row, calls Gemini with the structured Q&A, writes the
// generated review back to the same row and returns the text. Caller
// can then re-render to see the new review or edit it before saving.
//
// Body: { id: string }
//
// Auth: middleware.ts gates /api/admin/* with HTTP basic.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  let body: { id?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const id = typeof body?.id === 'string' ? body.id : '';
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const sb = supabaseAdmin();

  // Pull the stay's Q&A + the parent pin's name / city / country in one
  // query so the prompt has everything it needs without a second hop.
  const { data: stayRaw, error: stayErr } = await sb
    .from('hotel_stays')
    .select(
      'id, pin_id, room_type, nights, booking_source, personal_rating, would_stay_again, ' +
      'property_likes, breakfast_notes, bed_notes, bathroom_notes, amenities_notes, ' +
      'special_touches, location_notes, traveler_advice, ' +
      'pins(name, city_names, states_names)',
    )
    .eq('id', id)
    .maybeSingle();
  if (stayErr || !stayRaw) {
    return NextResponse.json(
      { error: stayErr?.message ?? 'stay not found' },
      { status: stayErr ? 500 : 404 },
    );
  }

  // supabase-js's PostgREST embed narrowing types each cell as
  // GenericStringError on wide selects; double-cast through unknown
  // matches the lib/savedLists.ts pattern and reads each row as a
  // plain map at runtime.
  const stay = stayRaw as unknown as Record<string, unknown>;

  // PostgREST embeds come back as a single object normally, occasionally
  // as a one-element array on older versions — handle both.
  const rawPin = stay.pins;
  const pin = (Array.isArray(rawPin) ? rawPin[0] : rawPin) as
    | { name?: string; city_names?: string[]; states_names?: string[] }
    | undefined;
  const hotelName = pin?.name ?? null;
  if (!hotelName) {
    return NextResponse.json(
      { error: 'parent pin missing name; cannot generate review' },
      { status: 400 },
    );
  }

  const result = await generateStayReview({
    hotelName,
    city: pin?.city_names?.[0] ?? null,
    country: pin?.states_names?.[0] ?? null,
    roomType: stay.room_type as string | null,
    nights: stay.nights as number | null,
    bookingSource: stay.booking_source as string | null,
    personalRating: stay.personal_rating as number | null,
    wouldStayAgain: stay.would_stay_again as boolean | null,
    propertyLikes: stay.property_likes as string | null,
    breakfastNotes: stay.breakfast_notes as string | null,
    bedNotes: stay.bed_notes as string | null,
    bathroomNotes: stay.bathroom_notes as string | null,
    amenitiesNotes: stay.amenities_notes as string | null,
    specialTouches: stay.special_touches as string | null,
    locationNotes: stay.location_notes as string | null,
    travelerAdvice: stay.traveler_advice as string | null,
  });

  if (!result) {
    return NextResponse.json(
      {
        error:
          'review generation failed (check GEMINI_API_KEY env var on this Vercel project and the runtime logs)',
      },
      { status: 502 },
    );
  }

  const { error: writeErr } = await sb
    .from('hotel_stays')
    .update({
      generated_review: result.text,
      generated_at: new Date().toISOString(),
      generated_by: result.model,
    })
    .eq('id', id);
  if (writeErr) {
    console.error('[generate-review] write back failed:', writeErr);
    // Still return the text so the caller can show it; the user can
    // retry the save manually.
    return NextResponse.json({
      review: result.text,
      model: result.model,
      saved: false,
      saveError: writeErr.message,
    });
  }

  try { revalidateTag('supabase-hotel-stays'); } catch { /* ignore */ }
  try { revalidateTag('supabase-pins'); } catch { /* ignore */ }

  return NextResponse.json({
    review: result.text,
    model: result.model,
    saved: true,
  });
}
