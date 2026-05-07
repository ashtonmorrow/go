import Link from 'next/link';
import { notFound } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { rowToPinForEdit } from './editorData';
import PinEditorClient from './PinEditorClient';
import { formatStayPeriod, formatStayNights, POINTS_PROGRAM_LABELS, type PointsProgram } from '@/lib/hotelStays';

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
  // Fetch the pin row + personal photos for this pin in parallel. Personal
  // photos feed the HeroPicker candidate list alongside any Wikidata
  // images on `pin.images`.
  const [pinRes, photosRes, staysRes] = await Promise.all([
    sb.from('pins').select('*').eq('id', id).maybeSingle(),
    sb
      .from('personal_photos')
      .select('id, url, width, height, caption, hidden')
      .eq('pin_id', id)
      .order('taken_at', { ascending: false, nullsFirst: false }),
    sb
      .from('hotel_stays')
      .select(
        'id, visit_year, visit_quarter, nights, room_type, ' +
        'cash_amount, cash_currency, points_amount, points_program, ' +
        'personal_rating, generated_review',
      )
      .eq('pin_id', id)
      .order('visit_year', { ascending: false, nullsFirst: false })
      .order('visit_quarter', { ascending: false, nullsFirst: false })
      .order('updated_at', { ascending: false }),
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
  const stays = (staysRes.data ?? []) as unknown as Array<{
    id: string;
    visit_year: number | null;
    visit_quarter: number | null;
    nights: number | null;
    room_type: string | null;
    cash_amount: number | null;
    cash_currency: string | null;
    points_amount: number | null;
    points_program: string | null;
    personal_rating: number | null;
    generated_review: string | null;
  }>;
  const isHotel = (initial.kind ?? '') === 'hotel';

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

      {isHotel && (
        <section className="mb-8 rounded border border-sand bg-cream-soft/40 p-5">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
            <h2 className="text-h3 text-ink-deep">
              Stays ({stays.length})
            </h2>
            <Link
              href={`/admin/pins/${id}/stays/new`}
              className="text-small px-3 py-1.5 rounded bg-teal text-white font-medium hover:bg-teal/90"
            >
              + Add stay
            </Link>
          </div>
          {stays.length === 0 ? (
            <p className="text-small text-muted italic">
              No stays recorded yet. Add one to capture dates, price, room
              type, and a generated review.
            </p>
          ) : (
            <ul className="divide-y divide-sand">
              {stays.map(st => {
                const period = formatStayPeriod({
                  visitQuarter: st.visit_quarter,
                  visitYear: st.visit_year,
                });
                const nights = formatStayNights({ nights: st.nights });
                const cash =
                  st.cash_amount != null && st.cash_currency
                    ? `${st.cash_currency} ${st.cash_amount}`
                    : null;
                const points =
                  st.points_amount != null && st.points_program
                    ? `${st.points_amount.toLocaleString()} ${POINTS_PROGRAM_LABELS[st.points_program as PointsProgram] ?? st.points_program}`
                    : null;
                const summary = [period, nights, st.room_type, cash, points]
                  .filter(Boolean)
                  .join(' · ');
                return (
                  <li key={st.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-small text-ink-deep font-medium truncate">
                        {summary || 'Stay'}
                      </div>
                      <div className="text-label text-muted truncate">
                        {st.personal_rating != null && `★ ${st.personal_rating}/5`}
                        {st.personal_rating != null && st.generated_review && ' · '}
                        {st.generated_review
                          ? 'Review generated'
                          : st.personal_rating == null
                          ? 'No notes yet'
                          : ''}
                      </div>
                    </div>
                    <Link
                      href={`/admin/pins/${id}/stays/${st.id}`}
                      className="text-small text-teal hover:underline flex-shrink-0"
                    >
                      Edit →
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      <PinEditorClient initial={initial} personalPhotos={personalPhotos} />
    </div>
  );
}
