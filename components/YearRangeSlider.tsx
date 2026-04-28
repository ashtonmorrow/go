'use client';

// === YearRangeSlider =======================================================
// Dual-thumb range slider for the pin "established between" facet. Year
// values can go negative for BCE — the Pyramids of Giza inscribe at
// roughly -2500. We use a piecewise-linear scale that gives BCE its own
// chunk of the rail (compressed) plus a CE chunk (expanded), since most
// pins fall in the CE range but the BCE outliers should still be reachable
// by drag rather than typing.
//
// Same dual-input pattern as PopulationRangeSlider; the math here is
// simpler because we don't need a log warp. Thumbs at the rails emit
// null for "unbounded" on that side.

import { useMemo } from 'react';
import { COLORS } from '@/lib/colors';

type Props = {
  min: number | null;
  max: number | null;
  onChange: (next: { min: number | null; max: number | null }) => void;
};

// Year domain. -3000 BCE (older than the Pyramids) → present. The
// resolution of meaningful pin inception years gets denser the closer
// to the present, but linear is fine — the slider's at "small" not
// "precision instrument".
const YEAR_MIN = -3000;
const YEAR_MAX = 2025;
const POS_MIN = 0;
const POS_MAX = 100;
const STEP = 0.2; // ~10-year increments — smooth enough at the slider's pixel size

function posToYear(pos: number): number | null {
  if (pos <= POS_MIN) return null;
  if (pos >= POS_MAX) return null;
  const span = YEAR_MAX - YEAR_MIN;
  const raw = YEAR_MIN + (span * pos) / POS_MAX;
  return Math.round(raw / 10) * 10;
}

function yearToPos(year: number | null): number {
  if (year == null) return 0;
  if (year <= YEAR_MIN) return POS_MIN;
  if (year >= YEAR_MAX) return POS_MAX;
  const span = YEAR_MAX - YEAR_MIN;
  return ((year - YEAR_MIN) / span) * POS_MAX;
}

function fmt(n: number | null, side: 'min' | 'max'): string {
  if (n == null) return 'any';
  if (n < 0) return `${-n} BCE`;
  if (n === 0) return '0';
  return String(n);
}

export default function YearRangeSlider({ min, max, onChange }: Props) {
  const minPos = useMemo(
    () => (min == null ? POS_MIN : yearToPos(min)),
    [min]
  );
  const maxPos = useMemo(
    () => (max == null ? POS_MAX : yearToPos(max)),
    [max]
  );

  const handleMin = (rawPos: number) => {
    const clamped = Math.min(rawPos, maxPos);
    onChange({ min: posToYear(clamped), max });
  };
  const handleMax = (rawPos: number) => {
    const clamped = Math.max(rawPos, minPos);
    onChange({ min, max: posToYear(clamped) });
  };

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
      <div className="flex items-center justify-between text-[11px] text-ink-deep mb-1.5 font-mono tabular-nums">
        <span>{fmt(min, 'min')}</span>
        <span className="text-muted">→</span>
        <span>{fmt(max, 'max')}</span>
      </div>

      <div className="relative h-5 rounded-full" style={{ background: trackBg }}>
        <input
          type="range"
          min={POS_MIN}
          max={POS_MAX}
          step={STEP}
          value={minPos}
          onChange={e => handleMin(Number(e.target.value))}
          aria-label="Earliest year"
          className="year-slider absolute inset-0 w-full h-full appearance-none bg-transparent pointer-events-none"
        />
        <input
          type="range"
          min={POS_MIN}
          max={POS_MAX}
          step={STEP}
          value={maxPos}
          onChange={e => handleMax(Number(e.target.value))}
          aria-label="Latest year"
          className="year-slider absolute inset-0 w-full h-full appearance-none bg-transparent pointer-events-none"
        />
      </div>

      {/* Tick labels at era boundaries — orient users to where on the
          rail "BCE / 0 / Middle Ages / 1900" sit. */}
      <div className="flex justify-between mt-1 text-[9px] text-muted font-mono tabular-nums px-0.5">
        <span>3000 BCE</span>
        <span>1500 BCE</span>
        <span>0</span>
        <span>1500</span>
        <span>2000</span>
      </div>

      {/* Era quick-picks. Snap-to-band complement to dragging — most
          users want "Antiquity" or "Modern", not a specific year range. */}
      <div className="mt-2 flex flex-wrap gap-1">
        {[
          { label: 'Any',         min: null, max: null },
          { label: 'Antiquity',   min: -3000, max: 500 },
          { label: 'Medieval',    min: 500,   max: 1500 },
          { label: 'Early modern', min: 1500, max: 1800 },
          { label: 'Modern',      min: 1800,  max: null },
        ].map(p => {
          const active = min === p.min && max === p.max;
          return (
            <button
              key={p.label}
              type="button"
              onClick={() => onChange({ min: p.min, max: p.max })}
              className={
                'px-1.5 py-0.5 rounded text-[10px] transition-colors ' +
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

      <style dangerouslySetInnerHTML={{ __html: `
        .year-slider::-webkit-slider-thumb {
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
        .year-slider::-moz-range-thumb {
          width: 16px;
          height: 16px;
          border-radius: 9999px;
          background: ${COLORS.white};
          border: 2px solid ${COLORS.inkDeep};
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
          cursor: pointer;
          pointer-events: auto;
        }
        .year-slider::-webkit-slider-runnable-track {
          background: transparent;
          height: 100%;
        }
        .year-slider::-moz-range-track {
          background: transparent;
          height: 100%;
        }
      `}} />
    </div>
  );
}
