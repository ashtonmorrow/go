'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { extractExifMeta } from '@/lib/exifGps';
import { convertHeicIfNeeded } from '@/lib/heicConvert';
import { sha256OfFile } from '@/lib/photoHash';
import { supabase } from '@/lib/supabase';

const MAX_PHOTOS = 30;

type PhotoStage =
  | 'reading'
  | 'no-gps'
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

    for (const photo of newPhotos) {
      try {
        const { file: workingFile } = await convertHeicIfNeeded(photo.file);
        const hash = await sha256OfFile(workingFile);
        const meta = await extractExifMeta(workingFile);
        const dims = await imageDimensions(workingFile);

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
                  {readyCount} with GPS · {noGpsCount} without GPS · {photos.length} total
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
    stage === 'ready' ? { label: 'Ready', cls: 'bg-teal/10 text-teal' } :
    stage === 'uploading' ? { label: 'Uploading…', cls: 'bg-cream-soft text-muted' } :
    stage === 'uploaded' ? { label: 'Uploaded', cls: 'bg-teal/10 text-teal' } :
    stage === 'saving' ? { label: 'Saving…', cls: 'bg-cream-soft text-muted' } :
    stage === 'saved' ? { label: 'Saved', cls: 'bg-teal/10 text-teal' } :
    { label: 'Error', cls: 'bg-orange/10 text-orange' };

  return (
    <div className="rounded border border-sand overflow-hidden bg-white">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photo.preview} alt="" className="w-full aspect-square object-cover bg-cream-soft" />
      <div className="p-2 text-[11px]">
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
        {photo.lat != null && photo.lng != null && (
          <p className="mt-1 font-mono text-muted truncate">
            {photo.lat.toFixed(4)}, {photo.lng.toFixed(4)}
          </p>
        )}
        {photo.takenAt && (
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
  onBack: () => void;
  onReset: () => void;
}) {
  const ready = photos.filter(p => p.stage === 'ready' && p.hash);
  const photosByCandidate = useMemo(() => {
    const map = new Map<string, Photo[]>();
    for (const p of ready) {
      const a = assignments.get(p.id);
      if (!a || a === 'skip') continue;
      if (!map.has(a)) map.set(a, []);
      map.get(a)!.push(p);
    }
    return map;
  }, [ready, assignments]);

  const savedCount = [...candidateStates.values()].filter(s => s.status === 'saved').length;

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

      <section>
        <h2 className="text-h3 text-ink-deep mb-3">Assign each photo</h2>
        <ul className="space-y-2">
          {ready.map(p => {
            const matching = candidates.filter(c => p.hash && c.photoHashes.includes(p.hash));
            const assigned = assignments.get(p.id) ?? 'skip';
            return (
              <li key={p.id} className="flex items-center gap-3 p-2 rounded border border-sand bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.preview} alt="" className="w-14 h-14 object-cover rounded bg-cream-soft" />
                <div className="flex-1 min-w-0 text-small">
                  <p className="font-mono text-[11px] text-muted truncate">
                    {p.lat?.toFixed(4)}, {p.lng?.toFixed(4)}
                  </p>
                  {p.takenAt && (
                    <p className="text-[11px] text-muted">{p.takenAt.toLocaleString()}</p>
                  )}
                </div>
                <select
                  value={assigned}
                  onChange={e => onAssign(p.id, e.target.value)}
                  className="text-small border border-sand rounded px-2 py-1 bg-white"
                >
                  <option value="skip">Skip this photo</option>
                  {matching.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.place.name}
                      {c.existingPinId ? ' (existing)' : ''}
                    </option>
                  ))}
                  {matching.length === 0 && (
                    <option value="skip" disabled>
                      No nearby candidates
                    </option>
                  )}
                </select>
              </li>
            );
          })}
        </ul>
      </section>

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
            {savedCount} of {candidates.length} saved
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

  return (
    <li className="flex items-start gap-3 p-3 rounded border border-sand bg-white">
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-medium text-ink-deep">{candidate.place.name}</span>
          {isExisting ? (
            <span className="pill bg-cream-soft text-slate text-[10px]">existing pin</span>
          ) : (
            <span className="pill bg-teal/10 text-teal text-[10px]">new pin</span>
          )}
          {photoCount > 0 && (
            <span className="pill bg-accent/10 text-accent text-[10px]">
              {photoCount} photo{photoCount === 1 ? '' : 's'} assigned
            </span>
          )}
        </div>
        <p className="text-small text-muted truncate">
          {candidate.place.address || `${candidate.place.city}, ${candidate.place.country}`}
        </p>
        <p className="text-[10px] text-muted font-mono mt-0.5">
          {candidate.place.category} · {candidate.place.lat.toFixed(4)}, {candidate.place.lng.toFixed(4)}
        </p>

        {assignedPhotos.length > 0 && (
          <div className="mt-2 flex gap-2 flex-wrap">
            {assignedPhotos.map(p => (
              <div key={p.id} className="relative group">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.preview}
                  alt={p.takenAt?.toLocaleString() ?? ''}
                  title={[
                    p.takenAt?.toLocaleString(),
                    p.lat != null && p.lng != null ? `${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}` : null,
                  ].filter(Boolean).join(' · ')}
                  className="w-14 h-14 object-cover rounded border border-sand bg-cream-soft"
                />
                {!isSaved && (
                  <button
                    type="button"
                    onClick={() => onDetachPhoto(p.id)}
                    aria-label="Wrong place — remove this photo"
                    title="Wrong place — remove this photo"
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-orange text-white text-[10px] leading-none flex items-center justify-center shadow opacity-90 hover:opacity-100"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {state.status === 'error' && state.error && (
          <p className="mt-2 text-[11px] text-orange">{state.error}</p>
        )}
        {isSaved && slug && (
          <p className="mt-2 text-[11px] text-teal">
            Saved {state.photoCount ?? 0} photo{(state.photoCount ?? 0) === 1 ? '' : 's'} ·{' '}
            <a href={`/pins/${slug}`} target="_blank" rel="noopener noreferrer" className="underline">
              View pin →
            </a>
          </p>
        )}
      </div>
      <SaveButton state={state} disabled={photoCount === 0} onClick={onSave} />
    </li>
  );
}

function SaveButton({
  state,
  disabled,
  onClick,
}: {
  state: CandidateState;
  disabled: boolean;
  onClick: () => void;
}) {
  if (state.status === 'saved') {
    return (
      <span className="px-3 py-1.5 text-small font-medium rounded bg-teal/10 text-teal">
        Saved ✓
      </span>
    );
  }
  const label =
    state.status === 'saving' ? 'Saving…' :
    state.status === 'error' ? 'Retry' :
    'Save';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || state.status === 'saving'}
      className={
        'px-3 py-1.5 text-small font-medium rounded transition-colors ' +
        (disabled
          ? 'bg-cream-soft text-muted cursor-not-allowed'
          : state.status === 'error'
          ? 'bg-orange text-white hover:bg-orange/90'
          : 'bg-teal text-white hover:bg-teal/90')
      }
    >
      {label}
    </button>
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
