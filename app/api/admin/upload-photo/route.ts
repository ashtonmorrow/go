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

export async function POST(req: Request) {
  const formData = await req.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ error: 'multipart form data required' }, { status: 400 });
  }
  const file = formData.get('file');
  const hash = formData.get('hash');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file required' }, { status: 400 });
  }
  if (typeof hash !== 'string' || !hash) {
    return NextResponse.json({ error: 'hash required' }, { status: 400 });
  }

  const sb = supabaseAdmin();

  const ext = extFromMime(file.type) || 'bin';
  const path = `${hash.slice(0, 2)}/${hash}.${ext}`;
  const arrayBuffer = await file.arrayBuffer();

  const { error: uploadErr } = await sb.storage
    .from(BUCKET)
    .upload(path, new Uint8Array(arrayBuffer), {
      contentType: file.type || 'application/octet-stream',
      upsert: true,
    });

  if (uploadErr) {
    console.error('[upload-photo] storage upload failed:', uploadErr);
    return NextResponse.json({ error: uploadErr.message }, { status: 500 });
  }

  const { data: urlData } = sb.storage.from(BUCKET).getPublicUrl(path);

  return NextResponse.json({
    url: urlData.publicUrl,
    path,
    bytes: arrayBuffer.byteLength,
  });
}
