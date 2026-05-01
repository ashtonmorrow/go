'use client';

import { useEffect, useState } from 'react';

/**
 * Live local-time display for a city or country detail sidebar.
 *
 * Renders nothing on the server (pre-hydration there's no clock yet so
 * SSR would just emit a "stale" timestamp that mismatches the client's
 * first paint and causes a hydration warning). After mount, ticks every
 * 30 seconds — minute-level precision is what the page actually shows
 * and one update per minute would race the second hand visually.
 *
 * The IANA `timeZone` string comes straight from the city/country row
 * (e.g. "Europe/Madrid"). Intl.DateTimeFormat handles DST, half-hour
 * offsets, abbreviations — all the stuff a manual clock implementation
 * gets wrong. If the zone string is invalid, the formatter throws; we
 * fall back to "—" so the layout doesn't break.
 */
export default function LiveClock({
  timeZone,
  className,
}: {
  timeZone: string | null;
  className?: string;
}) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    if (!timeZone) return;
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, [timeZone]);

  if (!timeZone) {
    return null;
  }

  // Empty state on the server + first client paint. Prevents the layout
  // from jumping between a placeholder and the real time once the clock
  // mounts — we ship it pre-sized with invisible characters.
  let timeLabel: string = ' ';
  let dayLabel: string | null = null;

  if (now) {
    try {
      timeLabel = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }).format(now);
      dayLabel = new Intl.DateTimeFormat('en-US', {
        timeZone,
        weekday: 'long',
      }).format(now);
    } catch {
      // Bad zone — render nothing rather than crash.
      return null;
    }
  }

  return (
    <div className={'flex flex-col gap-0.5 ' + (className ?? '')}>
      <span className="text-micro uppercase tracking-[0.14em] text-muted">
        Local time
      </span>
      <span className="text-h2 text-ink-deep font-semibold tabular-nums leading-none">
        {timeLabel}
      </span>
      <span className="text-label text-muted leading-none">
        {dayLabel ?? ' '} · {timeZone}
      </span>
    </div>
  );
}
