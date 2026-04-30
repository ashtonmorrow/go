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
  hotel_name: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  year: number | null;
  nights: number | null;
  room_type: string | null;
  total_paid: number | null;
  currency: string | null;
  brand: string | null;
  chain: string | null;
  breakfast_included: boolean | null;
};

async function callStrayParser(payload: {
  text?: string;
  pdf_base64?: string;
  pdf_mime?: string;
}): Promise<ParsedReservation | null> {
  const sb = supabaseAdmin();
  const { data, error } = await sb.functions.invoke('parse-reservation', { body: payload });
  if (error) {
    console.error('[parse-reservation] edge function failed:', error);
    return null;
  }
  const parsed = (data as any)?.parsed;
  if (!parsed) return null;
  return parsed as ParsedReservation;
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

async function upsertPin(parsed: ParsedReservation): Promise<{ id: string; slug: string | null; isNew: boolean } | null> {
  if (!parsed.hotel_name) return null;
  const sb = supabaseAdmin();

  const { data: existing } = await sb
    .from('pins')
    .select('id, slug, city_names, visit_year, nights_stayed, room_type, room_price_per_night, room_price_currency, address, states_names, kind, visited')
    .ilike('name', parsed.hotel_name)
    .limit(5);

  let existingPin: any | null = null;
  if (existing && existing.length > 0) {
    if (parsed.city) {
      const cityLower = parsed.city.toLowerCase();
      existingPin = existing.find(p =>
        Array.isArray(p.city_names) && p.city_names.some((c: string) => c.toLowerCase() === cityLower),
      ) ?? null;
    }
    if (!existingPin) existingPin = existing[0];
  }

  const perNight =
    parsed.total_paid != null && parsed.nights && parsed.nights > 0
      ? Number((parsed.total_paid / parsed.nights).toFixed(2))
      : null;

  // Build the candidate field set from the parse.
  const candidate: Record<string, unknown> = { kind: 'hotel', visited: true };
  if (parsed.address) candidate.address = parsed.address;
  if (parsed.city) candidate.city_names = [parsed.city];
  if (parsed.country) candidate.states_names = [parsed.country];
  if (parsed.year) candidate.visit_year = parsed.year;
  if (parsed.nights) candidate.nights_stayed = parsed.nights;
  if (parsed.room_type) candidate.room_type = parsed.room_type;
  if (perNight) candidate.room_price_per_night = perNight;
  if (parsed.currency) candidate.room_price_currency = parsed.currency;

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
    return NextResponse.json({
      duplicate: true,
      id: prior.pinId,
      slug: prior.pinSlug,
      name: prior.pinName,
      sourceLabel,
      parsed: prior.parsed,
    });
  }

  const parsed = await callStrayParser(payload);
  if (!parsed || !parsed.hotel_name) {
    return NextResponse.json(
      { error: `Could not parse a hotel name from ${sourceLabel}.`, parsed },
      { status: 422 },
    );
  }

  const result = await upsertPin(parsed);
  if (!result) {
    return NextResponse.json({ error: 'failed to create or update pin', parsed }, { status: 500 });
  }

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
  });
}
