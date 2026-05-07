import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { generatePinDescription } from '@/lib/geminiPinDescription';

// === /api/admin/pins/generate-description ==================================
// Reads a pin's structured fields, asks Gemini for a short factual
// description, and returns the generated text WITHOUT saving. The
// admin reviews the output in /admin/pins/enrich and clicks Save to
// commit through the existing /api/admin/update-pin endpoint.
//
// Body: { id: string }
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
      'id, name, kind, city_names, states_names, description, ' +
      'unesco_id, unesco_url, wikipedia_url, atlas_obscura_slug, ' +
      'lists, saved_lists',
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
  const name = (pin.name as string | null) ?? null;
  if (!name) {
    return NextResponse.json(
      { error: 'pin missing name; cannot generate description' },
      { status: 400 },
    );
  }

  const cityNames = pin.city_names as string[] | null;
  const stateNames = pin.states_names as string[] | null;
  const curated = Array.isArray(pin.lists) ? (pin.lists as string[]) : [];
  const saved = Array.isArray(pin.saved_lists) ? (pin.saved_lists as string[]) : [];

  const result = await generatePinDescription({
    name,
    kind: (pin.kind as string | null) ?? null,
    city: cityNames?.[0] ?? null,
    country: stateNames?.[0] ?? null,
    currentDescription: (pin.description as string | null) ?? null,
    curatedLists: curated,
    savedLists: saved,
    unescoId: (pin.unesco_id as number | null) ?? null,
    unescoUrl: (pin.unesco_url as string | null) ?? null,
    wikipediaUrl: (pin.wikipedia_url as string | null) ?? null,
    atlasObscuraSlug: (pin.atlas_obscura_slug as string | null) ?? null,
  });

  if (!result) {
    return NextResponse.json(
      {
        error:
          'description generation failed (check the Stray generate-stay-review edge function logs and GEMINI_API_KEY in its env)',
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    description: result.text,
    model: result.model,
  });
}
