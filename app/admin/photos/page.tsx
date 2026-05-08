import PhotosBrowserClient from './PhotosBrowserClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function AdminPhotosPage() {
  return (
    <div className="max-w-page mx-auto px-5 py-8">
      <header className="mb-6">
        <h1 className="text-h1 text-ink-deep leading-tight">Photos</h1>
        <p className="mt-2 text-small text-muted max-w-2xl">
          Every personal photo and every codex pin image in one place. Filter
          by source, search by pin name, multi-select to bulk delete. The
          per-pin pickers handle local cleanup; this page is for sweeping
          across the whole atlas.
        </p>
      </header>
      <PhotosBrowserClient />
    </div>
  );
}
