import Link from 'next/link';
import { notFound } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { rowToPinForEdit } from './editorData';
import PinEditorClient from './PinEditorClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export type AdminPersonalPhoto = {
  id: string;
  url: string;
  width: number | null;
  height: number | null;
  caption: string | null;
  hidden: boolean;
};

export default async function AdminPinEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sb = supabaseAdmin();
  const [pinRes, photosRes] = await Promise.all([
    sb.from('pins').select('*').eq('id', id).maybeSingle(),
    sb
      .from('personal_photos')
      .select('id, url, width, height, caption, hidden')
      .eq('pin_id', id)
      .order('taken_at', { ascending: false, nullsFirst: false }),
  ]);
  if (pinRes.error || !pinRes.data) notFound();

  const initial = rowToPinForEdit(pinRes.data);
  const personalPhotos: AdminPersonalPhoto[] = (photosRes.data ?? []).map(r => ({
    id: r.id as string,
    url: r.url as string,
    width: (r.width as number | null) ?? null,
    height: (r.height as number | null) ?? null,
    caption: (r.caption as string | null) ?? null,
    hidden: !!r.hidden,
  }));

  return (
    <div className="max-w-page mx-auto px-5 py-8">
      <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="text-small text-muted">
          <Link href="/admin/pins" className="hover:text-teal">← Edit visited</Link>
          <span className="mx-2">·</span>
          <span className="text-ink-deep">{initial.name}</span>
        </div>
        {initial.slug && (
          <Link
            href={`/pins/${initial.slug}`}
            target="_blank"
            className="text-small text-teal hover:underline"
          >
            View public page →
          </Link>
        )}
      </div>
      <h1 className="text-h2 text-ink-deep mb-2">{initial.name}</h1>
      <p className="text-small text-muted mb-6">
        Edit any field. Changes save when you click <strong>Save</strong> at the bottom.
      </p>

      <PinEditorClient initial={initial} personalPhotos={personalPhotos} />
    </div>
  );
}
