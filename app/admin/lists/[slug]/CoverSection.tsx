'use client';

import { useState } from 'react';
import CoverPickerModal from '../CoverPickerModal';

// === CoverSection ==========================================================
// Wraps the cover preview tile + Change/Clear button on /admin/lists/[slug].
// Owns the modal-open state and the local mirror of cover_photo_id/url so
// the preview updates instantly after a pick without a server round-trip.
//
// Initial values come from the server-rendered page (resolved via the
// same precedence used on /lists), so an admin landing here for the first
// time sees exactly what the public page shows.

type Props = {
  listName: string;
  initialCoverPhotoId: string | null;
  initialCoverUrl: string | null;
  /** Where the preview came from in the server-side fallback chain.
   *  Drives the "Curated"/"Auto" badge under the tile. */
  initialSource: 'curated-photo' | 'curated-pin' | 'fallback' | 'none';
};

export default function CoverSection({
  listName,
  initialCoverPhotoId,
  initialCoverUrl,
  initialSource,
}: Props) {
  const [coverPhotoId, setCoverPhotoId] = useState(initialCoverPhotoId);
  const [coverUrl, setCoverUrl] = useState(initialCoverUrl);
  const [source, setSource] = useState(initialSource);
  const [open, setOpen] = useState(false);

  function handleCommit(next: { coverPhotoId: string | null; coverUrl: string | null }) {
    setCoverPhotoId(next.coverPhotoId);
    setCoverUrl(next.coverUrl);
    // Clearing reverts to fallback; setting a photo is curated.
    setSource(next.coverPhotoId ? 'curated-photo' : 'fallback');
  }

  const sourceLabel =
    source === 'curated-photo' ? 'Curated photo'
    : source === 'curated-pin' ? 'Curated pin'
    : source === 'fallback' ? 'Auto (fallback chain)'
    : 'No cover';

  return (
    <div className="mt-4 flex items-start gap-3">
      <div className="w-32 aspect-[4/3] bg-cream-soft border border-sand rounded overflow-hidden flex items-center justify-center">
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="text-micro text-muted uppercase tracking-wider">
            No photo
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1.5 pt-0.5">
        <div className="text-label text-muted">
          Cover · <span className="text-slate">{sourceLabel}</span>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="self-start px-3 py-1.5 text-label rounded border border-sand text-ink-deep hover:border-slate hover:bg-cream-soft transition-colors"
        >
          {coverPhotoId ? 'Change cover…' : 'Pick cover…'}
        </button>
      </div>

      {open && (
        <CoverPickerModal
          listName={listName}
          currentCoverPhotoId={coverPhotoId}
          onCommit={handleCommit}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
