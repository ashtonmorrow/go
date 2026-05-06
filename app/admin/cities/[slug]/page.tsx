import Link from 'next/link';
import { notFound } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { GO_CITIES_TABLE } from '@/lib/goTables';
import CityHeroEditor, { type AdminCityPhoto } from './CityHeroEditor';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// === Admin city editor =====================================================
// Minimal page focused on hero photo curation. Mike picks 1-12 photos
// for the city's hero gallery; the rest of the city record (Notion-side
// fields) is edited in Supabase Studio for now.
//
// Candidate pool: every personal_photos row whose pin overlaps the
// city's `name` via `pins.city_names`, plus the city's curated
// `hero_image` and `personal_photo` cover URLs (so they remain
// pickable even though they're not in personal_photos).

export default async function AdminCityEditPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const sb = supabaseAdmin();

  const cityRes = await sb
    .from(GO_CITIES_TABLE)
    .select('id, slug, name, country, hero_image, personal_photo, hero_photo_urls')
    .eq('slug', slug)
    .maybeSingle();
  if (cityRes.error || !cityRes.data) notFound();

  const city = cityRes.data;
  const heroPhotoUrls: string[] = Array.isArray(city.hero_photo_urls)
    ? city.hero_photo_urls
    : [];

  // Pull all personal_photos joined to pins in this city. Cap at 200 so
  // the picker stays responsive on busy cities (Tokyo, Barcelona).
  const photosRes = await sb
    .from('personal_photos')
    .select(
      'id, url, width, height, caption, hidden, ' +
      'pins!inner(slug, name, kind, city_names)',
    )
    .overlaps('pins.city_names', [city.name])
    .order('taken_at', { ascending: false, nullsFirst: false })
    .limit(200);

  const candidates: AdminCityPhoto[] = ((photosRes.data ?? []) as unknown as Array<Record<string, unknown>>).map(r => {
    const pin = (r.pins as { name?: string } | undefined) ?? {};
    return {
      url: r.url as string,
      alt: (r.caption as string | null) ?? (pin.name ?? city.name),
      width: (r.width as number | null) ?? null,
      height: (r.height as number | null) ?? null,
      hidden: !!r.hidden,
      label: pin.name ?? 'personal',
    };
  });

  // Curated city covers — surface them as candidates if they're not
  // already in the personal_photos pool.
  const seen = new Set(candidates.map(c => c.url));
  if (city.personal_photo && !seen.has(city.personal_photo)) {
    candidates.unshift({
      url: city.personal_photo,
      alt: city.name,
      width: null,
      height: null,
      hidden: false,
      label: 'curated cover',
    });
    seen.add(city.personal_photo);
  }
  if (city.hero_image && !seen.has(city.hero_image)) {
    candidates.push({
      url: city.hero_image,
      alt: city.name,
      width: null,
      height: null,
      hidden: false,
      label: 'Wikipedia',
    });
  }

  return (
    <div className="max-w-page mx-auto px-5 py-8">
      <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="text-small text-muted">
          <Link href="/admin" className="hover:text-teal">← Admin</Link>
          <span className="mx-2">·</span>
          <span className="text-ink-deep">{city.name}</span>
          {city.country && (
            <>
              <span className="mx-1 text-muted/60">/</span>
              <span className="text-muted">{city.country}</span>
            </>
          )}
        </div>
        <Link
          href={`/cities/${city.slug}`}
          target="_blank"
          className="text-small text-teal hover:underline"
        >
          View public page →
        </Link>
      </div>
      <h1 className="text-h2 text-ink-deep mb-2">{city.name}</h1>
      <p className="text-small text-muted mb-6">
        Pick up to 12 hero photos for this city. They render in HeroGallery
        on <code className="text-mono">/cities/{city.slug}</code> in this
        order, every photo at native aspect ratio. Empty list falls back
        to the auto-pick collage.
      </p>

      <CityHeroEditor
        idOrSlug={city.slug}
        publicSlug={city.slug}
        initialHeroPhotoUrls={heroPhotoUrls}
        candidates={candidates}
      />
    </div>
  );
}
