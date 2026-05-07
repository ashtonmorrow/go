// === /admin/lists/[slug] ===================================================
// Public-page-shaped editor. The admin sees the same cover hero, stats,
// and card grid the visitor would see at /lists/[slug] — but every card
// is admin-clickable. Clicking opens an inline drawer (PinEditDrawer)
// for fast triage editing of the most-used fields without leaving the
// page. Membership management moves out of the giant checkbox roster
// and into a hover-✕ on each card + a + Add pin modal that searches
// the global pin corpus.
//
// Pattern is intentionally template-shaped — same approach will land on
// /admin/cities/[slug], /admin/countries/[slug], and the general
// /admin/pins editor in follow-up commits.

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { fetchAllPins } from '@/lib/pins';
import {
  fetchAllSavedListsMeta,
  listNameToSlug,
  slugToListName,
} from '@/lib/savedLists';
import EditableMeta from './EditableMeta';
import CoverSection from './CoverSection';
import AdminListEditor, { type AdminPinRow } from './AdminListEditor';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }> };

async function findList(slug: string) {
  const [pins, listsMeta] = await Promise.all([
    fetchAllPins(),
    fetchAllSavedListsMeta(),
  ]);
  const allNames = new Set<string>(listsMeta.keys());
  for (const p of pins) for (const l of p.savedLists ?? []) allNames.add(l);

  const candidate = slugToListName(slug);
  if (allNames.has(candidate)) return { name: candidate, pins, listsMeta };
  for (const name of allNames) {
    if (listNameToSlug(name) === slug) return { name, pins, listsMeta };
  }
  return null;
}

export default async function ListDetailAdminPage({ params }: Props) {
  const { slug } = await params;
  const found = await findList(slug);
  if (!found) notFound();

  const meta = found.listsMeta.get(found.name) ?? null;
  const titleCase = found.name.replace(/\b\w/g, c => c.toUpperCase());

  // Build the slim row shape the editor needs. Members and non-members
  // share the same shape — `isMember` flips. The grid renders members,
  // the AddPinModal renders non-members. Sorting members alphabetically
  // by default; the dropdown that public /lists/[slug] has would be
  // a future enhancement here too.
  // Members render in the curated pin_order if set, else alphabetical.
  // Non-members are alphabetical (they only show in the AddPinModal so
  // ordering matters less). orderIndex turns the order array into an
  // O(1) lookup so the sort comparator stays cheap.
  const orderIndex = new Map<string, number>();
  (meta?.pinOrder ?? []).forEach((id, i) => orderIndex.set(id, i));

  const rows: AdminPinRow[] = found.pins
    .map(p => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      city: p.cityNames?.[0] ?? null,
      country: p.statesNames?.[0] ?? null,
      cover: p.images?.[0]?.url ?? null,
      visited: p.visited,
      kind: p.kind ?? null,
      personalRating: p.personalRating,
      personalReview: p.personalReview,
      visitYear: p.visitYear,
      free: p.free ?? null,
      priceTier: p.priceTier ?? null,
      description: p.description ?? null,
      hours: p.hours ?? null,
      priceText: p.priceText ?? null,
      isMember: (p.savedLists ?? []).includes(found.name),
      isDraft:
        p.lat == null &&
        p.lng == null &&
        (p.cityNames?.length ?? 0) === 0 &&
        (p.statesNames?.length ?? 0) === 0,
    }))
    .sort((a, b) => {
      // Members first (so the editor lands on them).
      if (a.isMember !== b.isMember) return a.isMember ? -1 : 1;
      // Within the member group, honour the curated pin_order; pins not
      // listed there fall to the end alphabetically. Non-members are
      // always alphabetical.
      if (a.isMember && b.isMember) {
        const ai = orderIndex.has(a.id) ? orderIndex.get(a.id)! : Number.MAX_SAFE_INTEGER;
        const bi = orderIndex.has(b.id) ? orderIndex.get(b.id)! : Number.MAX_SAFE_INTEGER;
        if (ai !== bi) return ai - bi;
      }
      return a.name.localeCompare(b.name);
    });

  // === Cover resolution ====================================================
  // Same precedence /lists/[slug] uses, mirrored so the admin sees what
  // the visitor would see. Anchor city → for the 'city-photo' fallback.
  // Pin pile → for the visited-first fallback.
  let coverUrl: string | null = null;
  let coverSource: 'curated-photo' | 'curated-pin' | 'fallback' | 'none' = 'none';

  const memberPins = found.pins.filter(p =>
    (p.savedLists ?? []).includes(found.name),
  );

  if (meta?.coverImageUrl) {
    coverUrl = meta.coverImageUrl;
    coverSource = 'curated-photo';
  } else if (meta?.coverPhotoUrl) {
    coverUrl = meta.coverPhotoUrl;
    coverSource = 'curated-photo';
  } else if (meta?.coverPinId) {
    const pin = memberPins.find(p => p.id === meta.coverPinId);
    coverUrl = pin?.images?.[0]?.url ?? null;
    coverSource = coverUrl ? 'curated-pin' : 'none';
  }
  // If still no cover, try a pin-pile fallback so the admin hero isn't
  // empty when no curated cover is set yet.
  if (!coverUrl) {
    const visitedFirst = memberPins
      .slice()
      .sort((a, b) => (a.visited === b.visited ? 0 : a.visited ? -1 : 1));
    for (const p of visitedFirst) {
      const url = p.images?.[0]?.url;
      if (url) {
        coverUrl = url;
        coverSource = 'fallback';
        break;
      }
    }
  }

  return (
    <div className="max-w-page mx-auto px-5 py-8">
      <nav className="text-small text-muted mb-3" aria-label="Breadcrumb">
        <Link href="/admin/lists" className="hover:text-teal">
          Saved lists admin
        </Link>
        <span className="mx-1.5" aria-hidden>›</span>
        <span className="text-ink-deep capitalize">{titleCase}</span>
      </nav>

      {/* Cover hero — same 21:9 banner the public list page now shows.
          Renders only when the precedence chain finds an image. The
          CoverSection editor lives below the hero so the picker stays
          one click away without competing with the visual. */}
      {coverUrl && (
        <div className="mb-5 relative aspect-[21/9] rounded-lg overflow-hidden bg-cream-soft border border-sand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={coverUrl}
            alt=""
            className="w-full h-full object-cover"
          />
        </div>
      )}

      <header className="mb-6">
        {/* Title + description, both inline-editable. */}
        <EditableMeta
          initialName={found.name}
          initialDescription={meta?.description ?? null}
        />

        <div className="mt-3 flex flex-wrap items-center gap-3 text-label">
          <Link
            href={`/lists/${listNameToSlug(found.name)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-teal hover:underline"
          >
            View public page ↗
          </Link>
          {meta?.googleShareUrl && (
            <a
              href={meta.googleShareUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline"
            >
              View live on Google Maps ↗
            </a>
          )}
          <Link href="/admin/lists" className="text-slate hover:text-ink-deep">
            ← Back to all lists
          </Link>
        </div>

        {/* Cover picker editor — sits below the hero in a thin admin
            strip. Click "Change cover…" to open the photo picker modal. */}
        <CoverSection
          listName={found.name}
          initialCoverPhotoId={meta?.coverPhotoId ?? null}
          initialCoverUrl={coverUrl}
          initialSource={coverSource}
        />
      </header>

      <AdminListEditor
        listName={found.name}
        initialRows={rows}
        initialPinOrder={meta?.pinOrder ?? []}
      />
    </div>
  );
}
