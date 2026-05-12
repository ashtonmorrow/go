// === EnvironmentalScrubber =================================================
// Year-scrubber that drives three panels at once: air quality, weather,
// and daylight. Default thumb position is today. Drag to any day; all
// three panels update in lockstep.
//
// Data shape:
//   • climate.{high,low,precip} — 12 monthly normals from NASA POWER.
//   • airQuality.monthlyPm25    — 12 monthly averages from OpenAQ (may be
//                                  null per month if no measurement landed
//                                  in that window).
//   • daylight                  — 12 daylight entries, pre-computed from
//                                  lat/lng (lib/daylight.ts).
//
// The component is client-side because the scrubber holds React state.
// All data is passed in as props from the server-rendered page; no fetch
// happens here.
//
'use client';

import { useState } from 'react';
import type { MonthlyClimate } from '@/lib/cityClimate';
import type { AirQuality } from '@/lib/airQuality';
import type { DaylightDay } from '@/lib/daylight';

type Props = {
  lat: number;
  lng: number;
  timeZone: string | null;
  climate: MonthlyClimate | null;
  airQuality: AirQuality | null;
  /** Twelve monthly entries, Jan..Dec. */
  daylight: DaylightDay[];
  /** Day-of-year (1–365) to position the scrubber on initial render. */
  initialDayOfYear: number;
};

const MONTH_LABELS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'] as const;
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

// Day-of-year at the 1st of each month (non-leap), plus end-of-year sentinel.
const MONTH_BOUNDARIES = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334, 365];

function monthOf(dayOfYear: number): number {
  for (let m = 0; m < 12; m++) {
    if (dayOfYear < MONTH_BOUNDARIES[m + 1]) return m;
  }
  return 11;
}

function formatDateLabel(dayOfYear: number): string {
  const m = monthOf(dayOfYear);
  const d = dayOfYear - MONTH_BOUNDARIES[m] + 1;
  return `${MONTH_NAMES[m]} ${d}`;
}

// US EPA PM2.5 health bands (µg/m³, 24-hour averaging).
// Color values are pulled from lib/colors.ts visually but kept inline
// here because they're not part of the existing brand palette.
function pm25Band(value: number | null): { label: string; color: string } {
  if (value == null) return { label: 'No data', color: '#7c7e7f' };
  if (value <= 12) return { label: 'Good', color: '#5b9a6b' };
  if (value <= 35.4) return { label: 'Moderate', color: '#c8a14b' };
  if (value <= 55.4) return { label: 'Unhealthy for sensitive groups', color: '#d97a3c' };
  if (value <= 150.4) return { label: 'Unhealthy', color: '#c44a4a' };
  if (value <= 250.4) return { label: 'Very unhealthy', color: '#8e3a8e' };
  return { label: 'Hazardous', color: '#6b2424' };
}

function formatLocalTime(utcHour: number, timeZone: string | null, date: Date): string {
  if (!timeZone) return '—';
  const h = Math.floor(utcHour);
  const m = Math.floor((utcHour - h) * 60);
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), h, m));
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: false,
    timeZone,
  }).format(d);
}

export default function EnvironmentalScrubber({
  timeZone,
  climate,
  airQuality,
  daylight,
  initialDayOfYear,
}: Props) {
  const [dayOfYear, setDayOfYear] = useState(initialDayOfYear);
  const month = monthOf(dayOfYear);

  // The selected date as a Date object (current year). Used to compute
  // local sunrise/sunset honoring DST in the city's timezone.
  const year = new Date().getFullYear();
  const dayInMonth = dayOfYear - MONTH_BOUNDARIES[month] + 1;
  const selectedDate = new Date(Date.UTC(year, month, dayInMonth));

  const pm25Month = airQuality?.monthlyPm25?.[month] ?? null;
  const band = pm25Band(pm25Month);

  const high = climate?.high[month] ?? null;
  const low = climate?.low[month] ?? null;
  const precip = climate?.precip[month] ?? null;
  const climateAvailable =
    high != null && low != null && Number.isFinite(high) && Number.isFinite(low);

  const d = daylight[month];
  const sunriseLabel = d.isPolarNight
    ? 'no sunrise'
    : d.isPolarDay
      ? 'always up'
      : formatLocalTime(d.sunriseUtc, timeZone, selectedDate);
  const sunsetLabel = d.isPolarNight
    ? 'no sunset'
    : d.isPolarDay
      ? 'never sets'
      : formatLocalTime(d.sunsetUtc, timeZone, selectedDate);

  return (
    <section className="mt-8">
      <div className="flex items-baseline justify-between mb-3 gap-3">
        <h2 className="text-h2 text-ink-deep">In {formatDateLabel(dayOfYear)}</h2>
        <p className="text-small text-muted hidden sm:block">Drag to scrub across the year.</p>
      </div>

      <div className="mb-5">
        <input
          type="range"
          min={1}
          max={365}
          value={dayOfYear}
          onChange={e => setDayOfYear(Number(e.target.value))}
          aria-label="Day of year"
          className="w-full"
          style={{ accentColor: '#2f6f73' }}
        />
        <div className="flex justify-between px-1 mt-1 font-mono text-micro text-muted tracking-wide">
          {MONTH_LABELS.map((m, i) => (
            <span key={i}>{m}</span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Air quality panel */}
        <div className="card p-4">
          <div className="text-micro text-muted uppercase tracking-wide mb-2">Air quality</div>
          {pm25Month != null ? (
            <>
              <div className="font-mono text-h2" style={{ color: band.color }}>
                {pm25Month.toFixed(0)}
                <span className="text-small text-muted ml-1">µg/m³</span>
              </div>
              <div className="text-small mt-1" style={{ color: band.color }}>
                {band.label}
              </div>
              <div className="text-micro text-muted mt-1">PM2.5, monthly average</div>
            </>
          ) : airQuality?.station ? (
            <div className="text-small text-muted">
              Station nearby, but no measurement in this month.
            </div>
          ) : (
            <div className="text-small text-muted">No monitoring station within 25 km.</div>
          )}
        </div>

        {/* Weather panel */}
        <div className="card p-4">
          <div className="text-micro text-muted uppercase tracking-wide mb-2">Weather</div>
          {climateAvailable && high != null && low != null ? (
            <>
              <div className="font-mono text-h2 text-ink-deep">
                {Math.round(high)}°{' '}
                <span className="text-slate">/ {Math.round(low)}°</span>
              </div>
              <div className="text-small text-slate mt-1">Typical high / low</div>
              {precip != null && Number.isFinite(precip) && (
                <div className="text-micro text-muted mt-1">
                  {Math.round(precip)} mm rainfall this month
                </div>
              )}
            </>
          ) : (
            <div className="text-small text-muted">No climate data.</div>
          )}
        </div>

        {/* Daylight panel */}
        <div className="card p-4">
          <div className="text-micro text-muted uppercase tracking-wide mb-2">Daylight</div>
          <div className="font-mono text-h2 text-ink-deep">
            {d.daylightHours.toFixed(1)}
            <span className="text-small text-muted ml-1">h</span>
          </div>
          <div className="text-small text-slate mt-1">
            {sunriseLabel} – {sunsetLabel}
            {timeZone && !d.isPolarDay && !d.isPolarNight && (
              <span className="text-muted text-micro ml-1">local</span>
            )}
          </div>
        </div>
      </div>

      {airQuality?.station && (
        <p className="text-micro text-muted mt-3">
          Air quality from {airQuality.station.name}
          {airQuality.station.distanceKm > 0 &&
            `, ${airQuality.station.distanceKm.toFixed(1)} km from city center`}
          . PM2.5 monthly averages over the past 12 months, via OpenAQ.
        </p>
      )}
    </section>
  );
}
