import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// === /admin ================================================================
// Dashboard for the admin hub. Surfaces curation health (visited vs total,
// curated vs auto-pick, photographed vs not) and lets Mike see at a glance
// what's neglected. All counts are cheap to compute (one round-trip via
// a single SQL with subselects).

type Counts = {
  pinsTotal: number;
  pinsVisited: number;
  pinsWithPhoto: number;
  pinsIndexable: number;
  pinsNoDescription: number;
  pinsWithCodex: number;
  citiesTotal: number;
  citiesVisited: number;
  citiesCurated: number;
  countriesTotal: number;
  countriesCurated: number;
  personalPhotosVisible: number;
  personalPhotosHidden: number;
  lastUploadAt: string | null;
  recentUploadsThisWeek: number;
};

async function fetchCounts(): Promise<Counts | null> {
  const sb = supabaseAdmin();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Run all the head-counts in parallel. Each is a single index hit so
  // total round-trip is dominated by latency, not work.
  const [
    pinsTotal,
    pinsVisited,
    pinsWithPhoto,
    pinsIndexable,
    pinsNoDescription,
    pinsWithCodex,
    citiesTotal,
    citiesVisited,
    countriesTotal,
    photosVisible,
    photosHidden,
    photosThisWeek,
    lastUpload,
  ] = await Promise.all([
    sb.from('pins').select('id', { count: 'exact', head: true }),
    sb.from('pins').select('id', { count: 'exact', head: true }).eq('visited', true),
    sb.from('pins').select('id', { count: 'exact', head: true }).not('last_photo_at', 'is', null),
    sb.from('pins').select('id', { count: 'exact', head: true }).eq('indexable', true),
    sb.from('pins').select('id', { count: 'exact', head: true }).or('description.is.null,description.eq.'),
    sb
      .from('pins')
      .select('id', { count: 'exact', head: true })
      .contains('images', [{ source: 'codex-generated' }]),
    sb.from('go_cities').select('id', { count: 'exact', head: true }),
    sb.from('go_cities').select('id', { count: 'exact', head: true }).eq('been', true),
    sb.from('go_countries').select('id', { count: 'exact', head: true }),
    sb.from('personal_photos').select('id', { count: 'exact', head: true }).eq('hidden', false),
    sb.from('personal_photos').select('id', { count: 'exact', head: true }).eq('hidden', true),
    sb
      .from('personal_photos')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', sevenDaysAgo),
    sb
      .from('personal_photos')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  // Curated counts can't use head=true with array_length filters via
  // PostgREST — fetch the small subset of curated rows directly.
  const [citiesCuratedRes, countriesCuratedRes] = await Promise.all([
    sb
      .from('go_cities')
      .select('id', { count: 'exact', head: true })
      .not('hero_photo_urls', 'is', null)
      .not('hero_photo_urls', 'eq', '{}'),
    sb
      .from('go_countries')
      .select('id', { count: 'exact', head: true })
      .not('hero_photo_urls', 'is', null)
      .not('hero_photo_urls', 'eq', '{}'),
  ]);

  return {
    pinsTotal: pinsTotal.count ?? 0,
    pinsVisited: pinsVisited.count ?? 0,
    pinsWithPhoto: pinsWithPhoto.count ?? 0,
    pinsIndexable: pinsIndexable.count ?? 0,
    pinsNoDescription: pinsNoDescription.count ?? 0,
    pinsWithCodex: pinsWithCodex.count ?? 0,
    citiesTotal: citiesTotal.count ?? 0,
    citiesVisited: citiesVisited.count ?? 0,
    citiesCurated: citiesCuratedRes.count ?? 0,
    countriesTotal: countriesTotal.count ?? 0,
    countriesCurated: countriesCuratedRes.count ?? 0,
    personalPhotosVisible: photosVisible.count ?? 0,
    personalPhotosHidden: photosHidden.count ?? 0,
    lastUploadAt: (lastUpload.data as { created_at?: string } | null)?.created_at ?? null,
    recentUploadsThisWeek: photosThisWeek.count ?? 0,
  };
}

function formatRelative(iso: string | null): string {
  if (!iso) return 'never';
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

function pct(numerator: number, denominator: number): string {
  if (denominator === 0) return '0%';
  return `${Math.round((numerator / denominator) * 100)}%`;
}

export default async function AdminDashboardPage() {
  const counts = await fetchCounts();

  if (!counts) {
    return (
      <div className="max-w-page mx-auto px-5 py-8">
        <h1 className="text-h1 text-ink-deep">Admin</h1>
        <p className="mt-4 text-small text-orange">Failed to load dashboard counts.</p>
      </div>
    );
  }

  return (
    <div className="max-w-page mx-auto px-5 py-8">
      <header className="mb-6">
        <h1 className="text-h1 text-ink-deep leading-tight">Admin</h1>
        <p className="mt-2 text-small text-muted">
          Curation health at a glance. Last upload {formatRelative(counts.lastUploadAt)};{' '}
          {counts.recentUploadsThisWeek} photo
          {counts.recentUploadsThisWeek === 1 ? '' : 's'} added this week.
        </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <DashCard
          title="Pins"
          href="/admin/pins"
          rows={[
            { label: 'Visited', value: counts.pinsVisited, of: counts.pinsTotal },
            {
              label: 'With personal photo',
              value: counts.pinsWithPhoto,
              of: counts.pinsTotal,
              link: '/admin/pins?filter=visited-no-photo',
              linkLabel: 'see visited without photo',
            },
            { label: 'Indexable in Google', value: counts.pinsIndexable, of: counts.pinsTotal },
            {
              label: 'Missing description',
              value: counts.pinsNoDescription,
              of: counts.pinsTotal,
              warn: counts.pinsNoDescription > 0,
              link: '/admin/pins?filter=no-description',
              linkLabel: 'enrich',
            },
          ]}
        />
        <DashCard
          title="Cities"
          href="/admin/cities"
          rows={[
            { label: 'Visited', value: counts.citiesVisited, of: counts.citiesTotal },
            {
              label: 'Curated heroes',
              value: counts.citiesCurated,
              of: counts.citiesVisited,
              warn: counts.citiesCurated < counts.citiesVisited * 0.1,
              link: '/admin/cities?filter=needs-curation',
              linkLabel: 'curate',
            },
          ]}
        />
        <DashCard
          title="Countries"
          href="/admin/countries"
          rows={[
            { label: 'Total', value: counts.countriesTotal, of: counts.countriesTotal },
            {
              label: 'Curated heroes',
              value: counts.countriesCurated,
              of: counts.countriesTotal,
            },
          ]}
        />
        <DashCard
          title="Personal photos"
          href="/admin/photos"
          rows={[
            { label: 'Visible', value: counts.personalPhotosVisible },
            { label: 'Hidden', value: counts.personalPhotosHidden },
            { label: 'Added this week', value: counts.recentUploadsThisWeek },
          ]}
        />
        <DashCard
          title="Codex pin images"
          href="/admin/photos?source=codex"
          rows={[{ label: 'Pins with codex art', value: counts.pinsWithCodex }]}
          subtitle="AI illustrations used as fallback covers when no real photo exists."
        />
        <DashCard
          title="Quick actions"
          rows={[]}
          links={[
            { href: '/admin/upload', label: 'Upload photos' },
            { href: '/admin/photos', label: 'Browse all photos' },
            { href: '/admin/lists', label: 'Saved lists' },
            { href: '/admin/reservations/new', label: 'Add hotel stay' },
          ]}
        />
      </div>
    </div>
  );
}

type DashRow = {
  label: string;
  value: number;
  of?: number;
  warn?: boolean;
  /** Optional link routed to a filtered subpage. When set, the value
   *  becomes a clickable link. Useful for routing the dashboard's
   *  "Missing description: 339" stat directly to the filtered admin
   *  list. */
  link?: string;
  linkLabel?: string;
};

function DashCard({
  title,
  href,
  rows,
  subtitle,
  links,
}: {
  title: string;
  href?: string;
  rows: DashRow[];
  subtitle?: string;
  links?: { href: string; label: string }[];
}) {
  // If any row has its own deep-link, the card itself shouldn't wrap
  // in <Link> — nested anchors are invalid HTML and break the row
  // links. Fall back to a plain article in that case; the title
  // stays clickable via an explicit anchor in the header.
  const hasRowLinks = rows.some(r => r.link);
  const inner = (
    <article className="rounded-md border border-sand bg-white p-4 hover:border-slate transition-colors h-full">
      <div className="flex items-baseline justify-between mb-2 gap-2">
        <h2 className="text-h4 text-ink-deep">{title}</h2>
        {hasRowLinks && href && (
          <Link href={href} className="text-label text-teal hover:underline">
            open →
          </Link>
        )}
      </div>
      {subtitle && <p className="text-label text-muted mb-3">{subtitle}</p>}
      {rows.length > 0 && (
        <dl className="space-y-1.5">
          {rows.map(r => (
            <div key={r.label} className="flex items-baseline justify-between gap-3">
              <dt className="text-small text-slate">{r.label}</dt>
              <dd
                className={
                  'text-small tabular-nums ' +
                  (r.warn ? 'text-orange font-medium' : 'text-ink-deep')
                }
              >
                {r.value.toLocaleString()}
                {r.of != null && (
                  <span className="text-muted">
                    {' / '}
                    {r.of.toLocaleString()}
                    <span className="ml-1.5 text-label">({pct(r.value, r.of)})</span>
                  </span>
                )}
                {r.link && (
                  <Link
                    href={r.link}
                    className="ml-2 text-label text-teal hover:underline"
                  >
                    {r.linkLabel ?? 'view'} →
                  </Link>
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {links && (
        <ul className="space-y-1.5">
          {links.map(l => (
            <li key={l.href}>
              <Link href={l.href} className="text-small text-teal hover:underline">
                {l.label} →
              </Link>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
  if (hasRowLinks || !href) return inner;
  return (
    <Link href={href} className="block">
      {inner}
    </Link>
  );
}
