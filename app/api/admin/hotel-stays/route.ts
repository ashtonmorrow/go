import { NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { quarterOfMonth } from '@/lib/hotelStays';

// === /api/admin/hotel-stays ================================================
// CRUD for the hotel_stays table. Auth gated by middleware.ts (HTTP basic
// on /admin/* + /api/admin/*).
//
// POST   create a new stay
// PATCH  update an existing stay (partial fields)
// DELETE remove a stay (irreversible)
//
// Visit_year + visit_quarter are auto-derived from check_in when set so
// the public display can rely on them being populated whenever check_in
// exists.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type StayPayload = {
  pin_id: string;
  check_in?: string | null;
  check_out?: string | null;
  visit_year?: number | null;
  visit_quarter?: number | null;
  nights?: number | null;
  room_type?: string | null;
  cash_amount?: number | null;
  cash_currency?: string | null;
  points_amount?: number | null;
  points_program?: string | null;
  cash_addon_amount?: number | null;
  cash_addon_currency?: string | null;
  booking_source?: string | null;
  property_likes?: string | null;
  breakfast_notes?: string | null;
  bed_notes?: string | null;
  bathroom_notes?: string | null;
  amenities_notes?: string | null;
  special_touches?: string | null;
  location_notes?: string | null;
  traveler_advice?: string | null;
  personal_rating?: number | null;
  would_stay_again?: boolean | null;
  generated_review?: string | null;
  reservation_pdf_hash?: string | null;
};

const ALLOWED_PROGRAMS = new Set(['ihg', 'marriott', 'hyatt', 'hilton']);

/** Compute visit_year + visit_quarter from check_in when caller didn't
 *  provide them. Saves the form from having to do the math twice. */
function deriveDateFields(
  body: Partial<StayPayload>,
): { visit_year: number | null; visit_quarter: number | null } {
  if (body.visit_year != null && body.visit_quarter != null) {
    return { visit_year: body.visit_year, visit_quarter: body.visit_quarter };
  }
  if (!body.check_in) {
    return {
      visit_year: body.visit_year ?? null,
      visit_quarter: body.visit_quarter ?? null,
    };
  }
  // YYYY-MM-DD parse — explicit so we don't pick up any client TZ.
  const m = body.check_in.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) {
    return {
      visit_year: body.visit_year ?? null,
      visit_quarter: body.visit_quarter ?? null,
    };
  }
  const year = Number(m[1]);
  const month = Number(m[2]);
  return { visit_year: year, visit_quarter: quarterOfMonth(month) };
}

/** Compute nights from check_in/check_out when caller didn't pass it.
 *  Falls back to the explicit `nights` field. */
function deriveNights(body: Partial<StayPayload>): number | null {
  if (body.nights != null) return body.nights;
  if (!body.check_in || !body.check_out) return null;
  const inDate = new Date(body.check_in + 'T00:00:00Z');
  const outDate = new Date(body.check_out + 'T00:00:00Z');
  const diff = Math.round((outDate.getTime() - inDate.getTime()) / 86400000);
  return diff > 0 ? diff : null;
}

function sanitize(body: Partial<StayPayload>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const passthrough: (keyof StayPayload)[] = [
    'check_in',
    'check_out',
    'room_type',
    'cash_amount',
    'cash_currency',
    'points_amount',
    'cash_addon_amount',
    'cash_addon_currency',
    'booking_source',
    'property_likes',
    'breakfast_notes',
    'bed_notes',
    'bathroom_notes',
    'amenities_notes',
    'special_touches',
    'location_notes',
    'traveler_advice',
    'personal_rating',
    'would_stay_again',
    'generated_review',
    'reservation_pdf_hash',
  ];
  for (const k of passthrough) {
    if (k in body) out[k] = body[k] ?? null;
  }
  if ('points_program' in body) {
    const p = body.points_program;
    out.points_program =
      p && typeof p === 'string' && ALLOWED_PROGRAMS.has(p) ? p : null;
  }
  const dates = deriveDateFields(body);
  out.visit_year = dates.visit_year;
  out.visit_quarter = dates.visit_quarter;
  out.nights = deriveNights(body);
  return out;
}

/**
 * Bust both the data-fetcher cache (tag-keyed unstable_cache wrappers in
 * lib/) and the rendered route segment cache for the affected pin page.
 * Without the path bust, the public /pins/[slug] page sits on its
 * `revalidate = 604800` ISR copy and the freshly-saved review only
 * appears once the week-long window expires.
 *
 * `slug` is optional because some callers don't have it handy (POST
 * without a join). The dynamic-route bulk form busts every hotel page
 * — fine on this admin write path since stay edits are rare and the
 * underlying data fetchers are already tag-busted.
 */
async function bustCaches(opts: { slug?: string | null; pinId?: string | null } = {}) {
  try { revalidateTag('supabase-hotel-stays'); } catch { /* ignore */ }
  try { revalidateTag('supabase-pins'); } catch { /* ignore */ }
  let slug = opts.slug ?? null;
  if (!slug && opts.pinId) {
    try {
      const { data } = await supabaseAdmin()
        .from('pins')
        .select('slug')
        .eq('id', opts.pinId)
        .maybeSingle();
      slug = (data as { slug?: string } | null)?.slug ?? null;
    } catch { /* ignore */ }
  }
  try {
    if (slug) revalidatePath(`/pins/${slug}`);
    else revalidatePath('/pins/[slug]', 'page');
    revalidatePath('/pins/cards');
  } catch { /* ignore */ }
}

export async function POST(req: Request) {
  let body: StayPayload;
  try {
    body = (await req.json()) as StayPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!body.pin_id || typeof body.pin_id !== 'string') {
    return NextResponse.json({ error: 'pin_id required' }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const fields = sanitize(body);
  fields.pin_id = body.pin_id;

  const { data, error } = await sb
    .from('hotel_stays')
    .insert(fields)
    .select('id')
    .single();
  if (error || !data) {
    console.error('[hotel-stays POST]', error);
    return NextResponse.json({ error: error?.message ?? 'insert failed' }, { status: 500 });
  }

  await bustCaches({ pinId: body.pin_id });
  return NextResponse.json({ id: data.id });
}

export async function PATCH(req: Request) {
  let body: Partial<StayPayload> & { id?: string };
  try {
    body = (await req.json()) as Partial<StayPayload> & { id?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!body.id || typeof body.id !== 'string') {
    return NextResponse.json({ error: 'id required' }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const fields = sanitize(body);

  // Look up the parent pin id BEFORE writing so we can bust its rendered
  // route after. PATCH bodies don't carry pin_id (the row already has it).
  const { data: stayRow } = await sb
    .from('hotel_stays')
    .select('pin_id')
    .eq('id', body.id)
    .maybeSingle();
  const pinId = (stayRow as { pin_id?: string } | null)?.pin_id ?? null;

  const { error } = await sb.from('hotel_stays').update(fields).eq('id', body.id);
  if (error) {
    console.error('[hotel-stays PATCH]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await bustCaches({ pinId });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  let body: { id?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const id = typeof body?.id === 'string' ? body.id : '';
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const sb = supabaseAdmin();
  // Capture the pin id before the delete so bustCaches has something to
  // resolve a slug against. After the delete the row is gone.
  const { data: stayRow } = await sb
    .from('hotel_stays')
    .select('pin_id')
    .eq('id', id)
    .maybeSingle();
  const pinId = (stayRow as { pin_id?: string } | null)?.pin_id ?? null;

  const { error } = await sb.from('hotel_stays').delete().eq('id', id);
  if (error) {
    console.error('[hotel-stays DELETE]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await bustCaches({ pinId });
  return NextResponse.json({ ok: true });
}
