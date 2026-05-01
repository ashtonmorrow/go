// === MonthlyClimateChart ===================================================
// Twelve-month climate strip for a city. Two stacked sub-charts:
//   • temperature band  — daily high (top) and low (bottom) per month, with
//                          a comfort-zone shaded band (16–26 °C) so the
//                          eye picks out tourist-friendly months at a glance
//   • precipitation     — total monthly rainfall, mm
//
// Inline SVG (no chart library), responsive width, neutral palette so it
// fits the cream/teal design tokens. Server-rendered — the data comes
// pre-fetched from NASA POWER (lib/cityClimate.ts) and the component is
// purely declarative.
//
// Best-month indicator: months whose day high lands inside 18–28 °C and
// whose precipitation is below 100 mm get a small teal dot under the
// month label.
//
import type { MonthlyClimate } from '@/lib/cityClimate';

const MONTH_LABELS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'] as const;

type Props = {
  data: MonthlyClimate;
  // Hemisphere context only flips comfort heuristics in extreme cases.
  // Today the indicator is purely numeric so we ignore it; passed in for
  // future shading work.
  lat?: number | null;
};

export default function MonthlyClimateChart({ data }: Props) {
  // Width × height of the viewBox. Bars laid out evenly across 12 slots.
  const W = 360;
  const H = 140;
  const PAD_X = 20;
  const PAD_TOP = 18;
  const PAD_BOTTOM = 22;
  const TEMP_H = 70;
  const PRECIP_H = 30;
  const TEMP_TOP = PAD_TOP;
  const PRECIP_TOP = PAD_TOP + TEMP_H + 6;

  const usableW = W - PAD_X * 2;
  const slot = usableW / 12;

  // Temp range across the whole year, padded by 2 °C either side so the
  // band doesn't touch the edges.
  const allTemps = [...data.high, ...data.low].filter(n => Number.isFinite(n));
  const tMin = allTemps.length ? Math.floor(Math.min(...allTemps)) - 2 : -10;
  const tMax = allTemps.length ? Math.ceil(Math.max(...allTemps)) + 2 : 30;
  const tRange = tMax - tMin || 1;
  const tempY = (t: number) => TEMP_TOP + ((tMax - t) / tRange) * TEMP_H;

  // Precipitation max for scale.
  const pMax = Math.max(...data.precip.filter(n => Number.isFinite(n)), 30);
  const precipH = (p: number) => Math.max(0, (p / pMax) * PRECIP_H);

  // Best-month heuristic: pleasant temp range + low rainfall.
  const isBest = (i: number) => {
    const h = data.high[i];
    const l = data.low[i];
    const p = data.precip[i];
    return (
      Number.isFinite(h) && Number.isFinite(l) && Number.isFinite(p) &&
      h >= 18 && h <= 28 && l >= 8 && p < 100
    );
  };

  return (
    <figure className="not-prose">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto"
        role="img"
        aria-label="Monthly climate chart"
      >
        {/* Comfort band — shaded zone behind the temp lines for 18–26 °C */}
        {tMax > 18 && tMin < 26 && (
          <rect
            x={PAD_X}
            y={tempY(Math.min(26, tMax))}
            width={usableW}
            height={Math.max(0, tempY(Math.max(18, tMin)) - tempY(Math.min(26, tMax)))}
            fill="hsl(35 25% 86%)"
            opacity={0.5}
          />
        )}

        {/* Zero line if it sits inside the temp range */}
        {tMin < 0 && tMax > 0 && (
          <line
            x1={PAD_X}
            x2={W - PAD_X}
            y1={tempY(0)}
            y2={tempY(0)}
            stroke="#eceae6"
            strokeDasharray="2 3"
          />
        )}

        {/* Temperature bars — vertical line from low → high per month */}
        {data.high.map((h, i) => {
          if (!Number.isFinite(h) || !Number.isFinite(data.low[i])) return null;
          const x = PAD_X + slot * i + slot / 2;
          return (
            <g key={`t-${i}`}>
              <line
                x1={x}
                x2={x}
                y1={tempY(h)}
                y2={tempY(data.low[i])}
                stroke="#2f6f73"
                strokeWidth={4}
                strokeLinecap="round"
                opacity={0.55}
              />
              {/* Top dot = high */}
              <circle cx={x} cy={tempY(h)} r={2.4} fill="#2f6f73" />
              {/* Bottom dot = low */}
              <circle cx={x} cy={tempY(data.low[i])} r={2.4} fill="#6b7c8f" />
            </g>
          );
        })}

        {/* Precipitation bars — bottom strip */}
        {data.precip.map((p, i) => {
          if (!Number.isFinite(p)) return null;
          const x = PAD_X + slot * i + slot / 2;
          const h = precipH(p);
          return (
            <rect
              key={`p-${i}`}
              x={x - slot * 0.3}
              y={PRECIP_TOP + PRECIP_H - h}
              width={slot * 0.6}
              height={h}
              fill="#afc7d6"
              opacity={0.75}
            />
          );
        })}

        {/* Month labels + best-month dot */}
        {MONTH_LABELS.map((m, i) => {
          const x = PAD_X + slot * i + slot / 2;
          return (
            <g key={`m-${i}`}>
              <text
                x={x}
                y={H - 6}
                textAnchor="middle"
                fontSize={9}
                fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                fill="#7c7e7f"
                letterSpacing={1}
              >
                {m}
              </text>
              {isBest(i) && (
                <circle
                  cx={x}
                  cy={H - 14}
                  r={1.8}
                  fill="#2f6f73"
                />
              )}
            </g>
          );
        })}

        {/* Y-axis labels for temp (just min and max). Tiny, muted. */}
        <text
          x={PAD_X - 4}
          y={tempY(tMax) + 3}
          textAnchor="end"
          fontSize={8}
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
          fill="#7c7e7f"
        >
          {Math.round(tMax)}°
        </text>
        <text
          x={PAD_X - 4}
          y={tempY(tMin) + 3}
          textAnchor="end"
          fontSize={8}
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
          fill="#7c7e7f"
        >
          {Math.round(tMin)}°
        </text>
      </svg>
      <figcaption className="text-micro text-muted mt-2 flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-teal" />
          high
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-slate" />
          low
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-2 h-1.5 bg-sky/75" />
          rainfall
        </span>
        <span className="inline-flex items-center gap-1 ml-auto">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-teal" />
          comfortable months
        </span>
      </figcaption>
    </figure>
  );
}
