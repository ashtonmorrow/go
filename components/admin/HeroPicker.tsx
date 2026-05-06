'use client';

import { useMemo } from 'react';
import { thumbUrl } from '@/lib/imageUrl';

// === HeroPicker ============================================================
// Reusable curation widget for picking the hero photos that drive
// <HeroGallery> on a pin / city / country detail page. Stores an
// ordered array of URLs.
//
// Used by:
//   - app/admin/pins/[id]/PinEditorClient.tsx       (recommended max 6)
//   - app/admin/cities/[slug]/CityHeroEditor.tsx    (recommended max 12)
//   - app/admin/countries/[slug]/CountryHeroEditor (recommended max 16)
//
// Behaviour:
//   - Top counter shows "Picked X / recommended N" and exposes a Reset
//     button that clears the curation, falling back to the auto-pick
//     HeroCollage on the public page.
//   - Picked rail: thumbnails in display order. Up / Down / Remove
//     buttons on each. The hard cap is `maxAbsolute` (default 20).
//   - Available rail: all candidate photos NOT currently picked. Click
//     to append to the picked list. Includes a "hidden" pill for any
//     personal photo with `personal_photos.hidden = true` so Mike
//     remembers why it's not surfacing in auto-pick.
//
// Layout notes: thumbnails are square 96px tiles laid out with CSS
// grid. The buttons row sits on the bottom edge of each picked tile so
// hovering doesn't steal the click target.

export type HeroCandidate = {
  url: string;
  /** Tooltip / aria-label fallback. */
  alt?: string;
  width?: number | null;
  height?: number | null;
  /** Short tag shown on the tile (e.g. "personal", "Wikidata", "From
   *  Sagrada Familia") so Mike can tell candidates apart. */
  label?: string;
  /** If true, the candidate currently has `personal_photos.hidden=true`. */
  hidden?: boolean;
};

type Props = {
  /** Currently picked URLs in display order. */
  value: string[];
  /** Full pool of photos that could be picked. The picker hides any
   *  candidate already in `value`. Order here is "available rail" order. */
  candidates: HeroCandidate[];
  onChange: (next: string[]) => void;
  /** Soft cap shown in the counter text. Doesn't block — Mike can pick
   *  more, the counter just says "+3 over recommended." */
  maxRecommended?: number;
  /** Hard cap. Picks beyond this are blocked. Defaults to 20. */
  maxAbsolute?: number;
  /** Optional title rendered above the counter. */
  title?: string;
  /** Optional subhead under the title. */
  hint?: string;
};

export default function HeroPicker({
  value,
  candidates,
  onChange,
  maxRecommended = 8,
  maxAbsolute = 20,
  title = 'Hero photos',
  hint = 'Pick photos that should appear in the hero gallery, in the order you want them. Leave empty to use auto-pick.',
}: Props) {
  // Build a lookup from URL → candidate so the picked rail can show
  // the right thumbnail / label even if the candidate list is sorted
  // differently.
  const byUrl = useMemo(() => {
    const m = new Map<string, HeroCandidate>();
    for (const c of candidates) m.set(c.url, c);
    return m;
  }, [candidates]);

  const pickedSet = useMemo(() => new Set(value), [value]);
  const available = useMemo(
    () => candidates.filter(c => !pickedSet.has(c.url)),
    [candidates, pickedSet],
  );

  const counterClass = value.length > maxRecommended
    ? 'text-amber-700'
    : value.length > 0
    ? 'text-teal'
    : 'text-muted';

  function move(idx: number, delta: number) {
    const target = idx + delta;
    if (target < 0 || target >= value.length) return;
    const next = value.slice();
    [next[idx], next[target]] = [next[target]!, next[idx]!];
    onChange(next);
  }

  function remove(idx: number) {
    onChange(value.filter((_, i) => i !== idx));
  }

  function add(url: string) {
    if (value.includes(url)) return;
    if (value.length >= maxAbsolute) return;
    onChange([...value, url]);
  }

  function reset() {
    if (value.length === 0) return;
    if (!confirm('Clear all hero picks and fall back to auto-pick?')) return;
    onChange([]);
  }

  return (
    <section className="border border-sand rounded-md bg-white">
      <header className="px-4 py-3 border-b border-sand flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-h4 text-ink-deep">{title}</h3>
          {hint && <p className="text-small text-muted mt-0.5">{hint}</p>}
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-small font-medium ${counterClass}`}>
            Picked {value.length} / {maxRecommended} recommended
            {value.length > maxRecommended && ` (+${value.length - maxRecommended})`}
          </span>
          <button
            type="button"
            onClick={reset}
            disabled={value.length === 0}
            className="text-small text-muted hover:text-teal disabled:opacity-40 disabled:cursor-not-allowed underline-offset-2 hover:underline"
          >
            Reset to auto-pick
          </button>
        </div>
      </header>

      <div className="p-4 space-y-5">
        <div>
          <h4 className="text-label uppercase tracking-wide text-muted mb-2">
            Picked ({value.length})
          </h4>
          {value.length === 0 ? (
            <p className="text-small text-muted italic">
              No picks yet. The public page will use the auto-pick collage.
            </p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
              {value.map((url, idx) => {
                const cand = byUrl.get(url);
                return (
                  <figure
                    key={url}
                    className="relative aspect-square rounded overflow-hidden border border-sand bg-cream-soft group"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={thumbUrl(url, { size: 192 }) ?? url}
                      alt={cand?.alt ?? `Hero photo ${idx + 1}`}
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                    <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-ink-deep/80 text-white text-[10px] font-medium tabular-nums">
                      {idx + 1}
                    </span>
                    <div className="absolute bottom-0 left-0 right-0 flex bg-black/60 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => move(idx, -1)}
                        disabled={idx === 0}
                        className="flex-1 py-1 text-white text-xs hover:bg-white/15 disabled:opacity-30"
                        aria-label="Move up"
                      >
                        ←
                      </button>
                      <button
                        type="button"
                        onClick={() => move(idx, 1)}
                        disabled={idx === value.length - 1}
                        className="flex-1 py-1 text-white text-xs hover:bg-white/15 disabled:opacity-30"
                        aria-label="Move down"
                      >
                        →
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(idx)}
                        className="flex-1 py-1 text-white text-xs hover:bg-white/15"
                        aria-label="Remove"
                      >
                        ×
                      </button>
                    </div>
                  </figure>
                );
              })}
            </div>
          )}
        </div>

        <div>
          <h4 className="text-label uppercase tracking-wide text-muted mb-2">
            Available ({available.length})
          </h4>
          {available.length === 0 ? (
            <p className="text-small text-muted italic">
              All candidates are picked. Upload more photos via{' '}
              <a href="/admin/upload" className="text-teal hover:underline">
                /admin/upload
              </a>
              .
            </p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
              {available.map(c => (
                <button
                  key={c.url}
                  type="button"
                  onClick={() => add(c.url)}
                  disabled={value.length >= maxAbsolute}
                  className="relative aspect-square rounded overflow-hidden border border-sand bg-cream-soft cursor-pointer hover:ring-2 hover:ring-teal focus-visible:ring-2 focus-visible:ring-teal disabled:opacity-40 disabled:cursor-not-allowed"
                  aria-label={`Add ${c.alt ?? 'image'} to hero picks`}
                  title={c.label ? `${c.label}\n\nClick to add` : 'Click to add'}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={thumbUrl(c.url, { size: 192 }) ?? c.url}
                    alt={c.alt ?? ''}
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                  {c.hidden && (
                    <span className="absolute top-1 right-1 px-1 py-0.5 rounded bg-amber-600/90 text-white text-[9px] font-medium uppercase tracking-wide">
                      hidden
                    </span>
                  )}
                  {c.label && (
                    <span className="absolute bottom-0 left-0 right-0 px-1 py-0.5 bg-black/60 text-white text-[10px] truncate">
                      {c.label}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
