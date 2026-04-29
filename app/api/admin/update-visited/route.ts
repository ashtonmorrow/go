import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Change = { id: string; visited: boolean };

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const changes: Change[] = Array.isArray(body?.changes) ? body.changes : [];
  if (!changes.length) {
    return NextResponse.json({ updated: 0 });
  }

  const valid = changes.filter(c => typeof c.id === 'string' && typeof c.visited === 'boolean');
  if (!valid.length) {
    return NextResponse.json({ error: 'no valid changes' }, { status: 400 });
  }

  const sb = supabaseAdmin();

  // Group by visited value to issue at most two bulk UPDATEs instead of one
  // per row. Postgres handles each as a single statement.
  const setTrue = valid.filter(c => c.visited).map(c => c.id);
  const setFalse = valid.filter(c => !c.visited).map(c => c.id);

  const errors: string[] = [];
  let updated = 0;

  if (setTrue.length) {
    const { error, data } = await sb
      .from('pins')
      .update({ visited: true })
      .in('id', setTrue)
      .select('id');
    if (error) errors.push(error.message);
    else updated += data?.length ?? 0;
  }
  if (setFalse.length) {
    const { error, data } = await sb
      .from('pins')
      .update({ visited: false })
      .in('id', setFalse)
      .select('id');
    if (error) errors.push(error.message);
    else updated += data?.length ?? 0;
  }

  try {
    revalidateTag('supabase-pins');
  } catch {
    /* ignore */
  }

  if (errors.length) {
    return NextResponse.json({ updated, errors }, { status: 500 });
  }
  return NextResponse.json({ updated });
}
