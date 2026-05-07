import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { revalidatePath, revalidateTag } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Parse a hotel confirmation. Accepts:
 *   - multipart/form-data with `file` field (a PDF) — preferred path
 *   - application/json with { text } — pasted email body fallback
 *
 * The actual Gemini call lives in the Stray Supabase edge function
 * `parse-reservation` so the API key stays in one place.
 *
 * NEVER stored: confirmation numbers, guest names, exact dates, guest counts,
 * email addresses, loyalty status. Year is the only date field.
 *
 * Dedup: each input (PDF or text) is SHA-256 hashed. If we've already
 * imported this exact bytes/text before, we short-circuit with the previous
 * pin — no second Gemini call, no overwriting fresh edits the user made.
 *
 * Updates to existing pins are non-destructive: we only fill fields the pin
 * doesn't have a value for. So if you've already enriched a hotel pin with a
 * review and we re-parse a confirmation later, the review survives.
 */

type ParsedReservation = {
  // Identity
  hotel_name: string | null;
  brand: string | null;
  chain: string | null;

  // Location
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postal_code: string | null;
  lat: number | null;
  lng: number | null;

  // Contact (hotel-side, not guest)
  phone: string | null;
  website: string | null;
  email: string | null;

  // Hotel-level descriptors
  star_rating: number | null;
  description: string | null;
  check_in_time: string | null;
  check_out_time: string | null;

  // Amenities
  breakfast_included: boolean | null;
  wifi: 'free' | 'paid' | 'none' | null;
  parking: 'free' | 'paid' | 'street' | 'none' | null;
  pool: boolean | null;
  gym: boolean | null;
  spa: boolean | null;
  restaurant_on_site: boolean | null;
  bar: boolean | null;
  airport_shuttle: boolean | null;
  pet_friendly: boolean | null;

  // Stay-level (year-only, never exact dates)
  year: number | null;
  nights: number | null;
  room_type: string | null;
  total_paid: number | null;
  currency: string | null;
};

async function callStrayParser(payload: {
  text?: string;
  pdf_base64?: string;
  pdf_mime?: string;
}): Promise<{ parsed: ParsedReservation } | { error: string }> {
  const sb = supabaseAdmin();
  const { data, error } = await sb.functions.invoke('parse-reservation', { body: payload });
  if (error) {
    // FunctionsHttpError responses include the body as `context`; pull whatever
    // we can to surface the actual cause to the client.
    let detail = '';
    try {
      const ctx = (error as any).context;
      if (ctx && typeof ctx.json === 'function') {
        const body = await ctx.json();
        detail = body?.error ? `: ${body.error}` : `: ${JSON.stringify(body).slice(0, 200)}`;
      } else if (typeof ctx?.statusText === 'string') {
        detail = `: ${ctx.statusText}`;
      }
    } catch {
      /* ignore */
    }
    console.error('[parse-reservation] edge function failed:', error, detail);
    return { error: `edge function failed${detail || `: ${error.message}`}` };
  }
  const parsed = (data as any)?.parsed;
  if (!parsed) {
    return { error: `edge function returned no parsed object (got ${JSON.stringify(data).slice(0, 200)})` };
  }
  return { parsed: parsed as ParsedReservation };
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}

function sha256(buf: Buffer | string): string {
  return createHash('sha256').update(buf).digest('hex');
}

async function lookupExistingImport(hash: string) {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('reservation_imports')
    .select('pin_id, parsed, pins(slug, name)')
    .eq('pdf_hash', hash)
    .maybeSingle();
  if (!data) return null;
  const pin = (data as any).pins;
  return {
    pinId: data.pin_id as string | null,
    pinSlug: pin?.slug ?? null,
    pinName: pin?.name ?? (data as any).parsed?.hotel_name ?? 'unknown',
    parsed: data.parsed,
  };
}

/** Map the wifi enum from the parse onto our existing wifi (boolean) +
 *  wifi_quality (text) columns. Boolean answers "is there wifi at all?"
 *  while wifi_quality captures the paid/free distinction the confirmation
 *  often shows. */
function wifiFields(w: ParsedReservation['wifi']) {
  if (w === 'free') return { wifi: true, wifi_quality: 'free' };
  if (w === 'paid') return { wifi: true, wifi_quality: 'paid' };
  if (w === 'none') return { wifi: false, wifi_quality: null };
  return null;
}

/** Build a string array of amenity tags Gemini surfaced — used to populate
 *  hotel_vibe so the qualitative amenity grid on the detail page lights up
 *  without manual editing. */
function vibeFromAmenities(p: ParsedReservation): string[] {
  const out: string[] = [];
  if (p.pool) out.push('pool');
  if (p.gym) out.push('gym');
  if (p.spa) out.push('spa');
  if (p.restaurant_on_site) out.push('on-site restaurant');
  if (p.bar) out.push('bar');
  if (p.airport_shuttle) out.push('airport shuttle');
  if (p.pet_friendly) out.push('pet-friendly');
  return out;
}

/**
 * Idempotent insert of a stay row for this reservation. Keyed on
 * reservation_pdf_hash so re-uploading the same PDF won't create a
 * second stay; if a stay already exists for this hash we return its id
 * and leave it alone (the user may already have written notes / a
 * generated review on it).
 *
 * Year, nights, room type, and price are the only non-PII fields the
 * parse exposes — Q&A and rating stay null for the user to fill in
 * later via the stay editor.
 */
async function upsertStay(
  pinId: string,
  parsed: ParsedReservation,
  pdfHash: string,
  bookingSource: 'pdf' | 'text',
): Promise<{ id: string; isNew: boolean } | null> {
  const sb = supabaseAdmin();
  const { data: existing } = await sb
    .from('hotel_stays')
    .select('id')
    .eq('reservation_pdf_hash', pdfHash)
    .maybeSingle();
  if (existing && (existing as { id?: string }).id) {
    return { id: (existing as { id: string }).id, isNew: false };
  }
  const insert: Record<string, unknown> = {
    pin_id: pinId,
    reservation_pdf_hash: pdfHash,
    booking_source: bookingSource,
  };
  if (parsed.year) insert.visit_year = parsed.year;
  if (parsed.nights) insert.nights = parsed.nights;
  if (parsed.room_type) insert.room_type = parsed.room_type;
  if (parsed.total_paid != null) insert.cash_amount = parsed.total_paid;
  if (parsed.currency) insert.cash_currency = parsed.currency;
  const { data: created, error } = await sb
    .from('hotel_stays')
    .insert(insert)
    .select('id')
    .single();
  if (error || !created) {
    console.error('[parse-reservation] stay insert failed:', error);
    return null;
  }
  return { id: (created as { id: string }).id, isNew: true };
}

async function upsertPin(parsed: ParsedReservation): Promise<{ id: string; slug: string | null; isNew: boolean } | null> {
  if (!parsed.hotel_name) return null;
  const sb = supabaseAdmin();

  // Pull the same column set we might write back to so the non-destructive
  // update path can decide field-by-field whether to fill in.
  const { data: existing } = await sb
    .from('pins')
    .select(
      'id, slug, kind, visited, city_names, states_names, address, lat, lng, phone, website, description, ' +
      'visit_year, nights_stayed, room_type, room_price_per_night, room_price_currency, ' +
      'breakfast_quality, wifi, wifi_quality, parking, hotel_vibe',
    )
    .ilike('name', parsed.hotel_name)
    .limit(5);

  // Wider .select() tightens supabase-js's row inference enough that it
  // wraps each cell in a GenericStringError type. We treat rows as untyped
  // because the candidate map drives writes, so cast once and move on.
  const rows: any[] = Array.isArray(existing) ? (existing as any[]) : [];
  let existingPin: any | null = null;
  if (rows.length > 0) {
    if (parsed.city) {
      const cityLower = parsed.city.toLowerCase();
      existingPin = rows.find(p =>
        Array.isArray(p.city_names) && p.city_names.some((c: string) => c.toLowerCase() === cityLower),
      ) ?? null;
    }
    if (!existingPin) existingPin = rows[0];
  }

  const perNight =
    parsed.total_paid != null && parsed.nights && parsed.nights > 0
      ? Number((parsed.total_paid / parsed.nights).toFixed(2))
      : null;

  // Build the candidate field set from the parse — anything we have a
  // value for becomes a target. The non-destructive update path below
  // filters this further.
  const candidate: Record<string, unknown> = { kind: 'hotel', visited: true };

  // Location.
  if (parsed.address) candidate.address = parsed.address;
  if (parsed.city) candidate.city_names = [parsed.city];
  if (parsed.country) candidate.states_names = [parsed.country];
  if (parsed.lat != null) candidate.lat = parsed.lat;
  if (parsed.lng != null) candidate.lng = parsed.lng;

  // Public contact (hotel-side, never guest-side).
  if (parsed.phone) candidate.phone = parsed.phone;
  if (parsed.website) candidate.website = parsed.website;

  // Description / property snippet.
  if (parsed.description) candidate.description = parsed.description;

  // Stay facts.
  if (parsed.year) candidate.visit_year = parsed.year;
  if (parsed.nights) candidate.nights_stayed = parsed.nights;
  if (parsed.room_type) candidate.room_type = parsed.room_type;
  if (perNight) candidate.room_price_per_night = perNight;
  if (parsed.currency) candidate.room_price_currency = parsed.currency;

  // Amenities / qualitative.
  if (parsed.breakfast_included === true) candidate.breakfast_quality = 'included';
  else if (parsed.breakfast_included === false) candidate.breakfast_quality = 'not included';
  const wifi = wifiFields(parsed.wifi);
  if (wifi) Object.assign(candidate, wifi);
  if (parsed.parking) candidate.parking = parsed.parking;
  const vibe = vibeFromAmenities(parsed);
  if (vibe.length > 0) candidate.hotel_vibe = vibe;

  if (existingPin) {
    // Non-destructive update: only fill fields the pin doesn't already have.
    // Always set kind=hotel + visited=true even if previously different.
    const update: Record<string, unknown> = { kind: 'hotel', visited: true };
    const isEmpty = (v: unknown) =>
      v == null || (Array.isArray(v) && v.length === 0) || v === '';
    for (const [k, v] of Object.entries(candidate)) {
      if (k === 'kind' || k === 'visited') continue;
      if (isEmpty((existingPin as any)[k])) update[k] = v;
    }
    const { error } = await sb.from('pins').update(update).eq('id', existingPin.id);
    if (error) {
      console.error('[parse-reservation] update existing failed:', error);
      return null;
    }
    return { id: existingPin.id, slug: existingPin.slug ?? null, isNew: false };
  }

  // Create new pin.
  const baseSlug = slugify(parsed.hotel_name);
  let slug = baseSlug;
  for (let i = 0; i < 5; i++) {
    const { data: existingSlug } = await sb.from('pins').select('id').eq('slug', slug).maybeSingle();
    if (!existingSlug) break;
    slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
  }
  const { data: created, error } = await sb
    .from('pins')
    .insert({ name: parsed.hotel_name, slug, category: 'hotel', ...candidate })
    .select('id, slug')
    .single();
  if (error || !created) {
    console.error('[parse-reservation] insert failed:', error);
    return null;
  }
  return { id: created.id, slug: created.slug ?? null, isNew: true };
}

export async function POST(req: Request) {
  const contentType = req.headers.get('content-type') ?? '';
  let inputHash = '';
  let sourceLabel = 'text';
  let sourceKind: 'pdf' | 'text' = 'text';
  let payload: { text?: string; pdf_base64?: string; pdf_mime?: string } = {};

  if (contentType.includes('multipart/form-data')) {
    const form = await req.formData().catch(() => null);
    if (!form) return NextResponse.json({ error: 'invalid multipart body' }, { status: 400 });
    const file = form.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'file field required' }, { status: 400 });
    if (file.size > 4 * 1024 * 1024) {
      return NextResponse.json({ error: 'PDF too large (max 4 MB per file)' }, { status: 413 });
    }
    sourceLabel = file.name || 'pdf';
    sourceKind = 'pdf';
    const buf = Buffer.from(await file.arrayBuffer());
    inputHash = sha256(buf);
    payload = { pdf_base64: buf.toString('base64'), pdf_mime: file.type || 'application/pdf' };
  } else {
    let body: any;
    try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid JSON' }, { status: 400 }); }
    const text = typeof body?.text === 'string' ? body.text : '';
    if (!text || text.length < 50) {
      return NextResponse.json({ error: 'paste the email body (at least 50 chars)' }, { status: 400 });
    }
    inputHash = sha256(text);
    payload = { text };
  }

  // Dedup check before doing any LLM work.
  const prior = await lookupExistingImport(inputHash);
  if (prior && prior.pinId) {
    // If this PDF was imported before stays existed, the pin has no
    // stay yet — backfill one now from the previously stored parse so
    // the user lands on a hotel page that already has a placeholder
    // stay row instead of an empty Stays section.
    const priorParsed = (prior.parsed ?? null) as ParsedReservation | null;
    const stay = priorParsed
      ? await upsertStay(prior.pinId, priorParsed, inputHash, sourceKind)
      : null;
    return NextResponse.json({
      duplicate: true,
      id: prior.pinId,
      slug: prior.pinSlug,
      name: prior.pinName,
      sourceLabel,
      parsed: prior.parsed,
      stayId: stay?.id ?? null,
      stayIsNew: stay?.isNew ?? false,
    });
  }

  const callResult = await callStrayParser(payload);
  if ('error' in callResult) {
    return NextResponse.json(
      { error: `${sourceLabel}: ${callResult.error}` },
      { status: 502 },
    );
  }
  const parsed = callResult.parsed;
  if (!parsed.hotel_name) {
    return NextResponse.json(
      { error: `Could not parse a hotel name from ${sourceLabel}. (Gemini returned no hotel_name — likely a scanned/empty PDF or unfamiliar layout.)`, parsed },
      { status: 422 },
    );
  }

  const result = await upsertPin(parsed);
  if (!result) {
    return NextResponse.json({ error: 'failed to create or update pin', parsed }, { status: 500 });
  }

  // Stay row goes alongside the pin so the user lands on a hotel that
  // already has a placeholder stay to add notes against. Idempotent on
  // the input hash so re-parsing the same PDF doesn't pile up duplicates.
  const stay = await upsertStay(result.id, parsed, inputHash, sourceKind);

  // Record the import so a repeat upload short-circuits next time.
  const sb = supabaseAdmin();
  await sb.from('reservation_imports').upsert({
    pdf_hash: inputHash,
    pin_id: result.id,
    source: sourceKind,
    source_name: sourceLabel,
    parsed,
  });

  try {
    revalidateTag('supabase-pins');
    revalidateTag('supabase-hotel-stays');
    revalidatePath('/pins/cards');
    if (result.slug) revalidatePath(`/pins/${result.slug}`);
  } catch { /* ignore */ }

  return NextResponse.json({
    id: result.id,
    slug: result.slug,
    isNew: result.isNew,
    name: parsed.hotel_name,
    sourceLabel,
    parsed,
    duplicate: false,
    stayId: stay?.id ?? null,
    stayIsNew: stay?.isNew ?? false,
  });
}
