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
    }));

  return (
    <div className="max-w-page mx-auto px-5 py-8">
      <h1 className="text-h2 text-ink-deep mb-2">Edit visited</h1>
      <p className="text-small text-muted mb-6 max-w-2xl leading-relaxed">
        Tick the checkbox for any place you&rsquo;ve been. Search to filter the list.
        Click <strong>Save changes</strong> to commit. Only modified rows are sent.
      </p>
      <VisitedEditorClient initialRows={rows} />
    </div>
  );
}
