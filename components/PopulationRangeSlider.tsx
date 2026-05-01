'use client';

// === PopulationRangeSlider =================================================
// Dual-thumb range slider for the Population facet, on a LOG scale because
// city populations span 5+ orders of magnitude (a few hundred → 30M+).
// On a linear scale, 90% of the slider would be unusable — most cities
// would cluster at the low end. Log scale gives equal real-estate to each
// order of magnitude, the standard for city-population pickers (Numbeo,
// Teleport, etc.).
//
// Thumbs at the extremes mean "unbounded" — we emit null instead of the
// boundary value so the filter predicate skips that bound entirely. This
// matches how filterCities reads populationMin/populationMax (null = no
// constraint on that side).
//
// Implementation: two overlapping <input type="range">. The browser-native
// approach has the best accessibility (keyboard nav, screen-reader
// announcements, touch hit-targets) without needing a custom drag impl.
// The active "selected band" track between the thumbs is rendered as a
// CSS gradient on the wrapper div, computed from the two slider positions.

import { useMemo } from 'react';
import { COLORS } from '@/lib/colors';

type Props = {
  min: number | null;
  max: number | null;
  onChange: (next: { min: number | null; max: number | null }) => void;
};

// Log-scale endpoints. Positions outside [POS_MIN..POS_MAX] are treated
// as "unbounded" (null) so the user can drag to the rail to clear that
// bound.
const POS_MIN = 0;
const POS_MAX = 100;
// log10 boundaries — 10^2 = 100 (smallest meaningful city), 10^7.5 ≈ 30M
// (largest metro). Cities outside this range are clipped at the rails;
// at 100 the slider reads "unbounded".
const LOG_MIN = 2;
const LOG_MAX = 7.5;

const STEP = 0.5; // half-position-unit step ≈ ~3% of a decade — feels smooth

function posToPopulation(pos: number): number | null {
  if (pos <= POS_MIN) return null; // dragged to the low rail = unbounded
  if (pos >= POS_MAX) return null; // dragged to the high rail = unbounded
  const log = LOG_MIN + (LOG_MAX - LOG_MIN) * (pos / POS_MAX);
  // Round to a nicely human number — top significant digits depend on
  // magnitude. 1k-1M → round to 1k. 1M-30M → round to 100k.
  const raw = Math.pow(10, log);
  if (raw >= 1_000_000) return Math.round(raw / 100_000) * 100_000;
  if (raw >= 100_000)  return Math.round(raw / 10_000) * 10_000;
  if (raw >= 10_000)   return Math.round(raw / 1_000) * 1_000;
  if (raw >= 1_000)    return Math.round(raw / 100) * 100;
  return Math.round(raw / 10) * 10;
}

function populationToPos(p: number | null): number {
  if (p == null) return 0; // null on the low side maps to the low rail
  if (p <= 0) return 0;
  const log = Math.log10(p);
  if (log <= LOG_MIN) return POS_MIN;
  if (log >= LOG_MAX) return POS_MAX;
  return ((log - LOG_MIN) / (LOG_MAX - LOG_MIN)) * POS_MAX;
}

function fmt(n: number | null, side: 'min' | 'max'): string {
  if (n == null) return side === 'min' ? 'any' : 'any';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000) return Math.round(n / 1_000) + 'k';
  return String(n);
}

export default function PopulationRangeSlider({ min, max, onChange }: Props) {
  // Slider positions on the 0..100 log axis. For the MAX thumb we treat
  // null as "rail" (POS_MAX); for the MIN thumb null = POS_MIN.
  const minPos = useMemo(
    () => (min == null ? POS_MIN : populationToPos(min)),
    [min]
  );
  const maxPos = useMemo(
    () => (max == null ? POS_MAX : populationToPos(max)),
    [max]
  );

  // Guard against thumbs crossing — if the user drags one past the other,
  // clamp before emitting. The native range input doesn't enforce this on
  // its own.
  const handleMin = (rawPos: number) => {
    const clamped = Math.min(rawPos, maxPos);
    onChange({
      min: posToPopulation(clamped),
      max,
    });
  };
  const handleMax = (rawPos: number) => {
    const clamped = Math.max(rawPos, minPos);
    onChange({
      min,
      max: posToPopulation(clamped),
    });
  };

  // Selected-band track gradient — colored between the two thumb positions,
  // muted on the rails outside. Pure presentational (clicks pass through
  // to the inputs underneath).
  const trackBg = useMemo(() => {
    return (
      `linear-gradient(to right, ` +
        `${COLORS.sand} 0%, ` +
        `${COLORS.sand} ${minPos}%, ` +
        `${COLORS.inkDeep} ${minPos}%, ` +
        `${COLORS.inkDeep} ${maxPos}%, ` +
        `${COLORS.sand} ${maxPos}%, ` +
        `${COLORS.sand} 100%)`
    );
  }, [minPos, maxPos]);

  return (
    <div className="select-none">
      {/* Live readout — the current min/max in human-friendly form. */}
      <div className="flex items-center justify-between text-label text-ink-deep mb-1.5 font-mono tabular-nums">
        <span>{fmt(min, 'min')}</span>
        <span className="text-muted">→</span>
        <span>{fmt(max, 'max')}</span>
      </div>

      {/* Track + thumbs. Two range inputs absolute-positioned on top of
          each other; the colored track sits behind via the wrapper's
          background gradient. The thumbs of the inputs themselves
          render the visible drag handles. */}
      <div
        className="relative h-5 rounded-full"
        style={{
          background: trackBg,
        }}
      >
        <input
          type="range"
          min={POS_MIN}
          max={POS_MAX}
          step={STEP}
          value={minPos}
          onChange={e => handleMin(Number(e.target.value))}
          aria-label="Minimum population"
          className="pop-slider absolute inset-0 w-full h-full appearance-none bg-transparent pointer-events-none"
        />
        <input
          type="range"
          min={POS_MIN}
          max={POS_MAX}
          step={STEP}
          value={maxPos}
          onChange={e => handleMax(Number(e.target.value))}
          aria-label="Maximum population"
          className="pop-slider absolute inset-0 w-full h-full appearance-none bg-transparent pointer-events-none"
        />
      </div>
      {/* Thumb styles — Tailwind has no first-class range-thumb utilities
          and we want identical visuals on both inputs. Scoped to the
          .pop-slider class so it doesn't leak. Rendered as a global
          <style> tag because pseudo-elements can't be styled inline. */}
      <style dangerouslySetInnerHTML={{ __html: `
        .pop-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 9999px;
          background: ${COLORS.white};
          border: 2px solid ${COLORS.inkDeep};
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
          cursor: pointer;
          pointer-events: auto;
          margin-top: 0;
        }
        .pop-slider::-moz-range-thumb {
          width: 16px;
          height: 16px;
          border-radius: 9999px;
          background: ${COLORS.white};
          border: 2px solid ${COLORS.inkDeep};
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
          cursor: pointer;
          pointer-events: auto;
        }
        .pop-slider::-webkit-slider-runnable-track {
          background: transparent;
          height: 100%;
        }
        .pop-slider::-moz-range-track {
          background: transparent;
          height: 100%;
        }
      `}} />

      {/* Tick labels at decade boundaries — 100, 1k, 10k, 100k, 1M, 10M.
          Helps users gauge what each thumb position actually means. */}
      <div className="flex justify-between mt-1 text-micro text-muted font-mono tabular-nums px-0.5">
        <span>100</span>
        <span>1k</span>
        <span>10k</span>
        <span>100k</span>
        <span>1M</span>
        <span>10M</span>
      </div>

      {/* Quick-pick presets — same chips as before but rendered as a
          compact row below the slider. Snap the slider to common bands
          without dragging. */}
      <div className="mt-2 flex flex-wrap gap-1">
        {[
          { label: 'Any', min: null, max: null },
          { label: '< 100k', min: null, max: 100_000 },
          { label: '100k–1M', min: 100_000, max: 1_000_000 },
          { label: '1M–5M', min: 1_000_000, max: 5_000_000 },
          { label: '5M+', min: 5_000_000, max: null },
        ].map(p => {
          const active = min === p.min && max === p.max;
          return (
            <button
              key={p.label}
              type="button"
              onClick={() => onChange({ min: p.min, max: p.max })}
              className={
                'px-1.5 py-0.5 rounded text-micro transition-colors ' +
                (active
                  ? 'bg-ink-deep text-cream-soft'
                  : 'text-slate hover:text-ink-deep hover:bg-cream-soft')
              }
            >
              {p.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
