'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { extractExifMeta } from '@/lib/exifGps';
import { convertHeicIfNeeded } from '@/lib/heicConvert';
import { sha256OfFile } from '@/lib/photoHash';

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

type Phase = 'pick' | 'review' | 'saving' | 'done';

export default function UploadClient() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [phase, setPhase] = useState<Phase>('pick');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedCandidates, setSelectedCandidates] = useState<Set<string>>(new Set());
  /** Map<photoId, candidateId | 'skip'> */
  const [assignments, setAssignments] = useState<Map<string, string>>(new Map());
  const [findingCandidates, setFindingCandidates] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [saveResult, setSaveResult] = useState<{
    created: Array<{ photoHash: string; pinId: string; pinSlug: string; isNew: boolean }>;
    failed: Array<{ photoHash: string; error: string }>;
  } | null>(null);
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

      // Default selection: pre-select candidates that don't overlap an existing
      // pin. (Existing-pin candidates are still useful — they'll attach photos
      // to the existing pin without creating a new one.)
      const sel = new Set<string>();
      for (const c of cs) sel.add(c.id);
      setSelectedCandidates(sel);

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

  const toggleCandidate = (id: string) => {
    setSelectedCandidates(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const setAssignment = (photoId: string, candidateOrSkip: string) => {
    setAssignments(prev => {
      const next = new Map(prev);
      next.set(photoId, candidateOrSkip);
      return next;
    });
  };

  const submit = async () => {
    setPhase('saving');
    setGlobalError(null);

    const candidateById = new Map(candidates.map(c => [c.id, c]));
    const uploadedUrls = new Map<string, string>();

    for (const photo of photos) {
      if (!photo.hash || photo.stage === 'no-gps' || photo.stage === 'error') continue;
      const assigned = assignments.get(photo.id);
      if (!assigned || assigned === 'skip') continue;
      const cand = candidateById.get(assigned);
      if (!cand) continue;
      if (!selectedCandidates.has(assigned) && !cand.existingPinId) continue;

      try {
        setPhotos(prev => prev.map(p => (p.id === photo.id ? { ...p, stage: 'uploading' } : p)));
        const form = new FormData();
        form.append('file', photo.file, photo.file.name);
        form.append('hash', photo.hash);
        const res = await fetch('/api/admin/upload-photo', { method: 'POST', body: form });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error ?? 'upload failed');
        uploadedUrls.set(photo.id, data.url);
        setPhotos(prev =>
          prev.map(p =>
            p.id === photo.id
              ? { ...p, stage: 'uploaded', uploadedUrl: data.url }
              : p,
          ),
        );
      } catch (e) {
        setPhotos(prev =>
          prev.map(p =>
            p.id === photo.id
              ? {
                  ...p,
                  stage: 'error',
                  error: e instanceof Error ? e.message : 'upload failed',
                }
              : p,
          ),
        );
      }
    }

    const liveAssignments: any[] = [];
    for (const photo of photos) {
      const url = uploadedUrls.get(photo.id);
      if (!url || !photo.hash) continue;
      const assigned = assignments.get(photo.id);
      if (!assigned || assigned === 'skip') continue;
      const cand = candidateById.get(assigned);
      if (!cand) continue;

      const existingPinId = cand.existingPinId;
      const newPinFromCandidate =
        !existingPinId && selectedCandidates.has(cand.id) ? cand.place : null;
      if (!existingPinId && !newPinFromCandidate) continue;

      liveAssignments.push({
        photoHash: photo.hash,
        photoUrl: url,
        takenAt: photo.takenAt ? photo.takenAt.toISOString() : null,
        exifLat: photo.lat ?? null,
        exifLng: photo.lng ?? null,
        width: photo.width ?? null,
        height: photo.height ?? null,
        bytes: photo.file.size ?? null,
        caption: null,
        existingPinId,
        newPinFromCandidate,
      });
    }

    try {
      const res = await fetch('/api/admin/save-batch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ assignments: liveAssignments }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'save-batch failed');
      setSaveResult(data);
      setPhase('done');
    } catch (e) {
      setGlobalError(e instanceof Error ? e.message : 'save-batch failed');
      setPhase('review');
    }
  };

  const reset = () => {
    photos.forEach(p => URL.revokeObjectURL(p.preview));
    setPhotos([]);
    setCandidates([]);
    setSelectedCandidates(new Set());
    setAssignments(new Map());
    setSaveResult(null);
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
          selectedCandidates={selectedCandidates}
          assignments={assignments}
          onToggleCandidate={toggleCandidate}
          onAssign={setAssignment}
          onBack={() => setPhase('pick')}
          onSubmit={submit}
        />
      )}

      {phase === 'saving' && (
        <div className="text-small text-ink">Saving… uploading photos and creating pins.</div>
      )}

      {phase === 'done' && saveResult && (
        <DonePanel result={saveResult} onReset={reset} />
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
  selectedCandidates,
  assignments,
  onToggleCandidate,
  onAssign,
  onBack,
  onSubmit,
}: {
  photos: Photo[];
  candidates: Candidate[];
  selectedCandidates: Set<string>;
  assignments: Map<string, string>;
  onToggleCandidate: (id: string) => void;
  onAssign: (photoId: string, candId: string) => void;
  onBack: () => void;
  onSubmit: () => void;
}) {
  const candidateById = useMemo(() => new Map(candidates.map(c => [c.id, c])), [candidates]);
  const ready = photos.filter(p => p.stage === 'ready' && p.hash);

  const newCount = candidates.filter(c => !c.existingPinId && selectedCandidates.has(c.id)).length;
  const existingCount = candidates.filter(c => !!c.existingPinId).length;
  const photoTargetCount = ready.filter(p => {
    const a = assignments.get(p.id);
    if (!a || a === 'skip') return false;
    const c = candidateById.get(a);
    if (!c) return false;
    return !!c.existingPinId || selectedCandidates.has(c.id);
  }).length;

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-h3 text-ink-deep mb-3">Candidates near your photos</h2>
        {candidates.length === 0 ? (
          <p className="text-small text-muted">
            No nearby places returned. Either the photos are far from any indexed POI, or
            Google Places didn&rsquo;t recognise the area. You can still go back and remove
            photos.
          </p>
        ) : (
          <ul className="space-y-2">
            {candidates.map(c => {
              const isExisting = !!c.existingPinId;
              const checked = isExisting || selectedCandidates.has(c.id);
              return (
                <li key={c.id} className="flex items-start gap-3 p-3 rounded border border-sand bg-white">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={isExisting}
                    onChange={() => !isExisting && onToggleCandidate(c.id)}
                    className="mt-1"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="font-medium text-ink-deep">{c.place.name}</span>
                      {isExisting && (
                        <span className="pill bg-cream-soft text-slate text-[10px]">
                          existing pin
                        </span>
                      )}
                      {!isExisting && (
                        <span className="pill bg-teal/10 text-teal text-[10px]">
                          new pin
                        </span>
                      )}
                      {c.photoHashes.length > 1 && (
                        <span className="pill bg-accent/10 text-accent text-[10px]">
                          {c.photoHashes.length} photos
                        </span>
                      )}
                    </div>
                    <p className="text-small text-muted truncate">
                      {c.place.address || `${c.place.city}, ${c.place.country}`}
                    </p>
                    <p className="text-[10px] text-muted font-mono mt-0.5">
                      {c.place.category} · {c.place.lat.toFixed(4)}, {c.place.lng.toFixed(4)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-3 text-[11px] text-muted">
          {newCount} new pin{newCount === 1 ? '' : 's'} · {existingCount} existing match{existingCount === 1 ? '' : 'es'}
        </p>
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
            Will save {photoTargetCount} photo{photoTargetCount === 1 ? '' : 's'}
          </span>
          <button
            type="button"
            onClick={onSubmit}
            disabled={photoTargetCount === 0}
            className="px-4 py-2 text-small font-medium rounded bg-teal text-white disabled:bg-muted disabled:text-cream-soft"
          >
            Save batch
          </button>
        </div>
      </div>
    </div>
  );
}

function DonePanel({
  result,
  onReset,
}: {
  result: {
    created: Array<{ photoHash: string; pinId: string; pinSlug: string; isNew: boolean }>;
    failed: Array<{ photoHash: string; error: string }>;
  };
  onReset: () => void;
}) {
  const newPins = new Map<string, { slug: string; count: number }>();
  for (const c of result.created) {
    if (!c.isNew) continue;
    const e = newPins.get(c.pinId);
    if (e) e.count++;
    else newPins.set(c.pinId, { slug: c.pinSlug, count: 1 });
  }

  return (
    <div className="space-y-4">
      <div className="px-4 py-3 rounded bg-teal/10 text-teal text-small">
        Saved {result.created.length} photo{result.created.length === 1 ? '' : 's'}
        {newPins.size > 0 && (
          <> · created {newPins.size} new pin{newPins.size === 1 ? '' : 's'}</>
        )}
        {result.failed.length > 0 && (
          <> · {result.failed.length} failed</>
        )}
      </div>

      {newPins.size > 0 && (
        <div>
          <h3 className="text-small text-muted uppercase tracking-wider text-[11px] mb-2">New pins</h3>
          <ul className="text-small space-y-1">
            {[...newPins.entries()].map(([pinId, { slug, count }]) => (
              <li key={pinId}>
                <a
                  href={`/pins/${slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-teal hover:underline"
                >
                  {slug} → {count} photo{count === 1 ? '' : 's'}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.failed.length > 0 && (
        <div>
          <h3 className="text-small text-muted uppercase tracking-wider text-[11px] mb-2">Failed</h3>
          <ul className="text-small space-y-1 text-orange">
            {result.failed.map((f, i) => (
              <li key={i}>{f.photoHash.slice(0, 8)}…: {f.error}</li>
            ))}
          </ul>
        </div>
      )}

      <button
        type="button"
        onClick={onReset}
        className="px-4 py-2 text-small font-medium rounded bg-ink-deep text-white"
      >
        Upload more
      </button>
    </div>
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
