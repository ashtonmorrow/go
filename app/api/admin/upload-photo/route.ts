import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BUCKET = 'personal-photos';

function extFromMime(mime: string): string {
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/heic') return 'heic';
  if (mime === 'image/heif') return 'heif';
  return 'bin';
}

/**
 * Returns a one-time signed upload URL so the browser can PUT the file
 * directly to Supabase Storage, bypassing Vercel's 4.5MB function body
 * limit. The server never holds the file bytes.
 */
export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const hash = typeof body?.hash === 'string' ? body.hash : '';
  const contentType = typeof body?.contentType === 'string' ? body.contentType : 'application/octet-stream';
  if (!hash) {
    return NextResponse.json({ error: 'hash required' }, { status: 400 });
  }

  const ext = extFromMime(contentType) || 'bin';
  const path = `${hash.slice(0, 2)}/${hash}.${ext}`;

  const sb = supabaseAdmin();
  const { data, error } = await sb.storage
    .from(BUCKET)
    .createSignedUploadUrl(path, { upsert: true });

  if (error || !data) {
    console.error('[upload-url] createSignedUploadUrl failed:', error);
    return NextResponse.json(
      { error: error?.message ?? 'failed to create signed url' },
      { status: 500 },
    );
  }

  const { data: urlData } = sb.storage.from(BUCKET).getPublicUrl(path);

  return NextResponse.json({
    token: data.token,
    path,
    publicUrl: urlData.publicUrl,
  });
}
