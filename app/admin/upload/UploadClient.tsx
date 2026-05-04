'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { extractExifMeta } from '@/lib/exifGps';
import { convertHeicIfNeeded } from '@/lib/heicConvert';
import { sha256OfFile } from '@/lib/photoHash';
import { supabase } from '@/lib/supabase';

const MAX_PHOTOS = 30;

type PhotoStage =
  | 'reading'
  | 'no-gps'
  | 'duplicate'
  | 'ready'
  | 'uploading'
  | 'uploaded'
  | 'saving'
  | 'saved'
  | 'error';

type Photo = {
  id: string;
  file: File;
  preview: string;
  stage: PhotoStage;
  error?: string;
  hash?: string;
  takenAt?: Date;
  lat?: number;
  lng?: number;
  width?: number;
  height?: number;
  uploadedUrl?: string;
  duplicateOf?: { pinId: string; pinName: string; pinSlug: string | null };
};

type CandidatePlace = {
  name: string;
  address: string;
  city: string;
  country: string;
  lat: number;
  lng: number;
  category: string;
  website: string;
  googleMapsUrl: string;
  estimatedRating: number | null;
  distanceMeters: number | null;
};

type Candidate = {
  id: string;
  place: CandidatePlace;
  photoHashes: string[];
  existingPinId: string | null;
  existingPinName: string | null;
  existingPinSlug: string | null;
};

type Phase = 'pick' | 'review';

type CandidateState = {
  status: 'idle' | 'saving' | 'saved' | 'error';
  error?: string;
  pinSlug?: string;
  pinId?: string;
  photoCount?: number;
  isNew?: boolean;
};

export default function UploadClient() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [phase, setPhase] = useState<Phase>('pick');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  /** Map<photoId, candidateId | 'skip'> */
  const [assignments, setAssignments] = useState<Map<string, string>>(new Map());
  const [candidateStates, setCandidateStates] = useState<Map<string, CandidateState>>(new Map());
  const [findingCandidates, setFindingCandidates] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const ingestFiles = useCallback(async (files: File[]) => {
    if (!files.length) return;
    if (photos.length + files.length > MAX_PHOTOS) {
      setGlobalError(`Max ${MAX_PHOTOS} photos per batch.`);
      return;
    }
    setGlobalError(null);

    const newPhotos: Photo[] = files.map(file => ({
      id: crypto.randomUUID(),
      file,
      preview: URL.createObjectURL(file),
      stage: 'reading',
    }));
    setPhotos(prev => [...prev, ...newPhotos]);

    const ingestedHashes: string[] = [];
    for (const photo of newPhotos) {
      try {
        const { file: workingFile } = await convertHeicIfNeeded(photo.file);
        const hash = await sha256OfFile(workingFile);
        const meta = await extractExifMeta(workingFile);
        const dims = await imageDimensions(workingFile);

        ingestedHashes.push(hash);

        setPhotos(prev =>
          prev.map(p =>
            p.id === photo.id
              ? {
                  ...p,
                  file: workingFile,
                  hash,
                  takenAt: meta.takenAt,
                  lat: meta.lat,
                  lng: meta.lng,
                  width: dims?.width,
                  height: dims?.height,
                  stage: meta.lat == null || meta.lng == null ? 'no-gps' : 'ready',
                }
              : p,
          ),
        );
      } catch (e) {
        setPhotos(prev =>
          prev.map(p =>
            p.id === photo.id
              ? { ...p, stage: 'error', error: e instanceof Error ? e.message : 'parse failed' }
              : p,
          ),
        );
      }
    }

    // After all photos in this batch finish hashing, ask the server which
    // hashes already exist in personal_photos. Mark those as duplicates so
    // they can't be re-uploaded.
    if (ingestedHashes.length) {
      try {
        const res = await fetch('/api/admin/check-duplicates', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ hashes: ingestedHashes }),
        });
        const data = await res.json().catch(() => ({}));
        const dupes = (data?.duplicates ?? {}) as Record<
          string,
          { pinId: string; pinName: string; pinSlug: string | null }
        >;
        if (Object.keys(dupes).length) {
          setPhotos(prev =>
            prev.map(p => {
              if (!p.hash || !dupes[p.hash]) return p;
              return { ...p, stage: 'duplicate' as const, duplicateOf: dupes[p.hash] };
            }),
          );
        }
      } catch (e) {
        console.warn('check-duplicates failed:', e);
      }
    }
  }, [photos.length]);

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name));
      void ingestFiles(files);
    },
    [ingestFiles],
  );

  const removePhoto = (id: string) => {
    setPhotos(prev => prev.filter(p => p.id !== id));
    setAssignments(prev => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  };

  const findCandidates = async () => {
    const ready = photos.filter(p => p.stage === 'ready' && p.hash && p.lat != null && p.lng != null);
    if (!ready.length) {
      setGlobalError('Need at least one photo with EXIF GPS to find candidates.');
      return;
    }
    setFindingCandidates(true);
    setGlobalError(null);
    try {
      const res = await fetch('/api/admin/find-candidates', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          photos: ready.map(p => ({ hash: p.hash, lat: p.lat, lng: p.lng })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'find-candidates failed');
      const cs: Candidate[] = data.candidates ?? [];
      setCandidates(cs);
      setCandidateStates(new Map(cs.map(c => [c.id, { status: 'idle' as const }])));

      // Default per-photo assignment: each photo to its nearest matching candidate.
      const defaultAssign = new Map<string, string>();
      for (const p of ready) {
        if (!p.hash) continue;
        const matching = cs.filter(c => c.photoHashes.includes(p.hash!));
        if (!matching.length) {
          defaultAssign.set(p.id, 'skip');
          continue;
        }
        // Pick whichever matching candidate is geographically closest.
        let best = matching[0];
        let bestDist = haversineKm(p.lat!, p.lng!, best.place.lat, best.place.lng);
        for (let i = 1; i < matching.length; i++) {
          const d = haversineKm(p.lat!, p.lng!, matching[i].place.lat, matching[i].place.lng);
          if (d < bestDist) {
            bestDist = d;
            best = matching[i];
          }
        }
        defaultAssign.set(p.id, best.id);
      }
      setAssignments(defaultAssign);
      setPhase('review');
    } catch (e) {
      setGlobalError(e instanceof Error ? e.message : 'find-candidates failed');
    } finally {
      setFindingCandidates(false);
    }
  };

  /** Re-run the candidate search for one photo with a free-text query.
   *  Useful when the nearby search didn't return the right place. New
   *  candidates are merged into the candidates list (deduped by id). */
  const searchAgainForPhoto = async (photoId: string, query: string): Promise<boolean> => {
    const photo = photos.find(p => p.id === photoId);
    if (!photo || !photo.hash || photo.lat == null || photo.lng == null) return false;
    const trimmed = query.trim();
    if (!trimmed) return false;

    try {
      const res = await fetch('/api/admin/find-candidates', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          photos: [{ hash: photo.hash, lat: photo.lat, lng: photo.lng, query: trimmed }],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'search failed');
      const newCs: Candidate[] = data.candidates ?? [];
      if (!newCs.length) return false;

      setCandidates(prev => {
        const byId = new Map(prev.map(c => [c.id, c]));
        for (const nc of newCs) {
          const existing = byId.get(nc.id);
          if (existing) {
            // Merge photoHashes so the same place keeps prior associations
            for (const h of nc.photoHashes) {
              if (!existing.photoHashes.includes(h)) existing.photoHashes.push(h);
            }
          } else {
            byId.set(nc.id, nc);
          }
        }
        return [...byId.values()];
      });
      setCandidateStates(prev => {
        const next = new Map(prev);
        for (const nc of newCs) {
          if (!next.has(nc.id)) next.set(nc.id, { status: 'idle' as const });
        }
        return next;
      });
      // Auto-assign this photo to the top new result if it's not already assigned.
      const top = newCs[0];
      if (top) {
        setAssignments(prev => {
          const next = new Map(prev);
          next.set(photoId, top.id);
          return next;
        });
      }
      return true;
    } catch (e) {
      setGlobalError(e instanceof Error ? e.message : 'search failed');
      return false;
    }
  };

  const setAssignment = (photoId: string, candidateOrSkip: string) => {
    setAssignments(prev => {
      const next = new Map(prev);
      next.set(photoId, candidateOrSkip);
      return next;
    });
  };

  const detachPhoto = (photoId: string) => {
    setAssignments(prev => {
      const next = new Map(prev);
      next.set(photoId, 'skip');
      return next;
    });
  };

  const setCandidateState = (id: string, patch: CandidateState) => {
    setCandidateStates(prev => new Map(prev).set(id, patch));
  };

  const saveCandidate = async (candidateId: string) => {
    const cand = candidates.find(c => c.id === candidateId);
    if (!cand) return;

    const assignedPhotos = photos.filter(p => {
      if (!p.hash || p.stage === 'no-gps' || p.stage === 'error') return false;
      return assignments.get(p.id) === candidateId;
    });

    if (!assignedPhotos.length) {
      setCandidateState(candidateId, {
        status: 'error',
        error: 'No photos assigned to this place.',
      });
      return;
    }

    setCandidateState(candidateId, { status: 'saving' });

    const uploadedUrls = new Map<string, string>();
    for (const photo of assignedPhotos) {
      if (photo.uploadedUrl) {
        uploadedUrls.set(photo.id, photo.uploadedUrl);
        continue;
      }
      try {
        setPhotos(prev => prev.map(p => (p.id === photo.id ? { ...p, stage: 'uploading' } : p)));

        // Step 1: ask the server for a one-time signed upload token (small JSON,
        // safely under any payload limit).
        const tokenRes = await fetch('/api/admin/upload-photo', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ hash: photo.hash, contentType: photo.file.type }),
        });
        const tokenData = await tokenRes.json().catch(() => ({}));
        if (!tokenRes.ok) {
          throw new Error(tokenData?.error ?? `signed-url failed (${tokenRes.status})`);
        }

        // Step 2: upload the file body directly to Supabase Storage. Bypasses
        // Vercel entirely, so we're not bound by the 4.5MB function limit.
        const { error: uploadErr } = await supabase.storage
          .from('personal-photos')
          .uploadToSignedUrl(tokenData.path, tokenData.token, photo.file, {
            contentType: photo.file.type || 'application/octet-stream',
            upsert: true,
          });
        if (uploadErr) throw new Error(uploadErr.message);

        uploadedUrls.set(photo.id, tokenData.publicUrl);
        setPhotos(prev =>
          prev.map(p =>
            p.id === photo.id
              ? { ...p, stage: 'uploaded', uploadedUrl: tokenData.publicUrl }
              : p,
          ),
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'upload failed';
        setPhotos(prev =>
          prev.map(p =>
            p.id === photo.id ? { ...p, stage: 'error', error: msg } : p,
          ),
        );
        setCandidateState(candidateId, { status: 'error', error: `Upload failed: ${msg}` });
        return;
      }
    }

    const liveAssignments = assignedPhotos
      .filter(p => uploadedUrls.has(p.id))
      .map(p => ({
        photoHash: p.hash!,
        photoUrl: uploadedUrls.get(p.id)!,
        takenAt: p.takenAt ? p.takenAt.toISOString() : null,
        exifLat: p.lat ?? null,
        exifLng: p.lng ?? null,
        width: p.width ?? null,
        height: p.height ?? null,
        bytes: p.file.size ?? null,
        caption: null,
        existingPinId: cand.existingPinId ?? null,
        newPinFromCandidate: cand.existingPinId ? null : cand.place,
      }));

    try {
      const res = await fetch('/api/admin/save-batch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ assignments: liveAssignments }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `save-batch failed (${res.status})`);

      if (data.failed?.length) {
        setCandidateState(candidateId, {
          status: 'error',
          error: data.failed[0].error ?? 'save failed',
        });
        return;
      }

      const created: Array<{ pinId: string; pinSlug: string; isNew: boolean }> = data.created ?? [];
      const first = created[0];
      setCandidateState(candidateId, {
        status: 'saved',
        pinId: first?.pinId,
        pinSlug: first?.pinSlug,
        photoCount: created.length,
        isNew: first?.isNew ?? false,
      });
    } catch (e) {
      setCandidateState(candidateId, {
        status: 'error',
        error: e instanceof Error ? e.message : 'save failed',
      });
    }
  };

  const reset = () => {
    photos.forEach(p => URL.revokeObjectURL(p.preview));
    setPhotos([]);
    setCandidates([]);
    setAssignments(new Map());
    setCandidateStates(new Map());
    setPhase('pick');
    setGlobalError(null);
  };

  const readyCount = photos.filter(p => p.stage === 'ready').length;
  const noGpsCount = photos.filter(p => p.stage === 'no-gps').length;
  const dupeCount = photos.filter(p => p.stage === 'duplicate').length;

  return (
    <div className="space-y-6">
      {globalError && (
        <div className="px-3 py-2 rounded bg-orange/10 text-orange text-small">
          {globalError}
        </div>
      )}

      {phase === 'pick' && (
        <>
          <DropZone
            onDrop={onDrop}
            onPickClick={() => fileInputRef.current?.click()}
          />
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.heic,.heif"
            className="hidden"
            onChange={e => {
              if (e.target.files) void ingestFiles(Array.from(e.target.files));
              e.target.value = '';
            }}
          />

          {photos.length > 0 && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {photos.map(p => (
                  <PhotoCard key={p.id} photo={p} onRemove={() => removePhoto(p.id)} />
                ))}
              </div>

              <div className="flex items-center justify-between gap-3 pt-2">
                <p className="text-small text-muted">
                  {readyCount} with GPS · {noGpsCount} without GPS
                  {dupeCount > 0 && <> · {dupeCount} already saved</>}
                  {' · '}{photos.length} total
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={reset}
                    className="px-3 py-2 text-small text-ink hover:bg-cream-soft rounded border border-sand"
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    onClick={findCandidates}
                    disabled={readyCount === 0 || findingCandidates}
                    className="px-4 py-2 text-small font-medium rounded bg-teal text-white disabled:bg-muted disabled:text-cream-soft"
                  >
                    {findingCandidates ? 'Finding…' : `Find candidates for ${readyCount} photo${readyCount === 1 ? '' : 's'}`}
                  </button>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {phase === 'review' && (
        <ReviewSheet
          photos={photos}
          candidates={candidates}
          assignments={assignments}
          candidateStates={candidateStates}
          onAssign={setAssignment}
          onDetachPhoto={detachPhoto}
          onSaveCandidate={saveCandidate}
          onSearchAgain={searchAgainForPhoto}
          onBack={() => setPhase('pick')}
          onReset={reset}
        />
      )}
    </div>
  );
}

function DropZone({
  onDrop,
  onPickClick,
}: {
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onPickClick: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onDragOver={e => {
        e.preventDefault();
        setHover(true);
      }}
      onDragLeave={() => setHover(false)}
      onDrop={e => {
        setHover(false);
        onDrop(e);
      }}
      className={
        'border-2 border-dashed rounded-lg p-12 text-center transition-colors ' +
        (hover ? 'border-teal bg-teal/5' : 'border-sand bg-cream-soft')
      }
    >
      <p className="text-ink-deep font-medium mb-2">Drop photos here</p>
      <p className="text-small text-muted mb-4">JPEG / HEIC / PNG · up to 30 at a time · GPS in EXIF required</p>
      <button
        type="button"
        onClick={onPickClick}
        className="px-4 py-2 text-small font-medium rounded bg-ink-deep text-white"
      >
        Choose photos
      </button>
    </div>
  );
}

function PhotoCard({ photo, onRemove }: { photo: Photo; onRemove: () => void }) {
  const stage = photo.stage;
  const tag =
    stage === 'reading' ? { label: 'Reading…', cls: 'bg-cream-soft text-muted' } :
    stage === 'no-gps' ? { label: 'No GPS', cls: 'bg-orange/10 text-orange' } :
    stage === 'duplicate' ? { label: 'Already saved', cls: 'bg-cream-soft text-slate' } :
    stage === 'ready' ? { label: 'Ready', cls: 'bg-teal/10 text-teal' } :
    stage === 'uploading' ? { label: 'Uploading…', cls: 'bg-cream-soft text-muted' } :
    stage === 'uploaded' ? { label: 'Uploaded', cls: 'bg-teal/10 text-teal' } :
    stage === 'saving' ? { label: 'Saving…', cls: 'bg-cream-soft text-muted' } :
    stage === 'saved' ? { label: 'Saved', cls: 'bg-teal/10 text-teal' } :
    { label: 'Error', cls: 'bg-orange/10 text-orange' };

  return (
    <div className={'rounded border overflow-hidden bg-white ' + (stage === 'duplicate' ? 'border-slate/40 opacity-70' : 'border-sand')}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photo.preview} alt="" className="w-full aspect-square object-cover bg-cream-soft" />
      <div className="p-2 text-label">
        <div className="flex items-center justify-between gap-2">
          <span className={'pill ' + tag.cls}>{tag.label}</span>
          <button
            type="button"
            onClick={onRemove}
            className="text-muted hover:text-orange"
            aria-label="Remove"
          >
            ✕
          </button>
        </div>
        {stage === 'duplicate' && photo.duplicateOf && (
          <p className="mt-1 text-slate leading-tight">
            On{' '}
            {photo.duplicateOf.pinSlug ? (
              <a
                href={`/pins/${photo.duplicateOf.pinSlug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-teal underline hover:text-teal"
              >
                {photo.duplicateOf.pinName}
              </a>
            ) : (
              <span className="text-ink-deep">{photo.duplicateOf.pinName}</span>
            )}
          </p>
        )}
        {photo.lat != null && photo.lng != null && stage !== 'duplicate' && (
          <p className="mt-1 font-mono text-muted truncate">
            {photo.lat.toFixed(4)}, {photo.lng.toFixed(4)}
          </p>
        )}
        {photo.takenAt && stage !== 'duplicate' && (
          <p className="mt-0.5 text-muted">
            {photo.takenAt.toLocaleDateString()}
          </p>
        )}
        {photo.error && <p className="mt-1 text-orange leading-tight">{photo.error}</p>}
      </div>
    </div>
  );
}

function ReviewSheet({
  photos,
  candidates,
  assignments,
  candidateStates,
  onAssign,
  onDetachPhoto,
  onSaveCandidate,
  onSearchAgain,
  onBack,
  onReset,
}: {
  photos: Photo[];
  candidates: Candidate[];
  assignments: Map<string, string>;
  candidateStates: Map<string, CandidateState>;
  onAssign: (photoId: string, candId: string) => void;
  onDetachPhoto: (photoId: string) => void;
  onSaveCandidate: (id: string) => void;
  onSearchAgain: (photoId: string, query: string) => Promise<boolean>;
  onBack: () => void;
  onReset: () => void;
}) {
  const usable = photos.filter(
    p => p.hash && p.stage !== 'no-gps' && p.stage !== 'error' && p.stage !== 'duplicate',
  );

  const photosByCandidate = useMemo(() => {
    const map = new Map<string, Photo[]>();
    for (const p of usable) {
      const a = assignments.get(p.id);
      if (!a || a === 'skip') continue;
      if (!map.has(a)) map.set(a, []);
      map.get(a)!.push(p);
    }
    return map;
  }, [usable, assignments]);

  // Photos that haven't been saved yet — used for the "remaining" section.
  // A photo is "saved" if it's assigned to a candidate whose state is 'saved'.
  const remainingPhotos = useMemo(() => {
    return usable.filter(p => {
      const a = assignments.get(p.id);
      if (!a) return true;
      if (a === 'skip') return true;
      const cs = candidateStates.get(a);
      return cs?.status !== 'saved';
    });
  }, [usable, assignments, candidateStates]);

  const savedPhotoCount = [...candidateStates.values()]
    .filter(s => s.status === 'saved')
    .reduce((sum, s) => sum + (s.photoCount ?? 0), 0);
  const totalUsable = usable.length;

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-h3 text-ink-deep mb-3">Places near your photos</h2>
        <p className="text-small text-muted mb-3">
          Each place has its own Save button. Click to upload the assigned photos and
          create the pin (or attach to an existing one). You can save them in any order.
        </p>
        {candidates.length === 0 ? (
          <p className="text-small text-muted">
            No nearby places returned. Photos may be far from indexed POIs.
          </p>
        ) : (
          <ul className="space-y-2">
            {candidates.map(c => (
              <CandidateRow
                key={c.id}
                candidate={c}
                assignedPhotos={photosByCandidate.get(c.id) ?? []}
                state={candidateStates.get(c.id) ?? { status: 'idle' }}
                onSave={() => onSaveCandidate(c.id)}
                onDetachPhoto={onDetachPhoto}
              />
            ))}
          </ul>
        )}
      </section>

      {remainingPhotos.length > 0 && (
        <section>
          <h2 className="text-h3 text-ink-deep mb-1">Photos still to assign</h2>
          <p className="text-small text-muted mb-3">
            Pick the right place from the dropdown and click <strong>Save</strong>.
            Choose <em>Skip</em> if you don&rsquo;t want to save the photo.
          </p>
          <ul className="space-y-2">
            {remainingPhotos.map(p => (
              <RemainingPhotoRow
                key={p.id}
                photo={p}
                candidates={candidates}
                assigned={assignments.get(p.id) ?? 'skip'}
                assignedState={
                  assignments.get(p.id) && assignments.get(p.id) !== 'skip'
                    ? candidateStates.get(assignments.get(p.id) as string)
                    : undefined
                }
                onAssign={onAssign}
                onSaveCandidate={onSaveCandidate}
                onSearchAgain={onSearchAgain}
              />
            ))}
          </ul>
        </section>
      )}

      <div className="flex items-center justify-between pt-4 border-t border-sand">
        <button
          type="button"
          onClick={onBack}
          className="px-3 py-2 text-small text-ink hover:bg-cream-soft rounded border border-sand"
        >
          ← Back
        </button>
        <div className="flex items-center gap-3">
          <span className="text-small text-muted">
            {savedPhotoCount} of {totalUsable} photos saved
            {remainingPhotos.length > 0 && (
              <> · {remainingPhotos.length} still to assign</>
            )}
          </span>
          <button
            type="button"
            onClick={onReset}
            className="px-3 py-2 text-small text-ink hover:bg-cream-soft rounded border border-sand"
          >
            Upload more
          </button>
        </div>
      </div>
    </div>
  );
}

function RemainingPhotoRow({
  photo,
  candidates,
  assigned,
  assignedState,
  onAssign,
  onSaveCandidate,
  onSearchAgain,
}: {
  photo: Photo;
  candidates: Candidate[];
  assigned: string;
  assignedState: CandidateState | undefined;
  onAssign: (photoId: string, candId: string) => void;
  onSaveCandidate: (id: string) => void;
  onSearchAgain: (photoId: string, query: string) => Promise<boolean>;
}) {
  const matching = candidates.filter(c => photo.hash && c.photoHashes.includes(photo.hash));
  const canSave = assigned !== 'skip' && assignedState?.status !== 'saving';

  const assignedLabel = (() => {
    if (assigned === 'skip') return null;
    const c = candidates.find(x => x.id === assigned);
    return c ? c.place.name : null;
  })();

  return (
    <li className="rounded border border-sand bg-white">
      <div className="flex items-center gap-3 p-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo.preview} alt="" className="w-14 h-14 object-cover rounded bg-cream-soft" />
        <div className="flex-1 min-w-0 text-small">
          <p className="font-mono text-label text-muted truncate">
            {photo.lat?.toFixed(4)}, {photo.lng?.toFixed(4)}
          </p>
          {photo.takenAt && (
            <p className="text-label text-muted">{photo.takenAt.toLocaleString()}</p>
          )}
        </div>
        <PlaceCombobox
          assignedId={assigned}
          assignedLabel={assignedLabel}
          candidates={matching}
          onPick={candId => onAssign(photo.id, candId)}
          onSearchPlaces={async query => onSearchAgain(photo.id, query)}
        />
        <button
          type="button"
          onClick={() => assigned !== 'skip' && onSaveCandidate(assigned)}
          disabled={!canSave}
          className={
            'text-small px-3 py-1.5 rounded font-medium transition-colors ' +
            (canSave
              ? 'bg-teal text-white hover:bg-teal/90'
              : 'bg-cream-soft text-muted cursor-not-allowed')
          }
          title={
            assigned === 'skip'
              ? 'Pick a place first'
              : `Save photos assigned to this place`
          }
        >
          {assignedState?.status === 'saving' ? 'Saving…' : 'Save'}
        </button>
      </div>
    </li>
  );
}

/**
 * Combobox for picking a place to attach a photo to.
 *
 * Shows the currently-assigned place (or "Skip / pick a place") on the trigger.
 * Opening reveals:
 *   - Search input at top (autofocus). Filters the local candidate pool by
 *     substring. The local pool is whatever Google Nearby Search returned for
 *     this photo's GPS coords plus anything we've added via Places search.
 *   - Filtered list of those candidates.
 *   - "Skip this photo" sticky option.
 *   - "Search Google Places for «query»" appears whenever the typed query
 *     doesn't already exactly match a candidate name. This calls the same
 *     find-candidates endpoint with a `query` so we can attach photos to
 *     places that aren't in the photo's GPS neighborhood (e.g. an attraction
 *     20 km away that the EXIF coords don't surface).
 */
function PlaceCombobox({
  assignedId,
  assignedLabel,
  candidates,
  onPick,
  onSearchPlaces,
}: {
  assignedId: string;
  assignedLabel: string | null;
  candidates: Candidate[];
  onPick: (candId: string) => void;
  onSearchPlaces: (query: string) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchMsg, setSearchMsg] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Outside-click + Escape close.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? candidates.filter(c => c.place.name.toLowerCase().includes(q))
    : candidates;

  const exactMatch = q && candidates.some(c => c.place.name.toLowerCase() === q);
  const showPlacesAction = q.length >= 2 && !exactMatch;

  const triggerLabel = assignedId === 'skip'
    ? 'Skip / pick a place'
    : (assignedLabel ?? 'Pick a place');

  const runPlacesSearch = async () => {
    if (!q || searching) return;
    setSearching(true);
    setSearchMsg(null);
    const found = await onSearchPlaces(query.trim());
    setSearching(false);
    if (!found) {
      setSearchMsg('No Google results. Try a different name.');
    } else {
      setSearchMsg(null);
      setQuery('');
      setOpen(false);
    }
  };

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="text-small border border-sand rounded px-3 py-1.5 bg-white hover:border-slate flex items-center gap-2 max-w-[280px] min-w-[220px]"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={'truncate flex-1 text-left ' + (assignedId === 'skip' ? 'text-muted' : 'text-ink-deep')}>
          {triggerLabel}
        </span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted flex-shrink-0">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div
          className="absolute right-0 top-full mt-1 z-30 w-[320px] bg-white border border-sand rounded-md shadow-lg overflow-hidden"
          role="listbox"
        >
          <div className="p-2 border-b border-sand">
            <input
              type="text"
              value={query}
              onChange={e => { setQuery(e.target.value); setSearchMsg(null); }}
              onKeyDown={e => {
                if (e.key === 'Enter' && showPlacesAction) {
                  e.preventDefault();
                  runPlacesSearch();
                }
              }}
              placeholder="Type a place name…"
              className="w-full text-small border border-sand rounded px-2 py-1.5 bg-white focus:outline-none focus:border-ink-deep"
              autoFocus
            />
          </div>
          <div className="max-h-[280px] overflow-y-auto">
            <button
              type="button"
              onClick={() => { onPick('skip'); setOpen(false); }}
              className={
                'w-full text-left px-3 py-2 text-small hover:bg-cream-soft border-b border-sand ' +
                (assignedId === 'skip' ? 'bg-cream-soft text-ink-deep font-medium' : 'text-muted')
              }
            >
              Skip this photo
            </button>
            {filtered.length === 0 && !showPlacesAction && (
              <p className="px-3 py-2 text-label text-muted">
                {q ? 'No nearby pins match.' : 'No nearby candidates yet.'}
              </p>
            )}
            {filtered.map(c => (
              <button
                key={c.id}
                type="button"
                onClick={() => { onPick(c.id); setOpen(false); setQuery(''); }}
                className={
                  'w-full text-left px-3 py-2 text-small hover:bg-cream-soft flex items-center gap-2 ' +
                  (c.id === assignedId ? 'bg-cream-soft' : '')
                }
              >
                <span className="flex-1 min-w-0 truncate text-ink-deep">{c.place.name}</span>
                <span className={'pill text-micro flex-shrink-0 ' + (c.existingPinId ? 'bg-cream-soft text-slate' : 'bg-teal/10 text-teal')}>
                  {c.existingPinId ? 'existing' : 'new'}
                </span>
              </button>
            ))}
            {showPlacesAction && (
              <button
                type="button"
                onClick={runPlacesSearch}
                disabled={searching}
                className={
                  'w-full text-left px-3 py-2 text-small border-t border-sand flex items-center gap-2 ' +
                  (searching ? 'text-muted cursor-not-allowed bg-cream-soft' : 'text-ink-deep hover:bg-cream-soft')
                }
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
                <span className="flex-1 min-w-0 truncate">
                  {searching ? 'Searching Google Places…' : <>Search Google Places for &ldquo;<strong>{query.trim()}</strong>&rdquo;</>}
                </span>
              </button>
            )}
          </div>
          {searchMsg && (
            <p className="px-3 py-2 text-label text-orange border-t border-sand bg-cream-soft/60">
              {searchMsg}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function CandidateRow({
  candidate,
  assignedPhotos,
  state,
  onSave,
  onDetachPhoto,
}: {
  candidate: Candidate;
  assignedPhotos: Photo[];
  state: CandidateState;
  onSave: () => void;
  onDetachPhoto: (photoId: string) => void;
}) {
  const isExisting = !!candidate.existingPinId;
  const slug = state.pinSlug ?? candidate.existingPinSlug ?? null;
  const photoCount = assignedPhotos.length;
  const isSaved = state.status === 'saved';

  // === Upload progress ====================================================
  // saveCandidate() walks assignedPhotos sequentially: ready → uploading →
  // uploaded, then fires /api/admin/save-batch once everything is in storage.
  // We derive progress from those photo stages so we can show "Uploading 2/5"
  // (during the loop) or "Saving pin… (5/5 uploaded)" (after the loop, while
  // save-batch is in flight). No new state — just reads what's already on each
  // photo's `stage` field.
  const uploadedCount = assignedPhotos.filter(
    p => p.stage === 'uploaded' || p.stage === 'saved',
  ).length;
  const isUploading = state.status === 'saving' && uploadedCount < photoCount;
  const isFinalizing = state.status === 'saving' && !isUploading;
  const progressPct = photoCount > 0
    ? Math.round((uploadedCount / photoCount) * 100)
    : 0;

  return (
    <li className="flex items-start gap-3 p-3 rounded border border-sand bg-white">
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-medium text-ink-deep">{candidate.place.name}</span>
          {isExisting ? (
            <span className="pill bg-cream-soft text-slate text-micro">existing pin</span>
          ) : (
            <span className="pill bg-teal/10 text-teal text-micro">new pin</span>
          )}
          {photoCount > 0 && (
            <span className="pill bg-accent/10 text-accent text-micro">
              {photoCount} photo{photoCount === 1 ? '' : 's'} assigned
            </span>
          )}
        </div>
        <p className="text-small text-muted truncate">
          {candidate.place.address || `${candidate.place.city}, ${candidate.place.country}`}
        </p>
        <p className="text-micro text-muted font-mono mt-0.5">
          {candidate.place.category} · {candidate.place.lat.toFixed(4)}, {candidate.place.lng.toFixed(4)}
          {candidate.place.googleMapsUrl && (
            <>
              {' · '}
              <a
                href={candidate.place.googleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-teal underline hover:text-teal/80"
                title="Verify this place on Google Maps before saving"
              >
                preview on Google ↗
              </a>
            </>
          )}
        </p>

        {assignedPhotos.length > 0 && (
          <div className="mt-2 flex gap-2 flex-wrap">
            {assignedPhotos.map(p => {
              const uploaded = p.stage === 'uploaded' || p.stage === 'saved';
              const uploading = p.stage === 'uploading';
              return (
                <div key={p.id} className="relative group">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.preview}
                    alt={p.takenAt?.toLocaleString() ?? ''}
                    title={[
                      p.takenAt?.toLocaleString(),
                      p.lat != null && p.lng != null ? `${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}` : null,
                    ].filter(Boolean).join(' · ')}
                    className={
                      'w-14 h-14 object-cover rounded border bg-cream-soft transition-opacity ' +
                      (uploading ? 'border-teal opacity-60' : uploaded ? 'border-teal/60' : 'border-sand')
                    }
                  />
                  {/* Stage overlay — only renders during/after a save attempt
                      so the pre-save thumbnails stay clean. */}
                  {uploading && (
                    <div className="absolute inset-0 rounded flex items-center justify-center bg-ink-deep/40 pointer-events-none">
                      <Spinner className="text-white" />
                    </div>
                  )}
                  {uploaded && !isSaved && (
                    <div
                      className="absolute bottom-0.5 right-0.5 w-4 h-4 rounded-full bg-teal text-white flex items-center justify-center shadow pointer-events-none"
                      aria-label="Uploaded"
                      title="Uploaded"
                    >
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    </div>
                  )}
                  {!isSaved && state.status !== 'saving' && (
                    <button
                      type="button"
                      onClick={() => onDetachPhoto(p.id)}
                      aria-label="Wrong place — remove this photo"
                      title="Wrong place — remove this photo"
                      className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-orange text-white text-small leading-none flex items-center justify-center ring-2 ring-white shadow-md hover:bg-orange/90 hover:scale-110 transition-transform"
                    >
                      ✕
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {state.status === 'saving' && photoCount > 0 && (
          <div className="mt-2">
            <div className="flex items-center justify-between gap-2 text-label text-muted mb-1">
              <span>
                {isUploading
                  ? `Uploading ${Math.min(uploadedCount + 1, photoCount)} of ${photoCount}…`
                  : `Saving pin… (${uploadedCount} of ${photoCount} uploaded)`}
              </span>
              <span className="tabular-nums">{progressPct}%</span>
            </div>
            <div
              className="h-1 rounded-full bg-sand overflow-hidden"
              role="progressbar"
              aria-valuenow={progressPct}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className={
                  'h-full bg-teal transition-[width] duration-300 ease-out ' +
                  (isFinalizing ? 'animate-pulse' : '')
                }
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}

        {state.status === 'error' && state.error && (
          <p className="mt-2 text-label text-orange">{state.error}</p>
        )}
        {isSaved && slug && (
          <p className="mt-2 text-label text-teal">
            Saved {state.photoCount ?? 0} photo{(state.photoCount ?? 0) === 1 ? '' : 's'} ·{' '}
            <a href={`/pins/${slug}`} target="_blank" rel="noopener noreferrer" className="underline">
              View pin →
            </a>
          </p>
        )}
      </div>
      <SaveButton
        state={state}
        disabled={photoCount === 0}
        onClick={onSave}
        progress={
          state.status === 'saving' && photoCount > 0
            ? { uploaded: uploadedCount, total: photoCount }
            : undefined
        }
      />
    </li>
  );
}

function SaveButton({
  state,
  disabled,
  onClick,
  progress,
}: {
  state: CandidateState;
  disabled: boolean;
  onClick: () => void;
  progress?: { uploaded: number; total: number };
}) {
  if (state.status === 'saved') {
    return (
      <span className="px-3 py-1.5 text-small font-medium rounded bg-teal/10 text-teal">
        Saved ✓
      </span>
    );
  }
  const label = (() => {
    if (state.status === 'saving') {
      if (progress) {
        return progress.uploaded < progress.total
          ? `${progress.uploaded}/${progress.total}…`
          : 'Saving…';
      }
      return 'Saving…';
    }
    if (state.status === 'error') return 'Retry';
    return 'Save';
  })();
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || state.status === 'saving'}
      className={
        'px-3 py-1.5 text-small font-medium rounded transition-colors tabular-nums inline-flex items-center gap-1.5 ' +
        (disabled
          ? 'bg-cream-soft text-muted cursor-not-allowed'
          : state.status === 'error'
          ? 'bg-orange text-white hover:bg-orange/90'
          : state.status === 'saving'
          ? 'bg-teal text-white opacity-80 cursor-progress'
          : 'bg-teal text-white hover:bg-teal/90')
      }
    >
      {state.status === 'saving' && <Spinner className="text-white" />}
      {label}
    </button>
  );
}

function Spinner({ className }: { className?: string }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      className={'animate-spin ' + (className ?? '')}
      aria-hidden
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function imageDimensions(file: File): Promise<{ width: number; height: number } | null> {
  return new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const out = { width: img.naturalWidth, height: img.naturalHeight };
      URL.revokeObjectURL(url);
      resolve(out);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}
