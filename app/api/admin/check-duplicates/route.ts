import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const hashes: string[] = Array.isArray(body?.hashes)
    ? body.hashes.filter((h: any) => typeof h === 'string' && h)
    : [];
  if (!hashes.length) return NextResponse.json({ duplicates: {} });

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('personal_photos')
    .select('hash, pin_id, pins!inner(name, slug)')
    .in('hash', hashes);

  if (error) {
    console.error('[check-duplicates] failed:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const duplicates: Record<string, { pinId: string; pinName: string; pinSlug: string | null }> = {};
  for (const row of data ?? []) {
    if (!row.hash) continue;
    const pin = (row as any).pins;
    duplicates[row.hash] = {
      pinId: row.pin_id,
      pinName: pin?.name ?? 'unknown',
      pinSlug: pin?.slug ?? null,
    };
  }
  return NextResponse.json({ duplicates });
}
