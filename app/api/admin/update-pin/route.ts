import { NextResponse } from 'next/server';
import { revalidateTag, revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_KINDS = ['attraction', 'shopping', 'hotel', 'park', 'restaurant', 'transit'];

const ALLOWED_FIELDS = new Set([
  // Identity
  'name', 'slug', 'category', 'kind',
  // Status
  'visited', 'status', 'closure_reason',
  // Description
  'description',
  // Location
  'lat', 'lng', 'city_names', 'states_names', 'address',
  // Practical
  'website', 'hours', 'opening_hours',
  'booking', 'booking_url', 'official_ticket_url', 'booking_required',
  // Cost
  'price_text', 'price_amount', 'price_currency', 'free', 'free_to_visit',
  // Universal personal
  'personal_rating', 'personal_review', 'visit_dates', 'personal_notes', 'companions',
  // Hotel
  'nights_stayed', 'room_type', 'room_price_per_night', 'room_price_currency', 'would_stay_again',
  // Restaurant
  'cuisine', 'meal_types', 'dishes_tried', 'dietary_options', 'reservation_recommended',
  // Other facets
  'food_on_site', 'water_refill', 'restrooms', 'wifi', 'lockers',
  'shade', 'indoor_outdoor',
  'wheelchair_accessible', 'stroller_friendly', 'kid_friendly', 'min_age_recommended',
  'pet_friendly', 'photography', 'dress_code', 'difficulty',
  'parking', 'access_notes',
  'bring',
  'safety_notes', 'scam_warning', 'requires_permit', 'requires_guide', 'languages_offered',
  'best_months', 'worst_months', 'best_time_of_day', 'crowd_level',
  'duration_minutes',
  'lists', 'tags',
]);

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const id = typeof body?.id === 'string' ? body.id : '';
  const fields = body?.fields;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  if (!fields || typeof fields !== 'object') {
    return NextResponse.json({ error: 'fields object required' }, { status: 400 });
  }

  // Whitelist + light validation
  const update: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (!ALLOWED_FIELDS.has(key)) continue;
    if (key === 'kind' && value !== null && (typeof value !== 'string' || !ALLOWED_KINDS.includes(value))) {
      return NextResponse.json(
        { error: `kind must be one of: ${ALLOWED_KINDS.join(', ')}` },
        { status: 400 },
      );
    }
    if (key === 'personal_rating' && value !== null) {
      const n = Number(value);
      if (!Number.isFinite(n) || n < 1 || n > 5) {
        return NextResponse.json({ error: 'personal_rating must be 1-5' }, { status: 400 });
      }
      update[key] = Math.round(n);
      continue;
    }
    update[key] = value;
  }

  if (!Object.keys(update).length) {
    return NextResponse.json({ error: 'no recognised fields' }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('pins')
    .update(update)
    .eq('id', id)
    .select('id, slug')
    .maybeSingle();

  if (error) {
    console.error('[update-pin] failed:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'pin not found' }, { status: 404 });
  }

  // Bust caches so edits surface immediately on public pages.
  try {
    revalidateTag('supabase-pins');
    revalidatePath('/pins');
    revalidatePath('/pins/cards');
    revalidatePath('/pins/map');
    revalidatePath('/pins/table');
    if (data.slug) revalidatePath(`/pins/${data.slug}`);
  } catch {
    /* ignore */
  }

  return NextResponse.json({ id: data.id, slug: data.slug });
}
