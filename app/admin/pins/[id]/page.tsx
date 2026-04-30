import Link from 'next/link';
import { notFound } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { rowToPinForEdit } from './editorData';
import PinEditorClient from './PinEditorClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AdminPinEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('pins')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) notFound();

  const initial = rowToPinForEdit(data);

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
      <PinEditorClient initial={initial} />
    </div>
  );
}
