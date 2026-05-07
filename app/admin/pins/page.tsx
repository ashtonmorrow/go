import { fetchAllPins } from '@/lib/pins';
import VisitedEditorClient from './VisitedEditorClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AdminPinsPage() {
  const pins = await fetchAllPins();

  // Slim down to the columns the editor needs. Sort by most-recently-edited
  // first so freshly-uploaded pins show up at the top.
  const rows = pins
    .slice()
    .sort((a, b) => {
      const A = a.updatedAt ?? a.airtableModifiedAt ?? '';
      const B = b.updatedAt ?? b.airtableModifiedAt ?? '';
      if (!A && !B) return 0;
      if (!A) return 1;
      if (!B) return -1;
      return A < B ? 1 : A > B ? -1 : 0;
    })
    .map(p => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      city: p.cityNames[0] ?? '',
      country: p.statesNames[0] ?? '',
      visited: p.visited,
      kind: p.kind ?? null,
      indexable: p.indexable,
      personalRating: p.personalRating,
      // Cover precedence for the inline picker thumbnail: curated first
      // pick, then any pin.images entry, then nothing. The picker writes
      // back to heroPhotoUrls[0], so we keep the array for it to merge
      // its new pick into.
      coverUrl: p.heroPhotoUrls[0] ?? p.images?.[0]?.url ?? null,
      heroPhotoUrls: p.heroPhotoUrls,
      // Review fields. Hotel pins surface generated_review (the
      // public-facing copy that also gates indexability); every other
      // kind surfaces personal_review (Mike's voice for the universal
      // detail page block).
      personalReview: p.personalReview,
      generatedReview: p.generatedReview,
    }));

  return (
    <div className="max-w-page mx-auto px-5 py-8">
      <h1 className="text-h2 text-ink-deep mb-2">Edit pins</h1>
      <p className="text-small text-muted mb-6 max-w-2xl leading-relaxed">
        Edit visited, kind, indexable, and rating inline. Search to filter.
        Click <strong>Save changes</strong> to commit modified rows.
      </p>
      <VisitedEditorClient initialRows={rows} />
    </div>
  );
}
