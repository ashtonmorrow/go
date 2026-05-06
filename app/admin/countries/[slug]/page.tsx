import Link from 'next/link';
import { notFound } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { GO_COUNTRIES_TABLE } from '@/lib/goTables';
import CountryHeroEditor, { type AdminCountryPhoto } from './CountryHeroEditor';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// === Admin country editor ==================================================
// Same shape as /admin/cities/[slug] — minimal hero curation page. The
// candidate pool is the personal_photos for any pin whose
// `states_names` overlaps the country's name.

export default async function AdminCountryEditPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const sb = supabaseAdmin();

  const countryRes = await sb
    .from(GO_COUNTRIES_TABLE)
    .select('id, slug, name, hero_photo_urls')
    .eq('slug', slug)
    .maybeSingle();
  if (countryRes.error || !countryRes.data) notFound();

  const country = countryRes.data;
  const heroPhotoUrls: string[] = Array.isArray(country.hero_photo_urls)
    ? country.hero_photo_urls
    : [];

  // Cap at 300 — countries can have a lot of pin photos. The picker is
  // still a single grid, so this is a soft scroll cap, not a hard one.
  const photosRes = await sb
    .from('personal_photos')
    .select(
      'id, url, width, height, caption, hidden, ' +
      'pins!inner(slug, name, kind, states_names, city_names)',
    )
    .overlaps('pins.states_names', [country.name])
    .order('taken_at', { ascending: false, nullsFirst: false })
    .limit(300);

  const candidates: AdminCountryPhoto[] = ((photosRes.data ?? []) as unknown as Array<Record<string, unknown>>).map(r => {
    const pin = (r.pins as { name?: string; city_names?: string[] } | undefined) ?? {};
    const cityHint = Array.isArray(pin.city_names) && pin.city_names[0] ? pin.city_names[0] : null;
    return {
      url: r.url as string,
      alt: (r.caption as string | null) ?? pin.name ?? country.name,
      width: (r.width as number | null) ?? null,
      height: (r.height as number | null) ?? null,
      hidden: !!r.hidden,
      label: cityHint ? `${pin.name ?? 'pin'} · ${cityHint}` : (pin.name ?? 'personal'),
    };
  });

  return (
    <div className="max-w-page mx-auto px-5 py-8">
      <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="text-small text-muted">
          <Link href="/admin" className="hover:text-teal">← Admin</Link>
          <span className="mx-2">·</span>
          <span className="text-ink-deep">{country.name}</span>
        </div>
        <Link
          href={`/countries/${country.slug}`}
          target="_blank"
          className="text-small text-teal hover:underline"
        >
          View public page →
        </Link>
      </div>
      <h1 className="text-h2 text-ink-deep mb-2">{country.name}</h1>
      <p className="text-small text-muted mb-6">
        Pick up to 16 hero photos for this country. They render in
        HeroGallery on <code className="text-mono">/countries/{country.slug}</code>{' '}
        in this order, every photo at native aspect ratio. Empty list
        falls back to the auto-pick collage.
      </p>

      <CountryHeroEditor
        idOrSlug={country.slug}
        publicSlug={country.slug}
        initialHeroPhotoUrls={heroPhotoUrls}
        candidates={candidates}
      />
    </div>
  );
}
