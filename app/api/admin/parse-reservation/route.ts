import { NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Parse a hotel confirmation email body via Gemini, strip PII regardless of
 * what came in, then either find an existing pin (by name + city) or create
 * a new one with kind='hotel' and the parsed fields prefilled. Returns the
 * pin id so the client can redirect to the editor.
 *
 * Hard rules — these are NEVER stored, regardless of LLM output:
 *   - confirmation numbers
 *   - exact dates (only year)
 *   - guest names, primary or additional
 *   - guest count
 *   - email addresses
 *   - loyalty status / points
 */
const SYSTEM_PROMPT = `You are a hotel reservation parser. Extract structured travel data from the email below.

CRITICAL: do NOT include any of: guest names, additional guest names, email addresses, phone numbers, confirmation numbers, exact check-in/check-out dates, number of guests, or loyalty status.

Extract ONLY:
- hotel_name: the property name (e.g. "Holiday Inn Express & Suites Barcelona - Sabadell")
- address: the hotel's street address line
- city: best-guess city
- country: best-guess country
- year: the YEAR of the stay (4-digit int) — never the month or day
- nights: number of nights
- room_type: e.g. "Standard Room With Free Breakfast"
- total_paid: numeric total paid for the stay (sum of all charges)
- currency: 3-letter ISO code (USD, EUR, GBP)
- brand: hotel brand if mentioned (e.g. "Holiday Inn Express")
- chain: parent chain if mentioned (e.g. "IHG")
- breakfast_included: true if the room includes breakfast

Return JSON only, no prose. Use null for any field you cannot determine. The total_paid divided by nights gives the per-night rate.`;

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

async function parseViaGemini(text: string): Promise<ParsedReservation | null> {
  const sb = supabaseAdmin();
  // Use the Stray location-lookup edge function indirectly? No — that's
  // dedicated to places. Easier: call Gemini directly. The edge function
  // already has GEMINI_API_KEY, and we can hit it. But cleanest is a small
  // dedicated edge function or just invoke Gemini through an HTTPS call from
  // here using a server-side-only key. Stray's key lives on the edge
  // function; we don't have it on Vercel. So we use Stray's edge function
  // by adding a thin "parse-reservation" mode to it, OR we invoke the
  // existing edge function via supabase.functions.invoke('parse-reservation').
  //
  // To avoid coupling, we add a Vercel env var GEMINI_API_KEY and call
  // Gemini directly from here. If that env isn't set, fall back to a
  // best-effort regex extractor.
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return regexFallback(text);
  }

  try {
    const res = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gemini-2.5-flash',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: text.slice(0, 12000) },
          ],
          response_format: { type: 'json_object' },
        }),
      },
    );
    if (!res.ok) {
      console.error('[parse-reservation] gemini error:', res.status, await res.text());
      return regexFallback(text);
    }
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return regexFallback(text);
    const parsed = JSON.parse(content) as ParsedReservation;
    return scrub(parsed);
  } catch (e) {
    console.error('[parse-reservation] gemini call failed:', e);
    return regexFallback(text);
  }
}

/** Defensive scrub — drops any field that contains PII patterns even if the
 *  model returned it anyway. */
function scrub(p: ParsedReservation): ParsedReservation {
  const PII_RE = /\b(confirm(ation)?|booking|reservation)\s*(#|number|no\.?)/i;
  const EMAIL_RE = /[^@\s]+@[^@\s]+\.[^@\s]+/;
  const stripped: ParsedReservation = { ...p };
  for (const k of ['hotel_name', 'address', 'room_type', 'brand', 'chain'] as const) {
    const v = stripped[k];
    if (typeof v === 'string') {
      if (PII_RE.test(v) || EMAIL_RE.test(v)) stripped[k] = null;
    }
  }
  // Year sanity
  if (stripped.year != null) {
    const y = Number(stripped.year);
    stripped.year = Number.isFinite(y) && y >= 1900 && y <= 2100 ? y : null;
  }
  return stripped;
}

function regexFallback(text: string): ParsedReservation {
  // Very rough — only reliable if the model is unavailable. Pulls a 4-digit
  // year and "N nights" patterns. Better to require the env var.
  const yearMatch = text.match(/\b(19|20)\d{2}\b/);
  const nightsMatch = text.match(/(\d+)\s*nights?/i);
  return {
    hotel_name: null,
    address: null,
    city: null,
    country: null,
    year: yearMatch ? Number(yearMatch[0]) : null,
    nights: nightsMatch ? Number(nightsMatch[1]) : null,
    room_type: null,
    total_paid: null,
    currency: null,
    brand: null,
    chain: null,
    breakfast_included: null,
  };
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const text = typeof body?.text === 'string' ? body.text : '';
  if (!text || text.length < 50) {
    return NextResponse.json({ error: 'paste the email body (at least 50 chars)' }, { status: 400 });
  }

  const parsed = await parseViaGemini(text);
  if (!parsed || !parsed.hotel_name) {
    return NextResponse.json({
      error: 'Could not parse a hotel name. Paste the full email body, or add the pin manually.',
      parsed,
    }, { status: 422 });
  }

  const sb = supabaseAdmin();

  // Try to find an existing pin by name (case-insensitive) + matching city if we have one.
  let pinId: string | null = null;
  let pinSlug: string | null = null;
  let isNew = false;

  const matchQuery = sb
    .from('pins')
    .select('id, slug, city_names')
    .ilike('name', parsed.hotel_name);

  const { data: existing } = await matchQuery.limit(5);
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

  const updates: Record<string, unknown> = {
    kind: 'hotel',
    visited: true,
  };
  if (parsed.address) updates.address = parsed.address;
  if (parsed.city) updates.city_names = [parsed.city];
  if (parsed.country) updates.states_names = [parsed.country];
  if (parsed.year) updates.visit_year = parsed.year;
  if (parsed.nights) updates.nights_stayed = parsed.nights;
  if (parsed.room_type) updates.room_type = parsed.room_type;
  if (perNight) updates.room_price_per_night = perNight;
  if (parsed.currency) updates.room_price_currency = parsed.currency;

  if (pinId) {
    const { error } = await sb.from('pins').update(updates).eq('id', pinId);
    if (error) {
      console.error('[parse-reservation] update existing failed:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } else {
    isNew = true;
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
        ...updates,
      })
      .select('id, slug')
      .single();
    if (error || !created) {
      console.error('[parse-reservation] insert failed:', error);
      return NextResponse.json({ error: error?.message ?? 'create failed' }, { status: 500 });
    }
    pinId = created.id;
    pinSlug = created.slug;
  }

  try {
    revalidateTag('supabase-pins');
    revalidatePath('/pins/cards');
    if (pinSlug) revalidatePath(`/pins/${pinSlug}`);
  } catch {
    /* ignore */
  }

  return NextResponse.json({ id: pinId, slug: pinSlug, isNew, parsed });
}
