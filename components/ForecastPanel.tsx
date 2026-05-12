// === ForecastPanel =========================================================
// 7-day daily forecast strip for a city, sourced from Open-Meteo via
// lib/forecast.ts. Renders horizontally: today on the left, six days
// forward to the right. Each card shows the weekday, conditions, high/low,
// and a UV badge when the UV index would warrant attention.
//
// Server component; the forecast fetch happens upstream in the city
// page's Promise.all so this component is purely presentational.
//
import type { ForecastDay } from '@/lib/forecast';
import { weatherCodeToCondition, uvBand } from '@/lib/forecast';

type Props = {
  cityName: string;
  forecast: ForecastDay[] | null;
};

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function weekdayLabel(dateStr: string, isFirst: boolean): string {
  if (isFirst) return 'Today';
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return WEEKDAY_SHORT[dt.getUTCDay()];
}

function uvBadgeClass(level: ReturnType<typeof uvBand>['level']): string {
  switch (level) {
    case 'low':
      return 'bg-cream-soft text-slate';
    case 'moderate':
      return 'bg-sky/30 text-ink-deep';
    case 'high':
      return 'bg-orange-200 text-orange-900';
    case 'very_high':
      return 'bg-red-200 text-red-900';
    case 'extreme':
      return 'bg-red-300 text-red-950';
  }
}

export default function ForecastPanel({ cityName, forecast }: Props) {
  if (!forecast || forecast.length === 0) return null;

  return (
    <section className="mt-8">
      <h2 className="text-h2 text-ink-deep mb-2">The next week in {cityName}</h2>
      <p className="text-small text-slate mb-4">
        7-day forecast from Open-Meteo. UV badges flag days when sun protection
        matters (3 and above is moderate; 8 and above is risk territory for
        unprotected fair skin within 30 minutes).
      </p>

      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-2">
        {forecast.map((d, i) => {
          const cond = weatherCodeToCondition(d.weatherCode);
          const uv = uvBand(d.uvMax);
          const showUv = uv.level !== 'low';
          return (
            <div
              key={d.date}
              className="card p-3 flex flex-col items-center text-center"
            >
              <div className="text-micro text-muted uppercase tracking-wide mb-1">
                {weekdayLabel(d.date, i === 0)}
              </div>
              <div className="text-small text-ink-deep font-medium mb-1">
                {cond.label}
              </div>
              <div className="font-mono text-ink-deep">
                {Number.isFinite(d.highC) ? Math.round(d.highC) : '–'}°{' '}
                <span className="text-slate">
                  / {Number.isFinite(d.lowC) ? Math.round(d.lowC) : '–'}°
                </span>
              </div>
              {d.precipMm > 0.5 && (
                <div className="text-micro text-muted mt-1">
                  {d.precipMm.toFixed(1)} mm
                </div>
              )}
              {showUv && (
                <div
                  className={`text-micro mt-2 px-2 py-0.5 rounded-full font-medium ${uvBadgeClass(uv.level)}`}
                >
                  UV {uv.label}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
