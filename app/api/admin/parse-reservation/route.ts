import { NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Parse a hotel confirmation. Accepts:
 *   - multipart/form-data with `file` field (a PDF) — preferred path
 *   - application/json with { text } — pasted email body fallback
 *
 * Calls Gemini to extract structured fields, scrubs PII regardless of LLM
 * output, then either finds an existing pin (by name + city) or creates a
 * new one with kind='hotel' and the parsed fields prefilled.
 *
 * NEVER stored: confirmation numbers, guest names, exact dates, guest counts,
 * email addresses, loyalty status. Year is the only date field.
 */
const EXTRACTION_PROMPT = `You are a hotel reservation parser. Extract structured travel data from this hotel confirmation.

CRITICAL: do NOT return any of: guest names, additional guest names, email addresses, phone numbers, confirmation numbers, exact check-in/check-out dates, number of guests, or loyalty status / membership tier / points balances.

Return JSON ONLY. Use null for any field you cannot determine. Schema:
{
  "hotel_name": string | null,
  "address": string | null,
  "city": string | null,
  "country": string | null,
  "year": int | null,            // YEAR of stay only — never month or day
  "nights": int | null,
  "room_type": string | null,    // e.g. "Standard Room With Free Breakfast"
  "total_paid": number | null,   // sum of all charges for the whole stay
  "currency": string | null,     // 3-letter ISO (USD, EUR, GBP)
  "brand": string | null,        // e.g. "Holiday Inn Express"
  "chain": string | null,        // e.g. "IHG"
  "breakfast_included": boolean | null
}`;

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

const EMPTY: ParsedReservation = {
  hotel_name: null, address: null, city: null, country: null,
  year: null, nights: null, room_type: null, total_paid: null,
  currency: null, brand: null, chain: null, breakfast_included: null,
};

async function callGeminiNative(parts: any[]): Promise<ParsedReservation | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { responseMimeType: 'application/json' },
      }),
    });
    if (!res.ok) {
      console.error('[parse-reservation] gemini error:', res.status, (await res.text()).slice(0, 500));
      return null;
    }
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;
    return scrub(JSON.parse(text) as ParsedReservation);
  } catch (e) {
    console.error('[parse-reservation] gemini call failed:', e);
    return null;
  }
}

async function parsePdf(buf: ArrayBuffer): Promise<ParsedReservation | null> {
  const b64 = Buffer.from(buf).toString('base64');
  return callGeminiNative([
    { inline_data: { mime_type: 'application/pdf', data: b64 } },
    { text: EXTRACTION_PROMPT },
  ]);
}

async function parseText(text: string): Promise<ParsedReservation | null> {
  if (!process.env.GEMINI_API_KEY) return regexFallback(text);
  return callGeminiNative([
    { text: `${EXTRACTION_PROMPT}\n\n--- email body ---\n\n${text.slice(0, 12000)}` },
  ]) ?? regexFallback(text);
}

function scrub(p: ParsedReservation): ParsedReservation {
  const PII_RE = /\b(confirm(ation)?|booking|reservation)\s*(#|number|no\.?)/i;
  const EMAIL_RE = /[^@\s]+@[^@\s]+\.[^@\s]+/;
  const out: ParsedReservation = { ...p };
  for (const k of ['hotel_name', 'address', 'room_type', 'brand', 'chain'] as const) {
    const v = out[k];
    if (typeof v === 'string') {
      if (PII_RE.test(v) || EMAIL_RE.test(v)) out[k] = null;
    }
  }
  if (out.year != null) {
    const y = Number(out.year);
    out.year = Number.isFinite(y) && y >= 1900 && y <= 2100 ? y : null;
  }
  if (out.nights != null) {
    const n = Number(out.nights);
    out.nights = Number.isFinite(n) && n > 0 && n < 365 ? Math.round(n) : null;
  }
  return out;
}

function regexFallback(text: string): ParsedReservation {
  const yearMatch = text.match(/\b(19|20)\d{2}\b/);
  const nightsMatch = text.match(/(\d+)\s*nights?/i);
  return {
    ...EMPTY,
    year: yearMatch ? Number(yearMatch[0]) : null,
    nights: nightsMatch ? Number(nightsMatch[1]) : null,
  };
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}

async function upsertPin(parsed: ParsedReservation): Promise<{ id: string; slug: string | null; isNew: boolean } | null> {
  if (!parsed.hotel_name) return null;
  const sb = supabaseAdmin();

  // Existing match by name (case-insensitive) and ideally city.
  const { data: existing } = await sb
    .from('pins')
    .select('id, slug, city_names')
    .ilike('name', parsed.hotel_name)
    .limit(5);

  let pinId: string | null = null;
  let pinSlug: string | null = null;
  if (existing && existing.length > 0) {
    if (parsed.city) {
      const cityLower = parsed.city.toLowerCase();
      const cityHit = existing.find(p =>
        Array.isArray(p.city_names) && p.city_names.some((c: string) => c.toLowerCase() === cityLower),
      );
      if (cityHit) {
        pinId = cityHit.id;
        pinSlug = cityHit.slug;
      }
    }
    if (!pinId) {
      pinId = existing[0].id;
      pinSlug = existing[0].slug;
    }
  }

  const perNight =
    parsed.total_paid != null && parsed.nights && parsed.nights > 0
      ? Number((parsed.total_paid / parsed.nights).toFixed(2))
      : null;

  const fields: Record<string, unknown> = { kind: 'hotel', visited: true };
  if (parsed.address) fields.address = parsed.address;
  if (parsed.city) fields.city_names = [parsed.city];
  if (parsed.country) fields.states_names = [parsed.country];
  if (parsed.year) fields.visit_year = parsed.year;
  if (parsed.nights) fields.nights_stayed = parsed.nights;
  if (parsed.room_type) fields.room_type = parsed.room_type;
  if (perNight) fields.room_price_per_night = perNight;
  if (parsed.currency) fields.room_price_currency = parsed.currency;

  if (pinId) {
    const { error } = await sb.from('pins').update(fields).eq('id', pinId);
    if (error) {
      console.error('[parse-reservation] update existing failed:', error);
      return null;
    }
    return { id: pinId, slug: pinSlug, isNew: false };
  }

  const baseSlug = slugify(parsed.hotel_name);
  let slug = baseSlug;
  for (let i = 0; i < 5; i++) {
    const { data: existingSlug } = await sb.from('pins').select('id').eq('slug', slug).maybeSingle();
    if (!existingSlug) break;
    slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
  }
  const { data: created, error } = await sb
    .from('pins')
    .insert({
      name: parsed.hotel_name,
      slug,
      category: 'hotel',
      ...fields,
    })
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
  let parsed: ParsedReservation | null = null;
  let sourceLabel = 'text';

  if (contentType.includes('multipart/form-data')) {
    const form = await req.formData().catch(() => null);
    if (!form) {
      return NextResponse.json({ error: 'invalid multipart body' }, { status: 400 });
    }
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file field required' }, { status: 400 });
    }
    if (file.size > 4 * 1024 * 1024) {
      return NextResponse.json({ error: 'PDF too large (max 4 MB per file)' }, { status: 413 });
    }
    sourceLabel = file.name || 'pdf';
    const buf = await file.arrayBuffer();
    parsed = await parsePdf(buf);
  } else {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
    }
    const text = typeof body?.text === 'string' ? body.text : '';
    if (!text || text.length < 50) {
      return NextResponse.json({ error: 'paste the email body (at least 50 chars)' }, { status: 400 });
    }
    parsed = await parseText(text);
  }

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

  try {
    revalidateTag('supabase-pins');
    revalidatePath('/pins/cards');
    if (result.slug) revalidatePath(`/pins/${result.slug}`);
  } catch {
    /* ignore */
  }

  return NextResponse.json({
    id: result.id,
    slug: result.slug,
    isNew: result.isNew,
    name: parsed.hotel_name,
    sourceLabel,
    parsed,
  });
}
