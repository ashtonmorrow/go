import { NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { generateHotelReview } from '@/lib/geminiReview';

// === /api/admin/pins/generate-review =======================================
// Reads a hotel pin's structured Q&A + property metadata, calls Gemini,
// writes the generated review back to the same row, and bumps the
// rendered /pins/[slug] page so the new text shows up immediately.
//
// Body: { id: string }   // pin id
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
  const { data: pinRaw, error: pinErr } = await sb
    .from('pins')
    .select(
      'id, slug, name, kind, city_names, states_names, room_type, nights_stayed, ' +
      'personal_rating, would_stay_again, property_likes, breakfast_notes, ' +
      'bed_notes, bathroom_notes, amenities_notes, special_touches, ' +
      'location_notes, traveler_advice',
    )
    .eq('id', id)
    .maybeSingle();
  if (pinErr || !pinRaw) {
    return NextResponse.json(
      { error: pinErr?.message ?? 'pin not found' },
      { status: pinErr ? 500 : 404 },
    );
  }

  const pin = pinRaw as unknown as Record<string, unknown>;
  const hotelName = (pin.name as string | null) ?? null;
  const slug = (pin.slug as string | null) ?? null;
  if (!hotelName) {
    return NextResponse.json(
      { error: 'pin missing name; cannot generate review' },
      { status: 400 },
    );
  }
  if (pin.kind !== 'hotel') {
    return NextResponse.json(
      { error: 'review generation is only available for hotel pins' },
      { status: 400 },
    );
  }

  const cityNames = pin.city_names as string[] | null;
  const stateNames = pin.states_names as string[] | null;

  const result = await generateHotelReview({
    hotelName,
    city: cityNames?.[0] ?? null,
    country: stateNames?.[0] ?? null,
    roomType: pin.room_type as string | null,
    nights: pin.nights_stayed as number | null,
    personalRating: pin.personal_rating as number | null,
    wouldStayAgain: pin.would_stay_again as boolean | null,
    propertyLikes: pin.property_likes as string | null,
    breakfastNotes: pin.breakfast_notes as string | null,
    bedNotes: pin.bed_notes as string | null,
    bathroomNotes: pin.bathroom_notes as string | null,
    amenitiesNotes: pin.amenities_notes as string | null,
    specialTouches: pin.special_touches as string | null,
    locationNotes: pin.location_notes as string | null,
    travelerAdvice: pin.traveler_advice as string | null,
  });

  if (!result) {
    return NextResponse.json(
      {
        error:
          'review generation failed (check the Stray generate-stay-review edge function logs and GEMINI_API_KEY in its env)',
      },
      { status: 502 },
    );
  }

  const { error: writeErr } = await sb
    .from('pins')
    .update({
      generated_review: result.text,
      generated_at: new Date().toISOString(),
      generated_by: result.model,
    })
    .eq('id', id);
  if (writeErr) {
    console.error('[pins/generate-review] write back failed:', writeErr);
    return NextResponse.json({
      review: result.text,
      model: result.model,
      saved: false,
      saveError: writeErr.message,
    });
  }

  // Bust both the data fetcher cache and the rendered /pins/[slug] page.
  // Generating a review flips the hotel pin from noindex → indexable
  // (see app/pins/[slug]/page.tsx isThinPin) so the rendered HTML must
  // re-emit immediately, not after the week-long ISR window.
  try { revalidateTag('supabase-pins'); } catch { /* ignore */ }
  try {
    if (slug) revalidatePath(`/pins/${slug}`);
    else revalidatePath('/pins/[slug]', 'page');
    revalidatePath('/pins/cards');
  } catch { /* ignore */ }

  return NextResponse.json({
    review: result.text,
    model: result.model,
    saved: true,
  });
}
