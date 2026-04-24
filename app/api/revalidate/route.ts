import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';

// Webhook endpoint to revalidate pages when Notion data changes.
// Configure a secret in env as REVALIDATE_SECRET.
// Usage: POST /api/revalidate?secret=xxx&path=/cities/vienna
export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get('secret');
  if (!secret || secret !== process.env.REVALIDATE_SECRET) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  const path = searchParams.get('path') || '/';
  try {
    revalidatePath(path);
    return NextResponse.json({ ok: true, revalidated: path });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'unknown' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
