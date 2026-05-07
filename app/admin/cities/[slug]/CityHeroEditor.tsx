'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import HeroPicker, { type HeroCandidate } from '@/components/admin/HeroPicker';
import { uploadEntityPhoto } from '@/lib/admin/uploadEntityPhoto';

export type AdminCityPhoto = HeroCandidate;

type Props = {
  idOrSlug: string;
  publicSlug: string;
  initialHeroPhotoUrls: string[];
  candidates: AdminCityPhoto[];
};

export default function CityHeroEditor({
  idOrSlug,
  publicSlug,
  initialHeroPhotoUrls,
  candidates,
}: Props) {
  const router = useRouter();
  const [picks, setPicks] = useState<string[]>(initialHeroPhotoUrls);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ ok: true } | { error: string } | null>(null);

  const dirty =
    picks.length !== initialHeroPhotoUrls.length ||
    picks.some((u, i) => u !== initialHeroPhotoUrls[i]);

  async function togglePhotoHidden(id: string, nextHidden: boolean) {
    const res = await fetch('/api/admin/personal-photos', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, hidden: nextHidden }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.error ?? `toggle failed (${res.status})`);
    }
  }

  async function save() {
    setSaving(true);
    setResult(null);
    try {
      const res = await fetch('/api/admin/update-city', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          slug: idOrSlug,
          fields: { hero_photo_urls: picks },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `save failed (${res.status})`);
      setResult({ ok: true });
    } catch (e) {
      setResult({ error: e instanceof Error ? e.message : 'save failed' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      {result && 'ok' in result && (
        <div className="px-3 py-2 rounded bg-teal/10 text-teal text-small">Saved.</div>
      )}
      {result && 'error' in result && (
        <div className="px-3 py-2 rounded bg-orange/10 text-orange text-small">{result.error}</div>
      )}

      <HeroPicker
        value={picks}
        candidates={candidates}
        onChange={setPicks}
        onToggleHidden={togglePhotoHidden}
        maxRecommended={12}
        maxAbsolute={20}
        title="Hero photos"
        hint="Drag to reorder up to 12 photos. Click hide on any personal photo to suppress it from the auto-pick collage on cities without curation. Upload to add a fresh photo to this city's pool."
        onUploadFile={async file => {
          const result = await uploadEntityPhoto({
            kind: 'city',
            entityRef: idOrSlug,
            file,
            existingHeroPhotoUrls: picks,
            promoteToCover: false,
          });
          // Refresh so the candidates pool picks up the new URL.
          router.refresh();
          return { url: result.url };
        }}
      />

      <div className="flex items-center gap-3 sticky bottom-0 bg-cream/90 backdrop-blur py-3 border-t border-sand">
        <button
          type="button"
          onClick={save}
          disabled={!dirty || saving}
          className="px-4 py-2 rounded bg-teal text-white text-small font-medium hover:bg-teal/90 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <span className="text-small text-muted">
          {dirty ? 'Unsaved changes' : 'No changes'}
        </span>
        <a
          href={`/cities/${publicSlug}`}
          target="_blank"
          rel="noreferrer"
          className="ml-auto text-small text-teal hover:underline"
        >
          Preview public page →
        </a>
      </div>
    </div>
  );
}
